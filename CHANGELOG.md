# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-20

### Added

Initial stable release of @guidemd/linter — the official CLI for the GUIDE.md AI Context Interface standard.

#### Core Commands
- `guidemd lint [file]` — Validate a GUIDE.md file against the spec (handles inheritance)
  - `--json` — Output results as JSON for CI/tooling integration
  - `--fix` — Automatically fix fixable issues
  - `--sync` — Detect and sync drift between frontmatter and actual project files
  - `--stats` — Output Context Density Score comparing GUIDE.md to total repository size
  - `--skip-secret-scan` — Skip scanning for secrets (not recommended)

- `guidemd init` — Scaffold a new GUIDE.md with smart stack detection
  - `--force` — Overwrite an existing GUIDE.md

- `guidemd fix [file]` — Auto-fix missing required fields and common issues

- `guidemd sync [file]` — Detect and sync drift between frontmatter and project files
  - `--readme <path>` — Path to README.md for bi-directional sync

- `guidemd export [file]` — Export GUIDE.md to other AI context formats
  - `--target <type>` — Target format: claude, cursor, windsurf, agents, copilot, aider, or all
  - `--out <dir>` — Output directory
  - `--manifest` — Generate MCP manifest.json for Model Context Protocol

- `guidemd import <file>` — Reverse-parse AI context files into GUIDE.md
  - `--out <path>` — Output path for the generated GUIDE.md
  - `--dry-run` — Print to stdout instead of writing file

- `guidemd info [file]` — Display a high-level health report of AI-readiness

- `guidemd optimize [file]` — Analyze GUIDE.md for token efficiency and improvements

- `guidemd verify [file]` — Verify GUIDE.md provides enough context for AI cold start
  - `--json` — Output results as JSON

- `guidemd doctor [file]` — Deep static analysis for logic conflicts and architectural drift

- `guidemd profile [file]` — AI Observability: Token density, compatibility, and entropy
  - `--json-schema` — Export the project's GUIDE.md schema to JSON for IntelliSense

- `guidemd badge` — Generate a Markdown badge for your README (Dynamic Grading)
  - `--file <path>` — GUIDE.md file path

- `guidemd ci` — Generate a GitHub Action workflow template
  - `--write` — Create .github/workflows/guidemd.yml directly

- `guidemd watch [file]` — Watch mode: re-run lint on every save of GUIDE.md
  - `--skip-secret-scan` — Skip scanning for secrets

- `guidemd install-hooks` — Install git pre-commit hook to keep GUIDE.md in sync (The Guardian)
  - `--manager <type>` — Hook manager: husky, simple-git-hooks, lefthook
  - `--uninstall` — Remove the installed hook

- `guidemd schema` — Print the JSON Schema representation of the GUIDE.md spec

#### Registry Commands
- `guidemd add <module>` — Install a registry module into your GUIDE.md
- `guidemd list` — List available registry modules
- `guidemd search <query>` — Search for registry modules

#### Inheritance & Extends
- Support for `extends` field in frontmatter for inheriting from other GUIDE.md files
- Local file path resolution (e.g., `extends: "./base-guide.md"`)
- Registry module resolution (e.g., `extends: "typescript-strict"`)
- Remote URL resolution (e.g., `extends: "https://example.com/guide.md"`)
- Deep merging of nested objects (child values override parent values)
- Circular dependency detection with clear error messages

#### Secret Scanning
- Automatic scanning for secrets in GUIDE.md files
- Detection of OpenAI API keys, GitHub tokens, Slack tokens, AWS Access Keys
- Detection of sensitive YAML keys (API_KEY, SECRET_KEY, etc.)
- Smart placeholder detection (skips YOUR_API_KEY_HERE patterns)
- Masking of detected secrets for safe error reporting

#### Sync & Drift Detection
- Framework version drift detection from package.json
- Entry point existence validation
- tsconfig.json presence check for strict_typing
- Paradigm detection (OOP vs Functional) via AST analysis
- Automatic synchronization of detected drift

#### Export Targets
- **CLAUDE.md** — XML-style context/rules format for Claude Code
- **.cursorrules** — YAML frontmatter + markdown rules for Cursor
- **.windsurfrules** — Windsurf-specific format
- **AGENTS.md** — OpenAI Agents format with constraints and rules
- **.github/copilot-instructions.md** — GitHub Copilot instructions
- **.aider.conf.yml** — Aider configuration file
- **guidemd-manifest.json** — MCP (Model Context Protocol) manifest

#### Import Sources
- CLAUDE.md — Parse XML-style context/rules blocks
- .cursorrules — Parse YAML frontmatter + markdown
- .windsurfrules — Parse Windsurf format
- AGENTS.md — Parse OpenAI Agents format

#### Features
- Zod-based schema validation with detailed error messages
- Warning system for best practices (short descriptions, missing guardrails, stale files, etc.)
- Smart language detection from project file extensions
- Context Density Score for measuring AI context efficiency
- Cold Start Verification — Can an AI reconstruct your project from GUIDE.md alone?
- Token budget tracking and optimization suggestions
- Bi-directional sync with README.md
- Smart template generation with project detection

#### Supported Languages
TypeScript, JavaScript, Python, Rust, Go, Java, Kotlin, Swift, C++, C, C#, Ruby, PHP, Scala, Haskell, Elixir, Zig

#### VS Code Extension (separate package)
- Syntax highlighting for GUIDE.md files (YAML frontmatter + Markdown body)
- Inline diagnostics on save
- Open Dashboard command

### Security
- Secrets are never logged in plain text
- Masked values shown in error reports
- Placeholder values (YOUR_API_KEY_HERE) are not flagged as secrets

[1.0.0]: https://github.com/guidemd/linter/releases/tag/v1.0.0
