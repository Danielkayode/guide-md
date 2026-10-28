import fs from "node:fs";
import path from "node:path";
import { GuideMdSchema, GuideMdFrontmatter } from "../schema/index.js";
import { parseGuideFile } from "../parser/index.js";
import { scanForSecrets, SecretViolation } from "../linter/secrets.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AuditIssue {
  severity: "error" | "warning" | "info";
  category: "secret" | "dangerous_pattern" | "missing_field" | "outdated" | "best_practice";
  file: string;
  line?: number;
  message: string;
  recommendation: string;
}

export interface AuditResults {
  file: string;
  totalIssues: number;
  errors: number;
  warnings: number;
  info: number;
  issues: AuditIssue[];
  passed: boolean;
}

// ─── Dangerous Pattern Detection ───────────────────────────────────────────────

const DANGEROUS_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  recommendation: string;
}> = [
  {
    name: "Hardcoded API key",
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}["']?/i,
    recommendation: "Move API keys to environment variables or a secrets manager.",
  },
  {
    name: "Hardcoded password",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{8,}["']?/i,
    recommendation: "Never store passwords in GUIDE.md. Use environment variables.",
  },
  {
    name: "Hardcoded token",
    pattern: /(?:token|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']?[a-zA-Z0-9._-]{20,}["']?/i,
    recommendation: "Store tokens in environment variables or a secrets manager.",
  },
  {
    name: "Private key block",
    pattern: /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
    recommendation: "Never commit private keys to GUIDE.md or any tracked file.",
  },
  {
    name: "AWS secret key",
    pattern: /[0-9a-zA-Z/+]{40}/,
    recommendation: "Potential AWS secret key detected. Rotate and remove from file.",
  },
  {
    name: "Database connection string with credentials",
    pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/i,
    recommendation: "Remove credentials from connection strings. Use environment variables.",
  },
  {
    name: "Internal IP address",
    pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/,
    recommendation: "Avoid hardcoding internal IPs. Use hostnames or environment variables.",
  },
  {
    name: "JWT secret",
    pattern: /(?:jwt[_-]?secret|secret[_-]?key)\s*[:=]\s*["']?[^\s"']{16,}["']?/i,
    recommendation: "Store JWT secrets in environment variables.",
  },
];

// ─── Field Auditing ────────────────────────────────────────────────────────────

function auditFrontmatterFields(
  data: GuideMdFrontmatter,
  file: string,
): AuditIssue[] {
  const issues: AuditIssue[] = [];

  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  // Check for stale last_updated
  if (data.last_updated) {
    const lastUpdated = new Date(data.last_updated);
    if (lastUpdated < oneYearAgo) {
      issues.push({
        severity: "warning",
        category: "outdated",
        file,
        message: `last_updated is ${data.last_updated} (over 1 year old)`,
        recommendation: "Update last_updated to keep AI context fresh.",
      });
    }
  } else {
    issues.push({
      severity: "info",
      category: "missing_field",
      file,
      message: "last_updated is not set",
      recommendation: "Add last_updated to track when GUIDE.md was last reviewed.",
    });
  }

  // Check for missing description
  if (!data.description || data.description.length < 20) {
    issues.push({
      severity: "warning",
      category: "missing_field",
      file,
      message: "description is missing or too short (< 20 chars)",
      recommendation: "Add a meaningful description so AI understands project purpose.",
    });
  }

  // Check for missing entry_points
  if (!data.context?.entry_points || data.context.entry_points.length === 0) {
    issues.push({
      severity: "info",
      category: "best_practice",
      file,
      message: "context.entry_points is not configured",
      recommendation: "Add key entry points so AI can navigate the codebase.",
    });
  }

  // Check for missing off_limits
  if (!data.context?.off_limits || data.context.off_limits.length === 0) {
    issues.push({
      severity: "info",
      category: "best_practice",
      file,
      message: "context.off_limits is not configured",
      recommendation: "Add off-limits patterns to prevent AI from modifying sensitive files.",
    });
  }

  // Check guardrails
  if (!data.guardrails) {
    issues.push({
      severity: "warning",
      category: "best_practice",
      file,
      message: "No guardrails configured",
      recommendation: "Add guardrails (no_hallucination, scope_creep_prevention, etc.) to guide AI behavior.",
    });
  } else {
    if (!data.guardrails.no_hallucination) {
      issues.push({
        severity: "info",
        category: "best_practice",
        file,
        message: "no_hallucination guardrail is disabled",
        recommendation: "Enable no_hallucination to prevent AI from inventing APIs.",
      });
    }
    if (!data.guardrails.scope_creep_prevention) {
      issues.push({
        severity: "info",
        category: "best_practice",
        file,
        message: "scope_creep_prevention guardrail is disabled",
        recommendation: "Enable scope_creep_prevention to keep AI changes focused.",
      });
    }
  }

  // Check testing config
  if (!data.testing?.required) {
    issues.push({
      severity: "info",
      category: "best_practice",
      file,
      message: "testing.required is not enabled",
      recommendation: "Enable testing requirements so AI generates tests alongside code.",
    });
  }

  return issues;
}

// ─── Secret Scanning ───────────────────────────────────────────────────────────

function scanSecrets(
  content: string,
  file: string,
): { violations: SecretViolation[]; issues: AuditIssue[] } {
  const result = scanForSecrets(content, file);
  const issues: AuditIssue[] = [];

  for (const v of result.violations) {
    issues.push({
      severity: "error",
      category: "secret",
      file,
      line: v.line,
      message: `Potential secret detected: ${v.pattern}`,
      recommendation: "Remove the secret from this file and use environment variables instead.",
    });
  }

  return { violations: result.violations, issues };
}

// ─── Dangerous Pattern Scanning ────────────────────────────────────────────────

function scanDangerousPatterns(
  content: string,
  file: string,
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const lines = content.split("\n");

  for (const { name, pattern, recommendation } of DANGEROUS_PATTERNS) {
    const regex = new RegExp(pattern.source, (pattern.flags || "") + "g");
    lines.forEach((line, index) => {
      let match;
      while ((match = regex.exec(line)) !== null) {
        if (match.index === regex.lastIndex) regex.lastIndex++;
        issues.push({
          severity: "error",
          category: "dangerous_pattern",
          file,
          line: index + 1,
          message: `${name} detected`,
          recommendation,
        });
      }
    });
  }

  return issues;
}

// ─── Main Audit Function ───────────────────────────────────────────────────────

/**
 * Audits a GUIDE.md file for security issues, outdated content, and best practices.
 */
export function auditFile(file: string = "GUIDE.md"): AuditResults {
  const target = path.resolve(file);
  const issues: AuditIssue[] = [];

  if (!fs.existsSync(target)) {
    return {
      file: target,
      totalIssues: 1,
      errors: 1,
      warnings: 0,
      info: 0,
      issues: [{
        severity: "error",
        category: "missing_field",
        file: target,
        message: `GUIDE.md not found: ${target}`,
        recommendation: "Run 'guidemd init' to create a GUIDE.md file.",
      }],
      passed: false,
    };
  }

  const content = fs.readFileSync(target, "utf-8");

  // ── Scan for secrets ──
  const secretResult = scanSecrets(content, target);
  issues.push(...secretResult.issues);

  // ── Scan for dangerous patterns ──
  issues.push(...scanDangerousPatterns(content, target));

  // ── Parse and audit frontmatter ──
  const parsed = parseGuideFile(target);
  if (parsed.success) {
    const schemaResult = GuideMdSchema.safeParse(parsed.data);
    if (schemaResult.success) {
      issues.push(...auditFrontmatterFields(schemaResult.data, target));
    } else {
      issues.push({
        severity: "error",
        category: "missing_field",
        file: target,
        message: "Schema validation failed",
        recommendation: "Run 'guidemd lint' to fix schema errors.",
      });
    }
  } else {
    issues.push({
      severity: "error",
      category: "missing_field",
      file: target,
      message: parsed.error,
      recommendation: "Fix the file so it can be parsed correctly.",
    });
  }

  const errors = issues.filter(i => i.severity === "error").length;
  const warnings = issues.filter(i => i.severity === "warning").length;
  const info = issues.filter(i => i.severity === "info").length;

  return {
    file: target,
    totalIssues: issues.length,
    errors,
    warnings,
    info,
    issues,
    passed: errors === 0,
  };
}
