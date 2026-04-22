# AI Agent Integration Guide

Integrate `GUIDE.md` into any AI agent or IDE to ensure perfect project context.

---

## 1. Native IDE Rules

Use the `export` command to generate files that IDEs read automatically:

```bash
# Export to all supported formats
guidemd export --target all

# Export to specific IDE
guidemd export --target cursor
guidemd export --target windsurf
guidemd export --target claude
```

**Generated Files:**

| IDE/Tool | File | Auto-loaded? |
|----------|------|--------------|
| **Cursor** | `.cursorrules` | Yes |
| **Windsurf** | `.windsurfrules` | Yes |
| **Claude Code** | `CLAUDE.md` | Yes |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Yes (if in repo) |
| **Aider** | `.aider.conf.yml` | Yes |
| **Generic** | `AGENTS.md` | Manual reference |

---

## 2. Model Context Protocol (MCP)

For agents that support MCP (Claude Desktop, Cursor, etc.), expose your guide as a live server:

```bash
# Start MCP server (stdio JSON-RPC)
guidemd serve

# Or serve a specific file
guidemd serve ./docs/GUIDE.md
```

**Available Tools:**
- `get_context` - Complete frontmatter data
- `get_naming_conventions` - Code style rules
- `get_architecture` - Architecture pattern and constraints
- `get_guardrails` - AI safety constraints
- `get_testing_requirements` - Test setup and coverage
- `get_runtime_info` - Runtime and dependency info

**Available Resources (URI scheme):**
- `guidemd://frontmatter` - JSON frontmatter
- `guidemd://overview` - Project overview markdown
- `guidemd://domain` - Domain vocabulary
- `guidemd://decisions` - Architectural decisions
- `guidemd://antipatterns` - What NOT to do

---

## 3. The CI "Guardian"

Prevent "Context Rot" by enforcing GUIDE.md syncs in CI:

```bash
# Generate workflow file
guidemd ci --write

# Or output to stdout for custom setup
guidemd ci > .github/workflows/guidemd.yml
```

The generated workflow:
- Runs on every push to main/master
- Lints GUIDE.md and fails on errors
- Posts AI-Readiness dashboard as PR comment
- Updates existing bot comments (no spam)

---

## 4. Custom Agents

For custom agent development, use the JSON API:

```bash
# Get full validation report as JSON
guidemd lint --json

# Get with context density stats
guidemd lint --json --stats

# Get cold-start verification report
guidemd verify --json
```

**Sample JSON Output:**
```json
{
  "valid": true,
  "file": "/project/GUIDE.md",
  "diagnostics": [],
  "data": {
    "guide_version": "1.0.0",
    "project": "my-app",
    "language": "typescript",
    "framework": "next@14",
    "strict_typing": true,
    "guardrails": {
      "no_hallucination": true,
      "scope_creep_prevention": true
    }
  }
}
```

---

## 5. MCP Manifest

Generate an MCP-compatible manifest for IDE discovery:

```bash
guidemd export --manifest
```

This creates `guidemd-manifest.json` declaring:
- AI Interface capabilities
- Available tools
- Resource URIs
- Project context structure

---

## 6. Programmatic Integration

For Node.js-based agents, use the internal modules directly:

```typescript
import { parseGuideFile } from "@guidemd/linter/parser";
import { GuideMdSchema } from "@guidemd/linter/schema";

const result = parseGuideFile("./GUIDE.md");
if (result.success) {
  const validated = GuideMdSchema.safeParse(result.data);
  // Use validated.data for AI context
}
```

See [PLUGINS.md](../PLUGINS.md) for full API reference.
