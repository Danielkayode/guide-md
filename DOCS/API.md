# GUIDE.md Linter — API Reference

**Version:** 0.2.4  
**Module:** `@prismteam/linter` (published as `@guidemd/linter` for imports)

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Schema Types](#schema-types)
3. [Parser Module](#parser-module)
4. [Linter Module](#linter-module)
5. [Sync Engine](#sync-engine)
6. [Doctor Module](#doctor-module)
7. [Exporter Module](#exporter-module)
8. [Registry Module](#registry-module)
9. [Generator Module](#generator-module)
10. [Profiler Module](#profiler-module)
11. [Verify Module](#verify-module)
12. [Stats Module](#stats-module)
13. [Dashboard Module](#dashboard-module)
14. [Optimizer Module](#optimizer-module)
15. [MCP Server](#mcp-server)
16. [Diff Module](#diff-module)
17. [Watcher Module](#watcher-module)

---

## Getting Started

### Installation

```bash
npm install @prismteam/linter
```

### Import Patterns

```typescript
// Named imports from top-level
import { parseGuideFile, lintGuideFile } from "@guidemd/linter";

// Deep imports for specific modules
import { GuideMdSchema } from "@guidemd/linter/schema";
import { detectDrift } from "@guidemd/linter/linter/sync";
import { exportGuide } from "@guidemd/linter/exporter";
```

### TypeScript Configuration

The package is ESM-only. Ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

---

## Schema Types

### `GuideMdFrontmatter`

The primary type representing parsed and validated GUIDE.md frontmatter.

```typescript
import { GuideMdFrontmatter } from "@guidemd/linter/schema";

// Usage
function processGuide(data: GuideMdFrontmatter) {
  console.log(data.project);        // string
  console.log(data.language);       // string | string[]
  console.log(data.guardrails);     // GuardrailsConfig | undefined
}
```

### `GuideMdSchema`

The Zod schema object for runtime validation.

```typescript
import { GuideMdSchema } from "@guidemd/linter/schema";

// Manual validation
const result = GuideMdSchema.safeParse(unknownData);
if (result.success) {
  const data: GuideMdFrontmatter = result.data;
}
```

### Core Interfaces

```typescript
// Code Style Configuration
interface CodeStyleConfig {
  max_line_length?: number;        // 40-300, default: 100
  indentation?: "tabs" | string;    // "2 spaces", "4 spaces"
  naming_convention?: "camelCase" | "snake_case" | "PascalCase" | "kebab-case" | "SCREAMING_SNAKE";
  max_function_lines?: number;     // 5-500
  prefer_immutability?: boolean;
  prefer_early_returns?: boolean;
}

// Guardrails Configuration
interface GuardrailsConfig {
  no_hallucination?: boolean;      // default: true
  cite_sources?: boolean;          // default: false
  scope_creep_prevention?: boolean; // default: true
  dry_run_on_destructive?: boolean; // default: false
  max_response_scope?: "file" | "function" | "class" | "module";
}

// Testing Configuration
interface TestingConfig {
  required?: boolean;
  framework?: string;
  coverage_threshold?: number;       // 0-100
  test_alongside_code?: boolean;
}

// Context Configuration
interface ContextConfig {
  entry_points?: string[];
  off_limits?: string[];
  architecture_pattern?: "mvc" | "clean" | "hexagonal" | "layered" | 
                         "microservices" | "monolith" | "serverless" | "event-driven";
  state_management?: string;
}
```

---

## Parser Module

**Path:** `@guidemd/linter/parser`

### `parseGuideFile(filePath: string): ParseResult`

Parses a GUIDE.md file into structured data and markdown content.

```typescript
import { parseGuideFile } from "@guidemd/linter/parser";

const result = parseGuideFile("./GUIDE.md");

if (result.success) {
  console.log(result.data);      // Frontmatter object
  console.log(result.content);   // Markdown body string
  console.log(result.filePath);  // Absolute path
} else {
  console.error(result.error);   // Parse error details
}
```

**Returns:**
```typescript
interface ParseResult {
  success: true;
  data: Record<string, unknown>;
  content: string;
  filePath: string;
} | {
  success: false;
  error: string;
  filePath: string;
}
```

### `resolveInheritance(data, visited?): Promise<ResolvedData>`

Recursively resolves the `extends` field for module inheritance.

```typescript
import { resolveInheritance } from "@guidemd/linter/parser/resolver";

const localData = {
  extends: "typescript-strict",
  project: "my-app",
  language: "typescript"
};

const fullData = await resolveInheritance(localData);
// fullData now includes merged fields from typescript-strict module
```

**Parameters:**
- `data`: Local frontmatter with possible `extends` field
- `visited?: Set<string>`: Track visited modules (for circular detection)

**Returns:** `Promise<Record<string, unknown>>` — Deep merged data

**Throws:** `CircularDependencyError`, `ResolutionError`

---

## Linter Module

**Path:** `@guidemd/linter/linter`

### `lintGuideFile(filePath: string, options?): Promise<LintResult>`

Full validation pipeline including schema check, warnings, and optional secret scanning.

```typescript
import { lintGuideFile } from "@guidemd/linter/linter";

const result = await lintGuideFile("./GUIDE.md", {
  skipSecretScan: false  // default: false
});

console.log(result.valid);        // boolean
console.log(result.diagnostics);  // Array of issues
console.log(result.data);         // Validated frontmatter (if valid)
```

**Options:**
```typescript
interface LintOptions {
  skipSecretScan?: boolean;  // Skip API key/token scanning
}
```

**Returns:**
```typescript
interface LintResult {
  valid: boolean;
  file: string;
  diagnostics: Diagnostic[];
  data: GuideMdFrontmatter | null;
  secretScan?: SecretScanResult;
}

interface Diagnostic {
  severity: "error" | "warning";
  source: "schema" | "warning" | "secret-scan";
  field: string;
  message: string;
  received?: unknown;
}
```

### `fixGuideFile(filePath: string): Promise<FixResult>`

Auto-fixes certain validation issues by mutating the file.

```typescript
import { fixGuideFile } from "@guidemd/linter/linter";

const result = await fixGuideFile("./GUIDE.md");

console.log(result.fixed);         // boolean
console.log(result.appliedFixes);  // Array of fix descriptions
```

**Returns:**
```typescript
interface FixResult {
  fixed: boolean;
  file: string;
  diagnostics: Diagnostic[];
  data: GuideMdFrontmatter | null;
  appliedFixes: string[];
}
```

---

## Sync Engine

**Path:** `@guidemd/linter/linter/sync`

### `detectDrift(data, filePath): Promise<Drift[]>`

Detects differences between GUIDE.md claims and actual project state.

```typescript
import { detectDrift } from "@guidemd/linter/linter/sync";

const drifts = await detectDrift(guideData, "./GUIDE.md");

for (const drift of drifts) {
  console.log(`${drift.field}: ${drift.message}`);
  console.log(`  Expected: ${drift.expected}`);
  console.log(`  Actual: ${drift.actual}`);
}
```

**Returns:**
```typescript
interface Drift {
  field: string;
  message: string;
  expected?: string;
  actual?: string;
  severity: "error" | "warning" | "info";
}
```

### `syncGuideFile(data, filePath): Promise<SyncResult>`

Bi-directional sync: updates GUIDE.md to match project state.

```typescript
import { syncGuideFile } from "@guidemd/linter/linter/sync";

const result = await syncGuideFile(guideData, "./GUIDE.md");

console.log(result.success);     // boolean
console.log(result.changes);     // Array of field updates
console.log(result.conflicts);   // Array of conflicts requiring manual resolution
```

### `detectParadigm(projectRoot): Promise<"oop" | "functional" | null>`

AST-based paradigm detection using es-module-lexer.

```typescript
import { detectParadigm } from "@guidemd/linter/linter/sync";

const paradigm = await detectParadigm("./src");
if (paradigm === "oop") {
  console.log("Project uses OOP patterns (classes detected)");
}
```

### `detectLanguage(projectRoot): Promise<string | null>`

Detects primary language from file extensions.

```typescript
import { detectLanguage } from "@guidemd/linter/linter";

const lang = await detectLanguage("./src");
// Returns: "typescript", "python", "rust", etc.
```

---

## Doctor Module

**Path:** `@guidemd/linter/doctor`

### `runDoctor(data, content, projectRoot?): Promise<DoctorReport>`

Deep static analysis for architectural conflicts.

```typescript
import { runDoctor } from "@guidemd/linter/doctor";

const report = await runDoctor(guideData, guideContent, "./");

console.log(report.issues);      // Array of detected issues
console.log(report.frameworks);  // Auto-detected frameworks
console.log(report.score);       // Health score 0-100
```

**Returns:**
```typescript
interface DoctorReport {
  issues: DoctorIssue[];
  frameworks: DetectedFramework[];
  score: number;
  recommendations: string[];
}

interface DoctorIssue {
  severity: "error" | "warning" | "info";
  category: "framework" | "typescript" | "runtime" | "structure";
  message: string;
  suggestion?: string;
}
```

### `detectFramework(projectRoot?): string | null`

Detects framework from package.json and config files.

```typescript
import { detectFramework } from "@guidemd/linter/doctor";

const framework = detectFramework("./");
// Returns: "next@14", "express", "react@18", etc.
```

---

## Exporter Module

**Path:** `@guidemd/linter/exporter`

### `exportGuide(data, content, targetDir, target): ExportResult[]`

Exports GUIDE.md to AI-specific formats.

```typescript
import { exportGuide } from "@guidemd/linter/exporter";

const results = exportGuide(
  guideData,
  guideContent,
  "./output",
  "claude"  // or "cursor", "windsurf", "all"
);

for (const result of results) {
  console.log(`${result.fileName}: ${result.success ? "OK" : "FAILED"}`);
}
```

**Targets:** `"claude" | "cursor" | "windsurf" | "copilot" | "aider" | "agents" | "all"`

**Returns:**
```typescript
interface ExportResult {
  target: string;
  fileName: string;
  filePath: string;
  success: boolean;
  error?: string;
}
```

### `generateBadge(data, grade?): string`

Generates AI-Readiness badge markdown.

```typescript
import { generateBadge } from "@guidemd/linter/exporter";

const badge = generateBadge(guideData, "A");
// Returns: "[![AI-Ready](...)](...)"
```

### `exportMcpManifest(data, content, targetDir): ExportResult`

Generates MCP-compatible manifest file.

```typescript
import { exportMcpManifest } from "@guidemd/linter/exporter";

const result = exportMcpManifest(guideData, guideContent, "./");
// Creates guidemd-manifest.json
```

---

## Registry Module

**Path:** `@guidemd/linter/registry`

### `listModules(): Promise<RegistryListResult>`

Lists available modules from the registry.

```typescript
import { listModules } from "@guidemd/linter/registry";

const result = await listModules();

for (const module of result.modules) {
  console.log(`${module.name}: ${module.description}`);
}
```

### `searchModules(query): Promise<RegistryListResult>`

Search modules by keyword.

```typescript
import { searchModules } from "@guidemd/linter/registry";

const result = await searchModules("security");
// Returns modules matching "security" in name/tags
```

### `getModuleInfo(name): Promise<RegistryInfoResult>`

Get detailed information about a module.

```typescript
import { getModuleInfo } from "@guidemd/linter/registry";

const info = await getModuleInfo("typescript-strict");
console.log(info.content);  // Full module YAML
```

### `addModule(existing, moduleName, force?): Promise<AddModuleResult>`

Adds a registry module to existing frontmatter.

```typescript
import { addModule } from "@guidemd/linter/registry";

const result = await addModule(currentData, "typescript-strict");

if (result.success) {
  console.log("Added fields:", result.addedFields);
  console.log("Updated fields:", result.updatedFields);
}
```

**Returns:**
```typescript
interface AddModuleResult {
  success: boolean;
  data: Record<string, unknown>;
  addedFields: string[];
  updatedFields: string[];
  conflicts: string[];
  error?: string;
}
```

### Module Sources

```typescript
import { fetchModule, localSource, githubSource } from "@guidemd/linter/registry/sources";

// Fetch from specific source
const module = await fetchModule("typescript-strict", "local");
const module = await fetchModule("typescript-strict", "github");

// Search local cache
const local = await localSource.searchModules("security");
```

### Deep Merge

```typescript
import { mergeModule } from "@guidemd/linter/registry/merge";

const result = mergeModule(existingData, moduleData, force);
// result.data: merged data
// result.conflicts: conflicting fields
```

---

## Generator Module

**Path:** `@guidemd/linter/generator`

### `generateReadme(data, content, templatePath?, badge?): GenerateResult`

Generates README.md from GUIDE.md frontmatter.

```typescript
import { generateReadme } from "@guidemd/linter/generator";

const result = generateReadme(guideData, guideContent);

if (result.success) {
  console.log(result.content);  // Generated README markdown
}
```

### `backSyncFromReadme(guideData, readmeContent): SyncResult`

Extracts updates from README.md to sync back to GUIDE.md.

```typescript
import { backSyncFromReadme } from "@guidemd/linter/generator";

const result = backSyncFromReadme(guideData, readmeContent);
console.log(result.changes);  // Fields that would be updated
```

### `generateSmartTemplate(detectedData): string`

Generates a GUIDE.md template from detected project data.

```typescript
import { generateSmartTemplate } from "@guidemd/linter/generator";

const template = generateSmartTemplate({
  project: "my-app",
  language: "typescript",
  framework: "next@14"
});
```

---

## Profiler Module

**Path:** `@guidemd/linter/profiler`

### `runProfile(data, content, projectRoot?): ProfileReport`

Analyzes GUIDE.md for token efficiency and AI compatibility.

```typescript
import { runProfile } from "@guidemd/linter/profiler";

const report = runProfile(guideData, guideContent, "./");

console.log(report.tokenEstimate);      // Estimated LLM tokens
console.log(report.modelCompatibility); // Usage % per model
console.log(report.sectionEntropy);     // Information density per section
```

**Returns:**
```typescript
interface ProfileReport {
  tokenEstimate: number;
  wordCount: number;
  modelCompatibility: ModelCompatibility[];
  instructionDensity: Record<string, number>;
  sectionEntropy: SectionEntropy[];
}

interface ModelCompatibility {
  model: string;
  contextWindow: number;
  usagePercent: number;
  status: "safe" | "moderate" | "critical";
}
```

### `generateJsonSchema(): Record<string, unknown>`

Exports Zod schema as JSON Schema for external tooling.

```typescript
import { generateJsonSchema } from "@guidemd/linter/profiler";

const jsonSchema = generateJsonSchema();
// Use for IDE autocomplete, validation, etc.
```

---

## Verify Module

**Path:** `@guidemd/linter/verify`

### `runColdStartVerification(data, content, projectRoot?): Promise<VerificationResult>`

Simulates AI agent reading GUIDE.md for the first time.

```typescript
import { runColdStartVerification } from "@guidemd/linter/verify";

const result = await runColdStartVerification(guideData, guideContent, "./");

console.log(result.contractScore);      // 0-100
console.log(result.reconstructability); // Can AI understand the project?
console.log(result.capabilities);       // Verified capabilities
```

**Returns:**
```typescript
interface VerificationResult {
  contractScore: number;           // Pass threshold: 70
  reconstructability: boolean;
  capabilities: {
    dependencyTree: boolean;
    buildScripts: boolean;
    entryPoints: boolean;
    architecture: boolean;
  };
  missingContext: string[];
  recommendations: string[];
}
```

---

## Stats Module

**Path:** `@guidemd/linter/stats`

### `calculateContextDensity(filePath, projectRoot?): Promise<ContextDensityReport>`

Calculates the ratio of GUIDE.md size to total repository size.

```typescript
import { calculateContextDensity } from "@guidemd/linter/stats";

const report = await calculateContextDensity("./GUIDE.md", "./");

console.log(report.densityScore);      // Percentage
console.log(report.rating);            // "efficient" | "balanced" | "verbose" | "sparse"
console.log(report.breakdown);         // Size by category
```

### `formatDensityReport(report): string`

Formats the density report for CLI display.

```typescript
import { formatDensityReport } from "@guidemd/linter/stats";

const output = formatDensityReport(report);
console.log(output);  // Human-readable table
```

---

## Dashboard Module

**Path:** `@guidemd/linter/dashboard`

### `generateHealthReport(data, content, projectRoot?): Promise<HealthReport>`

Generates comprehensive AI-readiness report.

```typescript
import { generateHealthReport } from "@guidemd/linter/dashboard";

const report = await generateHealthReport(guideData, guideContent, "./");

console.log(report.grade);           // "A" | "B" | "C" | "D" | "F"
console.log(report.score);           // 0-100
console.log(report.categories);      // Breakdown by category
```

**Returns:**
```typescript
interface HealthReport {
  grade: "A" | "B" | "C" | "D" | "F";
  score: number;
  tokenEfficiency: number;
  syncStatus: "fresh" | "stale" | "unknown";
  lastUpdated?: string;
  categories: {
    completeness: number;
    bestPractices: number;
    freshness: number;
    aiCompatibility: number;
  };
}
```

### `printDashboard(report): void`

Prints formatted dashboard to console (uses chalk).

```typescript
import { printDashboard } from "@guidemd/linter/dashboard";

printDashboard(report);  // Pretty-printed dashboard
```

---

## Optimizer Module

**Path:** `@guidemd/linter/optimizer`

### `optimizeGuide(data, content): OptimizationResult`

Analyzes and suggests improvements for token efficiency.

```typescript
import { optimizeGuide } from "@guidemd/linter/optimizer";

const result = optimizeGuide(guideData, guideContent);

console.log(result.suggestions);    // Array of improvements
console.log(result.potentialSavings); // Estimated token savings
```

**Returns:**
```typescript
interface OptimizationResult {
  suggestions: OptimizationSuggestion[];
  potentialSavings: number;
  currentEfficiency: number;
}

interface OptimizationSuggestion {
  type: "redundancy" | "consolidation" | "brevity";
  section: string;
  message: string;
  severity: "high" | "medium" | "low";
}
```

---

## MCP Server

**Path:** `@guidemd/linter/mcp/server`

### `McpServer` Class

JSON-RPC 2.0 server implementing the Model Context Protocol.

```typescript
import { McpServer } from "@guidemd/linter/mcp/server";

const server = new McpServer(guideData, guideContent, "./GUIDE.md");

// Start stdio server
server.start();

// Or use with custom transport
server.handleRequest(jsonRpcRequest);
```

**Constructor:**
```typescript
new McpServer(
  data: GuideMdFrontmatter,
  content: string,
  filePath: string
)
```

### MCP Tools

**Path:** `@guidemd/linter/mcp/tools`

```typescript
import { TOOLS, callTool } from "@guidemd/linter/mcp/tools";

// Available tools
console.log(TOOLS);  // Array of 7 tool definitions

// Call a tool
const result = callTool("get_context", {}, guideData, guideContent);
```

**Available Tools:**
| Tool | Description |
|------|-------------|
| `get_context` | Complete frontmatter data |
| `get_naming_conventions` | Code style rules |
| `get_architecture` | Architecture pattern |
| `get_guardrails` | AI safety constraints |
| `get_testing_requirements` | Test configuration |
| `get_runtime_info` | Runtime and framework info |
| `get_entry_points` | Project entry points |

### MCP Resources

**Path:** `@guidemd/linter/mcp/resources`

```typescript
import { RESOURCES, readResource } from "@guidemd/linter/mcp/resources";

// Read a resource
const content = readResource("guidemd://frontmatter", guideData, guideContent);
```

**Available Resources:**
| URI | Content |
|-----|---------|
| `guidemd://frontmatter` | JSON frontmatter |
| `guidemd://overview` | Project overview markdown |
| `guidemd://domain` | Domain vocabulary section |
| `guidemd://decisions` | Architectural decisions |
| `guidemd://antipatterns` | What NOT to do section |

---

## Diff Module

**Path:** `@guidemd/linter/diff`

### `diffGuides(fileA, fileB, options?): DiffResult`

Compares two GUIDE.md files.

```typescript
import { diffGuides } from "@guidemd/linter/diff";

const result = diffGuides("./GUIDE.md", "./GUIDE.md.backup", {
  includeContent: true,
  breakingOnly: false
});

console.log(result.changes);       // Field-by-field diff
console.log(result.breaking);      // Breaking changes detected
```

### `diffGit(filePath, ref?): Promise<DiffResult>`

Diff against Git history.

```typescript
import { diffGit } from "@guidemd/linter/diff";

const result = await diffGit("./GUIDE.md", "HEAD~1");
```

---

## Watcher Module

**Path:** `@guidemd/linter/watcher`

### `watchGuideFile(filePath, options?): Promise<void>`

Watches GUIDE.md for changes and re-lints automatically.

```typescript
import { watchGuideFile } from "@guidemd/linter/watcher";

await watchGuideFile("./GUIDE.md", {
  skipSecretScan: false,
  onChange: (result) => {
    console.log(`Lint result: ${result.valid ? "valid" : "invalid"}`);
  }
});
```

---

## Error Handling

All async functions may throw. Wrap calls in try-catch:

```typescript
import { lintGuideFile, parseGuideFile } from "@guidemd/linter";

try {
  const parseResult = parseGuideFile("./GUIDE.md");
  if (!parseResult.success) {
    console.error("Parse failed:", parseResult.error);
    return;
  }
  
  const lintResult = await lintGuideFile("./GUIDE.md");
  // ...
} catch (error) {
  console.error("Unexpected error:", error);
}
```

### Specific Error Types

```typescript
import { CircularDependencyError, ResolutionError } from "@guidemd/linter/parser/resolver";

try {
  const data = await resolveInheritance(localData);
} catch (error) {
  if (error instanceof CircularDependencyError) {
    console.error("Circular dependency in extends:", error.chain);
  } else if (error instanceof ResolutionError) {
    console.error("Failed to resolve module:", error.moduleName);
  }
}
```

---

## Type Exports Summary

| Path | Exports |
|------|---------|
| `@guidemd/linter` | `parseGuideFile`, `lintGuideFile`, `fixGuideFile`, `detectLanguage` |
| `@guidemd/linter/schema` | `GuideMdSchema`, `GuideMdFrontmatter` |
| `@guidemd/linter/parser` | `parseGuideFile` |
| `@guidemd/linter/parser/resolver` | `resolveInheritance`, `CircularDependencyError`, `ResolutionError` |
| `@guidemd/linter/linter` | `lintGuideFile`, `fixGuideFile`, `LintResult`, `Diagnostic` |
| `@guidemd/linter/linter/sync` | `detectDrift`, `syncGuideFile`, `detectParadigm`, `Drift`, `SyncResult` |
| `@guidemd/linter/doctor` | `runDoctor`, `detectFramework`, `DoctorReport` |
| `@guidemd/linter/exporter` | `exportGuide`, `generateBadge`, `exportMcpManifest`, `ExportResult` |
| `@guidemd/linter/importer` | `importGuideFile`, `writeImportedGuide` |
| `@guidemd/linter/registry` | `listModules`, `searchModules`, `getModuleInfo`, `addModule` |
| `@guidemd/linter/registry/sources` | `fetchModule`, `localSource`, `githubSource` |
| `@guidemd/linter/registry/merge` | `mergeModule` |
| `@guidemd/linter/generator` | `generateReadme`, `backSyncFromReadme`, `generateSmartTemplate` |
| `@guidemd/linter/profiler` | `runProfile`, `generateJsonSchema`, `ProfileReport` |
| `@guidemd/linter/verify` | `runColdStartVerification`, `VerificationResult` |
| `@guidemd/linter/stats` | `calculateContextDensity`, `formatDensityReport` |
| `@guidemd/linter/dashboard` | `generateHealthReport`, `printDashboard`, `HealthReport` |
| `@guidemd/linter/optimizer` | `optimizeGuide`, `OptimizationResult` |
| `@guidemd/linter/mcp/server` | `McpServer` |
| `@guidemd/linter/mcp/tools` | `TOOLS`, `callTool` |
| `@guidemd/linter/mcp/resources` | `RESOURCES`, `readResource` |
| `@guidemd/linter/diff` | `diffGuides`, `diffGit`, `DiffResult` |
| `@guidemd/linter/watcher` | `watchGuideFile` |

---

*For CLI usage, see [CLI Reference](./plugin/docs.md). For architecture details, see [Architecture](./ARCHITECTURE.md).*
