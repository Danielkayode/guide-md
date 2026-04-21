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
  badges.push(`![AI-Validated](https://img.shields.io/badge/AI--Validated-GUIDE.md-ff69b4?style=flat-square&logo=ai)`);

  return badges.join(" ");
}

interface SmartTemplateOptions {
  project: string;
  language: string;
  framework: string | null;
  paradigm: "oop" | "functional" | null;
}

/**
 * Generates a smart GUIDE.md template pre-filled with detected project values.
 */
export function generateSmartTemplate(opts: SmartTemplateOptions): string {
  const lang = opts.language || "typescript";
  const framework = opts.framework || "";
  const paradigm = opts.paradigm || "";

  return `---
guide_version: "1.0.0"
project: "${opts.project}"
description: "Describe what this project does in 1-2 sentences for your AI agent."
language: ${lang}
${framework ? `framework: "${framework}"\n` : ""}runtime: "node@22"
strict_typing: ${lang === "typescript" ? "true" : "false"}
error_protocol: verbose
ai_model_target:
- "claude-sonnet-4-20250514"
last_updated: "${new Date().toISOString().split("T")[0]}"
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
  - "src/index.ts"
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
 * Generates an AI-Readiness badge for the README.
 */
export function generateAiReadinessBadge(grade: string): string {
  const colors: Record<string, string> = {
    "A": "brightgreen",
    "B": "green",
    "C": "yellow",
    "D": "orange",
    "F": "red"
  };
  const color = colors[grade] || "blue";
  return `[![AI-Ready](https://img.shields.io/badge/AI--Ready-Grade_${grade}-${color}?style=for-the-badge&logo=ai)](https://guidemd.dev)`;
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
