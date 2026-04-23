# 📘 GUIDE.md Linter — AI Context Interface Standard

[![AI-Ready](https://img.shields.io/badge/AI--Ready-GUIDE.md-blue?style=flat-square&logo=ai)](https://guidemd.dev)
[![npm version](https://img.shields.io/npm/v/@prismteam/linter?style=flat-square)](https://www.npmjs.com/package/@prismteam/linter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**Stop the Context Rot.** The official CLI for the GUIDE.md standard — a machine-validated, drift-aware AI context interface that helps AI agents generate correct code on the first attempt.

## 🎯 What is GUIDE.md?

`GUIDE.md` is a YAML-frontmatter + Markdown specification that tells AI agents everything they need to know about a codebase before generating code. Unlike plain markdown context files, GUIDE.md is:

- **Machine-validated** — Schema-enforced via Zod
- **Drift-aware** — Auto-syncs with your actual project state
- **Multi-export** — Native support for all major AI tools
- **Token-optimized** — Designed for expensive LLM context windows

---

## 🚀 Installation

```bash
npm install -g @prismteam/linter
```

**Requirements:** Node.js 18 or higher

---

## ⚡ Quick Start

```bash
# Scaffold a new GUIDE.md with smart detection
guidemd init

# Validate your GUIDE.md
guidemd lint

# Sync with project state (prevents "Context Rot")
guidemd sync

# Verify AI can reconstruct your project
guidemd verify
```

---

## 📋 Quick Feature Reference

> For detailed CLI documentation with all options and examples, see [CLI Reference](DOCS/plugin/docs.md).

### Core Validation

| Command | Description | Key Options |
|---------|-------------|-------------|
| `guidemd init` | Scaffold GUIDE.md with smart stack detection | `--force` |
| `guidemd lint [file]` | Validate against Zod schema | `--json`, `--fix`, `--sync`, `--stats`, `--skip-secret-scan` |
| `guidemd sync [file]` | Detect and sync drift with project state | `-r, --readme <path>` |
| `guidemd verify [file]` | Cold-start verification (AI reconstructability) | `--json` |

### Analysis & Observability

| Command | Description | Key Options |
|---------|-------------|-------------|
| `guidemd doctor [file]` | Deep static analysis for logic conflicts | — |
| `guidemd profile [file]` | AI observability (tokens, compatibility) | `--json-schema` |
| `guidemd optimize [file]` | Token efficiency analysis | `--json` |
| `guidemd info [file]` | AI-Readiness dashboard with grade (A-F) | `--json` |
| `guidemd diff [file]` | Compare GUIDE.md versions | `--git`, `--breaking`, `--json` |

### Export & Integration

| Command | Description | Supported Targets |
|---------|-------------|-------------------|
| `guidemd export [file]` | Export to AI context formats | `claude`, `cursor`, `windsurf`, `copilot`, `aider`, `agents`, `all` |
| `guidemd import <file>` | Reverse-parse AI context files | CLAUDE.md, .cursorrules, .windsurfrules, AGENTS.md |
| `guidemd serve [file]` | Launch MCP server for Claude Desktop, Cursor | — |

### README & Documentation

| Command | Description | Key Options |
|---------|-------------|-------------|
| `guidemd generate-readme [file]` | Auto-generate README.md from GUIDE.md | `-t, --template`, `--dry-run`, `--badge` |
| `guidemd back-sync-readme [file]` | Back-port README changes to GUIDE.md | `-r, --readme` |
| `guidemd badge` | Generate AI-Readiness badge (dynamic grading) | `--file` |
| `guidemd generate-docs` | Regenerate HTML docs from schema | `-o, --out` |

### Registry & Modules

| Command | Description |
|---------|-------------|
| `guidemd add <module>` | Add reusable module (e.g., `typescript-strict`) |
| `guidemd registry list` | List available modules |
| `guidemd registry search <query>` | Search modules by keyword |
| `guidemd registry info <module>` | Show module details |

### Automation & CI

| Command | Description | Key Options |
|---------|-------------|-------------|
| `guidemd install-hooks` | Install git pre-commit hook (The Guardian) | `-m, --manager`, `--uninstall` |
| `guidemd watch [file]` | Watch mode: re-lint on every save | `--skip-secret-scan` |
| `guidemd ci` | Generate GitHub Actions workflow | `--write` |
| `guidemd schema` | Print JSON Schema representation | — |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        GUIDE.md Linter                       │
├─────────────────────────────────────────────────────────────┤
│  Core        │  Analysis      │  Export        │  Registry  │
│  ────────────┼────────────────┼────────────────┼────────────│
│  • init      │  • doctor      │  • export      │  • add     │
│  • lint      │  • profile     │  • import      │  • search  │
│  • sync      │  • optimize    │  • serve       │  • list    │
│  • verify    │  • info        │  • generate-   │            │
│              │                │    readme      │            │
├─────────────────────────────────────────────────────────────┤
│  Automation: watch │ install-hooks │ ci │ badge              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [CLI Reference](DOCS/plugin/docs.md) | Complete command reference with all options |
| [Feature Architecture](DOCS/FEATURES.md) | How each module works internally |
| [Plugin SDK](DOCS/PLUGINS.md) | Build custom extensions |
| [GUIDE.md Spec](GUIDE.md) | Example GUIDE.md for this project |

---

## 🤝 Supported AI Tools

| Tool | Export Command | MCP Support |
|------|---------------|-------------|
| **Claude Code** | `guidemd export --target claude` | ✅ via `serve` |
| **Cursor** | `guidemd export --target cursor` | ✅ via `serve` |
| **Windsurf** | `guidemd export --target windsurf` | ✅ via `serve` |
| **GitHub Copilot** | `guidemd export --target copilot` | — |
| **Aider** | `guidemd export --target aider` | — |
| **Claude Desktop** | — | ✅ native MCP |

---

## 🔑 Key Concepts

### Drift Detection
Automatically detects when your GUIDE.md diverges from actual project state:
- Framework version mismatches
- Missing entry points
- Runtime version conflicts
- TypeScript strict mode drift

### The Guardian
Git pre-commit hook that:
- Runs `guidemd lint --sync` before every commit
- Auto-stages GUIDE.md if updated
- Blocks commits on validation errors

### Cold Start Verification
Simulates an AI agent reading your GUIDE.md for the first time, verifying:
- **Dependency Tree** — Can AI understand the tech stack?
- **Build Scripts** — Can AI determine how to build/test?
- **Entry Points** — Can AI find where the app starts?
- **Architecture** — Can AI understand design patterns?

---

## 🧪 Example Workflow

```bash
# 1. Initialize with smart detection
guidemd init

# 2. Validate and fix issues
guidemd lint --fix

# 3. Sync with project state
guidemd sync

# 4. Deep analysis
guidemd doctor

# 5. Verify AI can reconstruct
guidemd verify

# 6. Optimize token usage
guidemd optimize

# 7. Install git hooks
guidemd install-hooks

# 8. Export to all formats
guidemd export --target all --manifest

# 9. Generate README
guidemd generate-readme

# 10. Check AI-Readiness dashboard
guidemd info
```

---

## 📦 Registry Modules

Pre-built configurations for common stacks:

```bash
guidemd add typescript-strict    # Strict TypeScript rules
guidemd add nextjs-security      # Next.js security best practices
guidemd add react-testing        # React testing configuration
```

---

## 📊 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success / Valid |
| 1 | Validation failed / Errors detected |

---

## 📜 License

MIT © Prism Team
