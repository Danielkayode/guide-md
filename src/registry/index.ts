// ─── Registry Core: Fetch, Cache, Merge ──────────────────────────────────────────

import { GuideModule, RegistryEntry, MergeConflict } from "./types.js";
import { fetchModule, localSource, githubSource } from "./sources.js";
import { mergeModule } from "./merge.js";

export { fetchModule, localSource, githubSource };
export { mergeModule };
export type { GuideModule, RegistryEntry, MergeConflict };

export interface AddModuleResult {
  success: boolean;
  moduleName: string;
  conflicts: MergeConflict[];
  mergedData: Record<string, unknown>;
  error?: string;
}

export interface RegistryListResult {
  success: boolean;
  modules: RegistryEntry[];
  error?: string;
}

export interface RegistryInfoResult {
  success: boolean;
  module: GuideModule | null;
  error?: string;
}

/**
 * Lists available modules from the registry.
 * Tries local index first, falls back to GitHub if outdated.
 */
export async function listModules(): Promise<RegistryListResult> {
  try {
    const local = await localSource.listModules();
    if (local.length > 0) {
      return { success: true, modules: local };
    }
    // Fallback to GitHub
    const remote = await githubSource.listModules();
    return { success: true, modules: remote };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error listing modules";
    return { success: false, modules: [], error: message };
  }
}

/**
 * Searches modules by keyword across name, description, and tags.
 */
export async function searchModules(query: string): Promise<RegistryListResult> {
  try {
    // Always search both local and remote indices
    const localResults = await localSource.searchModules(query);
    const remoteResults = await githubSource.searchModules(query);
    // Merge and deduplicate by name
    const all = [...localResults, ...remoteResults];
    const seen = new Set<string>();
    const deduped = all.filter((m) => {
      if (seen.has(m.name)) return false;
      seen.add(m.name);
      return true;
    });
    return { success: true, modules: deduped };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error searching modules";
    return { success: false, modules: [], error: message };
  }
}

/**
 * Gets detailed info about a specific module.
 */
export async function getModuleInfo(name: string): Promise<RegistryInfoResult> {
  try {
    const module = await fetchModule(name, "github");
    return module
      ? { success: true, module }
      : { success: false, module: null, error: `Module "${name}" not found` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error fetching module info";
    return { success: false, module: null, error: message };
  }
}

/**
 * Adds a module to existing frontmatter data by fetching, validating, and merging.
 * Handles recursive dependency resolution.
 */
export async function addModule(
  existing: Record<string, unknown>,
  moduleName: string,
  force: boolean = false,
  visited: Set<string> = new Set()
): Promise<AddModuleResult> {
  if (visited.has(moduleName)) {
    return { success: true, moduleName, conflicts: [], mergedData: existing };
  }
  visited.add(moduleName);

  try {
    const module = await fetchModule(moduleName, "github");
    if (!module) {
      return {
        success: false,
        moduleName,
        conflicts: [],
        mergedData: existing,
        error: `Module "${moduleName}" not found in registry.`,
      };
    }

    let currentData = { ...existing };
    const allConflicts: MergeConflict[] = [];

    // 1. Resolve Dependencies first (Recursive)
    if (module.dependencies && module.dependencies.length > 0) {
      for (const dep of module.dependencies) {
        const depResult = await addModule(currentData, dep, force, visited);
        if (!depResult.success) {
          return {
            success: false,
            moduleName,
            conflicts: [],
            mergedData: existing,
            error: `Failed to resolve dependency "${dep}" for module "${moduleName}": ${depResult.error}`,
          };
        }
        currentData = depResult.mergedData;
        allConflicts.push(...depResult.conflicts);
      }
    }

    // 2. Merge the target module
    const result = mergeModule(currentData, module.content, force);
    allConflicts.push(...result.conflicts);

    // Record the module in the modules list
    const existingModules = Array.isArray(result.data.modules) ? result.data.modules : [];
    if (!existingModules.includes(moduleName)) {
      result.data.modules = [...existingModules, moduleName];
    }

    return {
      success: true,
      moduleName,
      conflicts: allConflicts,
      mergedData: result.data,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error adding module";
    return {
      success: false,
      moduleName,
      conflicts: [],
      mergedData: existing,
      error: message,
    };
  }
}
