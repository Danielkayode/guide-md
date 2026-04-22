# 📘 GUIDE.md — The AI Context Interface

[![AI-Ready](https://img.shields.io/badge/AI--Ready-GUIDE.md-blue?style=for-the-badge&logo=ai)](https://guidemd.dev)

**Stop the Context Rot.** `GUIDE.md` is a standard for providing AI agents with high-fidelity, validated, and auto-synced project context.

## 🚀 Key Features

- **🛡️ The Guardian**: Prevent "Context Rot" with Git hooks and CI gates.
- **🔄 Drift Detection**: Automatically sync your guide with `package.json` and directory structures.
- **⚡ Token Optimization**: Maximize "token-density" to make AI cheaper and smarter.
- **📤 Multi-Export**: Native support for `.cursorrules`, `.windsurfrules`, and `CLAUDE.md`.
- **🔌 MCP Server**: Expose your project context as a live tool via the Model Context Protocol.

## 🛠️ Installation

**Requirements:** Node.js 18 or higher

```bash
npm install -g @guidemd/linter
```

## 📖 Quick Start

1. **Initialize**: `guidemd init`
2. **Validate**: `guidemd lint`
3. **Sync Drift**: `guidemd sync`
4. **Optimize**: `guidemd optimize`
5. **Secure**: `guidemd install-hooks`
6. **Export**: `guidemd export --target all`

## 📊 AI-Readiness Dashboard

Run `guidemd info` to see your project's health report:
- **Overall AI Score**: How easy it is for an AI to understand your code.
- **Token Density**: Is your guide optimized for expensive LLMs?
- **Sync Status**: Is your documentation lying about your dependencies?

## 🤝 Integration

See [plugin.md](DOCS/plugin/plugin.md) for detailed instructions on integrating with Cursor, Windsurf, Claude Code, and custom AI agents.

## 📜 License
MIT
