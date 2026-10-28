import fs from "node:fs";
import path from "node:path";
import { GuideMdSchema, GuideMdFrontmatter } from "../schema/index.js";
import { parseGuideFile } from "../parser/index.js";
import { lintGuideFile } from "../linter/index.js";
import { generateHealthReport } from "../dashboard/index.js";
import { scanForSecrets } from "../linter/secrets.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AiContextFile {
  path: string;
  type: "guidemd" | "agents" | "claude" | "cursor" | "windsurf" | "copilot" | "other";
  exists: boolean;
  size: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  score?: number;
  grade?: string;
  hasSecrets: boolean;
  lastModified?: string;
}

export interface ScanResults {
  root: string;
  totalFiles: number;
  files: AiContextFile[];
  summary: {
    valid: number;
    invalid: number;
    withSecrets: number;
    averageScore: number;
  };
  recommendations: string[];
}

// ─── AI Context File Detection ─────────────────────────────────────────────────

const AI_CONTEXT_FILENAMES = [
  "GUIDE.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".windsurfrules",
  ".github/copilot-instructions.md",
];

function detectFileType(filePath: string): AiContextFile["type"] {
  const basename = path.basename(filePath).toLowerCase();
  const relative = filePath.toLowerCase();

  if (basename === "guide.md") return "guidemd";
  if (basename === "agents.md") return "agents";
  if (basename === "claude.md") return "claude";
  if (basename === ".cursorrules") return "cursor";
  if (basename === ".windsurfrules") return "windsurf";
  if (relative.includes("copilot-instructions.md")) return "copilot";
  return "other";
}

function findAiContextFiles(root: string): string[] {
  const found: string[] = [];
  const visited = new Set<string>();

  function walk(dir: string, depth: number) {
    if (depth > 3) return; // Limit depth to avoid scanning node_modules deeply
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "coverage") {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (AI_CONTEXT_FILENAMES.some(f => lower === f.toLowerCase()) || lower.endsWith("copilot-instructions.md")) {
          const relPath = path.relative(root, fullPath);
          if (!visited.has(relPath)) {
            visited.add(relPath);
            found.push(fullPath);
          }
        }
      }
    }
  }

  walk(root, 0);
  return found.sort();
}

// ─── File Analysis ─────────────────────────────────────────────────────────────

async function analyzeFile(filePath: string, root: string): Promise<AiContextFile> {
  const stat = fs.statSync(filePath);
  const relativePath = path.relative(root, filePath);
  const type = detectFileType(filePath);
  const result: AiContextFile = {
    path: relativePath,
    type,
    exists: true,
    size: stat.size,
    valid: false,
    errors: [],
    warnings: [],
    hasSecrets: false,
    lastModified: stat.mtime.toISOString(),
  };

  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Check for secrets
    const secretResult = scanForSecrets(content, filePath);
    result.hasSecrets = secretResult.detected;
    if (secretResult.detected) {
      result.warnings.push(
        `Potential secrets detected (${secretResult.violations.length})`,
      );
    }

    // Only GUIDE.md files get full linting + scoring
    if (type === "guidemd") {
      const parsed = parseGuideFile(filePath);
      if (!parsed.success) {
        result.errors.push(parsed.error);
        return result;
      }

      const schemaResult = GuideMdSchema.safeParse(parsed.data);
      if (!schemaResult.success) {
        result.errors.push("Schema validation failed");
        for (const err of schemaResult.error.errors.slice(0, 5)) {
          result.errors.push(`${err.path.join(".")}: ${err.message}`);
        }
        return result;
      }

      // Lint
      const lintResult = await lintGuideFile(filePath, { skipSecretScan: true });
      result.valid = lintResult.valid;
      for (const d of lintResult.diagnostics) {
        if (d.severity === "error") {
          result.errors.push(`${d.field}: ${d.message}`);
        } else {
          result.warnings.push(`${d.field}: ${d.message}`);
        }
      }

      // Health score
      const healthReport = generateHealthReport(schemaResult.data, parsed.content);
      result.score = healthReport.score;
      result.grade =
        healthReport.score >= 90 ? "A"
        : healthReport.score >= 80 ? "B"
        : healthReport.score >= 70 ? "C"
        : healthReport.score >= 60 ? "D"
        : "F";
    } else {
      // Non-GUIDE.md AI context files - just check they exist and have content
      result.valid = content.trim().length > 0;
      if (!result.valid) {
        result.errors.push("File is empty");
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

// ─── Main Scan Function ────────────────────────────────────────────────────────

/**
 * Scans a directory for AI context files and reports their health.
 */
export async function scanDirectory(
  root: string = process.cwd(),
): Promise<ScanResults> {
  const target = path.resolve(root);
  const files = findAiContextFiles(target);
  const results: AiContextFile[] = [];

  for (const file of files) {
    results.push(await analyzeFile(file, target));
  }

  const valid = results.filter(r => r.valid).length;
  const invalid = results.filter(r => !r.valid).length;
  const withSecrets = results.filter(r => r.hasSecrets).length;
  const scored = results.filter(r => r.score !== undefined);
  const averageScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, r) => sum + (r.score ?? 0), 0) / scored.length)
      : 0;

  const recommendations: string[] = [];

  if (withSecrets > 0) {
    recommendations.push(
      `${withSecrets} file(s) contain potential secrets. Run 'guidemd lint --skip-secret-scan=false' to review.`,
    );
  }

  const guidemdFiles = results.filter(r => r.type === "guidemd");
  if (guidemdFiles.length === 0) {
    recommendations.push(
      "No GUIDE.md found. Run 'guidemd init' to create one.",
    );
  } else if (guidemdFiles.length > 1) {
    recommendations.push(
      `Multiple GUIDE.md files found (${guidemdFiles.length}). Consider 'guidemd merge' to consolidate.`,
    );
  }

  const lowScore = scored.filter(r => (r.score ?? 0) < 80);
  if (lowScore.length > 0) {
    recommendations.push(
      `${lowScore.length} GUIDE.md file(s) score below 80. Review warnings and improve AI-readiness.`,
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("All AI context files look healthy!");
  }

  return {
    root: target,
    totalFiles: results.length,
    files: results,
    summary: {
      valid,
      invalid,
      withSecrets,
      averageScore,
    },
    recommendations,
  };
}
