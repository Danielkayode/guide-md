# GUIDE.md Technical Documentation

## Overview
`GUIDE.md` is the "AI Context Interface" standard. It bridges the gap between raw source code and AI intent by providing a structured, validated, and synced context file that AI agents can rely on.

---

## CLI Commands Reference

### Core Commands

#### `guidemd lint [file]`
Validates a `GUIDE.md` file against the Zod schema. Handles inheritance resolution automatically.

**Options:**
- `--json`: Output results as JSON (for CI/tooling integration)
- `--fix`: Automatically fix missing required fields
- `--sync`: Detect and sync drift between frontmatter and project files
- `--stats`: Output Context Density Score comparing GUIDE.md to repository size
- `--skip-secret-scan`: Skip scanning for secrets (not recommended)

**Examples:**
```bash
guidemd lint
guidemd lint ./docs/GUIDE.md --fix
guidemd lint --sync --stats
```

---

#### `guidemd sync [file]`
Detects and syncs drift between GUIDE.md frontmatter and actual project state. Also performs bi-directional sync with README.md markers.

**Options:**
- `-r, --readme <path>`: Path to README.md for bi-directional sync (default: README.md)

**Drift Detection Includes:**
- Framework version mismatches (e.g., `next@14` in GUIDE.md vs `next@15` in package.json)
- Entry point validation (checks if listed files exist on disk)
- Runtime version drift (e.g., `node@20` vs `.nvmrc`)
- Test framework mismatches
- TypeScript strict mode alignment

---

#### `guidemd init`
Scaffolds a new `GUIDE.md` in the current directory with smart stack detection.

**Options:**
- `--force`: Overwrite an existing GUIDE.md

**Smart Detection:**
- Detects project name from package.json
- Detects language from file extensions
- Detects framework from dependencies
- Detects paradigm (OOP/Functional) from source code patterns

---

#### `guidemd verify [file]`
Cold start verification - simulates an AI agent reading GUIDE.md for the first time to verify sufficient context exists to reconstruct the project.

**Options:**
- `--json`: Output results as JSON

**Contract Score (0-100):**
- Pass threshold: 70/100
- Checks: Dependency Tree, Build Scripts, Entry Points, Architecture

---

### Analysis Commands

#### `guidemd doctor [file]`
Deep static analysis to find logic conflicts and architectural drift.

**Detects:**
- Framework mismatches (detected in package.json but not in GUIDE.md)
- TypeScript strict mode conflicts
- Runtime version drift
- Redundant content between YAML and Markdown

**Signature Detection:**
Uses `src/doctor/signatures.json` to detect frameworks from config files and dependencies.

---

#### `guidemd profile [file]`
AI Observability: Token density, instruction/code ratio, and model compatibility.

**Options:**
- `--json-schema`: Export project's GUIDE.md schema to JSON for IntelliSense

**Metrics:**
- Estimated total tokens
- Model compatibility table (Claude, GPT-4o, Llama 3)
- Section entropy (fluff detection)
- Ghost context (non-existent entry points)

---

#### `guidemd optimize [file]`
Analyzes GUIDE.md for token efficiency and structural improvements.

**Suggests:**
- Removing redundant content between YAML and Markdown
- Consolidating duplicate instructions
- Token budget optimization

---

### Export & Integration

#### `guidemd export [file]`
Export GUIDE.md to various AI context formats.

**Options:**
- `-t, --target <type>`: Target format (claude, cursor, windsurf, agents, copilot, aider, all)
- `-o, --out <dir>`: Output directory (default: .)
- `-m, --manifest`: Generate MCP manifest.json

**Supported Targets:**
| Target | Output File | Description |
|--------|-------------|-------------|
| `claude` | `CLAUDE.md` | Claude Code CLI context |
| `cursor` | `.cursorrules` | Cursor IDE rules |
| `windsurf` | `.windsurfrules` | Windsurf IDE rules |
| `agents` | `AGENTS.md` | Generic AI agents format |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot |
| `aider` | `.aider.conf.yml` | Aider chat AI |

