<!-- guidemd:generated -->
# linter

A machine-validated, drift-aware AI context file linter and toolchain. GUIDE.md is an open standard for declaring project metadata, coding rules, guardrails, and architecture context so AI agents generate correct code on the first attempt. This package provides the reference CLI validator, dashboard, exporter, and MCP server for the standard.


## Project Context

- **Language**: typescript
- **Runtime**: node@22

- **Strict Typing**: Enabled
- **Error Protocol**: verbose

## Code Style

- Max line length: 100
- Indentation: 2 spaces
- Naming convention: camelCase
- Max function lines: 50


## Guardrails

- Do not invent APIs, packages, or type signatures
- Only modify files/functions explicitly referenced in the prompt
- Preview destructive operations before executing


## AI Instructions

# AI Instructions

## Project Overview

This is the reference implementation of the GUIDE.md standard — a YAML-frontmatter + Markdown specification that tells AI agents everything they need to know about a codebase before generating code. Unlike plain markdown context files (CLAUDE.md, etc.), GUIDE.md is machine-validated, drift-aware, and exportable to multiple AI tool formats.

Key business rules:
- Every project must have a file named exactly \`GUIDE.md\` in the repository root.
- The YAML frontmatter is validated against a strict Zod schema; invalid frontmatter blocks AI generation.
- The linter detects drift between the declared state in GUIDE.md and the actual project state (dependencies, entry points, TypeScript strictness).
- The MCP server exposes GUIDE.md as JSON-RPC tools and resources for Claude Desktop, Cursor, etc.

## Domain Vocabulary

- \*\*GUIDE.md\*\*: The standard AI context interface file. YAML frontmatter + Markdown body.
- \*\*Drift\*\*: When the real project state diverges from what GUIDE.md claims (e.g., framework version mismatch).
- \*\*Frontmatter\*\*: The YAML block between \`---\` fences at the top of the file.
- \*\*Guardrails\*\*: Behavioral constraints like \`no\_hallucination\` or \`dry\_run\_on\_destructive\`.
- \*\*MCP\*\*: Model Context Protocol server that exposes GUIDE.md as structured tools/resources.
- \*\*Registry\*\*: Reusable module repository for common stacks (nextjs-security, etc.).

## Non-Obvious Decisions

1. \*\*Why Zod instead of JSON Schema directly?\*\*
   Zod gives us runtime validation + TypeScript inference in one definition. We export to JSON Schema via \`zod-to-json-schema\` for language-agnostic consumers.

2. \*\*Why synchronous file I/O everywhere?\*\*
   The CLI is expected to run as a short-lived process. Async I/O adds complexity for marginal gain on local filesystems. If we add a daemon mode later, we will switch to async.

3. \*\*Why \`process.exit\` in CLI but not in library code?\*\*
   All \`process.exit\` calls live in \`src/cli/index.ts\`. Core modules return objects and never exit, so they remain testable and importable by the MCP server.

4. \*\*Why passthrough on the root Zod schema?\*\*
   \`GuideMdSchema.passthrough()\` allows forward compatibility. New fields added in minor spec versions won't break older linters.

## What NOT to do

- \*\*Do NOT add new CLI commands without updating the JSON output schema.\*\* CI pipelines depend on \`--json\` stability.
- \*\*Do NOT use \`any\` types\*\* — the project sets \`strict\_typing: true\` in its own GUIDE.md. Use \`unknown\` and narrow instead.
- \*\*Do NOT mutate parsed GUIDE.md data in-place.\*\* Always clone before merging or fixing; the MCP server may hold a reference to the same object.
- \*\*Do NOT assume framework versions in \`detectFramework\` match the semver in \`package.json\`.\*\* \`detectFramework\` returns \`next@14\` (major only), but \`checkFrameworkVersions\` compares full semver. Align them before using.
- \*\*Do NOT let \`ai\_model\_target\` rot.\*\* Model names change monthly. Prefer \`ai\_capabilities\` (capability-based) or remove the field from required validation.