# AI Agent Integration Guide

Integrate `GUIDE.md` into any AI agent or IDE to ensure perfect project context.

## 1. Native IDE Rules
Use the `export` command to generate files that IDEs like Cursor and Windsurf read automatically:
```bash
guidemd export --target all
```
This generates:
- `.cursorrules` for **Cursor**
- `.windsurfrules` for **Windsurf**
- `CLAUDE.md` for **Claude Code**

## 2. Model Context Protocol (MCP)
For agents that support MCP (like Claude Desktop), expose your guide as a live tool:
```bash
guidemd serve
```
The agent can then call `get_context` to receive structured JSON rather than parsing the entire Markdown file.

## 3. The CI "Guardian"
Ensure that your AI agent never receives "Context Rot" by enforcing syncs in CI:
```bash
guidemd ci > .github/workflows/guidemd.yml
```

## 4. Custom Agents
If building a custom agent, use the `--json` flag to get machine-readable context:
```bash
guidemd lint --json
```
Your agent can parse this JSON to understand the tech stack, naming conventions, and architecture patterns before it writes a single line of code.
