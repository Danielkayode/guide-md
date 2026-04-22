import { GuideMdSchema, GuideMdFrontmatter } from "../schema/index.js";
import { parseGuideFile } from "../parser/index.js";
import { detectDrift, syncGuideFile, Drift, SyncResult } from "./sync.js";
import { scanForSecrets, violationsToDiagnostics, SecretScanResult } from "./secrets.js";
import fs from "node:fs";
import path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiagnosticSeverity = "error" | "warning";
export type DiagnosticSource = "schema" | "warning" | "secret-scan";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  source: DiagnosticSource;
  field: string;
  message: string;
  received?: unknown;
}

export interface LintResult {
  valid: boolean;
  file: string;
  diagnostics: Diagnostic[];
  data: GuideMdFrontmatter | null;
  secretScan?: SecretScanResult | undefined;
}

export interface LintOptions {
  skipSecretScan?: boolean | undefined;
}

export interface FixResult {
  fixed: boolean;
  file: string;
  diagnostics: Diagnostic[];
  data: GuideMdFrontmatter | null;
  appliedFixes: string[];
}

export type { Drift, SyncResult };
export { syncGuideFile, detectDrift };

interface WarningRule {
  field: string;
  check: (data: Record<string, unknown>, filePath: string, content?: string) => boolean;
  message: string;
}

// ─── Warning Rules ────────────────────────────────────────────────────────────
// These are checks beyond Zod — soft best-practice recommendations.

const WARNING_RULES: WarningRule[] = [
  {
    field: "description",
    check: (data, filePath) => {
      const desc = data.description;
      return typeof desc === "string" && desc.length < 60;
    },
    message:
      "description is quite short. Consider expanding it — AI models use this as primary project context.",
  },
  {
    field: "guardrails.no_hallucination",
    check: (data, filePath) => {
      const guardrails = data.guardrails as Record<string, unknown> | undefined;
      return guardrails?.no_hallucination === false;
    },
    message:
      "Setting no_hallucination to false removes a critical AI guardrail. Are you sure?",
  },
  {
    field: "context.off_limits",
    check: (data, filePath) => {
      const context = data.context as Record<string, unknown> | undefined;
      return !context?.off_limits;
    },
    message:
      'No off_limits paths defined. Consider restricting sensitive directories like ".env", "migrations/", or "secrets/".',
  },
  {
    field: "ai_model_target",
    check: (data, filePath) => !data.ai_model_target,
    message:
      "No ai_model_target specified. Pinning to a model ensures consistent behavior across different AI tools.",
  },
  {
    field: "last_updated",
    check: (data, filePath) => {
      if (!data.last_updated || typeof data.last_updated !== "string") return true;
      const updated = new Date(data.last_updated);
      if (Number.isNaN(updated.getTime())) return true; // Invalid date, let schema validation handle it
      const now = new Date();
      const diffDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays > 180;
    },
    message:
      "GUIDE.md appears stale (last updated >6 months ago). Outdated context can mislead AI agents.",
  },
  {
    field: "file.length",
    check: (data, filePath, content) => {
      if (!content) return false; // No content available to check; skip
      const lines = content.split('\n').length;
      return lines > 200;
    },
    message:
      "GUIDE.md exceeds 200 lines. Research shows that concise files perform 4% better than verbose ones, which actually decrease performance.",
  },
];

// ─── Core Linter ─────────────────────────────────────────────────────────────

/**
 * Lints a GUIDE.md file: parses it, validates with Zod, and runs soft-warning rules.
 * Also scans for secrets unless skipSecretScan is true.
 */
