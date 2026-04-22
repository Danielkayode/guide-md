import { parseGuideFile } from "../parser/index.js";
import { GuideMdFrontmatter } from "../schema/index.js";
import fs from "node:fs";
import path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiffResult {
  breaking: boolean;
  sections: DiffSection[];
}

export interface DiffSection {
  name: string;
  changes: Change[];
}

export interface Change {
  type: "added" | "removed" | "modified";
  field?: string;
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
  description: string;
  breaking: boolean;
}

// ─── Frontmatter Diff ─────────────────────────────────────────────────────────

/**
 * Compares two frontmatter objects and returns field-level changes.
 */
function diffFrontmatter(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  path: string = ""
): Change[] {
  const changes: Change[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    const oldValue = oldData[key];
    const newValue = newData[key];

    // Key removed
    if (!(key in newData)) {
      changes.push({
        type: "removed",
        field: key,
        path: currentPath,
        oldValue,
        description: `Removed ${currentPath}`,
        breaking: isBreakingChange(currentPath, oldValue, undefined),
      });
      continue;
    }

    // Key added
    if (!(key in oldData)) {
      changes.push({
        type: "added",
        field: key,
        path: currentPath,
        newValue,
        description: `Added ${currentPath}: ${formatValue(newValue)}`,
        breaking: isBreakingChange(currentPath, undefined, newValue),
      });
      continue;
    }

    // Both exist - compare values
    const oldType = typeof oldValue;
    const newType = typeof newValue;

    if (oldType !== newType) {
      changes.push({
        type: "modified",
        field: key,
        path: currentPath,
        oldValue,
        newValue,
        description: `Changed ${currentPath} type from ${oldType} to ${newType}`,
        breaking: isBreakingChange(currentPath, oldValue, newValue),
      });
    } else if (oldType === "object" && oldValue !== null && newValue !== null) {
      // Deep compare objects
      if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        // Compare arrays
        const arrayChanges = diffArray(oldValue, newValue, currentPath);
        changes.push(...arrayChanges);
      } else if (!Array.isArray(oldValue) && !Array.isArray(newValue)) {
        // Recurse into nested objects
        const nestedChanges = diffFrontmatter(
          oldValue as Record<string, unknown>,
          newValue as Record<string, unknown>,
          currentPath
        );
        changes.push(...nestedChanges);
      }
    } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      // Primitive value changed
      changes.push({
        type: "modified",
        field: key,
        path: currentPath,
        oldValue,
        newValue,
        description: `Changed ${currentPath}: ${formatValue(oldValue)} → ${formatValue(newValue)}`,
        breaking: isBreakingChange(currentPath, oldValue, newValue),
      });
    }
  }

  return changes;
}

/**
 * Compares two arrays and returns changes.
 */
function diffArray(oldArray: unknown[], newArray: unknown[], path: string): Change[] {
  const changes: Change[] = [];

  // Find removed items
  for (const item of oldArray) {
    if (!newArray.some((newItem) => JSON.stringify(newItem) === JSON.stringify(item))) {
      changes.push({
        type: "removed",
        path,
        oldValue: item,
        description: `Removed from ${path}: ${formatValue(item)}`,
        breaking: isBreakingArrayChange(path, item, "removed"),
      });
    }
  }

  // Find added items
  for (const item of newArray) {
    if (!oldArray.some((oldItem) => JSON.stringify(oldItem) === JSON.stringify(item))) {
      changes.push({
        type: "added",
        path,
        newValue: item,
        description: `Added to ${path}: ${formatValue(item)}`,
        breaking: isBreakingArrayChange(path, item, "added"),
      });
    }
  }

  return changes;
}

/**
 * Determines if a change is breaking for AI agent behavior.
 */
function isBreakingChange(path: string, oldValue: unknown, newValue: unknown): boolean {
  const breakingFields = [
    "guardrails.no_hallucination",
    "guardrails.scope_creep_prevention",
    "guardrails.dry_run_on_destructive",
    "guardrails.max_response_scope",
    "strict_typing",
    "error_protocol",
    "context.entry_points",
    "context.off_limits",
    "code_style.max_line_length",
    "code_style.naming_convention",
    "language",
    "framework",
  ];

  // Check if this path matches or is nested under a breaking field
  for (const breakingField of breakingFields) {
    if (path === breakingField || path.startsWith(`${breakingField}.`)) {
      return true;
    }
  }

  // Guardrails being disabled is breaking
  if (path.includes("guardrails") && oldValue === true && newValue === false) {
    return true;
  }

  // Entry points changing is breaking
  if (path.includes("entry_points")) {
    return true;
  }

  return false;
}

