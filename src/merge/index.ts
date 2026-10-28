import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { GuideMdSchema, GuideMdFrontmatter } from "../schema/index.js";
import { parseGuideFile } from "../parser/index.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MergeConflict {
  field: string;
  resolution: "overwritten" | "merged" | "skipped";
  sourceFile: string;
}

export interface MergeResult {
  outputFile: string;
  mergedData: GuideMdFrontmatter;
  conflicts: MergeConflict[];
  mergedFrom: string[];
  changed: boolean;
}

// ─── Merge Strategies ──────────────────────────────────────────────────────────

function mergeArrays<T>(a: T[] | undefined, b: T[] | undefined): T[] {
  const result: T[] = [];
  if (a) result.push(...a);
  if (b) {
    for (const item of b) {
      if (!result.includes(item)) result.push(item);
    }
  }
  return result;
}

function mergeObjects(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
  path: string[],
  conflicts: MergeConflict[],
  sourceFile: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(a ?? {}) };

  if (!b) return result;

  for (const [key, value] of Object.entries(b)) {
    const fullPath = [...path, key];

    if (key in result) {
      const existing = result[key];

      // Arrays: merge uniquely
      if (Array.isArray(existing) && Array.isArray(value)) {
        const merged = mergeArrays(existing, value);
        if (JSON.stringify(merged) !== JSON.stringify(existing)) {
          conflicts.push({
            field: fullPath.join("."),
            resolution: "merged",
            sourceFile,
          });
        }
        result[key] = merged;
      }
      // Objects: recurse
      else if (
        existing &&
        typeof existing === "object" &&
        !Array.isArray(existing) &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        result[key] = mergeObjects(
          existing as Record<string, unknown>,
          value as Record<string, unknown>,
          fullPath,
          conflicts,
          sourceFile,
        );
      }
      // Primitives: source (later file) overwrites, but record conflict
      else if (JSON.stringify(existing) !== JSON.stringify(value)) {
        conflicts.push({
          field: fullPath.join("."),
          resolution: "overwritten",
          sourceFile,
        });
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ─── Main Merge Function ───────────────────────────────────────────────────────

/**
 * Merges multiple GUIDE.md files into one. Later files take precedence over
 * earlier ones for scalar fields; arrays are merged uniquely; objects are
 * merged recursively.
 *
 * @param files - Array of file paths to merge, in priority order (later = higher priority)
 * @param outputFile - Path to write the merged GUIDE.md
 * @returns MergeResult with merged data and any conflicts
 */
export function mergeGuides(
  files: string[],
  outputFile: string = "./GUIDE.md",
): MergeResult {
  if (files.length === 0) {
    throw new Error("At least one GUIDE.md file is required to merge.");
  }

  const conflicts: MergeConflict[] = [];
  const mergedData: Record<string, unknown> = { guide_version: "1.0.0" };
  const mergedFrom: string[] = [];
  let changed = false;

  // Collect all body content from all files (concatenate with separators)
  const bodyParts: string[] = [];

  for (const file of files) {
    const target = path.resolve(file);

    if (!fs.existsSync(target)) {
      throw new Error(`GUIDE.md not found: ${target}`);
    }

    const parsed = parseGuideFile(target);
    if (!parsed.success) {
      throw new Error(`Failed to parse ${file}: ${parsed.error}`);
    }

    const schemaResult = GuideMdSchema.safeParse(parsed.data);
    if (!schemaResult.success) {
      throw new Error(
        `Schema validation failed for ${file}: ${schemaResult.error.errors.map(e => e.message).join(", ")}`,
      );
    }

    const data = schemaResult.data;

    // Merge frontmatter
    const merged = mergeObjects(mergedData, data, [], conflicts, file);
    // Copy over all merged fields
    for (const [key, value] of Object.entries(merged)) {
      mergedData[key] = value;
    }

    mergedFrom.push(file);

    // Collect body content
    if (parsed.content && parsed.content.trim().length > 0) {
      bodyParts.push(`\n\n<!-- Merged from ${file} -->\n\n${parsed.content.trim()}`);
    }
  }

  // Validate merged data
  const validationResult = GuideMdSchema.safeParse(mergedData);
  if (!validationResult.success) {
    throw new Error(
      `Merged data is invalid: ${validationResult.error.errors.map(e => e.message).join(", ")}`,
    );
  }

  // Determine if output file already exists and differs
  const outputPath = path.resolve(outputFile);
  let existingContent = "";
  if (fs.existsSync(outputPath)) {
    existingContent = fs.readFileSync(outputPath, "utf-8");
  }

  const newContent = matter.stringify(bodyParts.join("\n"), mergedData);

  if (existingContent !== newContent) {
    changed = true;
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, newContent, "utf-8");
  }

  return {
    outputFile: outputPath,
    mergedData: validationResult.data,
    conflicts,
    mergedFrom,
    changed,
  };
}
