---
guide_version: "1.0.0"
project: "generate-readme-test"
description: "A sample project to test the README generator with shields.io badges and smart mapping."
language: typescript
runtime: "node@22"
framework: express
strict_typing: true
error_protocol: verbose
ai_model_target:
  - "claude-sonnet-4-20250514"
last_updated: "2026-04-21"
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
  framework: vitest
  coverage_threshold: 80
  test_alongside_code: true
context:
  entry_points:
    - "src/index.ts"
    - "src/cli/index.ts"
  off_limits:
    - ".env"
    - "secrets/"
  architecture_pattern: layered
---

# AI Instructions

## Project Overview

This is a comprehensive testing project for the README generator. It demonstrates how the smart mapping feature extracts content from the GUIDE.md body and injects it into a human-readable README.

The project follows a layered architecture with clear separation of concerns. All API endpoints are documented using OpenAPI specs.

## Domain Vocabulary

- **Guide**: The configuration file that provides AI context.
- **Module**: A reusable piece of frontmatter configuration fetched from the registry.
- **Drift**: When the frontmatter becomes out of sync with the actual project state.

## Non-Obvious Decisions

We chose to use a custom lightweight template parser instead of Handlebars or Mustache to keep the tool dependency-free and fast. This reduces bundle size and avoids security concerns with full template engines.

## What NOT to do

- Never hardcode API keys in the codebase.
- Do not modify files listed in `context.off_limits` without explicit human approval.
- Avoid introducing new dependencies without updating the `framework` field.
