import { fetchModule } from "../registry/sources.js";
import { GuideMdFrontmatter } from "../schema/index.js";
import matter from "gray-matter";

/**
 * Recursively resolves the 'extends' field in the frontmatter.
 * Merges inherited data into the local data (local takes precedence).
 */
export async function resolveInheritance(
  localData: Record<string, unknown>,
  visited: Set<string> = new Set()
): Promise<Record<string, unknown>> {
  if (!localData.extends) {
    return localData;
  }

  const extensions = Array.isArray(localData.extends)
    ? localData.extends
    : [localData.extends];

  let mergedData = { ...localData };

  // Resolve extensions in reverse order so that earlier ones take precedence?
  // Usually, if you have [base, middleware], middleware overrides base, and local overrides both.
  for (const ext of extensions) {
    if (visited.has(ext)) {
      console.warn(`Circular inheritance detected: ${ext}`);
      continue;
    }
    visited.add(ext);

    let parentData: Record<string, unknown> | null = null;

    try {
      if (ext.startsWith("http")) {
        const response = await fetch(ext);
        const text = await response.text();
        const parsed = matter(text);
        parentData = parsed.data;
      } else {
        // Assume it's a registry module
        const module = await fetchModule(ext, "github");
        if (module) {
          parentData = module.content as Record<string, unknown>;
        }
      }

      if (parentData) {
        // Recursive resolution for the parent
        parentData = await resolveInheritance(parentData, visited);
        
        // Merge parent into local (deep merge for specific known objects)
        mergedData = deepMerge(parentData, mergedData);
      }
    } catch (e) {
      console.error(`Failed to resolve extension ${ext}:`, e);
    }
  }

  return mergedData;
}

function deepMerge(parent: any, child: any): any {
  const result = { ...parent };

  for (const key in child) {
    const parentVal = parent[key];
    const childVal = child[key];

    if (
      parentVal &&
      childVal &&
      typeof parentVal === "object" &&
      typeof childVal === "object" &&
      !Array.isArray(parentVal) &&
      !Array.isArray(childVal)
    ) {
      result[key] = deepMerge(parentVal, childVal);
    } else {
      result[key] = childVal;
    }
  }

  return result;
}
