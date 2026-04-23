# GUIDE.md Linter Documentation

**The official documentation for the GUIDE.md AI Context Interface standard.**

---

## Quick Decision Tree

**What are you trying to do?**

- 🚀 **Just getting started?** → See [Getting Started](#getting-started) below
- 🔧 **Set up in my IDE?** → [Integration Options](#integration-options)
- 📝 **See all CLI commands?** → [CLI Reference](./plugin/docs.md)
- 💻 **Use in my code/programmatically?** → [API Reference](./API.md)
- 🔌 **Build a plugin?** → [Plugin SDK](./PLUGINS.md)
- 🏗️ **Understand how it works internally?** → [Architecture](./ARCHITECTURE.md) or [Feature Guide](./FEATURES.md)
- 🤖 **Connect to Claude Desktop/Cursor MCP?** → [MCP Integration](./MCP_INTEGRATION.md)

## Quick Navigation

| Document | Purpose |
|----------|---------|
| [CLI Reference](./plugin/docs.md) | Complete command-line interface documentation |
| [API Reference](./API.md) | Programmatic API for Node.js/TypeScript |
| [Architecture](./ARCHITECTURE.md) | System design, data flows, and design decisions |
| [Feature Guide](./FEATURES.md) | How each feature works internally |
| [MCP Integration](./MCP_INTEGRATION.md) | Model Context Protocol server setup |
| [Registry Guide](./REGISTRY.md) | Module registry and reusable configurations |
| [Plugin SDK](./PLUGINS.md) | Build custom extensions |
| [AI Agent Integration](./plugin/plugin.md) | Connect GUIDE.md to AI tools |

---

## Getting Started

### 1. Installation

```bash
npm install -g @prismteam/linter
```

### 2. Initialize GUIDE.md

```bash
guidemd init
```

### 3. Validate

```bash
guidemd lint
```

### 4. Export to Your AI Tool

```bash
# For Claude Code
guidemd export --target claude

# For Cursor IDE
guidemd export --target cursor

# For Windsurf
guidemd export --target windsurf

# Export all formats
guidemd export --target all
```

---

## Documentation by Role

### For Project Maintainers

- **[CLI Reference](./plugin/docs.md)** — All commands and options
- **[Feature Guide](./FEATURES.md)** — Understanding internal capabilities
- **[Registry Guide](./REGISTRY.md)** — Using reusable modules

### For AI Agent Developers

- **[API Reference](./API.md)** — Programmatic integration
- **[MCP Integration](./MCP_INTEGRATION.md)** — JSON-RPC server setup
- **[AI Agent Integration](./plugin/plugin.md)** — Tool-specific export formats

### For Plugin Authors

- **[Plugin SDK](./PLUGINS.md)** — Building custom extensions
- **[Architecture](./ARCHITECTURE.md)** — Extension points and design patterns
- **[API Reference](./API.md)** — Internal module APIs

### For DevOps/CI Engineers

- **[CLI Reference](./plugin/docs.md)** — `guidemd ci` workflow generation
- **[Feature Guide](./FEATURES.md)** — The Guardian (git hooks), verification

---

## Core Concepts

### What is GUIDE.md?

A machine-validated, drift-aware AI context file that combines:

1. **YAML Frontmatter** — Structured project metadata (tech stack, guardrails, testing requirements)
2. **Markdown Body** — Human-readable instructions for AI agents

```yaml
---
guide_version: "1.0.0"
project: my-app
language: typescript
runtime: node@22
framework: next@14
strict_typing: true
guardrails:
  no_hallucination: true
  scope_creep_prevention: true
---

# AI Instructions

## Project Overview
This is a Next.js application for...

## Domain Vocabulary
- **Widget**: A reusable UI component
- **Session**: User authentication state

## What NOT to do
- Never use `any` types
- Never modify files in `migrations/`
```

### The "Context Rot" Problem

Documentation becomes stale as code evolves. GUIDE.md solves this through:

- **Drift Detection** — Compares declared state vs. actual project state
- **Sync Engine** — Auto-updates GUIDE.md when frameworks/versions change
- **The Guardian** — Git pre-commit hook blocks commits with stale context

### Token Efficiency

Every byte in GUIDE.md competes with source code for LLM context windows. The linter provides:

- **Context Density Score** — Ratio of GUIDE.md size to repo size
- **Optimizer** — Suggests structural improvements
- **Profiler** — Token estimates per model

---

## Feature Overview

| Feature | CLI Command | Description |
|---------|-------------|-------------|
| **Validation** | `guidemd lint` | Zod schema + warning rules + secret scanning |
| **Drift Sync** | `guidemd sync` | Detect and fix divergence from project state |
| **Deep Analysis** | `guidemd doctor` | Static analysis for architectural conflicts |
| **Export** | `guidemd export` | Convert to AI-specific formats |
| **Verify** | `guidemd verify` | Cold-start AI reconstructability test |
| **Profile** | `guidemd profile` | Token efficiency and model compatibility |
| **Dashboard** | `guidemd info` | AI-readiness grade (A-F) |
| **Registry** | `guidemd add` | Reusable module system |
| **MCP Server** | `guidemd serve` | JSON-RPC 2.0 server for IDE integration |
| **README Gen** | `guidemd generate-readme` | Auto-generate from GUIDE.md |
| **Watcher** | `guidemd watch` | Auto-re-lint on file changes |

---

## Integration Options

### 1. Native IDE Rules (File-based)

Exported files are automatically loaded by IDEs:

```bash
guidemd export --target all
```

| IDE | File | Auto-loaded |
|-----|------|-------------|
| Claude Code | `CLAUDE.md` | Yes |
| Cursor | `.cursorrules` | Yes |
| Windsurf | `.windsurfrules` | Yes |
| GitHub Copilot | `.github/copilot-instructions.md` | Yes |
| Aider | `.aider.conf.yml` | Yes |

### 2. MCP Server (Protocol-based)

For IDEs supporting Model Context Protocol:

```bash
guidemd serve
```

Exposes 7 tools and 5 resources via JSON-RPC 2.0 over stdio.

See [MCP Integration](./MCP_INTEGRATION.md) for setup details.

### 3. Programmatic API

For custom agent development:

```typescript
import { lintGuideFile, exportGuide } from "@guidemd/linter";

const result = await lintGuideFile("./GUIDE.md");
const exports = exportGuide(result.data!, content, "./", "claude");
```

See [API Reference](./API.md) for complete documentation.

---

## Schema Quick Reference

### Required Fields

```yaml
---
guide_version: "1.0.0"  # Semver format
project: my-project     # 2-100 characters
language: typescript    # See supported languages below
strict_typing: true     # boolean
error_protocol: verbose # "verbose" | "silent" | "structured"
---
```

### Supported Languages

`typescript`, `javascript`, `python`, `rust`, `go`, `java`, `kotlin`, `swift`, `cpp`, `c`, `csharp`, `ruby`, `php`, `scala`, `haskell`, `elixir`, `zig`

### Optional Fields

```yaml
runtime: node@22              # e.g., "python@3.12", "bun@1.1"
framework: next@14             # string or array
description: "Project desc"    # 20-500 characters
last_updated: "2026-04-23"   # ISO date format
maintainers: ["email@example.com"]

# Code style configuration
code_style:
  max_line_length: 100
  indentation: "2 spaces"
  naming_convention: camelCase
  prefer_immutability: true

# AI behavior guardrails
guardrails:
  no_hallucination: true
  scope_creep_prevention: true
  dry_run_on_destructive: true

# Testing requirements
testing:
  required: true
  framework: vitest
  coverage_threshold: 80

# Project context
context:
  entry_points: ["src/index.ts"]
  off_limits: [".env", "migrations/"]
  architecture_pattern: clean

# Token budgets per section
token_budgets:
  guardrails: 500
  context: 1000
  total: 5000

# AI capability targeting (preferred over ai_model_target)
ai_capabilities:
  - tool_use
  - long_context
  - structured_output
```

---

## Best Practices

### 1. Keep It Fresh

```bash
# Run before commits
guidemd lint --sync

# Or install automatic hook
guidemd install-hooks
```

### 2. Use Capability-Based Targeting

```yaml
# Good: survives model churn
ai_capabilities: [tool_use, long_context, structured_output]

# Avoid: rots quickly
ai_model_target: [claude-sonnet-4-20250514]
```

### 3. Define Guardrails

```yaml
guardrails:
  no_hallucination: true        # Never invent APIs
  scope_creep_prevention: true  # Only modify requested files
  dry_run_on_destructive: true  # Preview before destructive ops
```

### 4. Set Off-Limits

```yaml
context:
  off_limits:
    - ".env"           # Secrets
    - ".env.*"         # Environment files
    - "migrations/"    # Database migrations
    - "secrets/"       # Credential storage
```

### 5. Use the Registry

```bash
# Add battle-tested configurations
guidemd add typescript-strict
guidemd add nextjs-security
guidemd add react-testing
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success / Valid |
| 1 | Validation failed / Errors detected |

---

## Resources

- [GitHub Repository](https://github.com/Danielkayode/guidemd-linter)
- [npm Package](https://www.npmjs.com/package/@prismteam/linter)
- [Report Issues](https://github.com/Danielkayode/guidemd-linter/issues)

---

## License

MIT © Prism Team
