// ─── Built-in README Template with Shields.io Badges ──────────────────────────

export const DEFAULT_TEMPLATE = `# <!-- guidemd:project -->{{project}}<!-- /guidemd:project -->

<!-- guidemd:description -->{{description}}<!-- /guidemd:description -->

<!-- AI-Context Badges -->
{{badgeLine}}

## Table of Contents

- [About This Project](#about-this-project)
- [Tech Stack](#tech-stack)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Architecture](#architecture)
- [Guardrails & AI Context](#guardrails--ai-context)
- [Getting Started](#getting-started)
{{mappedToc}}

{{mappedSections}}

## Tech Stack

| Technology | Details |
|------------|---------|
| Language | <!-- guidemd:language -->{{language}}<!-- /guidemd:language --> |
{{#if runtime}}
| Runtime | <!-- guidemd:runtime -->{{runtime}}<!-- /guidemd:runtime --> |
{{/if}}
{{#if framework}}
| Framework | <!-- guidemd:framework -->{{framework}}<!-- /guidemd:framework --> |
{{/if}}
{{#if architecture_pattern}}
| Architecture | <!-- guidemd:architecture_pattern -->{{architecture_pattern}}<!-- /guidemd:architecture_pattern --> |
{{/if}}

## Coding Standards

{{#if code_style}}
- **Naming Convention**: {{code_style.naming_convention}}
- **Max Line Length**: {{code_style.max_line_length}} characters
{{#if code_style.max_function_lines}}
- **Max Function Length**: {{code_style.max_function_lines}} lines
{{/if}}
- **Indentation**: {{code_style.indentation}}
- **Prefer Immutability**: {{code_style.prefer_immutability}}
- **Prefer Early Returns**: {{code_style.prefer_early_returns}}
{{/if}}

## Testing

{{#if testing}}
- **Required**: {{testing.required}}
{{#if testing.framework}}
- **Framework**: {{testing.framework}}
{{/if}}
{{#if testing.coverage_threshold}}
- **Coverage Threshold**: {{testing.coverage_threshold}}%
{{/if}}
- **Test Alongside Code**: {{testing.test_alongside_code}}
{{/if}}
{{#unless testing}}
No testing configuration specified in the project guide.
{{/unless}}

## Architecture

{{#if architecture_pattern}}
This project follows the **{{architecture_pattern}}** architecture pattern.
{{/if}}
{{#if entry_points}}

### Entry Points

{{#each entry_points}}
- {{this}}
{{/each}}
{{/if}}
{{#if off_limits}}

### Off-Limits Areas

The following files and directories should not be modified by automated tools:

{{#each off_limits}}
- {{this}}
{{/each}}
{{/if}}

## Guardrails & AI Context

This project uses [GUIDE.md](GUIDE.md) to provide structured context for AI agents. The following guardrails are configured:

{{#if guardrails_summary}}
{{guardrails_summary}}
{{/if}}
{{#unless guardrails_summary}}
_No guardrails explicitly configured._
{{/unless}}

## Getting Started

This README is auto-generated from the project's [GUIDE.md](GUIDE.md).
To update this README, edit the frontmatter and sections in \\\`GUIDE.md\\\`, then run:

\`\`\`bash
guidemd generate-readme
\`\`\`

---

*Last updated from GUIDE.md on {{last_updated}}*
`;

/**
 * Generates the shields.io badge markdown line based on project data.
 */
export function generateBadges(data: Record<string, unknown>): string {
  const badges: string[] = [];

  // Language badge
  const lang = Array.isArray(data.language) ? data.language[0] : data.language;
  if (typeof lang === "string") {
    badges.push(`![Language](https://img.shields.io/badge/Language-${encodeURIComponent(lang)}-blue?style=flat-square)`);
  }

  // Strict typing badge
  if (data.strict_typing === true) {
    badges.push(`![Strict Typing](https://img.shields.io/badge/Strict%20Typing-Enabled-success?style=flat-square)`);
  }

  // Framework badge
  const fw = Array.isArray(data.framework) ? data.framework[0] : data.framework;
  if (typeof fw === "string") {
    const fwName = fw.split("@")[0]!;
    badges.push(`![Framework](https://img.shields.io/badge/Framework-${encodeURIComponent(fwName)}-purple?style=flat-square)`);
  }

  // Testing badge
  const testing = data.testing as Record<string, unknown> | undefined;
  if (testing?.required === true) {
    badges.push(`![Testing](https://img.shields.io/badge/Testing-Required-orange?style=flat-square)`);
  }

  // AI-Validated badge
  badges.push(`![AI-Validated](https://img.shields.io/badge/AI--Validated-GUIDE.md-ff69b4?style=flat-square)`);

  return badges.join(" ");
}

interface SmartTemplateOptions {
  project: string;
  language: string | null;
  framework: string | null;
  paradigm: "oop" | "functional" | "mixed" | "imperative" | "procedural" | null;
}

/**
 * Generates a smart GUIDE.md template pre-filled with detected project values.
 */
