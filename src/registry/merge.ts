// ─── Deep Merge Strategy for Guide Modules ────────────────────────────────────
// Deep merges nested objects, concatenates+deduplicates arrays, overwrites primitives.

import { MergeResult, MergeConflict } from "./types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  path: string = "",
  force: boolean = false
): { result: Record<string, unknown>; conflicts: MergeConflict[] } {
  const result: Record<string, unknown> = { ...target };
  const conflicts: MergeConflict[] = [];

  for (const key of Object.keys(source)) {
    const fullPath = path ? `${path}.${key}` : key;
    const targetValue = target[key];
    const sourceValue = source[key];

    if (targetValue === undefined) {
      result[key] = sourceValue;
      continue;
    }

    if (isObject(targetValue) && isObject(sourceValue)) {
      const nested = deepMerge(targetValue, sourceValue, fullPath, force);
      result[key] = nested.result;
      conflicts.push(...nested.conflicts);
    } else if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      // Concatenate + deduplicate arrays
      const combined = [...targetValue, ...sourceValue];
      const deduped = combined.filter(
        (item, index) =>
          combined.findIndex(
            (other) => JSON.stringify(other) === JSON.stringify(item)
          ) === index
      );
      result[key] = deduped;
      if (targetValue.length > 0 && sourceValue.length > 0) {
        conflicts.push({
          field: fullPath,
          existing: targetValue,
          incoming: sourceValue,
          resolution: "merged",
        });
      }
    } else {
      // Primitive conflict
      if (force) {
        result[key] = sourceValue;
        conflicts.push({
          field: fullPath,
          existing: targetValue,
          incoming: sourceValue,
          resolution: "overwritten",
        });
      } else {
        // Keep existing value, skip incoming
        conflicts.push({
          field: fullPath,
          existing: targetValue,
          incoming: sourceValue,
          resolution: "skipped",
        });
      }
    }
  }

  return { result, conflicts };
}

/**
 * Merges a Guide Module into existing frontmatter data.
 * @param existing The current GUIDE.md frontmatter data
 * @param moduleData The module content to merge in
 * @param force If true, overwrites conflicting primitives instead of skipping
 * @returns Merged data and list of conflicts/resolutions
 */
export function mergeModule(
  existing: Record<string, unknown>,
  moduleData: Record<string, unknown>,
  force: boolean = false
): MergeResult {
  const { result, conflicts } = deepMerge(existing, moduleData, "", force);
  return { data: result, conflicts };
}
