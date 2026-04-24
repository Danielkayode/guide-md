# linter

A machine-validated, drift-aware AI context file linter and toolchain. GUIDE.md is an open standard for declaring project metadata, coding rules, guardrails, and architecture context so AI agents generate correct code on the first attempt. This package provides the reference CLI validator, dashboard, exporter, and MCP server for the standard.


## Constraints

- **Language**: typescript
- **Runtime**: node@22

- **Testing**: vitest with 80% coverage
- **Architecture**: clean

## Rules

- **No Hallucination**: Do not invent APIs, packages, or type signatures
- **Scope Creep Prevention**: Only modify files/functions explicitly referenced
- **Destructive Operations**: Always preview destructive changes before executing
- **Code Style**: Max line length 100, 2 spaces indentation, camelCase naming
- **Error Protocol**: verbose
- **Strict Typing**: Always use explicit types; never 'any' or untyped params

## Instructions

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

- \*\*Never\*\* add new CLI commands without updating the JSON output schema; CI stability is a hard requirement.
- \*\*Don't\*\* use the \`any\` type under any circumstances; use \`unknown\` and narrow types to respect strict\_typing.
- \*\*Never\*\* mutate parsed GUIDE.md data in-place; the MCP server requires immutable data references to prevent state drift.
- \*\*Don't\*\* assume \`detectFramework\` (major version) and \`checkFrameworkVersions\` (full semver) are interchangeable.
- \*\*Never\*\* hard-code specific model names in \`ai\_model\_target\`; always prefer capability-based checks in \`ai\_capabilities\`.
- \*\*Don't\*\* call \`process.exit()\` inside \`src/linter/\` or \`src/parser/\`; these calls are reserved strictly for \`src/cli/index.ts\`.