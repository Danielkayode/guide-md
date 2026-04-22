import { fetchModule } from "../registry/sources.js";
import { GuideMdFrontmatter } from "../schema/index.js";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export class CircularDependencyError extends Error {
  chain: string[];
  
  constructor(message: string, chain: string[]) {
    super(message);
    this.name = "CircularDependencyError";
    this.chain = chain;
  }
}

export interface ResolutionError {
  extends: string;
  message: string;
}

export interface ResolveResult {
  data: Record<string, unknown>;
  errors: ResolutionError[];
}

// ─── Resolution ─────────────────────────────────────────────────────────────────

/**
 * Normalizes an extends identifier for consistent circular detection.
 * Converts relative paths to absolute paths where possible.
 */
function normalizeExtendsId(ext: string, basePath: string): string {
  // Normalize local file paths to absolute paths
  if (ext.startsWith("./") || ext.startsWith("../")) {
    return path.resolve(basePath, ext).toLowerCase();
  }
  // Normalize registry names and URLs to lowercase
  return ext.toLowerCase();
}

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
 * @returns ResolveResult with merged data and any resolution errors
 * @throws CircularDependencyError if a circular extends chain is detected
 */
export async function resolveInheritance(
  localData: Record<string, unknown>,
  basePath: string = process.cwd(),
  visited: Set<string> = new Set(),
  chain: string[] = []
): Promise<ResolveResult> {
  if (!localData.extends) {
    return { data: localData, errors: [] };
  }

  const extensions = Array.isArray(localData.extends)
    ? localData.extends
    : [localData.extends];

  let mergedData = { ...localData };
  const errors: ResolutionError[] = [];

  // Resolve extensions in reverse order so that earlier ones take precedence
  // If you have [base, middleware], middleware overrides base, and local overrides both.
  for (const ext of extensions.reverse()) {
    // Runtime type check: skip non-string extends entries
    if (typeof ext !== "string") {
      errors.push({
        extends: String(ext),
        message: `Invalid extends entry: expected string, received ${typeof ext}`
      });
      continue;
    }
    // Normalize the extends identifier for consistent circular detection
    const normalizedExt = normalizeExtendsId(ext, basePath);
    
    if (visited.has(normalizedExt)) {
      throw new CircularDependencyError(
        `Circular extends chain detected: ${[...chain, ext].join(" -> ")}`,
        [...chain, ext]
      );
    }
    
    const newChain = [...chain, ext];
    visited.add(normalizedExt);

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
        const parentResult = await resolveInheritance(parentData, resolvedPath || basePath, visited, newChain);
        
        // Collect any errors from parent resolution
        errors.push(...parentResult.errors);
        
        // Remove 'extends' from parent data before merging (we've already resolved it)
        const { extends: _, ...parentWithoutExtends } = parentResult.data;
        
        // Merge parent into local (deep merge for nested objects)
        mergedData = deepMerge(parentWithoutExtends, mergedData);
      }
    } catch (e) {
      if (e instanceof CircularDependencyError) {
        throw e; // Re-throw circular dependency errors
      }
      // Surface non-circular resolution failures as errors
      errors.push({
        extends: ext,
        message: (e as Error).message || `Failed to resolve extension: ${ext}`
      });
    }
  }

  // Remove 'extends' from final merged data (it's been resolved)
  const { extends: _, ...finalData } = mergedData;
  return { data: finalData, errors };
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
