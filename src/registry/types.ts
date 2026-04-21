// ─── Registry Types ───────────────────────────────────────────────────────────

export interface GuideModule {
  name: string;
  version?: string;
  description?: string;
  tags?: string[];
  dependencies?: string[];
  content: Record<string, unknown>;
}

export interface RegistryEntry {
  name: string;
  description: string;
  tags: string[];
  lastUpdated: string;
}

export interface RegistryIndex {
  modules: RegistryEntry[];
  version: string;
}

export interface RegistrySource {
  name: "local" | "github";
  fetchModule(moduleName: string): Promise<GuideModule | null>;
  listModules(): Promise<RegistryEntry[]>;
  searchModules(query: string): Promise<RegistryEntry[]>;
}

export interface MergeResult {
  data: Record<string, unknown>;
  conflicts: MergeConflict[];
}

export interface MergeConflict {
  field: string;
  existing: unknown;
  incoming: unknown;
  resolution: "merged" | "overwritten" | "skipped";
}
