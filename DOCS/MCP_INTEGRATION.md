# MCP Integration Guide

**Model Context Protocol (MCP) Server for GUIDE.md**

This document explains how to integrate the GUIDE.md MCP server with AI agents and IDEs that support the Model Context Protocol.

---

## Table of Contents

1. [What is MCP?](#what-is-mcp)
2. [Quick Start](#quick-start)
3. [Configuration](#configuration)
4. [Available Tools](#available-tools)
5. [Available Resources](#available-resources)
6. [Security](#security)
7. [Protocol Details](#protocol-details)
8. [Troubleshooting](#troubleshooting)

---

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard that enables AI agents to discover and interact with external data sources and tools. The GUIDE.md MCP server exposes your project's GUIDE.md as structured tools and resources that MCP-compatible agents can consume.

### Supported Clients

| Client | Version | Support Level |
|--------|---------|---------------|
| Claude Desktop | 0.5+ | Full |
| Cursor | 0.40+ | Full |
| Continue | 0.9+ | Basic |

---

## Quick Start

### 1. Start the MCP Server

```bash
# Start with default GUIDE.md
guidemd serve

# Or specify a custom path
guidemd serve ./docs/GUIDE.md
```

The server runs on **stdio** (standard input/output) using JSON-RPC 2.0.

### 2. Configure Your MCP Client

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "guidemd": {
      "command": "guidemd",
      "args": ["serve", "/path/to/your/GUIDE.md"]
    }
  }
}
```

Location:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

#### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "guidemd": {
      "command": "npx",
      "args": ["-y", "@prismteam/linter", "serve", "./GUIDE.md"]
    }
  }
}
```

### 3. Test the Connection

Once configured, your AI agent will automatically discover the GUIDE.md context and use it when generating code.

---

## Configuration

### Server Options

```bash
guidemd serve [file] [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `file` | Path to GUIDE.md | `./GUIDE.md` |
| `--port` | HTTP mode port (not implemented) | - |

### Environment Variables

None currently supported. All configuration is through CLI arguments or the GUIDE.md file itself.

### Manifest Generation

Generate an MCP-compatible manifest for client discovery:

```bash
guidemd export --manifest
```

This creates `guidemd-manifest.json` with server capabilities and metadata.

---

## Available Tools

Tools are functions that the AI agent can call to retrieve specific information from your GUIDE.md.

### `get_context`

Retrieves the complete frontmatter data.

**Parameters:** None

**Returns:**
```json
{
  "guide_version": "1.0.0",
  "project": "my-app",
  "language": "typescript",
  "runtime": "node@22",
  "framework": "next@14",
  "strict_typing": true,
  "guardrails": {
    "no_hallucination": true,
    "scope_creep_prevention": true
  },
  ...
}
```

**Use Case:** Initial project context discovery

---

### `get_naming_conventions`

Returns code style rules from the frontmatter.

**Parameters:** None

**Returns:**
```json
{
  "max_line_length": 100,
  "indentation": "2 spaces",
  "naming_convention": "camelCase",
  "prefer_immutability": true,
  "prefer_early_returns": true
}
```

**Use Case:** Ensuring generated code follows project conventions

---

### `get_architecture`

Returns architecture pattern and constraints.

**Parameters:** None

**Returns:**
```json
{
  "pattern": "clean",
  "entry_points": ["src/index.ts", "src/cli/index.ts"],
  "off_limits": [".env", ".env.*", "migrations/"],
  "state_management": "zustand"
}
```

**Use Case:** Understanding project structure before file modifications

---

### `get_guardrails`

Returns AI safety constraints.

**Parameters:** None

**Returns:**
```json
{
  "no_hallucination": true,
  "cite_sources": false,
  "scope_creep_prevention": true,
  "dry_run_on_destructive": true,
  "max_response_scope": "function"
}
```

**Use Case:** Setting AI behavior boundaries

---

### `get_testing_requirements`

Returns testing configuration.

**Parameters:** None

**Returns:**
```json
{
  "required": true,
  "framework": "vitest",
  "coverage_threshold": 80,
  "test_alongside_code": true
}
```

**Use Case:** Generating tests alongside implementation

---

### `get_runtime_info`

Returns runtime and dependency information.

**Parameters:** None

**Returns:**
```json
{
  "language": "typescript",
  "runtime": "node@22",
  "framework": ["next@14"],
  "strict_typing": true,
  "error_protocol": "verbose"
}
```

**Use Case:** Selecting appropriate code patterns and APIs

---

### `get_entry_points`

Returns project entry points.

**Parameters:** None

**Returns:**
```json
{
  "entry_points": [
    "src/cli/index.ts",
    "src/linter/index.ts",
    "src/parser/index.ts"
  ]
}
```

**Use Case:** Understanding where to import from or modify

---

## Available Resources

Resources are URI-addressable content that the AI can read. They use the `guidemd://` scheme.

### `guidemd://frontmatter`

Complete frontmatter as JSON.

```json
{
  "uri": "guidemd://frontmatter",
  "mimeType": "application/json",
  "data": { /* full frontmatter */ }
}
```

---

### `guidemd://overview`

Project overview section from markdown body.

```markdown
# Project Overview

This is a Next.js application for managing user workflows...
```

**Use Case:** High-level project understanding

---

### `guidemd://domain`

Domain vocabulary section.

```markdown
# Domain Vocabulary

- **Widget**: A reusable UI component with internal state
- **Session**: User authentication state stored in cookies
- **Workflow**: A multi-step business process
```

**Use Case:** Ensuring consistent terminology in generated code

---

### `guidemd://decisions`

Non-obvious architectural decisions.

```markdown
# Non-Obvious Decisions

1. **Why Zod instead of JSON Schema?**
   Zod gives us runtime validation + TypeScript inference...
```

**Use Case:** Understanding design rationale before proposing changes

---

### `guidemd://antipatterns`

What NOT to do section.

```markdown
# What NOT to do

- Never use `any` types
- Never modify files in `migrations/`
- Never expose database IDs in API responses
```

**Use Case:** Avoiding known anti-patterns

---

## Security

### Input Validation

The MCP server validates all incoming JSON-RPC requests:

| Check | Implementation |
|-------|------------------|
| Request size limit | 1MB maximum |
| Method whitelist | Only 5 valid methods |
| ID validation | Integer (0-999999) or alphanumeric string |
| Params validation | Prototype pollution prevention |
| Nested depth limit | Maximum 10 levels |
| Key length limit | Maximum 100 characters |

### Rate Limiting

Built-in rate limiting prevents abuse:

- **Window:** 60 seconds
- **Max requests:** 120 per window
- **Burst size:** 10 concurrent requests

### Prototype Pollution Prevention

The server explicitly blocks dangerous keys:
- `__proto__`
- `constructor`
- `prototype`

### Safe Defaults

- Unknown fields in frontmatter are allowed (passthrough) but logged
- Errors never expose internal stack traces to clients
- All file paths are resolved relative to GUIDE.md location

---

## Protocol Details

### JSON-RPC 2.0 Format

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_context",
    "arguments": {}
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{ \"guide_version\": \"1.0.0\", ... }"
      }
    ]
  }
}
```

**Error:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  }
}
```

### Supported Methods

| Method | Description |
|--------|-------------|
| `initialize` | Server initialization handshake |
| `tools/list` | List available tools |
| `tools/call` | Execute a tool |
| `resources/list` | List available resources |
| `resources/read` | Read a resource |

### Transport

The server uses **stdio** (standard input/output) for communication:

- Each line is a complete JSON-RPC message
- Messages are newline-delimited (NDJSON)
- UTF-8 encoding required

### Lifecycle

```
Client                    Server
  |                          |
  |---- initialize --------->|
  |<--- server info ---------|
  |                          |
  |---- tools/list --------->|
  |<--- tool definitions ----|
  |                          |
  |---- tools/call --------->|
  |<--- tool result ---------|
  |                          |
  |---- resources/read ----->|
  |<--- resource content ----|
  |                          |
  |---- [disconnect] ------->|
  |<--- [server exits] -----|
```

---

## Troubleshooting

### Server Not Starting

**Problem:** `guidemd serve` fails with error

**Solutions:**
1. Verify GUIDE.md exists and is valid: `guidemd lint`
2. Check Node.js version (>=18 required): `node --version`
3. Ensure `guidemd` is in PATH: `which guidemd`

### Client Not Connecting

**Problem:** MCP client shows "Server disconnected" or similar

**Solutions:**
1. Test server manually:
   ```bash
   guidemd serve
   # Type: {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
   # Should respond with server info
   ```

2. Check client logs for errors
3. Verify configuration path is absolute, not relative
4. Ensure GUIDE.md path in config matches actual location

### Tools Not Appearing

**Problem:** Client doesn't show GUIDE.md tools

**Solutions:**
1. Restart the MCP client completely
2. Check `tools/list` response manually
3. Verify GUIDE.md has required fields (project, language, etc.)
4. Try refreshing the client's tool cache

### Resources Not Loading

**Problem:** `guidemd://` URIs return errors

**Solutions:**
1. Verify the section exists in GUIDE.md markdown body
2. Check that markdown headers match expected format
3. Test with `guidemd lint` to ensure file is valid

### Performance Issues

**Problem:** Slow responses or timeouts

**Solutions:**
1. Check GUIDE.md file size (should be <100KB)
2. Verify project root has reasonable file count
3. Reduce `entry_points` array size if very large
4. Check for circular inheritance in `extends` field

### Debugging

Enable verbose logging (if supported by client):

```bash
DEBUG=mcp* guidemd serve
```

Manual protocol test:

```bash
# Terminal 1
guidemd serve ./GUIDE.md

# Terminal 2 - send test request
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | nc localhost (if TCP)
# Or for stdio, just type into the running process
```

---

## Advanced Usage

### Custom Tool Calls

You can call MCP tools programmatically:

```typescript
import { McpServer } from "@guidemd/linter/mcp/server";
import { callTool } from "@guidemd/linter/mcp/tools";

const server = new McpServer(data, content, "./GUIDE.md");

// Call a tool directly
const result = callTool("get_context", {}, data, content);
console.log(result);
```

### Resource Reading

```typescript
import { readResource } from "@guidemd/linter/mcp/resources";

const content = readResource("guidemd://overview", data, markdownContent);
console.log(content);
```

### Server Extension (Planned)

Future versions will support custom tool registration via plugins:

```typescript
// Planned feature
const server = new McpServer(data, content, filePath, {
  plugins: [myCustomPlugin]
});
```

---

## Comparison: File Export vs. MCP Server

| Feature | File Export (`guidemd export`) | MCP Server (`guidemd serve`) |
|---------|-------------------------------|------------------------------|
| **Use Case** | One-time setup | Continuous session |
| **Updates** | Manual re-export | Automatic on restart |
| **Interactivity** | Static | Dynamic tool calls |
| **IDE Support** | Cursor, Windsurf, Claude Code | Claude Desktop, Cursor MCP |
| **Latency** | N/A (file-based) | Real-time JSON-RPC |
| **Complexity** | Simple | Requires configuration |

---

*For the programmatic API, see [API Reference](./API.md). For general CLI usage, see [CLI Reference](./plugin/docs.md).*
