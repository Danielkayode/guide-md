# Troubleshooting Guide

Common issues and solutions for GUIDE.md Linter.

## Table of Contents

- [Installation Issues](#installation-issues)
- [CLI Command Issues](#cli-command-issues)
- [Validation Errors](#validation-errors)
- [Export/Import Issues](#exportimport-issues)
- [Drift Detection Issues](#drift-detection-issues)
- [Performance Issues](#performance-issues)
- [Security Scanning Issues](#security-scanning-issues)
- [MCP Integration Issues](#mcp-integration-issues)
- [Git Hook Issues](#git-hook-issues)
- [Getting Help](#getting-help)

---

## Installation Issues

### `npm install` fails with permission errors

**Symptom**: EACCES or permission denied errors during installation.

**Solution**:
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# If still failing, try with sudo (not recommended long-term)
sudo npm install -g @prismteam/linter
```

### CLI not found after installation

**Symptom**: `guidemd: command not found`

**Solution**:
```bash
# Verify installation
npm list -g @prismteam/linter

# Check if bin directory is in PATH
echo $PATH

# Reinstall globally
npm uninstall -g @prismteam/linter
npm install -g @prismteam/linter

# Or use npx without global install
npx @prismteam/linter lint GUIDE.md
```

### Version mismatch errors

**Symptom**: Errors about incompatible Node.js version.

**Solution**:
```bash
# Check your Node.js version
node --version

# Required: Node.js >= 18.0.0
# Use nvm to manage Node.js versions
nvm install 20
nvm use 20

# Verify
node --version  # Should be v18.x.x or higher
```

---

## CLI Command Issues

### `guidemd init` overwrites existing GUIDE.md unexpectedly

**Symptom**: Existing GUIDE.md is replaced without warning.

**Solution**:
```bash
# Always use --force flag explicitly when you want to overwrite
guidemd init --force

# To preserve existing file, back it up first
cp GUIDE.md GUIDE.md.backup
guidemd init
```

### Commands run slowly

**Symptom**: CLI commands take several seconds to complete.

**Solution**:
```bash
# Skip secret scanning if not needed (faster but less secure)
guidemd lint GUIDE.md --skip-secret-scan

# For development, use tsx directly for faster iteration
npm run dev -- lint GUIDE.md

# Check if large files are being scanned
# Add large directories to .gitignore or exclude them
```

### JSON output is malformed

**Symptom**: `--json` flag produces invalid JSON.

**Solution**:
```bash
# Ensure no other output is mixed with JSON
guidemd lint GUIDE.md --json 2>/dev/null

# Pipe to jq for validation
guidemd lint GUIDE.md --json | jq .

# Check for console.log statements in custom plugins
```

---

## Validation Errors

### "Missing required field: title"

**Symptom**: Linter reports missing title field.

**Solution**:
```markdown
# Add title to frontmatter
---
title: "My Project Name"
version: "1.0.0"
---
```

### "Invalid language code"

**Symptom**: Error about invalid language identifier.

**Solution**:
```markdown
# Use valid ISO 639-1 language codes
---
language: typescript  # ✅ Valid
language: ts          # ❌ Invalid
language: python      # ✅ Valid
language: py          # ❌ Invalid
---

# Supported languages: typescript, javascript, python, rust, go, java, etc.
```

### "Circular dependency detected in extends chain"

**Symptom**: Error about circular inheritance.

**Solution**:
```markdown
# Check your extends chain
---
extends: "./base-guide.md"  # Make sure base-guide.md doesn't extend back to this file
---

# Break the cycle by removing one extends relationship
# Or create a third file that both can extend
```

### "Remote URL resolution failed"

**Symptom**: Cannot fetch remote GUIDE.md from extends URL.

**Solution**:
```markdown
# Check URL accessibility
curl -I https://example.com/guide.md

# Verify SSL certificate
# Ensure network connectivity
# Consider using local file path instead
---
extends: "./local-base-guide.md"  # More reliable than remote URLs
---

# If using remote, ensure SSRF protection isn't blocking legitimate URLs
# Remote URLs must be http:// or https:// (no file://, no internal IPs)
```

### "Secret detected in GUIDE.md"

**Symptom**: Linter finds and blocks API keys or tokens.

**Solution**:
```markdown
# Replace actual secrets with placeholders
---
api_key: YOUR_API_KEY_HERE    # ✅ Safe
api_key: sk-proj-abc123...    # ❌ Dangerous
---

# If it's a false positive, add comment explaining why
# Or adjust secret scanning patterns in configuration

# NEVER commit real secrets to version control
```

---

## Export/Import Issues

### Export produces empty files

**Symptom**: Exported files (CLAUDE.md, .cursorrules, etc.) are empty or minimal.

**Solution**:
```bash
# Ensure source GUIDE.md has content
guidemd lint GUIDE.md  # Fix any validation errors first

# Check export target format
guidemd export GUIDE.md --target claude --out ./

# Verify permissions on output directory
ls -la ./

# Try exporting to different format to isolate issue
guidemd export GUIDE.md --target all --out ./
```

### Import fails to parse source file

**Symptom**: Cannot import from CLAUDE.md, .cursorrules, etc.

**Solution**:
```bash
# Verify source file format
cat .cursorrules  # Check structure

# Use dry-run to see what would be imported
guidemd import .cursorrules --dry-run

# Some formats may have limited import support
# Check DOCS/API.md for supported import sources

# Manually create GUIDE.md if import fails
guidemd init --force
# Then copy relevant sections from source file
```

### MCP manifest generation fails

**Symptom**: `--manifest` flag doesn't create manifest.json.

**Solution**:
```bash
# Ensure output directory exists
mkdir -p ./mcp
guidemd export GUIDE.md --manifest --out ./mcp

# Check for valid GUIDE.md structure
# MCP requires certain fields (name, version, description)

# Verify manifest.json was created
cat ./mcp/manifest.json
```

---

## Drift Detection Issues

### Sync reports false drift

**Symptom**: `--sync` flag reports drift that doesn't exist.

**Solution**:
```bash
# Verify file paths in GUIDE.md match actual structure
guidedm lint GUIDE.md --json | grep entry_points

# Check if files exist
ls -la src/index.ts  # Verify entry point exists

# Update GUIDE.md to match reality
guidemd sync GUIDE.md --readme README.md

# Or mark intentional differences in GUIDE.md
# Some drift may be acceptable (document in guardrails)
```

### Framework version detection incorrect

**Symptom**: Detected framework version doesn't match package.json.

**Solution**:
```bash
# Check package.json for version
cat package.json | grep -A 2 '"dependencies"'

# Manually specify version in GUIDE.md if auto-detection fails
---
framework:
  name: Next.js
  version: "14.0.0"  # Explicit version
---

# Run sync to update
guidemd sync GUIDE.md
```

### Entry point validation fails

**Symptom**: Reports missing entry point that exists.

**Solution**:
```markdown
# Verify entry point path is correct
---
context:
  entry_points:
    - "src/index.ts"  # Must match actual file path exactly
---

# Check case sensitivity (Linux/macOS)
ls src/index.ts
ls src/Index.ts  # Different!

# Update path or rename file to match
```

---

## Performance Issues

### Linting takes too long on large projects

**Symptom**: `guidemd lint` takes >10 seconds.

**Solution**:
```bash
# Skip secret scanning for speed (if acceptable)
guidemd lint GUIDE.md --skip-secret-scan

# Exclude large directories from scanning
# Add to .gitignore or guide.md guardrails

# Use watch mode instead of repeated manual runs
guidemd watch GUIDE.md

# Profile to find bottlenecks
guidemd profile GUIDE.md --json
```

### Watch mode consumes high CPU

**Symptom**: `guidemd watch` uses excessive CPU resources.

**Solution**:
```bash
# Increase debounce interval if configurable
# Exclude unnecessary directories from watching

# Use more specific file patterns
chokidar 'GUIDE.md' --ignore '**/node_modules/**'

# Consider running lint on git pre-commit instead
guidemd install-hooks --manager husky
```

---

## Security Scanning Issues

### False positive secret detection

**Symptom**: Placeholder values flagged as secrets.

**Solution**:
```markdown
# Use recognized placeholder patterns
---
api_key: YOUR_API_KEY_HERE      # ✅ Recognized as placeholder
api_key: <YOUR_TOKEN>           # ✅ Recognized as placeholder
api_key: changeme               # ⚠️ May be flagged
api_key: test123                # ⚠️ May be flagged
---

# Document exceptions in guardrails section
guardrails:
  notes:
    - "Test values in development are not production secrets"
```

### Secret scanning misses actual secrets

**Symptom**: Real secrets not detected.

**Solution**:
```bash
# Secret scanning uses pattern matching
# Some secret formats may not be covered

# Report new secret patterns to project
# In meantime, manually audit GUIDE.md for secrets

# Use additional tools for comprehensive scanning
# - git-secrets
# - truffleHog
# - GitHub secret scanning
```

---

## MCP Integration Issues

### MCP server doesn't start

**Symptom**: Model Context Protocol server fails to initialize.

**Solution**:
```bash
# Verify manifest.json is valid
cat manifest.json | jq .

# Check MCP client configuration
# Ensure paths are absolute or correctly relative

# Test with simple MCP client first
# Review MCP logs for error messages

# Regenerate manifest
guidemd export GUIDE.md --manifest --out ./mcp
```

### MCP tools not available in AI assistant

**Symptom**: GUIDE.md tools don't appear in Claude/Cursor/etc.

**Solution**:
```json
// Verify manifest.json structure
{
  "name": "guidemd-tools",
  "version": "1.0.0",
  "tools": [
    {
      "name": "lint",
      "description": "..."
    }
  ]
}

// Check AI assistant MCP configuration
// Restart AI assistant after adding MCP server
// Verify network connectivity to MCP server
```

---

## Git Hook Issues

### Pre-commit hook fails to install

**Symptom**: `guidemd install-hooks` doesn't create hooks.

**Solution**:
```bash
# Check git repository initialization
git status  # Should work

# Try specific hook manager
guidemd install-hooks --manager husky
guidemd install-hooks --manager simple-git-hooks
guidemd install-hooks --manager lefthook

# Manual installation
# Create .git/hooks/pre-commit with:
#!/bin/sh
npx guidemd lint GUIDE.md

chmod +x .git/hooks/pre-commit
```

### Pre-commit hook slows down commits

**Symptom**: Git commits take too long due to hook.

**Solution**:
```bash
# Skip hook for quick commits
git commit -m "message" --no-verify

# Optimize hook script
# Only lint changed GUIDE.md files
# Use --skip-secret-scan if acceptable

# Or move to CI/CD pipeline instead of pre-commit
# Add GitHub Action for GUIDE.md validation
```

### Hook conflicts with existing hooks

**Symptom**: Multiple pre-commit hooks conflict.

**Solution**:
```bash
# Use hook manager that supports multiple hooks
# Husky can chain multiple pre-commit scripts

# Manually combine hooks into single pre-commit
# Or use lefthook for better hook management

# Backup existing hooks before installing
cp .git/hooks/pre-commit .git/hooks/pre-commit.backup
```

---

## Getting Help

### Resources

- **Documentation**: `/workspace/DOCS/index.md`
- **API Reference**: `/workspace/DOCS/API.md`
- **Architecture**: `/workspace/DOCS/ARCHITECTURE.md`
- **Examples**: `/workspace/examples/`
- **Fixtures**: `/workspace/fixtures/`

### Debugging Tips

```bash
# Enable verbose output
DEBUG=* guidemd lint GUIDE.md

# Check CLI version
guidemd --version

# View help for specific command
guidemd lint --help

# Run with Node.js debugger
node --inspect-brk $(which guidemd) lint GUIDE.md
```

### Reporting Issues

When reporting issues, include:

1. **GUIDE.md Linter version**: `guidemd --version`
2. **Node.js version**: `node --version`
3. **Operating system**: macOS, Linux, Windows (version)
4. **Command run**: Exact command with flags
5. **Error output**: Full error message or stack trace
6. **GUIDE.md content**: Relevant sections (remove secrets!)
7. **Expected vs actual behavior**: What should happen vs what did

### Community Support

- Check existing issues on GitHub
- Review documentation thoroughly
- Search for similar problems
- Provide minimal reproduction case

---

*Last updated: 2026-04-24*
