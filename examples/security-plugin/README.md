# Security Audit Plugin for @guidemd/linter

A "Hello World" example plugin demonstrating how to build plugins for the GUIDE.md ecosystem.

## Features

- **Schema Extension**: Adds custom `security` YAML fields to GUIDE.md
- **Doctor Signatures**: Detects security-related dependencies (Helmet, JWT, bcrypt, etc.)
- **Custom Lint Rules**: Scans for vulnerable dependencies
- **README Generation**: Adds security section to generated README files

## Installation

```bash
# In your project using this plugin
npm install --save-dev guidemd-plugin-security-audit
```

## Usage

Add to your `GUIDE.md` frontmatter:

```yaml
---
guide_version: "1.0.0"
project: "my-secure-app"
language: typescript
# ... other fields

# Register the plugin
plugins:
  - name: "guidemd-plugin-security-audit"
    version: "^1.0.0"

# Use the schema extension
security:
  require_auth: true
  owasp_level: "L2"
  secrets_vault: "hashicorp-vault"
  allowed_origins:
    - "https://app.example.com"
  dependency_scan: warn
  audit_endpoints: true
---
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `require_auth` | boolean | `true` | Require authentication on all endpoints |
| `owasp_level` | "L1" \| "L2" \| "L3" | "L1" | Target OWASP ASVS compliance level |
| `secrets_vault` | string | - | External secrets management service |
| `allowed_origins` | string[] | - | Allowed CORS origins |
| `dependency_scan` | "off" \| "warn" \| "block" | "warn" | Vulnerability scanning level |
| `audit_endpoints` | boolean | `false` | Include endpoint audit in README |

## What It Does

### Before Lint (`beforeLint` hook)

1. Checks that `.env` files are in `off_limits`
2. Scans `package.json` for known vulnerable dependencies
3. Warns or blocks based on `dependency_scan` setting

### After Sync (`afterSync` hook)

1. Monitors for security-related drift
2. Logs when security dependencies are added/removed

### README Generation (`onGenerateReadme` hook)

1. Adds a Security section to the generated README
2. Documents OWASP level and security configuration
3. Lists recommended security headers

## Detected Packages

The plugin detects these security-related packages:

- **Auth**: jsonwebtoken, passport, @auth0/auth0-spa-js
- **Middleware**: helmet, cors, express-rate-limit
- **Crypto**: bcrypt, argon2, crypto-js
- **Env**: dotenv, env-var

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## Learn More

- [GUIDE.md Plugin Documentation](../../DOCS/PLUGINS.md)
- [Core Architecture](../../DOCS/FEATURES.md)

## License

MIT
