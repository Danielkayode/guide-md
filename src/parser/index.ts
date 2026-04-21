import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";

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

  return {
    success: true,
    data: parsed.data as Record<string, unknown>,
    content: parsed.content,
    error: null,
  };
}