export async function lintGuideFile(filePath: string, options: LintOptions = {}): Promise<LintResult> {
  const diagnostics: Diagnostic[] = [];

  // ── Step 1: Secret Scanning (before parsing) ───────────────────────────────
  let secretScan: SecretScanResult | undefined;
  
  if (!options.skipSecretScan) {
    try {
      const rawContent = fs.readFileSync(filePath, "utf-8");
      secretScan = scanForSecrets(rawContent, filePath);
      
      if (secretScan.detected) {
        const secretDiagnostics = violationsToDiagnostics(secretScan);
        diagnostics.push(...secretDiagnostics);
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      diagnostics.push({
        severity: "warning",
        source: "warning",
        field: "(secret-scan)",
        message: `Could not read file for secret scanning: ${reason}`,
      });
    }
  }

  // ── Step 2: Parse ─────────────────────────────────────────────────────────
  const parsed = parseGuideFile(filePath);

  if (!parsed.success) {
    const parseDiagnostics = [...diagnostics];
    parseDiagnostics.push({
      severity: "error",
      source: "schema",
      field: "(file)",
      message: parsed.error ?? "Unknown parse error",
    });
    return { valid: false, file: filePath, diagnostics: parseDiagnostics, data: null, secretScan };
  }

  // ── Step 3: Zod validation ────────────────────────────────────────────────
  const result = GuideMdSchema.safeParse(parsed.data);

  if (!result.success) {
    const zodErrors: Diagnostic[] = result.error.errors.map((err) => ({
      severity: "error" as const,
      source: "schema" as const,
      field: err.path.join(".") || "(root)",
      message: err.message,
      received: err.code === "invalid_type" ? err.received : undefined,
    }));

    // Still run warnings against raw data for partial guidance
    const warnings = await runWarnings(parsed.data, filePath, parsed.content);
    const allDiagnostics = [...diagnostics, ...zodErrors, ...warnings];
    return {
      valid: false,
      file: filePath,
      diagnostics: allDiagnostics,
      data: null,
      secretScan,
    };
  }

  // ── Step 4: Soft warnings ─────────────────────────────────────────────────
  const warnings = await runWarnings(result.data, filePath, parsed.content);
  const allDiagnostics = [...diagnostics, ...warnings];

  // Valid if no errors across all diagnostics (including secret-scan)
  const hasErrors = allDiagnostics.filter((w) => w.severity === "error").length > 0;

  return {
    valid: !hasErrors,
    file: filePath,
    diagnostics: allDiagnostics,
    data: result.data,
    secretScan,
  };
}

/**
 * Runs soft-warning rules against the data object.
 */
async function runWarnings(data: Record<string, unknown>, filePath: string, content?: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  for (const rule of WARNING_RULES) {
    const triggered = rule.check(data, filePath, content);
    if (triggered) {
      diagnostics.push({
        severity: "warning",
        source: "warning",
        field: rule.field,
        message: rule.message,
      });
    }
  }

  // Add drift detection warnings
  try {
    const drifts = await detectDrift(data, filePath);
    diagnostics.push(...drifts.map(d => ({
      severity: "warning" as const,
      source: "warning" as const,
      field: d.field,
      message: d.message
    })));
  } catch (e) {
    // Ignore drift detection errors during raw data validation
  }

  return diagnostics;
}

// ─── Auto-Fix Functionality ──────────────────────────────────────────────────

/**
 * Attempts to auto-fix a GUIDE.md file by adding missing required fields with sensible defaults.
 */
export async function fixGuideFile(filePath: string): Promise<FixResult> {
  const appliedFixes: string[] = [];

  // ── Step 1: Parse ─────────────────────────────────────────────────────────
  const parsed = parseGuideFile(filePath);

  // If parse failed due to empty frontmatter, start with empty data
  // Otherwise return the error
  let data: Record<string, unknown>;
  if (!parsed.success) {
    if (parsed.error?.includes("No frontmatter found")) {
      data = {};
    } else {
      return {
        fixed: false,
        file: filePath,
        diagnostics: [{
          severity: "error",
          source: "schema",
          field: "(file)",
          message: parsed.error ?? "Unknown parse error",
        }],
        data: null,
        appliedFixes: [],
      };
    }
  } else {
    data = { ...parsed.data };
  }

  // ── Step 2: Try to fix missing required fields ───────────────────────────
  const fixes = applyFixes(data, filePath);
  appliedFixes.push(...fixes.applied);

  // Update data with fixes
  data = { ...data, ...fixes.data };

  // ── Step 3: Re-validate ───────────────────────────────────────────────────
  const result = GuideMdSchema.safeParse(data);

  if (!result.success) {
    const zodErrors: Diagnostic[] = result.error.errors.map((err) => ({
      severity: "error" as const,
      source: "schema" as const,
      field: err.path.join(".") || "(root)",
      message: err.message,
      received: err.code === "invalid_type" ? err.received : undefined,
    }));

    return {
      fixed: false,
      file: filePath,
      diagnostics: zodErrors,
      data: null,
      appliedFixes,
    };
  }

  // ── Step 4: Run warnings on fixed data ───────────────────────────────────
  const warnings = await runWarnings(result.data, filePath);

  return {
    fixed: appliedFixes.length > 0,
    file: filePath,
    diagnostics: warnings,
    data: result.data,
    appliedFixes,
  };
}

/**
 * Applies fixes to the data object for missing required fields.
 */
function applyFixes(data: Record<string, unknown>, filePath: string): { data: Record<string, unknown>, applied: string[] } {
  const fixes: Record<string, unknown> = {};
  const applied: string[] = [];

  // guide_version
  if (!data.guide_version) {
    fixes.guide_version = "1.0.0";
    applied.push("Added guide_version: '1.0.0'");
  }

  // project
  if (!data.project) {
    const dirName = path.basename(path.dirname(filePath));
    fixes.project = dirName === "." ? "my-project" : dirName;
    applied.push(`Added project: '${fixes.project}'`);
  }

  // language
  if (!data.language) {
    const detected = detectLanguage(filePath);
    fixes.language = detected;
    applied.push(`Added language: '${detected}'`);
  }

  // strict_typing
  if (data.strict_typing === undefined) {
    fixes.strict_typing = true;
    applied.push("Added strict_typing: true");
  }

  // error_protocol
  if (!data.error_protocol) {
    fixes.error_protocol = "verbose";
    applied.push("Added error_protocol: 'verbose'");
  }

  // last_updated
  if (!data.last_updated) {
    fixes.last_updated = new Date().toISOString().split("T")[0];
    applied.push(`Added last_updated: '${fixes.last_updated}'`);
  }

  return { data: fixes, applied };
}

/**
 * Attempts to detect the primary language from the project structure.
 * Exported for use in init command and other modules.
 */
const DETECT_LANG_IGNORED_DIRS = new Set(["node_modules", "dist", ".git", ".next", ".nuxt", "build", "coverage"]);
const DETECT_LANG_MAX_DEPTH = 10;

function readdirRecursive(dir: string, maxDepth: number, ignoreSet: Set<string>, currentDepth = 0): string[] {
  if (currentDepth >= maxDepth) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoreSet.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...readdirRecursive(fullPath, maxDepth, ignoreSet, currentDepth + 1));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return results;
}

export function detectLanguage(filePath: string): string {
  const dir = path.dirname(filePath);

  try {
    const files = readdirRecursive(dir, DETECT_LANG_MAX_DEPTH, DETECT_LANG_IGNORED_DIRS);

    // Count file extensions
    const extensions: Record<string, number> = {};
    for (const file of files) {
      const ext = path.extname(file);
      extensions[ext] = (extensions[ext] || 0) + 1;
    }

    // Map extensions to languages
    const extToLang: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".py": "python",
      ".rs": "rust",
      ".go": "go",
      ".java": "java",
      ".kt": "kotlin",
      ".swift": "swift",
      ".cpp": "cpp",
      ".c": "c",
      ".cs": "csharp",
      ".rb": "ruby",
      ".php": "php",
      ".scala": "scala",
      ".hs": "haskell",
      ".ex": "elixir",
      ".zig": "zig",
    };

    let maxCount = 0;
    let detectedLang = "typescript"; // default

    for (const [ext, count] of Object.entries(extensions)) {
      if (count > maxCount && extToLang[ext]) {
        maxCount = count;
        detectedLang = extToLang[ext];
      }
    }

    return detectedLang;
  } catch {
    return "typescript"; // fallback
  }
}
