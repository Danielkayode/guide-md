# GUIDE.md Technical Documentation

## Overview
`GUIDE.md` is the "AI Context Interface" standard. It bridges the gap between raw source code and AI intent by providing a structured, validated, and synced context file that AI agents can rely on.

## CLI Commands

### 1. `guidemd lint [file]`
Validates the `GUIDE.md` against the Zod schema.
- `--fix`: Automatically repairs missing required fields.
- `--sync`: Detects and repairs "Context Rot" (drift) between code and guide.

### 2. `guidemd sync [file]`
Specifically audits the project for drift:
- **Frameworks**: Matches versions in `package.json`.
- **Typing**: Verifies `tsconfig.json` presence if `strict_typing` is enabled.
- **Paths**: Checks if `entry_points` exist on disk.

### 3. `guidemd optimize [file]`
Analyzes Markdown for redundancy. If a rule is already in the YAML, it suggests removing it from the Markdown to save tokens and improve model focus.

### 4. `guidemd export`
Generates tool-specific context files:
- `CLAUDE.md` (Claude Code)
- `.cursorrules` (Cursor)
- `.windsurfrules` (Windsurf)

### 5. `guidemd serve`
Launches a local **Model Context Protocol (MCP)** server. AI agents can connect via stdio to query project context as structured data.

### 6. `guidemd install-hooks`
Installs a Git pre-commit hook that prevents committing a stale or invalid `GUIDE.md`.

### 7. `guidemd info`
Displays the AI-Readiness Dashboard with token density and sync status scores.