function isBreakingArrayChange(path: string, value: unknown, operation: "added" | "removed"): boolean {
  // Changes to off_limits are always breaking
  if (path.includes("off_limits")) {
    return true;
  }

  // Changes to entry_points are always breaking
  if (path.includes("entry_points")) {
    return true;
  }

  return false;
}

/**
 * Formats a value for display in diff output.
 */
function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.length} items]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    if (keys.length === 0) return "{}";
    return `{${keys.join(", ")}}`;
  }
  return String(value);
}

// ─── Body Diff ────────────────────────────────────────────────────────────────

interface BodySection {
  heading: string;
  level: number;
  content: string;
}

/**
 * Parses markdown content into sections by heading.
 */
function parseBodySections(content: string): BodySection[] {
  const sections: BodySection[] = [];
  const lines = content.split("\n");

  let currentSection: BodySection | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join("\n").trim();
        sections.push(currentSection);
      }

      // Start new section
      if (!headingMatch) continue;
      const headingText = headingMatch[2]?.trim() ?? "";
      const level = headingMatch[1]?.length ?? 1;
      currentSection = {
        heading: headingText,
        level,
        content: "",
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection) {
    currentSection.content = currentContent.join("\n").trim();
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Diff two markdown bodies by section.
 */
function diffBody(oldContent: string, newContent: string): Change[] {
  const changes: Change[] = [];

  const oldSections = parseBodySections(oldContent);
  const newSections = parseBodySections(newContent);

  const oldHeadings = new Map(oldSections.map((s) => [s.heading, s]));
  const newHeadings = new Map(newSections.map((s) => [s.heading, s]));

  // Find removed sections
  for (const [heading, section] of oldHeadings) {
    if (!newHeadings.has(heading)) {
      changes.push({
        type: "removed",
        path: `body.${heading}`,
        oldValue: section.content.substring(0, 100) + (section.content.length > 100 ? "..." : ""),
        description: `Removed section: ## ${heading}`,
        breaking: false,
      });
    }
  }

  // Find added sections
  for (const [heading, section] of newHeadings) {
    if (!oldHeadings.has(heading)) {
      changes.push({
        type: "added",
        path: `body.${heading}`,
        newValue: section.content.substring(0, 100) + (section.content.length > 100 ? "..." : ""),
        description: `Added section: ## ${heading}`,
        breaking: false,
      });
    }
  }

  // Find modified sections
  for (const [heading, oldSection] of oldHeadings) {
    const newSection = newHeadings.get(heading);
    if (newSection && oldSection.content !== newSection.content) {
      changes.push({
        type: "modified",
        path: `body.${heading}`,
        description: `Modified section: ## ${heading}`,
        breaking: false,
      });
    }
  }

  return changes;
}

// ─── Main Diff Function ───────────────────────────────────────────────────────

export interface DiffOptions {
  breaking?: boolean | undefined;
  git?: boolean | undefined;
}

/**
 * Compares two GUIDE.md files and returns structured differences.
 */
export function diffGuides(
  oldFilePath: string,
  newFilePath: string,
  options: DiffOptions = {}
): DiffResult {
  // Parse both files
  const oldParsed = parseGuideFile(oldFilePath);
  const newParsed = parseGuideFile(newFilePath);

  if (!oldParsed.success) {
    throw new Error(`Failed to parse old file: ${oldParsed.error}`);
  }

  if (!newParsed.success) {
    throw new Error(`Failed to parse new file: ${newParsed.error}`);
  }

  const sections: DiffSection[] = [];

  // Frontmatter diff
  const frontmatterChanges = diffFrontmatter(oldParsed.data || {}, newParsed.data || {});
  if (frontmatterChanges.length > 0) {
    sections.push({
      name: "frontmatter",
      changes: frontmatterChanges,
    });
  }

  // Guardrails diff
  const oldGuardrails = ((oldParsed.data as GuideMdFrontmatter)?.guardrails || {}) as Record<string, unknown>;
  const newGuardrails = ((newParsed.data as GuideMdFrontmatter)?.guardrails || {}) as Record<string, unknown>;
  const guardrailsChanges = diffFrontmatter(oldGuardrails, newGuardrails, "guardrails");
  if (guardrailsChanges.length > 0) {
    sections.push({
      name: "guardrails",
      changes: guardrailsChanges,
    });
  }

  // Context diff
  const oldContext = ((oldParsed.data as GuideMdFrontmatter)?.context || {}) as Record<string, unknown>;
  const newContext = ((newParsed.data as GuideMdFrontmatter)?.context || {}) as Record<string, unknown>;
  const contextChanges = diffFrontmatter(oldContext, newContext, "context");
  if (contextChanges.length > 0) {
    sections.push({
      name: "context",
      changes: contextChanges,
    });
  }

  // Body diff
  const bodyChanges = diffBody(oldParsed.content, newParsed.content);
  if (bodyChanges.length > 0) {
    sections.push({
      name: "body",
      changes: bodyChanges,
    });
  }

  // Filter for breaking changes only if requested
  if (options.breaking) {
    for (const section of sections) {
      section.changes = section.changes.filter((c) => c.breaking);
    }
  }

  // Remove sections with no changes
  const nonEmptySections = sections.filter((s) => s.changes.length > 0);

  // Determine if there are any breaking changes
  const hasBreaking = nonEmptySections.some((s) => s.changes.some((c) => c.breaking));

  return {
    breaking: hasBreaking,
    sections: nonEmptySections,
  };
}

/**
 * Validates and sanitizes a file path component for safe use in shell commands.
 */
function sanitizePathComponent(component: string): string | null {
  // Reject empty or path traversal attempts
  if (!component || component === "." || component === "..") {
    return null;
  }
  
  // Reject any component with path separators or dangerous characters
  if (/[\/\\<>|&;$*?`\"']/.test(component)) {
    return null;
  }
  
  // Reject control characters
  if (/[\x00-\x1f\x7f]/.test(component)) {
    return null;
  }
  
  // Reject overly long components
  if (component.length > 255) {
    return null;
  }
  
  return component;
}

/**
 * Diffs the current GUIDE.md against git HEAD.
 */
export async function diffGit(filePath: string, options: DiffOptions = {}): Promise<DiffResult> {
  const { spawn } = await import("child_process");
  const os = await import("node:os");

  // Get the file content from git HEAD
  try {
    // Security: Validate filePath before using in shell command
    const baseName = path.basename(filePath);
    const sanitizedName = sanitizePathComponent(baseName);
    if (!sanitizedName) {
      throw new Error("Invalid file name");
    }
    
    // Use spawn instead of exec to avoid shell injection
    const gitProcess = spawn("git", ["show", `HEAD:${sanitizedName}`], {
      cwd: path.dirname(filePath),
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    // Collect buffers first, then decode to handle UTF-8 characters across chunk boundaries
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    gitProcess.stdout.on("data", (data: Buffer) => {
      stdoutChunks.push(data);
    });

    gitProcess.stderr.on("data", (data: Buffer) => {
      stderrChunks.push(data);
    });
    
    const exitCode = await new Promise<number>((resolve) => {
      gitProcess.on("close", resolve);
    });

    // Decode collected buffers to strings
    const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
    const stderr = Buffer.concat(stderrChunks).toString("utf-8");

    if (exitCode !== 0) {
      throw new Error(`Git command failed: ${stderr || "Unknown error"}`);
    }

    // Security: Use os.tmpdir() for secure temp directory location
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "guidemd-diff-"));
    const tempFile = path.join(tempDir, "HEAD-GUIDE.md");
    
    // Security: Ensure tempFile is within tempDir (path traversal check)
    const resolvedTempDir = path.resolve(tempDir);
    const resolvedTempFile = path.resolve(tempFile);
    if (!resolvedTempFile.startsWith(resolvedTempDir + path.sep)) {
      throw new Error("Security: Temp file path traversal detected");
    }
    
    await fs.promises.writeFile(tempFile, stdout, "utf-8");

    try {
      const result = diffGuides(tempFile, filePath, options);
      return result;
    } finally {
      // Security: Verify tempDir is in temp directory before deletion
      const resolvedOsTemp = path.resolve(os.tmpdir());
      if (resolvedTempDir.startsWith(resolvedOsTemp + path.sep) || resolvedTempDir === resolvedOsTemp) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get git version: ${errorMessage}`);
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Formats diff result as human-readable text.
 */
export function formatDiff(result: DiffResult): string {
  const lines: string[] = [];

  if (result.sections.length === 0) {
    return "No changes detected.";
  }

  lines.push(`Changes detected: ${result.breaking ? "⚠️ Contains breaking changes" : "✓ No breaking changes"}`);
  lines.push("");

  for (const section of result.sections) {
    lines.push(`[${section.name}]`);
    lines.push("─".repeat(40));

    for (const change of section.changes) {
      const icon = change.type === "added" ? "+" : change.type === "removed" ? "−" : "~";
      const breaking = change.breaking ? " ⚠️ BREAKING" : "";
      lines.push(`  ${icon} ${change.description}${breaking}`);

      if (change.type === "modified" && change.oldValue !== undefined && change.newValue !== undefined) {
        lines.push(`    ${formatValue(change.oldValue)} → ${formatValue(change.newValue)}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Formats diff result as JSON.
 */
export function formatDiffJson(result: DiffResult): string {
  return JSON.stringify(result, null, 2);
}
