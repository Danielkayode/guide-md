# GUIDE.md Linter — Architecture Documentation

**Version:** 0.2.4  
**Last Updated:** 2026-04-23

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Philosophy](#core-philosophy)
3. [Architecture Diagrams](#architecture-diagrams)
4. [Module Deep Dive](#module-deep-dive)
5. [Data Flow](#data-flow)
6. [Design Decisions](#design-decisions)
7. [Extension Points](#extension-points)

---

## System Overview

The GUIDE.md Linter is a TypeScript-based CLI tool and library that validates, syncs, and exports AI context files. It serves as the reference implementation for the GUIDE.md standard — a YAML-frontmatter + Markdown specification designed to help AI agents generate correct code on the first attempt.

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Validation** | Zod-schema enforcement with custom warning rules |
| **Sync** | Bi-directional drift detection between GUIDE.md and project state |
| **Export** | Multi-format adapters (Claude, Cursor, Windsurf, MCP) |
| **Observability** | Token efficiency, context density, AI-readiness grading |
| **Registry** | Reusable module system for common stack configurations |
| **MCP Server** | JSON-RPC 2.0 server exposing tools and resources |

---

## Core Philosophy

### 1. Machine-Validated Over Human-Documented

Unlike traditional README files, GUIDE.md is validated against a strict Zod schema. Invalid frontmatter blocks AI generation, ensuring agents never work with corrupted context.

### 2. Drift-Aware Context

The "Context Rot" problem: documentation becomes stale as code evolves. The Sync Engine (`src/linter/sync.ts`) continuously detects and reports divergence between declared and actual project state.

### 3. Token Efficiency

Every byte in GUIDE.md competes with source code for limited LLM context windows. The Optimizer (`src/optimizer/`) analyzes information density and suggests improvements.

### 4. Capability-Based Targeting

Instead of pinning to specific model names (which rot monthly), use `ai_capabilities`: `tool_use`, `long_context`, `structured_output`, etc.

---

## Architecture Diagrams

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GUIDE.md Linter                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐ │
│  │    CLI      │───▶│   Parser    │───▶│   Linter    │───▶│ Exporter │ │
│  │  (index.ts) │    │(gray-matter)│    │ (Zod schema)│    │(adapters)│ │
│  └──────┬──────┘    └─────────────┘    └──────┬──────┘    └──────────┘ │
│         │                                      │                       │
│         ▼                                      ▼                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   Doctor    │    │ Sync Engine │    │  Dashboard  │                 │
│  │(signatures) │    │(AST parser) │    │(health report)│                │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│         │                                      │                       │
│         ▼                                      ▼                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │  Registry   │◀──▶│    MCP      │    │ Generator   │                 │
│  │  (modules)  │    │  (server)   │    │  (README)   │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Parse → Validate → Sync → Export

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   GUIDE.md   │────▶│  gray-matter │────▶│    Zod       │────▶│  Drift Check │
│   (YAML+MD)  │     │   parsing    │     │  validation  │     │  (sync.ts)   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                         │
                                                                         ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  AI Agents   │◀────│   Exporter   │◀────│  Inheritance │◀────│  Registry    │
│ (Claude/etc) │     │  (adapters)  │     │ (resolver.ts)│     │  (modules)   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### MCP Server Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         MCP Server (stdio)                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────────────┐  │
│   │  Request    │─────▶│  Security   │─────▶│   Router/Dispatcher │  │
│   │   Reader    │      │  Validator  │      │                     │  │
│   └─────────────┘      └─────────────┘      └──────────┬──────────┘  │
│                                                         │             │
│                              ┌──────────────────────────┼──────────┐  │
│                              ▼                          ▼          │  │
│                       ┌────────────┐              ┌────────────┐   │  │
│                       │   Tools    │              │ Resources  │   │  │
│                       │ (7 tools)  │              │ (5 URIs)   │   │  │
│                       └────────────┘              └────────────┘   │  │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Module Deep Dive

### Core Pipeline

| Module | File | Responsibility |
|--------|------|----------------|
| **CLI** | `src/cli/index.ts` | Commander.js setup, all command definitions, human-readable output formatting |
| **Parser** | `src/parser/index.ts` | gray-matter integration, YAML/Markdown separation |
| **Resolver** | `src/parser/resolver.ts` | Inheritance resolution (`extends` field), circular dependency detection |
| **Schema** | `src/schema/index.ts` | Zod schema definitions, type exports |
| **Linter** | `src/linter/index.ts` | Validation orchestration, warning rules, result aggregation |

### Analysis & Observability

| Module | File | Responsibility |
|--------|------|----------------|
| **Sync** | `src/linter/sync.ts` | Drift detection, paradigm detection (OOP/Functional), bi-directional sync |
| **Secrets** | `src/linter/secrets.ts` | Pattern-based secret scanning (API keys, tokens) |
| **Doctor** | `src/doctor/index.ts` | Deep static analysis, framework fingerprinting, signatures.json loader |
| **Profiler** | `src/profiler/index.ts` | Token estimation, model compatibility, section entropy |
| **Stats** | `src/stats/index.ts` | Context density calculation, repository breakdown |
| **Verify** | `src/verify/index.ts` | Cold-start verification, reconstructability matrix |
| **Optimizer** | `src/optimizer/index.ts` | Token efficiency analysis, redundancy detection |
| **Dashboard** | `src/dashboard/index.ts` | AI-Readiness grading (A-F), budget tracking |

### Export & Integration

| Module | File | Responsibility |
|--------|------|----------------|
| **Exporter** | `src/exporter/index.ts` | Adapter pattern for multi-format export (Claude, Cursor, Windsurf, etc.) |
| **Importer** | `src/importer/index.ts` | Reverse-parse AI context files back to GUIDE.md |
| **Generator** | `src/generator/index.ts` | README.md generation from GUIDE.md frontmatter |
| **MCP Server** | `src/mcp/server.ts` | JSON-RPC 2.0 server, request validation, rate limiting |
| **MCP Tools** | `src/mcp/tools.ts` | Tool definitions (get_context, get_guardrails, etc.) |
| **MCP Resources** | `src/mcp/resources.ts` | Resource URI handlers (guidemd://frontmatter, etc.) |
| **MCP Audit** | `src/mcp/audit.ts` | Rate limiting, security logging |

### Registry & Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **Registry** | `src/registry/index.ts` | Module listing, searching, adding operations |
| **Sources** | `src/registry/sources.ts` | Local cache vs GitHub fetching, module resolution |
| **Merge** | `src/registry/merge.ts` | Deep merge with conflict detection |
| **Types** | `src/registry/types.ts` | Registry type definitions |

### Automation

| Module | File | Responsibility |
|--------|------|----------------|
| **Guardian** | `src/guardian/hooks.ts` | Git pre-commit hook installation, Huskier/Raw manager support |
| **Watcher** | `src/watcher/index.ts` | File watching mode (chokidar), auto-re-lint on save |
| **Diff** | `src/diff/index.ts` | GUIDE.md version comparison, breaking change detection |

---

## Data Flow

### 1. Command Execution Flow

```
User Input → CLI Parser → Command Handler → Core Module → Output Formatter
                │              │               │            │
                ▼              ▼               ▼            ▼
            Commander      Business Logic   Validation    chalk/JSON
```

### 2. Validation Pipeline

```
1. Parse (gray-matter) → { data: frontmatter, content: markdown }
            │
            ▼
2. Resolve Inheritance (if extends field exists)
   - Fetch modules from registry/local
   - Deep merge (child takes precedence)
   - Detect circular dependencies
            │
            ▼
3. Zod Schema Validation
   - Type checking
   - Constraint validation
   - Custom error messages
            │
            ▼
4. Warning Rules (soft checks)
   - Description length
   - stale last_updated
   - Missing off_limits
            │
            ▼
5. Secret Scan (optional)
   - Pattern matching for API keys
   - High-entropy string detection
            │
            ▼
6. Return LintResult { valid, diagnostics, data }
```

### 3. Sync Engine Flow

```
1. Detect Framework
   - Check package.json dependencies
   - Match against signatures.json
   - Return framework@version
            │
            ▼
2. Detect Language
   - Scan file extensions
   - Map to SupportedLanguage enum
            │
            ▼
3. Detect Paradigm (AST-based)
   - es-module-lexer for fast parsing
   - Pattern detection: class → OOP, const functions → Functional
            │
            ▼
4. Compare with GUIDE.md
   - Framework version match?
   - Entry points exist?
   - TypeScript strict mode aligned?
            │
            ▼
5. Report Drifts or Auto-fix
```

### 4. MCP Request Flow

```
stdin → JSON-RPC Request → Security Validator → Method Router
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              tools/list               tools/call                resources/read
                    │                         │                         │
                    ▼                         ▼                         ▼
              Return manifest            Execute tool             Return content
              (7 tools)                  (callTool)               (readResource)
                    │                         │                         │
                    └─────────────────────────┴─────────────────────────┘
                                              │
                                              ▼
                                    JSON-RPC Response → stdout
```

---

## Design Decisions

### Why Synchronous File I/O?

**Decision:** All file operations in core modules use synchronous Node.js APIs (`fs.readFileSync`, etc.).

**Rationale:**
- CLI is short-lived; async adds complexity for marginal gain
- Local filesystem I/O is fast enough
- Simpler error handling and stack traces
- **Exception:** MCP server could be long-running; async transition planned for daemon mode

### Why Zod Instead of JSON Schema?

**Decision:** Use Zod for runtime validation, export to JSON Schema for consumers.

**Rationale:**
- Single source of truth with TypeScript inference
- Better error messages
- Composable schemas
- `zod-to-json-schema` provides language-agnostic export

### Why Passthrough Schema?

**Decision:** `GuideMdSchema.passthrough()` allows unknown keys.

**Rationale:**
- Forward compatibility: new spec versions don't break old linters
- Plugin system: custom fields from plugins pass through
- Warning logged for unknown fields (not error)

### Why `process.exit` Only in CLI?

**Decision:** Core modules return objects; CLI handles exits.

**Rationale:**
- Testability: core functions can be unit tested without mocking `process`
- Library usage: MCP server can import core without side effects
- Clean separation of concerns

### Why es-module-lexer for AST?

**Decision:** Use `es-module-lexer` for paradigm detection instead of full TypeScript compiler API.

**Rationale:**
- 10x faster than `typescript` parser for simple detection
- No heavy dependencies
- Good enough for pattern detection (class vs function)

---

## Extension Points

### Plugin System (Planned)

The `src/plugins/` directory is reserved for future plugin support:

```typescript
interface GuidemdPlugin {
  name: string;
  version: string;
  hooks: PluginHooks;
  schema?: PluginSchemaExtension;
  signatures?: PluginSignature[];
  exporters?: PluginExporter[];
}
```

**Extension Points:**
1. **Schema Extension:** Add custom YAML fields via Zod fragments
2. **Doctor Signatures:** Inject new framework detection patterns
3. **Custom Exporters:** Support emerging AI agents
4. **Lifecycle Hooks:** `beforeLint`, `afterSync`, `onGenerateReadme`

See [PLUGINS.md](./PLUGINS.md) for full SDK documentation.

### Registry Modules

Users can extend GUIDE.md via the registry system:

```bash
guidemd add typescript-strict    # Add strict TypeScript rules
guidemd add nextjs-security      # Add Next.js security patterns
```

Modules are fetched from:
1. Local cache (`~/.guidemd/modules/`)
2. GitHub registry (fallback)

### Custom Exporters

New AI agents can be supported by adding adapters to `src/exporter/index.ts`:

```typescript
interface ExporterAdapter {
  fileName: string;
  transform: (data: GuideMdFrontmatter, instructions: string) => string;
}
```

---

## Component Interaction Matrix

| Consumer → Provider | Parser | Linter | Sync | Doctor | Exporter | MCP | Registry |
|---------------------|--------|--------|------|--------|----------|-----|----------|
| **CLI**             | ✓ Read | ✓ Call | ✓ Call | ✓ Call | ✓ Call | ✓ Start | ✓ Call |
| **MCP Tools**       | ✓ Read | ✓ Call | - | - | - | Internal | - |
| **Sync Engine**     | - | - | Internal | ✓ Call | - | - | ✓ Fetch |
| **Generator**       | ✓ Read | - | - | - | - | - | - |
| **Importer**        | ✓ Write | ✓ Call | - | - | - | - | - |

---

## Security Considerations

| Module | Security Feature |
|--------|------------------|
| **MCP Server** | Input validation, prototype pollution prevention, rate limiting, request size limits |
| **Linter** | Secret scanning (API keys, tokens) with configurable skip |
| **Parser** | YAML safe loading (no arbitrary code execution) |
| **CLI** | No environment variable exposure in `--json` output |

---

## Performance Characteristics

| Operation | Typical Duration | Bottleneck |
|-----------|------------------|------------|
| Parse GUIDE.md | <1ms | gray-matter YAML parsing |
| Zod Validation | <1ms | Schema complexity |
| Drift Detection | 10-50ms | package.json reading, file existence checks |
| Paradigm Detection | 50-200ms | es-module-lexer (depends on source tree size) |
| Secret Scan | 5-20ms | Regex pattern matching |
| Full Lint | 50-300ms | All of above + I/O |

---

*For implementation details, see source code in `src/` and test files in `tests/`.*