---

#### `guidemd import <file>`
Reverse-parse an AI context file into a GUIDE.md.

**Options:**
- `-o, --out <path>`: Output path (default: GUIDE.md)
- `--dry-run`: Print to stdout instead of writing file

**Supported Imports:**
- CLAUDE.md
- .cursorrules
- .windsurfrules
- AGENTS.md

---

#### `guidemd serve [file]`
Launch a local MCP (Model Context Protocol) server exposing GUIDE.md as structured Tools and Resources.

**Exposed Tools:**
- `get_context`: Retrieve complete frontmatter
- `get_naming_conventions`: Get code style rules
- `get_architecture`: Get architecture pattern
- `get_guardrails`: Get AI safety constraints
- `get_testing_requirements`: Get test setup
- `get_runtime_info`: Get runtime details

**Exposed Resources (URI scheme: `guidemd://`):**
- `guidemd://frontmatter`: JSON frontmatter
- `guidemd://overview`: Project overview markdown
- `guidemd://domain`: Domain vocabulary
- `guidemd://decisions`: Architectural decisions
- `guidemd://antipatterns`: Anti-patterns

---

### README Generation

#### `guidemd generate-readme [file]`
Generate a human-friendly README.md from GUIDE.md frontmatter.

**Options:**
- `-t, --template <path>`: Use custom Handlebars-like template
- `--dry-run`: Print to stdout instead of writing file
- `--badge`: Inject AI-Readiness badge (default: true)

**Features:**
- Smart mapping of GUIDE.md sections to README sections
- Shields.io badges for tech stack
- AI-Readiness grade badge (A-F)

---

#### `guidemd back-sync-readme [file]`
Back-port changes from README.md into GUIDE.md frontmatter (bi-directional sync).

**Options:**
- `-r, --readme <path>`: Path to README.md (default: README.md)

**Syncs:**
- Project name from H1 heading
- Language, runtime, framework from Tech Stack section
- Architecture pattern from markers

---

### Registry & Modules

#### `guidemd add <module>`
Add a reusable Guide Module to your GUIDE.md.

**Options:**
- `--force`: Overwrite conflicting fields

**Example:**
```bash
guidemd add typescript-strict
guidemd add nextjs-security --force
```

---

#### `guidemd registry list`
List available modules in the registry.

---

#### `guidemd registry search <query>`
Search modules by keyword.

---

#### `guidemd registry info <module>`
Show details about a specific module.

---

### Automation & CI

#### `guidemd install-hooks`
Install a Git pre-commit hook to keep GUIDE.md in sync (The Guardian).

**Options:**
- `-m, --manager <type>`: Hook manager: husky, raw, or auto (default: auto)
- `--uninstall`: Remove the Guardian hook

**The Guardian will:**
- Run `guidemd lint --sync` before every commit
- Auto-stage GUIDE.md if updated during sync
- Block commits if GUIDE.md has validation errors

---

#### `guidemd ci`
Generate a GitHub Actions workflow template.

**Options:**
- `--write`: Create .github/workflows/guidemd.yml directly

---

#### `guidemd badge`
Generate a Markdown badge for your README with dynamic AI-Readiness grading.

**Options:**
- `--file <path>`: GUIDE.md file path (default: GUIDE.md)

---

#### `guidemd watch [file]`
Watch mode: re-run lint on every save of GUIDE.md.

**Options:**
- `--skip-secret-scan`: Skip scanning for secrets

---

### Utility Commands

#### `guidemd schema`
Print the JSON Schema representation of the GUIDE.md spec.

---

#### `guidemd info [file]`
Display a high-level health report of the project's AI-readiness.

**Shows:**
- Overall AI Grade (A-F)
- Token efficiency score
- Sync status (days since last update)
- Section completeness
- Best practices coverage
- Model compatibility ratings

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success / Valid |
| 1 | Validation failed / Errors detected |

---

## Environment Variables

None currently supported. All configuration is through CLI flags or GUIDE.md frontmatter.
