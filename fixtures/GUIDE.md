---
guide_version: "1.0.0"
project: "guidemd-linter"
description: "The official linter and validator for the GUIDE.md AI Context Interface standard."
language: typescript
runtime: "node@22"
framework: "commander"
strict_typing: true
error_protocol: verbose
ai_model_target:
  - "claude-sonnet-4-20250514"
last_updated: "2025-04-20"

code_style:
  max_line_length: 100
  indentation: "2 spaces"
  naming_convention: camelCase
  max_function_lines: 50
  prefer_immutability: true
  prefer_early_returns: true

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
  test_alongside_code: true

context:
  entry_points:
    - "src/cli/index.js"
  off_limits:
    - ".env"
    - ".env.*"
  architecture_pattern: layered
---

# AI Instructions

## Project Overview
This is the reference implementation of the GUIDE.md spec. It is a CLI tool and linter.

## Non-Obvious Decisions
- We use ESM (`"type": "module"`) throughout. Never use `require()`.
- Zod is the single source of truth for the schema. Do not duplicate field definitions.
