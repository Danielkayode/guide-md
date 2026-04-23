---
guide_version: 1.0.0
project: "\U0001F4D8-guide.md-—-the-ai-context-interface"
language: typescript
runtime: node@22
strict_typing: true
error_protocol: verbose
ai_model_target:
  - claude-sonnet-4-20250514
code_style:
  max_line_length: 100
  indentation: 2 spaces
  naming_convention: camelCase
  max_function_lines: 50
  prefer_immutability: true
  prefer_early_returns: true
guardrails:
  no_hallucination: true
  cite_sources: false
  scope_creep_prevention: true
  dry_run_on_destructive: true
  max_response_scope: function
testing:
  required: true
  framework: vitest
  coverage_threshold: 80
  test_alongside_code: true
context:
  entry_points:
    - coverage
    - dist
    - DOCS
    - examples
    - fixtures
    - packages
    - tests
  off_limits:
    - .env
    - .env.*
    - migrations/
  architecture_pattern: clean
description: Describe what this project does in 1-2 sentences for your AI agent.
last_updated: '2026-04-23'
---
# AI Instructions
## Project Overview
<!-- Describe the project purpose, domain context, and any business rules the AI must know -->
## Domain Vocabulary
<!-- Define key terms so the AI uses consistent naming -->
## Non-Obvious Decisions
<!-- Explain any architectural choices that might seem unusual -->
## What NOT to do
<!-- Anti-patterns specific to this codebase -->
