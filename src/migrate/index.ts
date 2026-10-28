import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { GuideMdSchema } from "../schema/index.js";
import { parseGuideFile } from "../parser/index.js";

export interface MigrateResult {
  changed: boolean;
  changes: string[];
  version: string;
}

/**
 * Migrates a GUIDE.md file's frontmatter to the current schema version.
 * Returns the changes made without writing to disk unless write=true.
 */
export function migrateGuide(
  file: string = "GUIDE.md",
  opts: { force?: boolean; write?: boolean } = {},
): MigrateResult {
  const target = path.resolve(file);
  const currentVersion = "0.2.5";
  const changes: string[] = [];

  if (!fs.existsSync(target)) {
    throw new Error(`GUIDE.md not found: ${target}`);
  }

  const parsed = parseGuideFile(target);
  if (!parsed.success) {
    throw new Error(parsed.error);
  }

  const nextData = { ...parsed.data };

  // ── 1. guide_version ─────────────────────────────────────────────────────
  if (!nextData.guide_version) {
    nextData.guide_version = currentVersion;
    changes.push(`guide_version: set to ${currentVersion}`);
  } else if (nextData.guide_version !== currentVersion && opts.force) {
    changes.push(
      `guide_version: ${nextData.guide_version} → ${currentVersion}`,
    );
    nextData.guide_version = currentVersion;
  }

  // ── 2. Required identity fields ──────────────────────────────────────────
  if (!nextData.project) {
    const dirName = path.basename(path.dirname(target));
    nextData.project = dirName;
    changes.push(`project: set to "${dirName}" (from directory name)`);
  }
  if (!nextData.language) {
    nextData.language = "typescript";
    changes.push("language: set to typescript (default)");
  }
  if (nextData.strict_typing === undefined) {
    nextData.strict_typing = true;
    changes.push("strict_typing: set to true (default)");
  }
  if (!nextData.error_protocol) {
    nextData.error_protocol = "verbose";
    changes.push("error_protocol: set to verbose (default)");
  }

  // ── 4. Validate migrated data ────────────────────────────────────────────
  const migratedResult = GuideMdSchema.safeParse(nextData);
  if (!migratedResult.success) {
    throw new Error(
      `Migration produced invalid frontmatter: ${migratedResult.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ")}`,
    );
  }

  // ── 5. Write back ────────────────────────────────────────────────────────
  if (opts.write !== false && changes.length > 0) {
    const originalContent = fs.readFileSync(target, "utf-8");
    const matterParsed = matter(originalContent);
    const newContent = matter.stringify(matterParsed.content, nextData);
    fs.writeFileSync(target, newContent, "utf-8");
  }

  return {
    changed: changes.length > 0,
    changes,
    version: currentVersion,
  };
}
