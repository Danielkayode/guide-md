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
last_updated: "2026-04-22"
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

- **Linting**: Validates GUIDE.md files against the official schema with inheritance resolution
- **Sync**: Detects drift between frontmatter and actual project state (package.json versions, missing entry points)
- **Doctor**: Deep static analysis for logic conflicts and architectural fingerprinting
- **Verify**: Cold-start verification ensures AI can reconstruct your project from GUIDE.md alone
- **Export**: Converts GUIDE.md to CLAUDE.md, .cursorrules, .windsurfrules, AGENTS.md, Copilot instructions, Aider config
- **Import**: Reverse-parse existing AI context files back into GUIDE.md
- **Optimize**: Analyzes token efficiency and suggests improvements
- **Profile**: AI observability with token metrics, model compatibility, and section entropy
- **Dashboard**: AI-readiness health reports with scoring (grade A-F)
- **Guardian**: Git pre-commit hooks to keep GUIDE.md in sync
- **MCP Server**: Exposes GUIDE.md as structured Tools and Resources for AI agents via JSON-RPC
- **README Generator**: Translates GUIDE.md into beautiful human-readable README.md with smart section mapping
- **Back-Sync**: Bi-directional sync between README.md changes and GUIDE.md frontmatter
- **Registry**: Context Hub for reusable Guide Modules (like `guidemd add typescript-strict`)
- **Watcher**: Development mode with automatic re-linting on every save

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
| `guidemd lint --stats` | Show context density score |
| `guidemd sync [file]` | Sync frontmatter with project state |
| `guidemd init` | Scaffold a new GUIDE.md with smart detection |
| `guidemd schema` | Print JSON Schema representation |
| `guidemd verify [file]` | Cold-start verification (AI reconstructability) |
| `guidemd watch [file]` | Watch mode: re-lint on every save |

### Analysis Commands

| Command | Description |
|---------|-------------|
| `guidemd doctor [file]` | Deep static analysis for logic conflicts |
| `guidemd profile [file]` | AI observability: tokens, density, compatibility |
| `guidemd profile --json-schema` | Export JSON Schema for IntelliSense |
| `guidemd optimize [file]` | Analyze token efficiency |
| `guidemd info [file]` | AI-readiness dashboard with scoring |
| `guidemd badge` | Generate shields.io badge markdown |

### Export & Integration

| Command | Description |
|---------|-------------|
| `guidemd export [file]` | Export to all AI context formats |
| `guidemd export -t <target>` | Export to specific format (claude,cursor,windsurf,agents,copilot,aider) |
| `guidemd export --manifest` | Generate MCP manifest.json |
| `guidemd import <file>` | Reverse-parse AI context file to GUIDE.md |
| `guidemd serve [file]` | Start MCP server (stdio JSON-RPC) |

### README Generation

| Command | Description |
|---------|-------------|
| `guidemd generate-readme [file]` | Generate human-readable README.md |
| `guidemd generate-readme --template <path>` | Use custom template |
| `guidemd generate-readme --dry-run` | Print to stdout instead of file |
| `guidemd back-sync-readme [file]` | Sync changes from README back to GUIDE.md |

### Automation & CI

| Command | Description |
|---------|-------------|
| `guidemd install-hooks` | Install Guardian pre-commit hook |
| `guidemd install-hooks --uninstall` | Remove Guardian hook |
| `guidemd ci` | Print GitHub Actions workflow template |
| `guidemd ci --write` | Create .github/workflows/guidemd.yml directly |

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
