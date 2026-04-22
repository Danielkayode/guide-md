# 📘 GUIDE.md — The AI Context Interface

[![AI-Ready](https://img.shields.io/badge/AI--Ready-GUIDE.md-blue?style=for-the-badge&logo=ai)](https://guidemd.dev)

**Stop the Context Rot.** `GUIDE.md` is a standard for providing AI agents with high-fidelity, validated, and auto-synced project context.

## 🚀 Key Features

| Feature | CLI Command | Description |
|---------|-------------|-------------|
| **🛡️ The Guardian** | `install-hooks` | Git pre-commit hooks prevent "Context Rot" |
| **🔄 Drift Detection** | `sync` | Auto-sync with `package.json` and project files |
| **⚡ Token Optimization** | `optimize` | Maximize token-density for cheaper LLM usage |
| **📤 Multi-Export** | `export` | Native support for Cursor, Windsurf, Claude, Copilot, Aider |
| **🔌 MCP Server** | `serve` | Live Model Context Protocol server for AI agents |
| **🩺 Deep Analysis** | `doctor` | Find logic conflicts and architectural drift |
| **🔍 Cold Start Verify** | `verify` | Ensure AI can reconstruct your project |
| **📈 Observability** | `profile` | Token metrics and model compatibility |
| **📖 README Gen** | `generate-readme` | Auto-generate human-friendly README |
| **📦 Module Registry** | `add`, `registry` | Reusable configuration modules |
| **👁️ Watch Mode** | `watch` | Instant validation on every save |
| **🔄 Bi-Directional** | `import`, `back-sync-readme` | Sync between GUIDE.md and other formats |

## 🛠️ Installation

**Requirements:** Node.js 18 or higher

```bash
npm install -g @guidemd/linter
```

## 📖 Quick Start

```bash
# 1. Install the CLI
npm install -g @guidemd/linter

# 2. Initialize a new GUIDE.md (with smart stack detection)
guidemd init

# 3. Validate against schema
guidemd lint

# 4. Sync with project state (detect drift)
guidemd sync

# 5. Verify AI can reconstruct your project
guidemd verify

# 6. Run deep analysis for issues
guidemd doctor

# 7. Optimize for token efficiency
guidemd optimize

# 8. Install git hooks (The Guardian)
guidemd install-hooks

# 9. Export to IDE formats
guidemd export --target all

# 10. Generate README.md
guidemd generate-readme

# 11. View AI-Readiness dashboard
guidemd info
```

## 📊 AI-Readiness Dashboard

Run `guidemd info` to see your project's health report:
- **Overall AI Score**: How easy it is for an AI to understand your code.
- **Token Density**: Is your guide optimized for expensive LLMs?
- **Sync Status**: Is your documentation lying about your dependencies?

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [CLI Reference](DOCS/plugin/docs.md) | Complete command reference and options |
| [Integration Guide](DOCS/plugin/plugin.md) | Integrate with Cursor, Windsurf, Claude, Copilot |
| [Feature Architecture](DOCS/FEATURES.md) | How each module works internally |
| [Plugin SDK](DOCS/PLUGINS.md) | Build extensions for @prismteam/linter |
| [GUIDE.md Spec](GUIDE.md) | This project's own GUIDE.md (example) |

## 🤝 Supported AI Agents & IDEs

- **Claude Code** (`guidemd export --target claude`)
- **Cursor** (`guidemd export --target cursor`)
- **Windsurf** (`guidemd export --target windsurf`)
- **GitHub Copilot** (`guidemd export --target copilot`)
- **Aider** (`guidemd export --target aider`)
- **Claude Desktop** (`guidemd serve` for MCP)
- **Custom Agents** (`guidemd lint --json` for programmatic access)

## 📜 License
MIT