export function generateSmartTemplate(opts: SmartTemplateOptions): string {
  const lang = opts.language;
  const framework = opts.framework || "";
  const paradigm = opts.paradigm || "";

  // Infer sensible defaults per language
  const isTyped = ["typescript", "rust", "go", "java", "kotlin", "swift", "dart"].includes(lang ?? "");
  const defaultTestFramework = inferTestFramework(lang);
  const defaultRuntime = inferRuntime(lang);
  const defaultNaming = inferNamingConvention(lang);
  const defaultIndentation = inferIndentation(lang);

  return `---
guide_version: "1.0.0"
project: "${opts.project}"
description: "Describe what this project does in 1-2 sentences for your AI agent."
language: ${lang ? lang : "# TODO: fill this in (e.g., typescript, python, go)"}
${framework ? `framework: "${framework}"\n` : ""}${defaultRuntime ? `runtime: "${defaultRuntime}"\n` : ""}
strict_typing: ${isTyped ? "true" : "false"}
error_protocol: verbose
ai_capabilities:
  - tool_use
  - long_context
  - structured_output
  - code_execution
last_updated: "${new Date().toISOString().split("T")[0]}"
code_style:
  max_line_length: 100
  indentation: "${defaultIndentation}"
  naming_convention: ${defaultNaming}
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
  framework: "${defaultTestFramework}"
  coverage_threshold: 80
  test_alongside_code: true
context:
  entry_points:
  - ${inferEntryPoint(lang)}
  off_limits:
  - ".env"
  - ".env.*"
  - "migrations/"
  architecture_pattern: ${paradigm === "oop" ? "layered" : paradigm === "functional" ? "clean" : "layered"}
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
`;
}

/**
 * Infers the default test framework based on detected language.
 */
function inferTestFramework(lang: string | null): string {
  const map: Record<string, string> = {
    typescript: "vitest",
    javascript: "vitest",
    python: "pytest",
    rust: "cargo test",
    go: "go test",
    java: "junit",
    kotlin: "junit",
    ruby: "rspec",
    php: "phpunit",
    swift: "xctest",
    dart: "flutter test",
    elixir: "exunit",
  };
  return map[lang ?? ""] ?? "# TODO: fill this in";
}

/**
 * Infers the default runtime based on detected language.
 */
function inferRuntime(lang: string | null): string | null {
  const map: Record<string, string> = {
    typescript: "node@22",
    javascript: "node@22",
    python: "python@3.12",
    rust: "rustc@stable",
    go: "go@1.22",
    java: "jdk@21",
    kotlin: "jdk@21",
    ruby: "ruby@3.3",
    php: "php@8.3",
    swift: "swift@5.10",
    dart: "dart@3.4",
    elixir: "elixir@1.16",
  };
  return map[lang ?? ""] ?? null;
}

/**
 * Infers the default naming convention based on detected language.
 */
function inferNamingConvention(lang: string | null): string {
  const map: Record<string, string> = {
    typescript: "camelCase",
    javascript: "camelCase",
    python: "snake_case",
    rust: "snake_case",
    go: "camelCase",
    java: "camelCase",
    kotlin: "camelCase",
    ruby: "snake_case",
    php: "camelCase",
    swift: "camelCase",
    dart: "camelCase",
    elixir: "snake_case",
  };
  return map[lang ?? ""] ?? "camelCase";
}

/**
 * Infers the default indentation based on detected language.
 */
function inferIndentation(lang: string | null): string {
  const map: Record<string, string> = {
    python: "4 spaces",
    rust: "4 spaces",
    go: "tab",
    java: "4 spaces",
    kotlin: "4 spaces",
    ruby: "2 spaces",
    php: "4 spaces",
    swift: "4 spaces",
    elixir: "2 spaces",
  };
  return map[lang ?? ""] ?? "2 spaces";
}

/**
 * Infers the default entry point based on detected language.
 */
function inferEntryPoint(lang: string | null): string {
  const map: Record<string, string> = {
    typescript: '"src/index.ts"',
    javascript: '"src/index.js"',
    python: '"src/main.py"',
    rust: '"src/main.rs"',
    go: '"main.go"',
    java: '"src/main/java/Main.java"',
    kotlin: '"src/main/kotlin/Main.kt"',
    ruby: '"lib/main.rb"',
    php: '"src/index.php"',
    swift: '"Sources/main.swift"',
    dart: '"lib/main.dart"',
    elixir: '"lib/app.ex"',
  };
  return map[lang ?? ""] ?? '"# TODO: fill this in"';
}

/**
 * Generates an AI-Readiness badge for the README.
 */
export function generateAiReadinessBadge(grade: string): string {
  const colors: Record<string, string> = {
    "A": "brightgreen",
    "B": "green",
    "C": "yellow",
    "D": "orange",
    "F": "red",
  };
  const color = colors[grade] || "blue";
  return `[![AI-Ready](https://img.shields.io/badge/AI--Ready-Grade_${grade}-${color}?style=for-the-badge)](https://guidemd.dev)`;
}

/**
 * Generates a markdown summary of configured guardrails.
 */
export function generateGuardrailsSummary(data: Record<string, unknown>): string {
  const guardrails = data.guardrails as Record<string, unknown> | undefined;
  if (!guardrails) return "";

  const items: string[] = [];
  if (guardrails.no_hallucination === true) {
    items.push("- **No Hallucination**: AI must not invent APIs, packages, or type signatures.");
  }
  if (guardrails.scope_creep_prevention === true) {
    items.push("- **Scope Creep Prevention**: AI only modifies explicitly referenced files/functions.");
  }
  if (guardrails.dry_run_on_destructive === true) {
    items.push("- **Dry Run on Destructive**: AI previews destructive operations before executing.");
  }
  if (guardrails.cite_sources === true) {
    items.push("- **Cite Sources**: AI includes inline documentation citations.");
  }
  if (guardrails.max_response_scope) {
    items.push(`- **Max Response Scope**: ${guardrails.max_response_scope}`);
  }

  return items.join("\n");
}