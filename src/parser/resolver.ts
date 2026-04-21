import { fetchModule } from "../registry/sources.js";
import { GuideMdFrontmatter } from "../schema/index.js";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CircularDependencyError extends Error {
  chain: string[];
}

// ─── Resolution ─────────────────────────────────────────────────────────────────

/**
 * Recursively resolves the 'extends' field in the frontmatter.
 * Merges inherited data into the local data (local takes precedence).
 * 
 * Supports:
 * - Local file paths (e.g., extends: "./base-guide.md")
 * - Registry module names (e.g., extends: "typescript-strict")
 * - Remote URLs (e.g., extends: "https://example.com/guide.md")
 * 
 * @param localData The local frontmatter data containing the 'extends' field
 * @param basePath The base directory for resolving relative file paths
 * @param visited Set of already visited extends to detect circular dependencies
 * @param chain Array tracking the current extends chain for error reporting
 * @returns The merged data with all extends resolved
 * @throws CircularDependencyError if a circular extends chain is detected
 */
export async function resolveInheritance(
  localData: Record<string, unknown>,
  basePath: string = process.cwd(),
  visited: Set<string> = new Set(),
  chain: string[] = []
): Promise<Record<string, unknown>> {
  if (!localData.extends) {
    return localData;
  }

  const extensions = Array.isArray(localData.extends)
    ? localData.extends
    : [localData.extends];

  let mergedData = { ...localData };

  // Resolve extensions in reverse order so that earlier ones take precedence
  // If you have [base, middleware], middleware overrides base, and local overrides both.
  for (const ext of extensions as string[]) {
    if (visited.has(ext)) {
      const error = new Error(
        `Circular extends chain detected: ${[...chain, ext].join(" -> ")}`
      ) as CircularDependencyError;
      error.chain = [...chain, ext];
      throw error;
    }
    
    const newChain = [...chain, ext];
    visited.add(ext);

    let parentData: Record<string, unknown> | null = null;
    let resolvedPath: string | null = null;

    try {
      if (ext.startsWith("http://") || ext.startsWith("https://")) {
        // Remote URL
        const response = await fetch(ext);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${ext}`);
        }
        const text = await response.text();
        const parsed = matter(text);
        parentData = parsed.data;
        resolvedPath = ext;
      } else if (ext.startsWith("./") || ext.startsWith("../") || ext.endsWith(".md") || ext.endsWith(".guide")) {
        // Local file path
        const filePath = path.resolve(basePath, ext);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Local extends file not found: ${filePath}`);
        }
        
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = matter(content);
        parentData = parsed.data;
        resolvedPath = path.dirname(filePath);
      } else {
        // Assume it's a registry module
        const module = await fetchModule(ext, "github");
        if (module) {
          parentData = module.content as Record<string, unknown>;
          resolvedPath = basePath; // Registry modules don't have a local path
        } else {
          throw new Error(`Registry module not found: ${ext}`);
        }
      }

      if (parentData) {
        // Recursive resolution for the parent
        parentData = await resolveInheritance(parentData, resolvedPath || basePath, visited, newChain);
        
        // Remove 'extends' from parent data before merging (we've already resolved it)
        const { extends: _, ...parentWithoutExtends } = parentData;
        
        // Merge parent into local (deep merge for nested objects)
        mergedData = deepMerge(parentWithoutExtends, mergedData);
      }
    } catch (e) {
      if ((e as Error).name === "CircularDependencyError" || (e as CircularDependencyError).chain) {
        throw e; // Re-throw circular dependency errors
      }
      console.error(`Failed to resolve extension ${ext}:`, e);
      // Continue with other extensions even if one fails
    }
  }

  // Remove 'extends' from final merged data (it's been resolved)
  const { extends: _, ...finalData } = mergedData;
  return finalData;
}

/**
 * Checks if an extends value is a local file path.
 */
function isLocalPath(ext: string): boolean {
  return ext.startsWith("./") || ext.startsWith("../") || ext.startsWith("/") || ext.endsWith(".md") || ext.endsWith(".guide");
}

/**
 * Checks if an extends value is a remote URL.
 */
function isRemoteUrl(ext: string): boolean {
  return ext.startsWith("http://") || ext.startsWith("https://");
}

/**
 * Loads and parses a local GUIDE.md file.
 */
function loadLocalGuide(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(content);
    return parsed.data as Record<string, unknown>;
  } catch {
    return null;
  }
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
