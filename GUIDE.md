---
guide_version: "1.0.0"
project: "@guidemd/linter"
description: "The official CLI linter and toolkit for the GUIDE.md AI Context Interface standard. Validates, exports, optimizes, and generates human-readable documentation from machine-readable AI context files."
language: typescript
runtime: "node@20"
framework: commander
strict_typing: true
error_protocol: verbose
ai_model_target:
  - "claude-sonnet-4-20250514"
last_updated: "2026-04-21"
code_style:
  max_line_length: 100
  indentation: "2 spaces"
  naming_convention: camelCase
  max_function_lines: 50
  prefer_immutability: true
  prefer_early_returns: true
guardrails:
  no_hallucination: true
  scope_creep_prevention: true
  cite_sources: false
  dry_run_on_destructive: true
  max_response_scope: function
testing:
  required: false
context:
  entry_points:
    - "src/cli/index.ts"
  architecture_pattern: layered
modules:
  - typescript-strict
---

# AI Instructions

## Project Overview

This project is a comprehensive toolkit for the GUIDE.md specification — a YAML frontmatter standard designed to give AI agents structured context about software projects. The tool provides:

- **Linting**: Validates GUIDE.md files against the official schema
- **Sync**: Detects drift between frontmatter and actual project state (package.json versions, missing entry points)
- **Export**: Converts GUIDE.md to CLAUDE.md, .cursorrules, or .windsurfrules
- **Optimize**: Analyzes token efficiency and suggests improvements
- **Dashboard**: AI-readiness health reports with scoring
- **Guardian**: Git pre-commit hooks to keep GUIDE.md in sync
- **MCP Server**: Exposes GUIDE.md as structured Tools and Resources for AI agents
- **README Generator**: Translates GUIDE.md into beautiful human-readable README.md files with shields.io badges
- **Registry**: Context Hub for reusable Guide Modules (like `guidemd add typescript-strict`)

## Domain Vocabulary

- **GUIDE.md**: A markdown file with YAML frontmatter providing AI context
- **Frontmatter**: The YAML block at the top of a GUIDE.md file (between `---` delimiters)
- **Drift**: When the declared frontmatter state differs from the actual project state (e.g., framework version mismatch)
- **Guardrails**: AI behavior constraints (e.g., `no_hallucination`, `scope_creep_prevention`)
- **Module**: A reusable, shareable piece of frontmatter configuration fetched from the registry
- **Smart Mapping**: The feature that extracts content from GUIDE.md body sections and injects them into generated README.md sections

## Non-Obvious Decisions

We chose a custom lightweight template parser over Handlebars/Mustache for the README generator. This keeps the tool dependency-free and avoids security concerns with full template engines. The parser supports `{{variable}}`, `{{#if field}}`, and `{{#each array}}` syntax.

The registry uses a local cache directory (`~/.guidemd/modules/`) with GitHub fallback rather than a centralized API. This enables offline usage and avoids infrastructure costs while still allowing community sharing via a GitHub organization (`guidemd/registry`).

## What NOT to do

- Never modify files in `context.off_limits` without explicit human approval
- Don't introduce breaking changes to the `GuideMdSchema` without version bumping `guide_version`
- Avoid adding runtime dependencies unless absolutely necessary — keep the tool lightweight
- Don't use `any` types — the project uses `strict: true` TypeScript configuration

## CLI Commands Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `guidemd lint [file]` | Validate GUIDE.md against schema |
| `guidemd lint --fix` | Auto-fix missing required fields |
| `guidemd lint --sync` | Detect and sync drift |
| `guidemd sync [file]` | Sync frontmatter with project state |
| `guidemd init` | Scaffold a new GUIDE.md |
| `guidemd schema` | Print JSON Schema representation |

### Export & Integration

| Command | Description |
|---------|-------------|
| `guidemd export [file]` | Export to CLAUDE.md, .cursorrules, .windsurfrules |
| `guidemd export -t claude` | Export to specific format only |
| `guidemd serve [file]` | Start MCP server (stdio JSON-RPC) |

### Quality & Analysis

| Command | Description |
|---------|-------------|
| `guidemd optimize [file]` | Analyze token efficiency |
| `guidemd info [file]` | AI-readiness dashboard with scoring |
| `guidemd badge` | Generate shields.io badge markdown |

### Automation

| Command | Description |
|---------|-------------|
| `guidemd install-hooks` | Install Guardian pre-commit hook |
| `guidemd ci` | Print GitHub Actions workflow template |

### Human Mirror (README Generation)

| Command | Description |
|---------|-------------|
| `guidemd generate-readme [file]` | Generate human-readable README.md |
| `guidemd generate-readme --template <path>` | Use custom template |
| `guidemd generate-readme --dry-run` | Print to stdout instead of file |

The generated README includes:
- Project title and description
- Shields.io badges (language, strict typing, framework, testing, AI-validated)
- Tech stack table
- Coding standards documentation
- Testing requirements
- Architecture overview with entry points
- Guardrails summary
- Smart-mapped sections from GUIDE.md body (`Project Overview` → `About This Project`, etc.)

### Context Hub (Registry)

| Command | Description |
|---------|-------------|
| `guidemd add <module>` | Add a reusable Guide Module to GUIDE.md |
| `guidemd add <module> --force` | Overwrite conflicting fields |
| `guidemd registry list` | List available modules |
| `guidemd registry search <query>` | Search modules by keyword |
| `guidemd registry info <module>` | Show module details |

Modules are YAML files with partial frontmatter. When added, they are:
1. Fetched from local cache or GitHub (`guidemd/registry`)
2. Deep-merged into existing GUIDE.md (arrays are concatenated + deduplicated)
3. Validated against schema
4. Recorded in the `modules: []` field for update tracking
