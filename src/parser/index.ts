import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";

// Security: Maximum file size to prevent memory exhaustion (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Security: Maximum frontmatter depth to prevent stack overflow
const MAX_FRONTMATTER_DEPTH = 10;
// Security: Maximum number of keys in frontmatter
const MAX_FRONTMATTER_KEYS = 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParseResultSuccess {
  success: true;
  data: Record<string, unknown>;
  content: string;
  error: null;
}

export interface ParseResultFailure {
  success: false;
  data: null;
  content: string;
  error: string;
}

export type ParseResult = ParseResultSuccess | ParseResultFailure;

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Validates that parsed frontmatter doesn't exceed safe depth limits.
 */
function validateFrontmatterDepth(obj: Record<string, unknown>, depth = 0): boolean {
  if (depth > MAX_FRONTMATTER_DEPTH) {
    return false;
  }
  
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      if (!validateFrontmatterDepth(value as Record<string, unknown>, depth + 1)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Counts total keys in frontmatter object recursively.
 */
function countFrontmatterKeys(obj: Record<string, unknown>): number {
  let count = 0;
  for (const key of Object.keys(obj)) {
    count++;
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      count += countFrontmatterKeys(value as Record<string, unknown>);
    }
    // Limit check during counting to avoid excessive iteration
    if (count > MAX_FRONTMATTER_KEYS) {
      return count;
    }
  }
  return count;
}

/**
 * Reads and parses a GUIDE.md file, extracting YAML frontmatter.
 * This is separate from *validation* — a file can parse successfully
 * but still fail Zod validation.
 */
export function parseGuideFile(filePath: string): ParseResult {
  const resolved = path.resolve(filePath);

  // ── 1. File existence check ────────────────────────────────────────────────
  if (!fs.existsSync(resolved)) {
    return {
      success: false,
      data: null,
      content: "",
      error: `File not found: ${resolved}`,
    };
  }

  // ── 1b. File size check (security: prevent memory exhaustion) ───────────
  try {
    const stats = fs.statSync(resolved);
    if (stats.size > MAX_FILE_SIZE) {
      return {
        success: false,
        data: null,
        content: "",
        error: `File too large: ${stats.size} bytes exceeds maximum of ${MAX_FILE_SIZE} bytes`,
      };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      data: null,
      content: "",
      error: `Could not check file size: ${error}`,
    };
  }

  // ── 2. Filename convention check ─────────────────────────────────────────
  const basename = path.basename(resolved);
  if (basename !== "GUIDE.md") {
    return {
      success: false,
      data: null,
      content: "",
      error: `Invalid filename: "${basename}". The spec requires the file be named exactly "GUIDE.md" (uppercase).`,
    };
  }

  // ── 3. Read & parse ───────────────────────────────────────────────────────
  let raw: string;
  try {
    raw = fs.readFileSync(resolved, "utf-8");
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      data: null,
      content: "",
      error: `Could not read file: ${error}`,
    };
  }

  // ── 4. gray-matter extraction ─────────────────────────────────────────────
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      data: null,
      content: "",
      error: `YAML frontmatter parse error: ${error}`,
    };
  }

  // ── 5. Empty frontmatter guard ────────────────────────────────────────────
  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    return {
      success: false,
      data: null,
      content: parsed.content ?? "",
      error: "No frontmatter found. GUIDE.md must begin with a YAML block enclosed in --- delimiters.",
    };
  }

  // ── 5b. Frontmatter complexity guard (security: prevent memory exhaustion) ─
  const frontmatterData = parsed.data as Record<string, unknown>;
  if (!validateFrontmatterDepth(frontmatterData)) {
    return {
      success: false,
      data: null,
      content: parsed.content ?? "",
      error: `Frontmatter too deeply nested (max ${MAX_FRONTMATTER_DEPTH} levels)`,
    };
  }
  
  const keyCount = countFrontmatterKeys(frontmatterData);
  if (keyCount > MAX_FRONTMATTER_KEYS) {
    return {
      success: false,
      data: null,
      content: parsed.content ?? "",
      error: `Frontmatter too complex: ${keyCount} keys exceeds maximum of ${MAX_FRONTMATTER_KEYS}`,
    };
  }

  return {
    success: true,
    data: frontmatterData,
    content: parsed.content,
    error: null,
  };
}
