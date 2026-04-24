# Security Guide

This document details the security measures implemented in the GUIDE.md Linter, including parser protections, MCP server hardening, and best practices for safe usage.

---

## Table of Contents

1. [Parser Security](#parser-security)
2. [MCP Server Security](#mcp-server-security)
3. [Secret Scanning](#secret-scanning)
4. [Path Traversal Protection](#path-traversal-protection)
5. [Skill Security Validation](#skill-security-validation)
6. [Git Hook Security](#git-hook-security)
7. [Best Practices](#best-practices)

---

## Parser Security

The parser module (`@guidemd/linter/parser`) implements multiple layers of security to prevent abuse:

### File Size Limits

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
```

- **Protection**: Prevents memory exhaustion from excessively large GUIDE.md files
- **Behavior**: Returns parse error if file exceeds 10MB
- **Use Case**: Prevents DoS attacks via large file uploads

### Frontmatter Depth Limiting

```typescript
const MAX_FRONTMATTER_DEPTH = 10; // Maximum nesting levels
const MAX_FRONTMATTER_KEYS = 1000; // Maximum total keys
```

- **Protection**: Prevents stack overflow from deeply nested YAML
- **Behavior**: Returns error if frontmatter exceeds 10 levels deep or 1000 keys
- **Use Case**: Prevents malicious YAML causing memory/stack exhaustion

### Filename Enforcement

```typescript
if (basename !== "GUIDE.md") {
  return { success: false, error: "Invalid filename: must be GUIDE.md" };
}
```

- **Protection**: Ensures files follow the standard naming convention
- **Behavior**: Rejects files not named exactly "GUIDE.md" (case-sensitive)
- **Use Case**: Prevents accidental processing of wrong files

### Input Validation

All parsed content undergoes:
- **Size validation** before reading
- **YAML syntax validation** with safe parsing
- **Depth validation** on nested objects
- **Key count validation** to prevent object expansion attacks

---

## MCP Server Security

The MCP (Model Context Protocol) server implements extensive security hardening:

### Request Size Limiting

```typescript
const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB
```

- **Protection**: Prevents DoS via large JSON-RPC requests
- **Behavior**: Terminates connection if request exceeds 1MB
- **Implementation**: Byte-length check on stdin chunks

### Rate Limiting

```typescript
const RATE_LIMIT_WINDOW_MS = 60_000;    // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120;    // Per window
const RATE_LIMIT_BURST_SIZE = 10;       // Per 100ms
```

- **Protection**: Prevents request flooding
- **Behavior**: Returns rate limit error (code -32000) when exceeded
- **Features**: Sliding window + burst protection

### Prototype Pollution Protection

```typescript
function deepSanitize(value: unknown, depth = 0): unknown {
  // Removes __proto__, constructor, prototype keys
  // Creates null-prototype objects
  // Freezes objects to prevent mutation
}
```

- **Protection**: Prevents prototype pollution attacks via JSON-RPC
- **Behavior**: 
  - Strips dangerous keys (`__proto__`, `constructor`, `prototype`)
  - Creates null-prototype objects
  - Freezes objects after sanitization
  - Validates key length and characters

### Input Validation Pipeline

1. **ID Validation**: Validates JSON-RPC ID format (integer 0-999999 or alphanumeric string ≤100 chars)
2. **Method Whitelist**: Only allows known methods (`initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`)
3. **Params Validation**: Recursively checks for prototype pollution risks
4. **Key Length Limits**: Max 100 characters per key
5. **Control Character Filtering**: Rejects null bytes and control characters

### JSON Parsing Security

```typescript
function secureJsonParse(text: string): unknown {
  // Pre-scan for prototype pollution patterns
  // Parse with standard JSON.parse
  // Deep sanitize result
}
```

- **Two-Pass Approach**: Pattern detection + sanitization
- **Pattern Detection**: Checks for `__proto__`, `constructor`, `prototype` as keys

---

## Secret Scanning

The linter automatically scans for accidentally committed secrets:

### Detected Patterns

| Secret Type | Pattern Example |
|-------------|-----------------|
| OpenAI API Keys | `sk-[a-zA-Z0-9]{48}` |
| GitHub Tokens | `ghp_[a-zA-Z0-9]{36}` |
| AWS Access Keys | `AKIA[0-9A-Z]{16}` |
| Slack Tokens | `xoxb-[a-zA-Z0-9]{24}` |
| Generic API Keys | `api[_-]?key.*=.*[a-zA-Z0-9]{16,}` |

### Scanning Behavior

- **Severity**: Errors (not warnings) - blocks validation
- **Coverage**: Entire file content (frontmatter + markdown body)
- **Exclusions**: Placeholder values like `YOUR_API_KEY_HERE`
- **Option**: Can be disabled with `--skip-secret-scan` (not recommended)

### Implementation

Located in `src/linter/secrets.ts`:

```typescript
export function scanForSecrets(content: string, filePath: string): SecretScanResult {
  // Returns detected secrets with positions and types
}
```

---

## Path Traversal Protection

Multiple modules implement path traversal protection:

### Parser Resolver

```typescript
// Resolves "extends" paths safely
// Prevents escaping project directory
// Validates all module paths before loading
```

### Exporter Security

```typescript
// Validates parent directories are within targetDir
// Prevents path traversal in export targets
const resolvedParent = path.resolve(parentDir);
const resolvedTarget = path.resolve(targetDir);
if (!resolvedParent.startsWith(resolvedTarget + path.sep)) {
  throw new Error("Security: Parent directory escapes target directory");
}
```

### Skill Validation

Skills are validated for:
- `../` relative path traversal
- URL-encoded traversal (`%2e%2e%2f`)
- Absolute Windows paths (`C:\`)
- Sensitive file access (`/etc/passwd`, `~/.ssh`, `/proc/*`)

---

## Skill Security Validation

The Skills module (`@guidemd/linter/skills`) provides comprehensive security scanning:

### High-Risk Command Detection

Blocks skills containing:
- Shell command execution (`rm -rf`, `sudo`, `curl | sh`)
- Code evaluation (`eval()`, `exec()`, `child_process`)
- System calls (`os.system()`, `subprocess.call`)
- Destructive operations (`mkfs`, `dd`, `chmod 777`)
- Fork bombs (`:(){ :|: & };:`)

### Path Traversal Detection

Blocks skills attempting:
- Directory traversal (`../`, `..\`)
- URL-encoded traversal
- Sensitive file access
- procfs enumeration

### Resource Integrity

Validates:
- All markdown links (`[text](./path)`) must resolve to existing files
- Links must be relative (`./`)
- Referenced files must exist in skill directory

---

## Git Hook Security

The Guardian module (`@guidemd/linter/guardian`) implements secure Git hook installation:

### Path Validation

```typescript
function isSafePath(input: string): boolean {
  // Rejects shell metacharacters: ; & | ` $ ( ) { } [ ] < > ! # * ?
  // Rejects newlines
}
```

### Shell Escaping

```typescript
function shellEscape(arg: string): string {
  // Wraps in single quotes
  // Escapes embedded single quotes safely
}
```

### Cross-Platform Safety

- Detects Windows vs Unix environments
- Uses appropriate script formats (shell, cmd, PowerShell)
- Validates bash availability before generating shell scripts

---

## Best Practices

### For Users

1. **Never commit secrets** - The scanner catches most patterns, but prevention is better
2. **Review skill content** - Validate third-party skills before use
3. **Use `--sync` carefully** - Sync modifies your GUIDE.md automatically
4. **Enable Guardian hooks** - Prevents committing invalid GUIDE.md

### For Contributors

1. **Validate all file paths** - Use `isSafePath()` before file operations
2. **Escape shell arguments** - Use `shellEscape()` for any shell interaction
3. **Limit input sizes** - Add size checks for user-provided content
4. **Sanitize JSON inputs** - Use `deepSanitize()` for JSON-RPC handling
5. **Test security features** - Add tests for path traversal, injection attempts

### For MCP Server Operators

1. **Monitor rate limits** - Check logs for rate limit events
2. **Use latest version** - Security updates are released regularly
3. **Validate client requests** - The server validates, but defense in depth helps

---

## Security Audit

For the complete security audit report, see [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md).

---

*Last updated: 2025-01-15*
