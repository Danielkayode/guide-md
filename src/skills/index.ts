import { SkillSchema, SkillFrontmatter } from "./schema.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SkillDiagnosticSeverity = "error" | "warning";
export type SkillDiagnosticSource = "schema" | "style" | "security" | "resource";

export interface SkillDiagnostic {
  severity: SkillDiagnosticSeverity;
  source: SkillDiagnosticSource;
  field: string;
  message: string;
  received?: unknown;
}

export interface SkillValidationResult {
  valid: boolean;
  file: string;
  diagnostics: SkillDiagnostic[];
  data: SkillFrontmatter | null;
  skillDir: string;
}

export interface DetectedSkill {
  path: string;
  name: string;
}

// ─── High-Risk Command Patterns ──────────────────────────────────────────────

const HIGH_RISK_PATTERNS = [
  {
    pattern: /rm\s+-rf\s+/i,
    name: "rm -rf",
    description: "Recursive force delete - can destroy data",
  },
  {
    pattern: /sudo\s+/i,
    name: "sudo",
    description: "Elevated privileges - potential security risk",
  },
  {
    pattern: /curl\s+.*\|\s*(?:sh|bash|zsh)/i,
    name: "curl | sh",
    description: "Remote code execution - pipes curl to shell",
  },
  {
    pattern: /wget\s+.*-O\s*-\s*.*\|\s*(?:sh|bash|zsh)/i,
    name: "wget | sh",
    description: "Remote code execution - pipes wget to shell",
  },
  {
    pattern: /eval\s*\(/i,
    name: "eval()",
    description: "Dynamic code evaluation - can execute arbitrary code",
  },
  {
    pattern: /eval\s+['"`]/i,
    name: "eval",
    description: "Dynamic code evaluation - can execute arbitrary code",
  },
  {
    pattern: /child_process/i,
    name: "child_process",
    description: "Node.js process spawning - potential command injection",
  },
  {
    pattern: /os\.system\s*\(/i,
    name: "os.system()",
    description: "Python system command execution",
  },
  {
    pattern: /subprocess\.call/i,
    name: "subprocess.call",
    description: "Python subprocess execution - shell injection risk",
  },
  {
    pattern: /exec\s*\(/i,
    name: "exec()",
    description: "Dynamic code execution - multiple languages",
  },
  {
    pattern: /\/bin\/sh/i,
    name: "/bin/sh",
    description: "Direct shell invocation",
  },
  {
    pattern: /\/bin\/bash/i,
    name: "/bin/bash",
    description: "Direct bash invocation",
  },
  {
    pattern: /mkfs\./i,
    name: "mkfs",
    description: "Filesystem formatting - destructive operation",
  },
  {
    pattern: /dd\s+if=/i,
    name: "dd",
    description: "Low-level disk write - destructive operation",
  },
  {
    pattern: /:\(\)\s*\{\s*:\|:\s*\}&\s*;/i,
    name: "fork bomb",
    description: "Fork bomb pattern - resource exhaustion attack",
  },
  {
    pattern: /chmod\s+777/i,
    name: "chmod 777",
    description: "Overly permissive file permissions",
  },
  {
    pattern: /chmod\s+-R\s+777/i,
    name: "chmod -R 777",
    description: "Recursive overly permissive permissions",
  },
];

// ─── Path Traversal Detection ──────────────────────────────────────────────────

const PATH_TRAVERSAL_PATTERNS = [
  {
    pattern: /\.\.\//,
    name: "relative path traversal",
    description: "Attempts to access parent directories via relative paths",
  },
  {
    pattern: /\.\.\\/,
    name: "Windows path traversal",
    description: "Windows-style parent directory traversal",
  },
  {
    pattern: /%2e%2e%2f/i,
    name: "URL-encoded traversal",
    description: "URL-encoded path traversal attempt",
  },
  {
    pattern: /\.{2,}[\/\\]/,
    name: "multiple dot traversal",
    description: "Multiple dots followed by path separator",
  },
  {
    pattern: /\/etc\/passwd/,
    name: "sensitive file access",
    description: "Attempt to access system password file",
  },
  {
    pattern: /\/etc\/shadow/,
    name: "sensitive file access",
    description: "Attempt to access system shadow password file",
  },
  {
    pattern: /~\/\.ssh/,
    name: "SSH key access",
    description: "Attempt to access SSH private keys",
  },
  {
    pattern: /\/proc\/self/,
    name: "procfs access",
    description: "Attempt to access process filesystem",
  },
  {
    pattern: /\/proc\/\d+/,
    name: "process enumeration",
    description: "Attempt to enumerate system processes",
  },
  {
    pattern: /C:\\/i,
    name: "absolute Windows path",
    description: "Absolute Windows path that may escape skill directory",
  },
  {
    pattern: /\/[a-zA-Z]:\//i,
    name: "Windows drive letter",
    description: "Windows-style absolute path with drive letter",
  },
];

// ─── Third-Person Description Check ────────────────────────────────────────────

const FIRST_PERSON_INDICATORS = [
  /^I\s+/i,           // "I analyze code"
  /^I'\s+/i,          // "I' (contraction start)
  /\bI\s+am\s+/i,     // "I am analyzing"
  /\bI'\s*/i,         // Contractions like "I'm", "I'll", "I've"
  /\bmy\s+/i,         // "my analysis"
  /\bme\s+/i,         // "This helps me"
  /\bmine\s*/i,       // "This is mine"
  /\bmyself\b/i,      // "I did it myself"
  /\bwe\s+/i,         // "We analyze" (also first person plural)
  /\bour\s+/i,        // "our analysis"
  /\bus\s+/i,         // "This helps us"
];

// ─── Markdown Link Extraction ─────────────────────────────────────────────────

/**
 * Extracts all markdown links from content.
 * Returns array of {text, path} objects.
 */
function extractMarkdownLinks(content: string): Array<{ text: string; path: string }> {
  const links: Array<{ text: string; path: string }> = [];

  // Match [text](./path) or [text](./path/to/file) patterns
  const linkRegex = /\[([^\]]+)\]\((\.\/[^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const text = match[1];
    const pathStr = match[2];
    if (text !== undefined && pathStr !== undefined) {
      links.push({
        text,
        path: pathStr,
      });
    }
  }

  return links;
}

// ─── Skill Discovery ───────────────────────────────────────────────────────────

/**
 * Recursively finds all SKILL.md files within a directory.
 * Returns array of detected skill paths.
 */
export function detectSkills(projectPath: string): DetectedSkill[] {
  const skills: DetectedSkill[] = [];

  function scanDir(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden directories and common ignore patterns
          if (
            entry.name.startsWith(".") ||
            entry.name === "node_modules" ||
            entry.name === "dist" ||
            entry.name === "build" ||
            entry.name === "coverage"
          ) {
            continue;
          }

          scanDir(fullPath);
        } else if (entry.isFile() && entry.name === "SKILL.md") {
          // Found a skill - extract name from directory
          const skillName = path.basename(dir);
          skills.push({
            path: fullPath,
            name: skillName,
          });
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  scanDir(projectPath);
  return skills;
}

// ─── Skill Validation ────────────────────────────────────────────────────────

/**
 * Validates a single SKILL.md file.
 * Performs:
 * 1. YAML frontmatter validation (schema, kebab-case, SemVer, third-person)
 * 2. Resource integrity checks (markdown links exist)
 * 3. Security heuristics (high-risk commands, path traversal)
 */
export function validateSkill(skillPath: string): SkillValidationResult {
  const diagnostics: SkillDiagnostic[] = [];
  const skillDir = path.dirname(skillPath);

  // ── Step 1: Read and Parse ────────────────────────────────────────────────
  let rawContent: string;
  try {
    rawContent = fs.readFileSync(skillPath, "utf-8");
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      file: skillPath,
      diagnostics: [
        {
          severity: "error",
          source: "schema",
          field: "(file)",
          message: `Failed to read SKILL.md: ${reason}`,
        },
      ],
      data: null,
      skillDir,
    };
  }

  // Parse frontmatter
  let parsed: { data: Record<string, unknown>; content: string };
  try {
    parsed = matter(rawContent);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      file: skillPath,
      diagnostics: [
        {
          severity: "error",
          source: "schema",
          field: "(frontmatter)",
          message: `Invalid YAML frontmatter: ${reason}`,
        },
      ],
      data: null,
      skillDir,
    };
  }

  // ── Step 2: Schema Validation ─────────────────────────────────────────────
  const schemaResult = SkillSchema.safeParse(parsed.data);

  if (!schemaResult.success) {
    const schemaErrors: SkillDiagnostic[] = schemaResult.error.errors.map((err) => ({
      severity: "error",
      source: "schema",
      field: err.path.join(".") || "(root)",
      message: err.message,
      received: err.code === "invalid_type" ? err.received : undefined,
    }));
    diagnostics.push(...schemaErrors);
  }

  // ── Step 3: Style Validation (Third-Person Check) ───────────────────────────
  const description = parsed.data.description;
  if (typeof description === "string") {
    for (const indicator of FIRST_PERSON_INDICATORS) {
      if (indicator.test(description)) {
        diagnostics.push({
          severity: "error",
          source: "style",
          field: "description",
          message:
            "Description must be in third-person (e.g., 'Analyzes code' not 'I analyze code'). " +
            "First-person indicators like 'I', 'my', 'we', 'our' are not allowed.",
          received: description.substring(0, 100) + (description.length > 100 ? "..." : ""),
        });
        break; // Only report once
      }
    }
  }

  // ── Step 4: Resource Integrity Check ───────────────────────────────────────
  const markdownLinks = extractMarkdownLinks(parsed.content);
  const missingResources: Array<{ text: string; path: string }> = [];

  for (const link of markdownLinks) {
    // Resolve relative to skill directory
    const resolvedPath = path.resolve(skillDir, link.path);

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      missingResources.push(link);
    }
  }

  if (missingResources.length > 0) {
    for (const missing of missingResources) {
      diagnostics.push({
        severity: "error",
        source: "resource",
        field: "content",
        message: `Broken markdown link: "${missing.text}" references missing file "${missing.path}"`,
      });
    }
  }

  // ── Step 5: Security Heuristics ─────────────────────────────────────────────
  // Check for high-risk commands in the markdown content
  const contentLower = parsed.content.toLowerCase();

  for (const risk of HIGH_RISK_PATTERNS) {
    if (risk.pattern.test(parsed.content)) {
      diagnostics.push({
        severity: "error",
        source: "security",
        field: "content",
        message: `High-risk command detected: ${risk.name} - ${risk.description}. ` +
          "Skills should not contain destructive or security-sensitive operations.",
      });
    }
  }

  // Check for path traversal attempts
  for (const traversal of PATH_TRAVERSAL_PATTERNS) {
    if (traversal.pattern.test(parsed.content)) {
      diagnostics.push({
        severity: "error",
        source: "security",
        field: "content",
        message: `Path traversal risk detected: ${traversal.name} - ${traversal.description}. ` +
          "Skills should not attempt to access files outside their directory.",
      });
    }
  }

  // ── Step 6: Return Result ─────────────────────────────────────────────────
  const hasErrors = diagnostics.filter((d) => d.severity === "error").length > 0;

  return {
    valid: !hasErrors,
    file: skillPath,
    diagnostics,
    data: schemaResult.success ? schemaResult.data : null,
    skillDir,
  };
}

/**
 * Validates all detected skills in a project.
 */
export function validateAllSkills(projectPath: string): SkillValidationResult[] {
  const detectedSkills = detectSkills(projectPath);
  return detectedSkills.map((skill) => validateSkill(skill.path));
}

// ─── Export for CLI Integration ───────────────────────────────────────────────

export { SkillSchema, SkillFrontmatter } from "./schema.js";
