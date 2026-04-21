#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { lintGuideFile } from "../linter/index.js";
import { GuideMdSchema } from "../schema/index.js";
import fs from 'node:fs';
import path from 'node:path';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ICONS = {
  error: chalk.red("✖"),
  warning: chalk.yellow("⚠"),
  success: chalk.green("✔"),
  info: chalk.cyan("ℹ"),
};

function printBanner() {
  console.log(chalk.bold.cyan("\n ╔═══════════════════════════╗"));
  console.log(chalk.bold.cyan("   ║     GUIDE.md  Linter      ║"));
  console.log(chalk.bold.cyan("   ║  AI Context Interface     ║"));
  console.log(chalk.bold.cyan("   ╚═══════════════════════════╝\n"));
}

function printDiagnostics(result) {
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  const warnings = result.diagnostics.filter((d) => d.severity === "warning");

  if (errors.length > 0) {
    console.log(chalk.red.bold(`\n  Errors (${errors.length})`));
    console.log(chalk.red("  " + "─".repeat(40)));
    errors.forEach((d) => {
      console.log(`  ${ICONS.error} ${chalk.bold(d.field)}`);
      console.log(`    ${chalk.dim("→")} ${d.message}`);
      if (d.received !== undefined) {
        console.log(`    ${chalk.dim("received:")} ${chalk.red(JSON.stringify(d.received))}`);
      }
    });
  }

  if (warnings.length > 0) {
    console.log(chalk.yellow.bold(`\n  Warnings (${warnings.length})`));
    console.log(chalk.yellow("  " + "─".repeat(40)));
    warnings.forEach((d) => {
      console.log(`  ${ICONS.warning} ${chalk.bold(d.field)}`);
      console.log(`    ${chalk.dim("→")} ${d.message}`);
    });
  }
}

function exitSummary(result) {
  const errors = result.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = result.diagnostics.filter((d) => d.severity === "warning").length;

  console.log("\n  " + "─".repeat(44));

  if (result.valid && errors === 0) {
    console.log(
      `  ${ICONS.success} ${chalk.green.bold("GUIDE.md is valid")}` +
      (warnings > 0 ? chalk.yellow(` · ${warnings} warning(s)`) : "")
    );
    console.log(
      chalk.dim(`\n  This file is ready to be consumed by AI agents and MCP servers.\n`)
    );
    process.exit(0);
  } else {
    console.log(
      `  ${ICONS.error} ${chalk.red.bold("Validation failed")} ` +
      chalk.red(`· ${errors} error(s)`) +
      (warnings > 0 ? chalk.yellow(`, ${warnings} warning(s)`) : "")
    );
    console.log(
      chalk.dim(`\n  Fix the errors above before using this GUIDE.md with AI agents.\n`)
    );
    process.exit(1);
  }
}

// ─── INIT template ────────────────────────────────────────────────────────────

const TEMPLATE = `---
guide_version: "1.0.0"
project: "my-project"
description: "Describe what this project does in 1-2 sentences for your AI agent."
language: typescript
runtime: "node@22"
framework: "express"
strict_typing: true
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
  architecture_pattern: layered
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

// ─── Commands ─────────────────────────────────────────────────────────────────

program
  .name("guidemd")
  .description("The official CLI for the GUIDE.md AI Context Interface standard")
  .version("0.1.0");

// ── guidemd lint ──────────────────────────────────────────────────────────────
program
  .command("lint [file]")
  .description("Validate a GUIDE.md file against the spec")
  .option("--json", "Output results as JSON (for CI/tooling integration)")
  .action((opts, file = "GUIDE.md") => {
    const target = path.resolve(file);

    if (!opts.json) {
      printBanner();
      console.log(`  ${ICONS.info} Linting: ${chalk.underline(target)}\n`);
    }

    const result = lintGuideFile(target);

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
      return;
    }

    printDiagnostics(result);
    exitSummary(result);
  });

// ── guidemd init ─────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Scaffold a new GUIDE.md in the current directory")
  .option("--force", "Overwrite an existing GUIDE.md")
  .action((opts) => {
    printBanner();
    const dest = path.resolve("GUIDE.md");

    if (fs.existsSync(dest) && !opts.force) {
      console.log(
        `  ${ICONS.error} ${chalk.red("GUIDE.md already exists.")} Use ${chalk.cyan("--force")} to overwrite.\n`
      );
      process.exit(1);
    }

    fs.writeFileSync(dest, TEMPLATE, "utf-8");
    console.log(`  ${ICONS.success} ${chalk.green("Created GUIDE.md")}`);
    console.log(
      chalk.dim(`\n  Edit the frontmatter, then run: ${chalk.cyan("guidemd lint")}\n`)
    );
  });

// ── guidemd schema ────────────────────────────────────────────────────────────
program
  .command("schema")
  .description("Print the JSON Schema representation of the GUIDE.md spec")
  .action(() => {
    // Zod doesn't natively export JSON Schema, so we hand-craft the public shape
    // In v2, use zod-to-json-schema package
    const summary = {
      $schema: "https://guidemd.dev/schema/1.0.0.json",
      title: "GUIDE.md Frontmatter Spec",
      version: "1.0.0",
      required: ["guide_version", "project", "language", "strict_typing", "error_protocol"],
      fields: Object.keys(GuideMdSchema.shape).map((key) => ({
        field: key,
        required: GuideMdSchema.shape[key].isOptional() === false,
      })),
    };
    console.log(JSON.stringify(summary, null, 2));
  });

program.parse();
