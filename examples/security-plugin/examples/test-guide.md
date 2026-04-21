---
guide_version: "1.0.0"
project: "secure-api-demo"
description: "A secure REST API demonstrating the security audit plugin"
language: typescript
runtime: "node@20"
framework: "express"
strict_typing: true
error_protocol: verbose
ai_model_target:
  - "claude-sonnet-4-20250514"
last_updated: "2026-04-21"

# Plugin registration
plugins:
  - name: "com.example.security-audit"
    version: "1.0.0"

# Security configuration (schema extension)
security:
  require_auth: true
  owasp_level: "L2"
  secrets_vault: "hashicorp-vault"
  allowed_origins:
    - "https://app.example.com"
    - "https://admin.example.com"
  dependency_scan: warn
  audit_endpoints: true

code_style:
  max_line_length: 100
  indentation: "2 spaces"
  naming_convention: camelCase
  prefer_immutability: true

guardrails:
  no_hallucination: true
  scope_creep_prevention: true
  cite_sources: false
  dry_run_on_destructive: true
  max_response_scope: function

testing:
  required: true
  framework: "vitest"
  coverage_threshold: 80

context:
  entry_points:
    - "src/index.ts"
    - "src/routes/api.ts"
  off_limits:
    - ".env"
    - ".env.*"
    - "secrets/"
    - "migrations/"
    - "*.key"
    - "*.pem"
  architecture_pattern: "layered"
  state_management: "none"
---

# AI Instructions

## Project Overview

This is a demonstration project for the Security Audit Plugin. It implements a secure REST API with:

- JWT-based authentication
- Rate limiting middleware
- OWASP ASVS Level 2 compliance
- External secrets management

## Domain Vocabulary

- **JWT**: JSON Web Token for stateless authentication
- **RBAC**: Role-Based Access Control
- **ASVS**: Application Security Verification Standard
- **MFA**: Multi-Factor Authentication
- **HMAC**: Hash-based Message Authentication Code

## Non-Obvious Decisions

### Why HashiCorp Vault?

We chose HashiCorp Vault for secrets management because:
1. It supports dynamic secrets (short-lived database credentials)
2. Built-in audit logging for compliance
3. Kubernetes integration for pod identity

### Rate Limiting Strategy

Rate limits are applied at multiple layers:
1. CDN edge (Cloudflare) for DDoS protection
2. API Gateway for per-API limits
3. Application layer for per-user limits

## What NOT to do

- **Never commit `.env` files**: Use the plugin's lint check to enforce this
- **Never log sensitive data**: PII, tokens, passwords must be redacted
- **Never trust client input**: Always validate at API boundary
- **Never use eval() or similar**: Code injection prevention
- **Never disable TLS verification**: Even in development

## Security Checklist

When modifying this codebase:

- [ ] New endpoints require auth middleware
- [ ] Input validation uses Zod schemas
- [ ] SQL queries use parameterized statements
- [ ] Secrets are read from Vault, never hardcoded
- [ ] CORS origins are explicitly whitelisted
- [ ] Rate limits are configured per endpoint
