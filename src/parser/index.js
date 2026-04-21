import matter from "gray-matter";
import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {Object} ParseResult
 * @property {boolean} success
 * @property {Record<string, any> | null} data   - The raw frontmatter object
 * @property {string} content                    - The markdown body (after frontmatter)
 * @property {string | null} error               - Parse-level error message if any
 */

/**
 * Reads and parses a GUIDE.md file, extracting YAML frontmatter.
 * This is separate from *validation* — a file can parse successfully
 * but still fail Zod validation.
 *
 * @param {string} filePath - Absolute or relative path to the GUIDE.md file
 * @returns {ParseResult}
 */
export function parseGuideFile(filePath) {
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
  let raw;
  try {
    raw = fs.readFileSync(resolved, "utf-8");
  } catch (err) {
    return {
      success: false,
      data: null,
      content: "",
      error: `Could not read file: ${err.message}`,
    };
  }

  // ── 4. gray-matter extraction ─────────────────────────────────────────────
  let parsed;
  try {
    parsed = matter(raw);
  } catch (err) {
    return {
      success: false,
      data: null,
      content: "",
      error: `YAML frontmatter parse error: ${err.message}`,
    };
  }

  // ── 5. Empty frontmatter guard ────────────────────────────────────────────
  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    return {
      success: false,
      data: null,
      content: parsed.content ?? "",
      error:
        "No frontmatter found. GUIDE.md must begin with a YAML block enclosed in --- delimiters.",
    };
  }

  return {
    success: true,
    data: parsed.data,
    content: parsed.content,
    error: null,
  };
}
