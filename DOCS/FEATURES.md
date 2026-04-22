# @guidemd/linter - Feature Documentation

This document maps each directory in `src/` to its user-facing capabilities, explaining how the internal architecture delivers value to users.

---

## Table of Contents

1. [The Doctor (src/doctor/)](#the-doctor)
2. [The Exporter (src/exporter/)](#the-exporter)
3. [The Sync Engine (src/linter/sync.ts)](#the-sync-engine)
4. [The Observability Suite](#the-observability-suite)
5. [Additional Capabilities](#additional-capabilities)
6. [The Importer (src/importer/)](#the-importer)
7. [The Watcher (src/watcher/)](#the-watcher)

---

## The Doctor

**Directory:** `src/doctor/`  
**CLI Command:** `guidemd doctor [file]`  
**Purpose:** Deep static analysis to find logic conflicts and architectural drift

### How It Works

The Doctor performs "Architectural Fingerprinting" by comparing what GUIDE.md claims against what actually exists in your codebase:

1. **Signature Detection**: Scans for framework fingerprints in:
   - `package.json` dependencies
   - Configuration files (e.g., `next.config.js`, `vite.config.ts`)
   - Folder structures (e.g., `app/`, `pages/`, `src/`)

2. **Mismatch Reporting**: When a framework is detected but not declared in GUIDE.md:
   ```
   ⚠ framework: Next.js detected in project but not listed in GUIDE.md.
      → Add 'next' to your framework list to help the AI use the correct tools.
   ```

3. **Logic Conflict Detection**:
   - TypeScript strict mode mismatch between GUIDE.md and `tsconfig.json`
   - Runtime version drift (e.g., GUIDE.md says `node@20` but `package.json` specifies `>=18`)
   - Framework version mismatches

### signatures.json

The `signatures.json` file defines detection patterns:

```json
{
  "signatures": [
    {
      "name": "Next.js",
      "type": "dependency",
      "field": "framework",
      "check": {
        "packageKey": "dependencies",
        "packageName": "next",
        "configFiles": ["next.config.js", "next.config.ts"]
      }
    }
  ]
}
```

**Contributing New Signatures:**

Users can contribute by adding entries to `signatures.json`:

1. **File-based detection**: Detects via config files or folders
   ```json
   {
     "name": "Docker",
     "type": "file",
     "field": "context.architecture_pattern",
     "check": {
       "files": ["Dockerfile", "docker-compose.yml"]
     }
   }
   ```

2. **Dependency-based detection**: Detects via `package.json`
   ```json
   {
     "name": "Vitest",
     "type": "dependency",
     "field": "testing.framework",
     "check": {
       "packageKey": "devDependencies",
       "packageName": "vitest"
     }
   }
   ```

---

## The Exporter

**Directory:** `src/exporter/`  
**CLI Command:** `guidemd export [file] --target <type> --manifest`  
**Purpose:** Transform GUIDE.md into tool-specific AI context formats

### How It Works

The Exporter uses an adapter pattern to transform GUIDE.md frontmatter into various AI-readable formats:

```typescript
interface ExporterAdapter {
  fileName: string;
  transform: (data: GuideMdFrontmatter, instructions: string) => string;
}
```

### Built-in Adapters

| Target | Output File | Use Case |
|--------|-------------|----------|
| `claude` | `CLAUDE.md` | Claude Code CLI context |
| `cursor` | `.cursorrules` | Cursor IDE rules |
| `windsurf` | `.windsurfrules` | Windsurf IDE rules |
| `mcp` | `guidemd-manifest.json` | MCP-compatible manifest |

### Transformation Examples

**CLAUDE.md Output:**
```xml
<context>
# Project: my-app
A web application for...

## Tech Stack
- Language: typescript
- Runtime: node@20
- Framework: next@14
</context>

<rules>
## Coding Standards
- Error Protocol: verbose
...
</rules>
```

**MCP Manifest Output:**
```json
{
  "schema_version": "1.0.0",
  "ai_interface": {
    "protocol": "guidemd",
    "capabilities": [
      "context_awareness",
      "code_generation",
      "refactoring"
    ],
    "tools": [
      { "name": "get_context", "description": "..." }
    ],
    "resources": [
      { "uri": "guidemd://frontmatter", "mimeType": "application/json" }
    ]
  }
}
```

### MCP Manifest Export

The `--manifest` flag generates a `guidemd-manifest.json` file that:
- Declares the project's AI Interface capabilities
- Lists available tools (get_context, get_guardrails, etc.)
- Defines resources with URI schemes (guidemd://)
- Enables MCP-compatible IDEs to discover project capabilities instantly

---

## The Sync Engine

**Directory:** `src/linter/sync.ts`  
**CLI Commands:** `guidemd sync [file]`, `guidemd lint --sync`  
**Purpose:** Prevent "Context Rot" by keeping GUIDE.md in sync with actual project state

### How It Works

#### 1. AST-Based Paradigm Detection

The Sync Engine analyzes source code to detect programming paradigms:

```typescript
// Detects OOP patterns
class UserService { }  // → paradigm: "oop"

// Detects Functional patterns  
const processData = (x) => ...  // → paradigm: "functional"

// Detects React patterns
const Component = () => { }  // → paradigm: "react"
```

Uses `es-module-lexer` for fast, lightweight parsing without full AST generation.

#### 2. Structural Syncing

Detects drift in:

- **Framework versions**: GUIDE.md says `next@14` but `package.json` has `next@15`
- **Entry points**: `src/index.ts` listed but doesn't exist
- **Runtime**: `node@20` declared but `.nvmrc` specifies `18`
- **Test frameworks**: `jest` configured but `vitest` in GUIDE.md

#### 3. Bi-Directional Sync

The engine syncs both ways:
- **GUIDE.md → Project**: Updates code to match GUIDE.md intent
- **Project → GUIDE.md**: Updates GUIDE.md to reflect actual project state

---

## The Observability Suite

**Directories:** `src/profiler/`, `src/stats/`, `src/verify/`  
**CLI Commands:** `guidemd profile`, `guidemd lint --stats`, `guidemd verify`  
**Purpose:** Measure AI context efficiency and completeness

### Cold Start Verification (src/verify/)

**Command:** `guidemd verify [file]`

Simulates an AI agent reading GUIDE.md for the first time, verifying the file provides enough context to reconstruct the project without additional documentation.

#### Reconstructability Matrix

The verification checks four key capabilities:

| Capability | What It Verifies |
|------------|------------------|
| **Dependency Tree** | Can the AI understand the tech stack from GUIDE.md alone? |
| **Build Scripts** | Can the AI determine how to build/test the project? |
| **Entry Points** | Can the AI find where the application starts? |
| **Architecture** | Can the AI understand the project's design patterns? |

#### Contract Score

Scores 0-100 based on:
- Required fields present (project, language, runtime, description)
- Critical sections documented (Project Overview, Domain Vocabulary)
- Entry points actually exist on disk
- Framework declarations match package.json

**Pass Threshold:** 70/100

### Context Density Score (src/stats/)

**Command:** `guidemd lint --stats`

Measures the efficiency of context provision by comparing GUIDE.md size to total repository size.

#### Density Score Formula

```
Context Density = (GUIDE.md bytes / Total repo bytes) × 100
```

#### Efficiency Ratings

| Rating | Range | Interpretation |
|--------|-------|----------------|
| ✨ Efficient | 0.1% - 1% | Optimal context-to-code ratio |
| ✓ Balanced | 0.01% - 0.1% or 1% - 5% | Acceptable range |
| ⚠ Verbose | > 5% | GUIDE.md may be too large |
| ℹ Sparse | < 0.01% | May need more context |

#### Repository Breakdown

The stats report categorizes repo size by:
- **Source Code**: `.ts`, `.js`, `.py`, `.rs`, etc.
- **Documentation**: `.md`, `.rst`, `.txt`
- **Configuration**: `.json`, `.yaml`, `.toml`
- **Other**: Assets, binaries, etc.

### AI Observability Profile (src/profiler/)

**Command:** `guidemd profile [file]`

Provides token efficiency metrics:

#### Token Metrics
- **Estimated Total Tokens**: Rough token count for LLM context windows
- **Word Count**: Markdown body word count

#### Model Compatibility

Shows what percentage of each model's context window would be consumed:

| Model | Usage % | Status |
|-------|---------|--------|
| Claude 3.5 Sonnet | 12.5% | ✓ Safe |
| GPT-4o | 18.2% | ✓ Safe |
| Llama 3 (70B) | 45.1% | ⚠ Moderate |

#### Instruction-to-Code Density

Measures the ratio of instructional words to code units across different domains:
- **Error handling**: Words describing error patterns / try-catch blocks
- **API usage**: Words about API conventions / API call sites
- **Data flow**: Words about data patterns / function definitions

#### Section Entropy (Fluff Detection)

Identifies which sections are information-dense vs. "fluffy":

```
Section Entropy (Higher is more efficient):
████████░░ What NOT to do (80%)
██████░░░░ Domain Vocabulary (60%)
██░░░░░░░░ Project Overview (20%) ← Needs improvement
```

---

## Additional Capabilities

### Guardian (src/guardian/)

**Command:** `guidemd install-hooks`

Git pre-commit hook that:
- Runs `guidemd lint --sync` before every commit
- Auto-stages GUIDE.md if updated during sync
- Blocks commits if GUIDE.md has validation errors

### MCP Server (src/mcp/)

**Command:** `guidemd serve [file]`

Launches a local MCP (Model Context Protocol) server exposing:

**Tools:**
- `get_context`: Retrieve complete frontmatter
- `get_naming_conventions`: Get code style rules
- `get_architecture`: Get architecture pattern
- `get_guardrails`: Get AI safety constraints
- `get_testing_requirements`: Get test setup
- `get_runtime_info`: Get runtime details

**Resources:**
- `guidemd://frontmatter`: JSON frontmatter
- `guidemd://overview`: Project overview markdown
- `guidemd://domain`: Domain vocabulary
- `guidemd://decisions`: Architectural decisions
- `guidemd://antipatterns`: Anti-patterns

### Registry (src/registry/)

**Commands:** `guidemd registry list`, `guidemd add <module>`

Fetches reusable Guide Modules from the remote registry:
- Pre-built configurations for common stacks (Next.js + Auth, React + Testing)
- Community-contributed patterns
- Version-pinned module definitions

### Dashboard (src/dashboard/)

**Command:** `guidemd info [file]`

Visual AI-Readiness Dashboard showing:
- Overall AI Grade (A-F)
- Token efficiency score
- Sync status (days since last update)
- Section completeness
- Best practices coverage
- Model compatibility ratings

---

## The Importer (src/importer/)

**Directory:** `src/importer/`  
**CLI Command:** `guidemd import <file>`  
**Purpose:** Reverse-parse AI context files back into GUIDE.md

### How It Works

The Importer performs bidirectional conversion by parsing existing AI context files and extracting structured data:

1. **File Detection**: Automatically detects file type from extension/name:
   - `CLAUDE.md` → Claude format
   - `.cursorrules` → Cursor format
   - `.windsurfrules` → Windsurf format
   - `AGENTS.md` → Generic agents format

2. **Field Mapping**: Extracts common fields:
   - Project name from H1 headings
   - Language from tech stack sections
   - Framework from dependencies mentioned
   - Code style from rules sections

3. **Best-Effort Parsing**: Since AI context files lack strict structure, the importer uses heuristics:
   - Pattern matching for key-value pairs
   - Section header detection
   - List item parsing for rules

### Usage

```bash
# Import a Cursor rules file
guidemd import .cursorrules

# Import with custom output path
guidemd import CLAUDE.md -o ./docs/GUIDE.md

# Preview without writing
guidemd import .windsurfrules --dry-run
```

---

## The Watcher (src/watcher/)

**Directory:** `src/watcher/`  
**CLI Command:** `guidemd watch [file]`  
**Purpose:** Development mode with automatic re-linting

### How It Works

The Watcher uses `chokidar` to monitor GUIDE.md for changes:

1. **File Watching**: Monitors the target GUIDE.md file for modifications
2. **Automatic Re-lint**: Runs `guidemd lint` on every save
3. **Instant Feedback**: Shows validation results immediately

### Usage

```bash
# Watch default GUIDE.md
guidemd watch

# Watch specific file
guidemd watch ./docs/GUIDE.md

# Watch without secret scanning
guidemd watch --skip-secret-scan
```

### Development Workflow

Ideal for iterative GUIDE.md editing:
```bash
# Terminal 1: Start watcher
guidemd watch

# Terminal 2: Edit GUIDE.md
# Every save triggers instant validation feedback
```

---

## Summary: src/ Directory → Capability Mapping

| Directory | User Capability | CLI Entry Point |
|-----------|-----------------|-----------------|
| `src/cli/` | All CLI commands | `guidemd <command>` |
| `src/doctor/` | Deep static analysis | `guidemd doctor` |
| `src/exporter/` | Multi-format export | `guidemd export` |
| `src/linter/` | Validation & sync | `guidemd lint`, `guidemd sync` |
| `src/dashboard/` | AI-Readiness dashboard | `guidemd info` |
| `src/guardian/` | Git hooks | `guidemd install-hooks` |
| `src/mcp/` | MCP server | `guidemd serve` |
| `src/optimizer/` | Token efficiency | `guidemd optimize` |
| `src/profiler/` | AI observability | `guidemd profile` |
| `src/registry/` | Module registry | `guidemd registry`, `guidemd add` |
| `src/stats/` | Context density | `guidemd lint --stats` |
| `src/verify/` | Cold start verification | `guidemd verify` |
| `src/generator/` | README generation | `guidemd generate-readme`, `guidemd back-sync-readme` |
| `src/importer/` | Reverse-parse AI context files | `guidemd import` |
| `src/watcher/` | File watching mode | `guidemd watch` |
| `src/parser/` | Inheritance resolution | Handled automatically |

---

## Plugin System Architecture

**Directory:** `src/plugins/` (extension point - currently empty, planned feature)  
**Purpose:** Extensible plugin interface for third-party extensions

> **⚠️ Note**: The plugin system is planned but not yet fully implemented. The `src/plugins/` directory is currently empty and the `GuidemdPlugin` interface is documented as the target design. Plugin loading and execution will be available in a future release.

### GuidemdPlugin Interface

Plugins implement the standard `GuidemdPlugin` interface to hook into the linter pipeline:

```typescript
export interface GuidemdPlugin {
  /** Unique plugin identifier (reverse-domain notation recommended) */
  name: string;
  
  /** Semantic version */
  version: string;
  
  /** Plugin lifecycle hooks */
  hooks: PluginHooks;
  
  /** Schema extensions (optional) */
  schema?: PluginSchemaExtension;
  
  /** Doctor signatures (optional) */
  signatures?: PluginSignature[];
  
  /** Custom exporters (optional) */
  exporters?: PluginExporter[];
}

export interface PluginHooks {
  /** Called before linting begins */
  beforeLint?: (context: HookContext) => Promise<void> | void;
  
  /** Called after sync completes */
  afterSync?: (context: HookContext, result: SyncResult) => Promise<void> | void;
  
  /** Called during README generation */
  onGenerateReadme?: (context: HookContext, data: GenerateContext) => Promise<string | null> | string | null;
}

export interface HookContext {
  /** Parsed GUIDE.md data */
  data: GuideMdFrontmatter;
  
  /** Raw markdown content */
  content: string;
  
  /** Project root directory */
  projectRoot: string;
  
  /** File path to GUIDE.md */
  filePath: string;
}
```

### Extending the Schema

Plugins can add custom YAML fields for specialized agents:

```typescript
export interface PluginSchemaExtension {
  /** Zod schema fragments to merge into GuideMdSchema */
  fields: Record<string, z.ZodTypeAny>;
  
  /** Field descriptions for documentation */
  descriptions?: Record<string, string>;
}

// Example: Security Audit Plugin
const securityPlugin: GuidemdPlugin = {
  name: "com.example.security-audit",
  version: "1.0.0",
  hooks: {},
  schema: {
    fields: {
      security: z.object({
        require_auth: z.boolean().default(true),
        allowed_origins: z.array(z.string()).optional(),
        secrets_vault: z.enum(["vault", "aws-sm", "azure-kv"]).optional(),
        owasp_level: z.enum(["L1", "L2", "L3"]).default("L1"),
      })
    },
    descriptions: {
      "security.require_auth": "All endpoints require authentication",
      "security.owasp_level": "Target OWASP ASVS compliance level"
    }
  }
};
```

### Adding Doctor Signatures

Plugins can inject new framework detection patterns:

```typescript
export interface PluginSignature {
  /** Display name of the detected technology */
  name: string;
  
  /** Target field in GuideMdFrontmatter */
  field: string;
  
  /** Detection method */
  type: "file" | "dependency" | "custom";
  
  /** Detection configuration */
  check: SignatureCheck;
  
  /** Optional: Custom detection function (for type: "custom") */
  detector?: (projectRoot: string, pkg: PackageJson | null) => Promise<boolean>;
}

type SignatureCheck = {
  files?: string[];           // Config files to detect
  folders?: string[];         // Directory structures
  packageKey?: "dependencies" | "devDependencies";
  packageName?: string;       // npm package name
  configFiles?: string[];     // Stronger evidence files
};
```

### Custom Exporters

Plugins can add adapters for emerging AI agents:

```typescript
export interface PluginExporter {
  /** Target identifier (e.g., "devin", "aider") */
  target: string;
  
  /** Output file name */
  fileName: string;
  
  /** Transformation function */
  transform: (data: GuideMdFrontmatter, content: string) => string;
}

// Example: Devin AI Exporter
const devinExporter: PluginExporter = {
  target: "devin",
  fileName: ".devin-context.md",
  transform: (data, content) => {
    return `# Devin Context: ${data.project}\n\n` +
           `## Constraints\n` +
           `- Language: ${data.language}\n` +
           `- Strict Types: ${data.strict_typing}\n\n` +
           `## Original Instructions\n${content}`;
  }
};
```

### Lifecycle Hooks

#### beforeLint

Called before linting begins. Use for pre-processing or validation:

```typescript
beforeLint: async (context) => {
  // Load external configuration
  const config = await loadExternalConfig(context.projectRoot);
  
  // Enrich context data
  context.data._enriched = config;
  
  // Early termination if critical condition not met
  if (!config.criticalSetting) {
    throw new PluginError("Critical setting missing");
  }
}
```

#### afterSync

Called after sync completes. Use for post-sync actions:

```typescript
afterSync: async (context, result) => {
  // Log sync events
  for (const drift of result.drifts) {
    await logToAnalytics("drift_detected", {
      field: drift.field,
      project: context.data.project
    });
  }
  
  // Trigger downstream CI if major drift detected
  if (result.drifts.some(d => d.field === "framework")) {
    await triggerCIRebuild(context.projectRoot);
  }
}
```

#### onGenerateReadme

Called during README generation. Return custom section content or null:

```typescript
onGenerateReadme: async (context, generateContext) => {
  // Generate custom security section
  if (context.data.security) {
    return `## Security\n\n` +
           `This project targets OWASP ASVS Level ${context.data.security.owasp_level}.\n`;
  }
  return null; // No custom content
}
```

### Plugin Registration

Plugins are registered in GUIDE.md frontmatter:

```yaml
---
guide_version: "1.0.0"
project: "my-app"
plugins:
  - name: "com.example.security-audit"
    version: "^1.0.0"
    config:
      owasp_level: "L2"
  - name: "com.acme.custom-exporter"
    version: "~2.1.0"
---
```

Plugins are resolved via:
1. Local `node_modules/` (if published to npm)
2. Registry module resolution (`guidemd add <plugin>`)
3. Direct URL (for development)

---

## Internal API Reference

### For Plugin Authors

#### Inheritance Resolution (`src/parser/resolver.ts`)

```typescript
/**
 * Recursively resolves the 'extends' field in the frontmatter.
 * Merges inherited data into the local data (local takes precedence).
 */
export async function resolveInheritance(
  localData: Record<string, unknown>,
  visited?: Set<string>
): Promise<Record<string, unknown>>;
```

**Use Case:** Plugins that need to understand the complete inherited context.

```typescript
import { resolveInheritance } from "@guidemd/linter/parser/resolver";

const plugin: GuidemdPlugin = {
  hooks: {
    beforeLint: async (context) => {
      // Resolve any inheritance to get complete picture
      const fullData = await resolveInheritance(context.data);
      
      // Access parent module configurations
      console.log(fullData.extends); // Resolved parent configs
    }
  }
};
```

#### Module Fetching (`src/registry/sources.ts`)

```typescript
/**
 * Attempts to fetch a module from local cache first, then GitHub.
 */
export async function fetchModule(
  name: string,
  source: "local" | "github" = "local"
): Promise<GuideModule | null>;

/** Local cache source */
export const localSource: RegistrySource;

/** GitHub remote source */
export const githubSource: RegistrySource;
```

**Use Case:** Plugins that need to fetch external configurations.

```typescript
import { fetchModule, localSource } from "@guidemd/linter/registry/sources";

// Fetch a configuration module
const securityStandards = await fetchModule("owasp-standards", "github");

// Or search local modules
const localModules = await localSource.searchModules("security");
```

#### Registry Operations (`src/registry/index.ts`)

```typescript
/**
 * Lists available modules from the registry.
 */
export async function listModules(): Promise<RegistryListResult>;

/**
 * Searches modules by keyword.
 */
export async function searchModules(query: string): Promise<RegistryListResult>;

/**
 * Gets detailed info about a specific module.
 */
export async function getModuleInfo(name: string): Promise<RegistryInfoResult>;

/**
 * Adds a module to existing frontmatter data.
 */
export async function addModule(
  existing: Record<string, unknown>,
  moduleName: string,
  force?: boolean
): Promise<AddModuleResult>;
```

**Use Case:** Plugins that manage module dependencies.

```typescript
import { addModule, searchModules } from "@guidemd/linter/registry";

// Auto-add required modules
const plugin: GuidemdPlugin = {
  hooks: {
    beforeLint: async (context) => {
      // Check if required module exists
      const search = await searchModules("security");
      
      if (search.modules.length === 0) {
        // Add default security module
        const result = await addModule(context.data, "security-baseline");
        
        if (result.success) {
          console.log("Added security-baseline module");
        }
      }
    }
  }
};
```

#### Deep Merge (`src/registry/merge.ts`)

```typescript
/**
 * Merges a Guide Module into existing frontmatter data.
 * Deep merges nested objects, concatenates+deduplicates arrays.
 */
export function mergeModule(
  existing: Record<string, unknown>,
  moduleData: Record<string, unknown>,
  force?: boolean
): MergeResult;
```

**Use Case:** Plugins that need to merge external configurations.

```typescript
import { mergeModule } from "@guidemd/linter/registry/merge";

const result = mergeModule(
  existingData,
  pluginData,
  true // force overwrite
);

console.log(result.conflicts); // Track what was merged
```

#### Drift Detection (`src/linter/sync.ts`)

```typescript
/**
 * Detects drift between GUIDE.md frontmatter and actual project state.
 */
export async function detectDrift(
  data: GuideMdFrontmatter,
  filePath: string
): Promise<Drift[]>;

/**
 * Automatically syncs GUIDE.md frontmatter with project state.
 */
export async function syncGuideFile(
  data: GuideMdFrontmatter,
  filePath: string
): Promise<SyncResult>;

/**
 * Detects paradigm using AST-based analysis.
 */
export async function detectParadigm(
  projectRoot: string
): Promise<"oop" | "functional" | null>;
```

**Use Case:** Plugins that need to understand project state drift.

```typescript
import { detectDrift, detectParadigm } from "@guidemd/linter/linter/sync";

const plugin: GuidemdPlugin = {
  hooks: {
    afterSync: async (context, result) => {
      // Check for specific drift patterns
      const paradigm = await detectParadigm(context.projectRoot);
      
      if (paradigm === "oop" && !context.data.paradigm) {
        console.warn("OOP paradigm detected but not documented in GUIDE.md");
      }
    }
  }
};
```

---

## Summary: Plugin Capabilities

| Extension Point | API | Use Case |
|----------------|-----|----------|
| **Schema** | `PluginSchemaExtension` | Add custom YAML fields |
| **Doctor** | `PluginSignature[]` | Framework detection |
| **Exporter** | `PluginExporter[]` | New AI agent formats |
| **Hooks** | `beforeLint`, `afterSync`, `onGenerateReadme` | Pipeline integration |
| **Registry** | `fetchModule`, `addModule` | External dependencies |
| **Parser** | `resolveInheritance` | Inheritance resolution |

For a complete plugin development guide with examples, see [`DOCS/PLUGINS.md`](./PLUGINS.md).
