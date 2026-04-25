import { program } from "commander";
import chalk from "chalk";
import { lintGuideFile, fixGuideFile, LintResult, syncGuideFile, detectDrift, detectLanguage, readDependencies, detectParadigm as detectUniversalParadigm } from "../linter/index.js";
import { GuideMdSchema, GuideMdFrontmatter } from "../schema/index.js";
import { parseGuideFile } from "../parser/index.js";
import { exportGuide, generateBadge, ExportTarget, exportMcpManifest } from "../exporter/index.js";
import { importGuideFile, writeImportedGuide } from "../importer/index.js";
import { optimizeGuide } from "../optimizer/index.js";
import { generateHealthReport, printDashboard } from "../dashboard/index.js";
import { McpServer } from "../mcp/server.js";
import { installHook, uninstallHook, detectHookManager, HookManager } from "../guardian/hooks.js";
import { resolveInheritance, ResolutionError, ResolveResult, CircularDependencyError } from "../parser/resolver.js";
import { generateReadme, backSyncFromReadme, generateSmartTemplate } from "../generator/index.js";
import { listModules, searchModules, getModuleInfo, addModule, fetchModule } from "../registry/index.js";
import { runDoctor, detectEcosystem, detectFramework } from "../doctor/index.js";
import { runColdStartVerification } from "../verify/index.js";
import { calculateContextDensity, formatDensityReport } from "../stats/index.js";
import { runProfile, generateJsonSchema } from "../profiler/index.js";
import { watchGuideFile } from "../watcher/index.js";
import { diffGuides, diffGit, formatDiff, formatDiffJson, DiffOptions } from "../diff/index.js";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { zodToJsonSchema } from "zod-to-json-schema";
import { validateAllSkills, SkillValidationResult } from "../skills/index.js";
import { fileURLToPath } from "node:url";

// ─── Version ───────────────────────────────────────────────────────────────────
// Read version from package.json so --version always matches the published package
const PKG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");
const PKG_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ICONS = {
  error: chalk.red("✖"),
  warning: chalk.yellow("⚠"),
  success: chalk.green("✔"),
  info: chalk.cyan("ℹ"),
  sync: chalk.blue("🔄"),
  export: chalk.magenta("📤"),
  optimize: chalk.hex("#FFA500")("⚡"),
  guardian: chalk.green("🛡️"),
  skill: chalk.hex("#8A2BE2")("🎯"),
  mcp: chalk.cyan("🔌"),
  readme: chalk.magenta("📝"),
  registry: chalk.hex("#8A2BE2")("📦"),
  doctor: chalk.magenta("🩺"),
  profile: chalk.cyan("📊"),
  stats: chalk.yellow("📈"),
  verify: chalk.blue("🔍"),
};

function printBanner(): void {
  console.log(chalk.bold.cyan("\n╔═══════════════════════════╗"));
  console.log(chalk.bold.cyan("  ║     GUIDE.md  Linter      ║"));
  console.log(chalk.bold.cyan("  ║  AI Context Interface     ║"));
  console.log(chalk.bold.cyan("  ╚═══════════════════════════╝\n"));
}

function printDiagnostics(result: LintResult): void {
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  const warnings = result.diagnostics.filter((d) => d.severity === "warning");

  if (errors.length > 0) {
    console.log(chalk.red.bold(`\nErrors (${errors.length})`));
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
    console.log(chalk.yellow.bold(`\nWarnings (${warnings.length})`));
    console.log(chalk.yellow("  " + "─".repeat(40)));
    warnings.forEach((d) => {
      console.log(`  ${ICONS.warning} ${chalk.bold(d.field)}`);
      console.log(`    ${chalk.dim("→")} ${d.message}`);
    });
  }
}

function exitSummary(result: LintResult): void {
  const errors = result.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = result.diagnostics.filter((d) => d.severity === "warning").length;

  console.log("\n" + "─".repeat(44));
  if (result.valid && errors === 0) {
    console.log(
      `  ${ICONS.success} ${chalk.green.bold("GUIDE.md is valid")}` +
      (warnings > 0 ? chalk.yellow(` · ${warnings} warning(s)`) : "")
    );
    console.log(
      chalk.dim(`
This file is ready to be consumed by AI agents and MCP servers.
`)
    );
    process.exit(0);
  } else {
    console.log(
      `  ${ICONS.error} ${chalk.red.bold("Validation failed")} ` +
      chalk.red(`· ${errors} error(s)`) +
      (warnings > 0 ? chalk.yellow(`, ${warnings} warning(s)`) : "")
    );
    console.log(
      chalk.dim(`
Fix the errors above before using this GUIDE.md with AI agents.
`)
    );
    process.exit(1);
  }
}

// ─── Skill Validation Helpers ──────────────────────────────────────────────────

function printSkillDiagnostics(skillResult: import("../skills/index.js").SkillValidationResult): void {
  const errors = skillResult.diagnostics.filter((d) => d.severity === "error");
  const warnings = skillResult.diagnostics.filter((d) => d.severity === "warning");

  if (errors.length > 0) {
    console.log(chalk.red.bold(`    Errors (${errors.length})`));
    errors.forEach((d) => {
      console.log(`      ${ICONS.error} ${chalk.bold(d.field)}`);
      console.log(`        ${chalk.dim("→")} ${d.message}`);
      if (d.received !== undefined) {
        console.log(`        ${chalk.dim("received:")} ${chalk.red(JSON.stringify(d.received))}`);
      }
    });
  }

  if (warnings.length > 0) {
    console.log(chalk.yellow.bold(`    Warnings (${warnings.length})`));
    warnings.forEach((d) => {
      console.log(`      ${ICONS.warning} ${chalk.bold(d.field)}`);
      console.log(`        ${chalk.dim("→")} ${d.message}`);
    });
  }
}

function printSkillSummary(results: import("../skills/index.js").SkillValidationResult[]): void {
  const total = results.length;
  const valid = results.filter((r) => r.valid).length;
  const invalid = total - valid;
  const totalErrors = results.reduce((sum, r) => sum + r.diagnostics.filter((d) => d.severity === "error").length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.diagnostics.filter((d) => d.severity === "warning").length, 0);

  console.log(chalk.bold("\n  Skills Summary:"));
  console.log(`    ${chalk.dim("•")} Total skills: ${total}`);
  console.log(`    ${chalk.dim("•")} Valid: ${chalk.green(valid)}`);
  console.log(`    ${chalk.dim("•")} Invalid: ${chalk.red(invalid)}`);
  console.log(`    ${chalk.dim("•")} Total errors: ${chalk.red(totalErrors)}`);
  console.log(`    ${chalk.dim("•")} Total warnings: ${chalk.yellow(totalWarnings)}`);
  console.log("");
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
last_updated: "{{CURRENT_DATE}}"
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
interface LintOptions {
  json?: boolean;
  fix?: boolean;
  sync?: boolean;
  stats?: boolean;
  skipSecretScan?: boolean;
}

interface InitOptions {
  json: any;
  force?: boolean;
}

program
  .name("guidemd")
  .description("The official CLI for the GUIDE.md AI Context Interface standard")
  .version(PKG_VERSION);

// ── guidemd lint ──────────────────────────────────────────────────────────────
program
  .command("lint [file]")
  .description("Validate a GUIDE.md file against the spec (handles inheritance)")
  .option("--json", "Output results as JSON (for CI/tooling integration)")
  .option("--fix", "Automatically fix fixable issues")
  .option("--sync", "Detect and sync drift between frontmatter and actual project files")
  .option("--stats", "Output Context Density Score comparing GUIDE.md to total repository size")
  .option("--skip-secret-scan", "Skip scanning for secrets (not recommended)")
  .action(async (file: string = "GUIDE.md", opts: LintOptions) => {
    const target = path.resolve(file);

    if (!opts.json) {
      printBanner();
      console.log(`  ${ICONS.info} Linting: ${chalk.underline(target)}\n`);
    }

    const parsed = parseGuideFile(target);
    if (!parsed.success) {
      if (opts.json) {
        console.log(JSON.stringify({ valid: false, error: parsed.error }));
      } else {
        console.log(`  ${ICONS.error} ${chalk.red(parsed.error)}`);
      }
      process.exit(1);
    }

    // Resolve Inheritance
    let resolveResult: ResolveResult | undefined;
    let circularError: CircularDependencyError | undefined;
    
    try {
      const fileDir = path.dirname(target);
      resolveResult = await resolveInheritance(parsed.data, fileDir);
    } catch (e) {
      if (e instanceof CircularDependencyError) {
        circularError = e;
      } else {
        throw e; // Re-throw unexpected errors
      }
    }
    
    // Handle circular dependency as a diagnostic
    if (circularError) {
      const lintResult = await lintGuideFile(target, { skipSecretScan: opts.skipSecretScan });
      const result: LintResult = {
        ...lintResult,
        valid: false,
        diagnostics: [
          ...lintResult.diagnostics,
          {
            severity: "error" as const,
            source: "schema" as const,
            field: "extends",
            message: circularError.message
          }
        ]
      };
      
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(1);
        return;
      }
      
      printDiagnostics(result);
      exitSummary(result);
      return;
    }
    
    if (!resolveResult) {
      const result = await lintGuideFile(target, { skipSecretScan: opts.skipSecretScan });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(1);
        return;
      }
      printDiagnostics(result);
      exitSummary(result);
      return;
    }

    const resolvedData = resolveResult.data;

    // Surface resolution errors as diagnostics
    const resolveDiagnostics = resolveResult.errors.map((err: ResolutionError) => ({
      severity: "error" as const,
      source: "schema" as const,
      field: "extends",
      message: `Failed to resolve "${err.extends}": ${err.message}`
    }));

    // 1. Handle Sync if requested
    if (opts.sync) {
      const syncResult = await syncGuideFile(resolvedData, target);
      if (syncResult.synced) {
        const originalContent = fs.readFileSync(target, "utf-8");
        const matterParsed = matter(originalContent);
        // We only write back non-inherited fields to the file?
        // Actually, syncing usually updates the local file.
        const newContent = matter.stringify(matterParsed.content, syncResult.data);
        fs.writeFileSync(target, newContent, "utf-8");

        if (!opts.json) {
          console.log(`  ${ICONS.sync} ${chalk.blue("Synced drift:")}`);
          syncResult.drifts.forEach((drift) => {
            console.log(`    ${chalk.dim("•")} ${drift.message}`);
          });
          console.log();
        }
      }
    }

    // 2. Handle Fix if requested
    if (opts.fix) {
      const fixResult = await fixGuideFile(target);
      // Note: fixGuideFile currently doesn't handle inheritance.
      // For now, it fixes the local file.

      if (opts.json) {
        console.log(JSON.stringify(fixResult, null, 2));
        process.exit(fixResult.diagnostics.filter((d) => d.severity === "error").length === 0 ? 0 : 1);
        return;
      }

      if (fixResult.fixed && fixResult.data) {
        const originalContent = fs.readFileSync(target, "utf-8");
        const matterParsed = matter(originalContent);
        const newContent = matter.stringify(matterParsed.content, fixResult.data);
        fs.writeFileSync(target, newContent, "utf-8");

        console.log(`  ${ICONS.success} ${chalk.green("Applied fixes:")}`);
        fixResult.appliedFixes?.forEach((fix) => {
          console.log(`    ${chalk.dim("•")} ${fix}`);
        });
        console.log();
      }

      const finalResult: LintResult = {
        valid: fixResult.diagnostics.filter((d) => d.severity === "error").length === 0,
        file: target,
        diagnostics: fixResult.diagnostics,
        data: fixResult.data,
      };

      printDiagnostics(finalResult);
      exitSummary(finalResult);
    } else {
      const lintResult = await lintGuideFile(target, { skipSecretScan: opts.skipSecretScan });
      
      let allDiagnostics = [...lintResult.diagnostics];
      let valid = lintResult.valid;
      
      // Add resolution errors to diagnostics
      if (resolveDiagnostics.length > 0) {
        valid = false;
        allDiagnostics = [...allDiagnostics, ...resolveDiagnostics];
      }
      
      // We should validate the resolved data instead of just the local data
      const schemaValidation = GuideMdSchema.safeParse(resolvedData);
      
      if (!schemaValidation.success) {
        const schemaDiagnostics = schemaValidation.error.errors.map(err => ({
          field: err.path.join("."),
          message: err.message,
          severity: "error" as const,
          source: "schema" as const,
          received: typeof (err as { received?: unknown }).received !== "undefined" ? (err as { received?: unknown }).received : undefined
        }));
        valid = false;
        allDiagnostics = [...allDiagnostics, ...schemaDiagnostics];
      }

      const result: LintResult = {
        ...lintResult,
        valid,
        diagnostics: allDiagnostics,
      };

      if (opts.json) {
        let output: any = result;
        if (opts.stats) {
          const densityReport = calculateContextDensity(target, path.dirname(target));
          output = { ...result, stats: densityReport };
        }
        console.log(JSON.stringify(output, null, 2));
        process.exit(result.valid ? 0 : 1);
        return;
      }
      printDiagnostics(result);

      // Output stats if requested
      if (opts.stats) {
        const projectRoot = path.dirname(target);
        const densityReport = calculateContextDensity(target, projectRoot);
        console.log(chalk.bold.cyan("\n╔════════════════════════════════════════════════╗"));
        console.log(chalk.bold.cyan("║     📈  Context Density Report                 ║"));
        console.log(chalk.bold.cyan("╚════════════════════════════════════════════════╝"));
        console.log(formatDensityReport(densityReport));
        console.log("");
      }

      // ── Skill Validation ────────────────────────────────────────────────────
      const projectRoot = path.dirname(target);
      const skillResults = validateAllSkills(projectRoot);

      if (skillResults.length > 0) {
        console.log(chalk.bold.hex("#8A2BE2")("\n╔════════════════════════════════════════════════╗"));
        console.log(chalk.bold.hex("#8A2BE2")("║     🎯  Agent Skills Validation                ║"));
        console.log(chalk.bold.hex("#8A2BE2")("╚════════════════════════════════════════════════╝"));

        skillResults.forEach((skillResult) => {
          const skillName = path.basename(skillResult.skillDir);
          const statusIcon = skillResult.valid ? ICONS.success : ICONS.error;
          const statusColor = skillResult.valid ? chalk.green : chalk.red;
          console.log(`\n  ${statusIcon} ${statusColor.bold(skillName)} ${chalk.dim(skillResult.file)}`);

          if (!skillResult.valid || skillResult.diagnostics.length > 0) {
            printSkillDiagnostics(skillResult);
          }
        });

        printSkillSummary(skillResults);

        // If skills have errors, mark the overall result as invalid
        if (skillResults.some((r) => !r.valid)) {
          result.valid = false;
        }
      }

      exitSummary(result);
    }
  });

// ── guidemd back-sync-readme ──────────────────────────────────────────────────
program
  .command("back-sync-readme [file]")
  .description("Back-port changes from README.md into GUIDE.md frontmatter (Bi-Directional)")
  .option("-r, --readme <path>", "Path to README.md", "README.md")
  .action((file: string = "GUIDE.md", opts: { readme: string }) => {
    printBanner();
    const guidePath = path.resolve(file);
    const readmePath = path.resolve(opts.readme);

    if (!fs.existsSync(readmePath)) {
      console.log(`  ${ICONS.error} ${chalk.red(`README not found: ${readmePath}`)}`);
      process.exit(1);
    }

    const parsedGuide = parseGuideFile(guidePath);
    if (!parsedGuide.success) {
      console.log(`  ${ICONS.error} ${chalk.red(parsedGuide.error)}`);
      process.exit(1);
    }

    const readmeContent = fs.readFileSync(readmePath, "utf-8");
    const guideData = GuideMdSchema.safeParse(parsedGuide.data);
    if (!guideData.success) {
      console.log(`  ${ICONS.error} ${chalk.red("GUIDE.md failed schema validation:")}`);
      guideData.error.errors.forEach(err => console.log(`    ${chalk.dim("•")} ${err.path.join(".")}: ${err.message}`));
      process.exit(1);
    }
    const newData = backSyncFromReadme(readmeContent, guideData.data);

    // Check if anything changed
    const changed = JSON.stringify(newData) !== JSON.stringify(parsedGuide.data);

    if (changed) {
      const originalContent = fs.readFileSync(guidePath, "utf-8");
      const matterParsed = matter(originalContent);
      const newContent = matter.stringify(matterParsed.content, newData);
      fs.writeFileSync(guidePath, newContent, "utf-8");

      console.log(`  ${ICONS.success} ${chalk.green("Back-synced changes from README.md to GUIDE.md")}`);
      console.log(chalk.dim("Fields updated: project, language, runtime (detected from Markdown)"));
    } else {
      console.log(`  ${ICONS.success} ${chalk.green("No changes detected in README.md to back-port.")}`);
    }
  });

// ── guidemd verify ────────────────────────────────────────────────────────────
interface VerifyOptions {
  json?: boolean;
}

program
  .command("verify [file]")
  .description("Verify GUIDE.md provides enough context for AI cold start (Contract Verification)")
  .option("--json", "Output results as JSON")
  .action(async (file: string = "GUIDE.md", opts: VerifyOptions) => {
    if (!opts.json) {
      printBanner();
    }

    const targetFile = path.resolve(file);

    if (!fs.existsSync(targetFile)) {
      const msg = `GUIDE.md not found: ${targetFile}`;
      if (opts.json) {
        console.log(JSON.stringify({ valid: false, error: msg }));
      } else {
        console.log(`  ${ICONS.error} ${chalk.red(msg)}`);
      }
      process.exit(1);
    }

    if (!opts.json) {
      console.log(`  ${ICONS.info} Running Cold Start Verification: ${chalk.underline(targetFile)}\n`);
      console.log(chalk.dim("  Simulating AI agent reading GUIDE.md for the first time...\n"));
    }

    const parsed = parseGuideFile(targetFile);
    if (!parsed.success) {
      if (opts.json) {
        console.log(JSON.stringify({ valid: false, error: parsed.error }));
      } else {
        console.log(`  ${ICONS.error} ${chalk.red(parsed.error)}`);
      }
      process.exit(1);
    }

    const schemaResult = GuideMdSchema.safeParse(parsed.data);
    if (!schemaResult.success) {
      const msg = "Cannot verify a file with schema errors. Run 'guidemd lint' first.";
      if (opts.json) {
        console.log(JSON.stringify({ valid: false, error: msg }));
      } else {
        console.log(`  ${ICONS.error} ${chalk.red(msg)}`);
      }
      process.exit(1);
    }

    const projectRoot = path.dirname(targetFile);
    const report = await runColdStartVerification(schemaResult.data, parsed.content, projectRoot);

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.valid ? 0 : 1);
      return;
    }

    // Print human-readable report
    const statusColor = report.valid ? chalk.green : report.score >= 50 ? chalk.yellow : chalk.red;
    const statusIcon = report.valid ? ICONS.success : report.score >= 50 ? ICONS.warning : ICONS.error;

    console.log(chalk.bold.cyan("\n╔════════════════════════════════════════════════╗"));
    console.log(chalk.bold.cyan("║     🔍  Cold Start Verification Report         ║"));
    console.log(chalk.bold.cyan("╚════════════════════════════════════════════════╝\n"));

    console.log(`${chalk.bold("Contract Score:")}  ${statusColor(report.score + "/100")}`);
    console.log(`${statusIcon} ${statusColor(report.valid ? "PASS - AI can reconstruct project" : "FAIL - Insufficient context")}\n`);

    // Reconstructability matrix
    console.log(chalk.bold("  Reconstructability Matrix:"));
    console.log(chalk.dim("  ──────────────────────────"));
    const matrix = [
      { name: "Dependency Tree", ok: report.canReconstruct.dependencyTree },
      { name: "Build Scripts", ok: report.canReconstruct.buildScripts },
      { name: "Entry Points", ok: report.canReconstruct.entryPoints },
      { name: "Architecture", ok: report.canReconstruct.architecture },
    ];
    matrix.forEach(item => {
      const icon = item.ok ? chalk.green("✔") : chalk.red("✖");
      const status = item.ok ? chalk.green("Reconstructable") : chalk.red("Missing Context");
      console.log(`    ${icon} ${item.name.padEnd(18)} ${status}`);
    });

    // Stats
    console.log(chalk.bold("\n  Coverage Stats:"));
    console.log(`    ${chalk.dim("•")} Required fields: ${report.stats.requiredFieldsPresent}/${report.stats.totalRequiredFields}`);
    console.log(`    ${chalk.dim("•")} Critical sections: ${report.stats.criticalSectionsPresent}/${report.stats.totalCriticalSections}`);

    // Findings
    if (report.findings.length > 0) {
      const critical = report.findings.filter(f => f.type === "critical");
      const warnings = report.findings.filter(f => f.type === "warning");
      const info = report.findings.filter(f => f.type === "info");

      if (critical.length > 0) {
        console.log(chalk.red.bold(`\n  Critical Issues (${critical.length}):`));
        critical.forEach(f => {
          console.log(`    ${ICONS.error} ${chalk.bold(f.category.toUpperCase())}: ${f.message}`);
          console.log(`      ${chalk.dim("→")} ${chalk.green(f.recommendation)}`);
        });
      }

      if (warnings.length > 0) {
        console.log(chalk.yellow.bold(`\n  Warnings (${warnings.length}):`));
        warnings.forEach(f => {
          console.log(`    ${ICONS.warning} ${chalk.bold(f.category.toUpperCase())}: ${f.message}`);
          console.log(`      ${chalk.dim("→")} ${f.recommendation}`);
        });
      }

      if (info.length > 0 && report.score < 100) {
        console.log(chalk.dim(`\n  Notes (${info.length}):`));
        info.forEach(f => {
          console.log(`    ${ICONS.info} ${f.message}`);
        });
      }
    }

    // Recommendations summary
    if (report.recommendations.length > 0 && !report.valid) {
      console.log(chalk.bold("\n  💡 Quick Fixes:"));
      report.recommendations.slice(0, 3).forEach((rec, i) => {
        console.log(`    ${i + 1}. ${rec}`);
      });
    }

    console.log(chalk.dim("\n  A passing score means an AI agent can reconstruct your project\n  from GUIDE.md alone, without additional documentation.\n"));

    process.exit(report.valid ? 0 : 1);
  });

// ── guidemd doctor ────────────────────────────────────────────────────────────
program
  .command("doctor [file]")
  .description("Deep static analysis to find logic conflicts and architectural drift")
  .action(async (file: string = "GUIDE.md") => {
    printBanner();
    const targetFile = path.resolve(file);
    console.log(`  ${ICONS.doctor} Running Deep Analysis: ${chalk.underline(targetFile)}\n`);

    const parsed = parseGuideFile(targetFile);
    if (!parsed.success) {
      console.log(`  ${ICONS.error} ${chalk.red(parsed.error)}`);
      process.exit(1);
    }

    const schemaResult = GuideMdSchema.safeParse(parsed.data);
    if (!schemaResult.success) {
      console.log(`  ${ICONS.error} ${chalk.red("Cannot run doctor on a file with schema errors. Run 'guidemd lint' first.")}`);
      process.exit(1);
    }

    const report = await runDoctor(schemaResult.data, parsed.content);

    // Print Stats
    console.log(chalk.bold(`  Scan Results:`));
    console.log(`    ${chalk.dim("•")} Files scanned: ${report.stats.filesScanned}`);
    console.log(`    ${chalk.dim("•")} Signatures detected: ${report.stats.signaturesFound.join(", ") || "None"}\n`);

    if (report.issues.length === 0) {
      console.log(`  ${ICONS.success} ${chalk.green("No architectural drift or logic conflicts found.")}`);
      process.exit(0);
    }

    const errors = report.issues.filter(i => i.severity === "error");
    const warnings = report.issues.filter(i => i.severity === "warning");

    if (errors.length > 0) {
      console.log(chalk.red.bold(`  Critical Conflicts (${errors.length})`));
      errors.forEach(i => {
        console.log(`    ${ICONS.error} ${chalk.bold(i.field)}: ${i.message}`);
        console.log(`      ${chalk.green("Fix:")} ${i.recommendation}`);
      });
      console.log();
    }

    if (warnings.length > 0) {
      console.log(chalk.yellow.bold(`  Optimization Opportunities (${warnings.length})`));
      warnings.forEach(i => {
        const icon = i.type === "redundancy" ? ICONS.optimize : ICONS.warning;
        console.log(`    ${icon} ${chalk.bold(i.field)}: ${i.message}`);
        console.log(`      ${chalk.dim("→")} ${i.recommendation}`);
      });
      console.log();
    }

    process.exit(errors.length > 0 ? 1 : 0);
  });

// ── guidemd profile ───────────────────────────────────────────────────────────
program
  .command("profile [file]")
  .description("AI Observability: Token density, Instruction/Code ratio, and Compatibility")
  .option("--json-schema", "Export the project's GUIDE.md schema to JSON for IntelliSense")
  .action((file: string = "GUIDE.md", opts: { jsonSchema?: boolean }) => {
    if (opts.jsonSchema) {
      const schema = generateJsonSchema();
      const schemaFileName = "guidemd.schema.json";
      const targetPath = path.resolve(schemaFileName);
      
      // Security: Verify path doesn't escape CWD and file is safe to write
      const cwd = process.cwd();
      // Normalize paths for Windows compatibility (handles different casing and path separators)
      const normalizedTarget = path.normalize(targetPath).toLowerCase();
      const normalizedCwd = path.normalize(cwd).toLowerCase();
      const normalizedSep = path.normalize(path.sep).toLowerCase();
      if (!normalizedTarget.startsWith(normalizedCwd + normalizedSep) && normalizedTarget !== normalizedCwd) {
        console.error(`${ICONS.error} ${chalk.red("Security: Invalid schema file path")}`);
        process.exit(1);
      }
      
      // Security: If file exists, verify it was created by us (check for marker)
      if (fs.existsSync(targetPath)) {
        try {
          const existing = fs.readFileSync(targetPath, "utf-8");
          if (!existing.includes("\"$comment\": \"Generated by GuideMD\"")) {
            console.error(`${ICONS.error} ${chalk.red("Security: File exists and was not created by guidemd. Aborting to prevent data loss.")}`);
            process.exit(1);
          }
        } catch (err) {
          console.error(`${ICONS.error} ${chalk.red("Security: Cannot verify existing file. Aborting.")}`);
          process.exit(1);
        }
      }
      
      // Security: Add marker comment to identify our files
      const markedSchema = schema.replace(
        '{"$schema":',
        '{"$comment": "Generated by GuideMD", "$schema":'
      );
      
      fs.writeFileSync(targetPath, markedSchema, "utf-8");
      console.log(`${ICONS.success} Created ${chalk.underline(schemaFileName)}`);
      console.log(chalk.dim("Add this to your VS Code settings to get real-time IntelliSense for GUIDE.md."));
      return;
    }

    printBanner();
    const targetFile = path.resolve(file);
    console.log(`  ${ICONS.profile} Profiling: ${chalk.underline(targetFile)}\n`);

    const parsed = parseGuideFile(targetFile);
    if (!parsed.success) {
      console.log(`  ${ICONS.error} ${chalk.red(parsed.error)}`);
      process.exit(1);
    }

    const schemaResult = GuideMdSchema.safeParse(parsed.data);
    if (!schemaResult.success) {
      console.log(`  ${ICONS.error} ${chalk.red("Cannot profile a file with schema errors.")}`);
      process.exit(1);
    }

    const report = runProfile(schemaResult.data, parsed.content);

    // 1. Token Metrics
    console.log(chalk.bold("  Token Metrics:"));
    console.log(`    ${chalk.dim("•")} Estimated Total Tokens: ${chalk.cyan(report.totalTokens)}`);
    console.log(`    ${chalk.dim("•")} Word Count (MD): ${parsed.content.split(/\s+/).length}\n`);

    // 2. Compatibility Table
    console.log(chalk.bold("  Model Compatibility:"));
    console.table(report.compatibility.map(c => ({
      Model: c.model,
      "Usage %": c.usagePercentage.toFixed(2) + "%",
      "Status": c.usagePercentage < 10 ? chalk.green("Safe") : c.usagePercentage < 50 ? chalk.yellow("Moderate") : chalk.red("Heavy")
    })));
    console.log();

    // 3. Instruction/Code Ratio
    console.log(chalk.bold("  Instruction-to-Code Density:"));
    report.instructionRatio.forEach(r => {
      const color = r.status === "balanced" ? chalk.green : chalk.yellow;
      console.log(`    ${color("•")} ${chalk.bold(r.domain)}: ${r.instructionWords} words / ${r.codeUnits} units (${color(r.status)})`);
    });
    console.log();

    // 4. Entropy (Fluff Detection)
    console.log(chalk.bold("  Section Entropy (Higher is more efficient):"));
    report.entropy.forEach(s => {
      const bar = "█".repeat(Math.floor(s.score * 10)) + "░".repeat(10 - Math.floor(s.score * 10));
      const color = s.score > 0.9 ? chalk.green : s.score > 0.7 ? chalk.yellow : chalk.red;
      console.log(`    ${color(bar)} ${chalk.bold(s.section)} (${(s.score * 100).toFixed(0)}%)`);
      if (s.recommendation) console.log(`      ${chalk.dim("→ " + s.recommendation)}`);
    });
    console.log();

    // 5. Ghost Context
    if (report.ghostContext.length > 0) {
      console.log(chalk.red.bold("  Ghost Context Detected:"));
      report.ghostContext.forEach(ep => {
        console.log(`    ${ICONS.error} Entry point ${chalk.underline(ep)} does not exist in filesystem.`);
      });
      console.log();
    }
  });

// ── guidemd sync ──────────────────────────────────────────────────────────────
program
  .command("sync [file]")
  .description("Detect and sync drift between frontmatter and actual project files, and bi-directionally sync README.md markers")
  .option("-r, --readme <path>", "Path to README.md for bi-directional sync", "README.md")
  .action(async (file: string = "GUIDE.md", opts: { readme: string }) => {
    printBanner();
    const target = path.resolve(file);
    console.log(`  ${ICONS.sync} Syncing: ${chalk.underline(target)}\n`);

    const result = await lintGuideFile(target);
    if (!result.data) {
      console.log(`  ${ICONS.error} ${chalk.red("Cannot sync a file with schema errors.")}`);
      process.exit(1);
    }

    // 1. Project drift sync
    const syncResult = await syncGuideFile(result.data, target);
    let fileSynced = false;

    if (syncResult.synced) {
      const originalContent = fs.readFileSync(target, "utf-8");
      const parsed = matter(originalContent);
      const newContent = matter.stringify(parsed.content, syncResult.data);
      fs.writeFileSync(target, newContent, "utf-8");
      fileSynced = true;

      console.log(`  ${ICONS.success} ${chalk.green("Project drift sync complete!")}`);
      syncResult.drifts.forEach((drift) => {
        console.log(`    ${chalk.dim("•")} ${drift.message}`);
      });
    }

    // 2. Bi-Directional README Sync (Parser-Back)
    const readmePath = path.resolve(opts.readme);
    if (fs.existsSync(readmePath)) {
      const readmeContent = fs.readFileSync(readmePath, "utf-8");
      const parsedGuide = parseGuideFile(target);
      if (parsedGuide.success) {
        const guideData = GuideMdSchema.safeParse(parsedGuide.data);
        if (!guideData.success) return; // Skip back-sync if guide is invalid
        const newData = backSyncFromReadme(readmeContent, guideData.data);
        const changed = JSON.stringify(newData) !== JSON.stringify(parsedGuide.data);

        if (changed) {
          const originalContent = fs.readFileSync(target, "utf-8");
          const matterParsed = matter(originalContent);
          const newContent = matter.stringify(matterParsed.content, newData);
          fs.writeFileSync(target, newContent, "utf-8");
          fileSynced = true;

          console.log(`  ${ICONS.sync} ${chalk.blue("README back-sync complete!")}`);
          console.log(chalk.dim("    Parsed changes from HTML comment markers and updated GUIDE.md frontmatter."));
        }
      }
    }
  }); // <--- Added the missing closure here

// ── guidemd init ─────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Scaffold a new GUIDE.md in the current directory with smart stack detection")
  .option("--force", "Overwrite an existing GUIDE.md")
  .action(async (opts: InitOptions) => {
    printBanner();
    const dest = path.resolve("GUIDE.md");
    if (fs.existsSync(dest) && !opts.force) {
      console.log(
        `  ${ICONS.error} ${chalk.red("GUIDE.md already exists.")} Use ${chalk.cyan("--force")} to overwrite.\n`
      );
      process.exit(1);
    }

    // ── SMART PRE-FLIGHT SCAN ────────────────────────────────────────────────
    console.log(`  ${ICONS.info} Running pre-flight scan to detect project configuration...\n`);
    
    const projectRoot = process.cwd();
    
    // Universal ecosystem detection
    const ecosystem = detectEcosystem(projectRoot);
    
    // Fallback to file-based detection if ecosystem detection didn't find language
    let detectedLang = ecosystem.language;
    if (!detectedLang) {
      detectedLang = detectLanguage(dest);
    }
    
    // Framework detection: ecosystem first, then npm-based
    let detectedFramework = ecosystem.framework;
    if (!detectedFramework) {
      const npmFramework = detectFramework(projectRoot);
      if (npmFramework) detectedFramework = npmFramework;
    }
    
    // Paradigm detection: ecosystem pre-detected first, then universal, then TS-based
    let detectedParadigm: "oop" | "functional" | "mixed" | "imperative" | "procedural" | null = ecosystem.paradigm;
    if (!detectedParadigm && detectedLang) {
      detectedParadigm = detectUniversalParadigm(projectRoot, detectedLang);
    }
    if (!detectedParadigm) {
      // Fallback for JS/TS projects
      const { detectDrift } = await import("../linter/sync.js");
      // Use sync.ts paradigm detection via temp GUIDE.md
      const tempGuidePath = path.join(projectRoot, "GUIDE.md");
      if (fs.existsSync(tempGuidePath)) {
        const tempData = { language: detectedLang };
        const tempDrifts = await detectDrift(tempData, tempGuidePath);
        const paradigmDrift = tempDrifts.find(d => d.field === "paradigm");
        if (paradigmDrift) {
          detectedParadigm = paradigmDrift.actual as "oop" | "functional" | null;
        }
      }
    }
    
    // Runtime detection from ecosystem
    const detectedRuntime = ecosystem.runtime;
    
    // Read top dependencies
    const allDeps = readDependencies(projectRoot);
    const topDeps = allDeps.slice(0, 10).map(d => `${d.name}@${d.version.replace(/[\^~>=<]/, "").split(",").pop() || "*"}`);
    
    // Get project name from manifest or directory
    let projectName = path.basename(projectRoot);
    const manifestPriority = ["package.json", "Cargo.toml", "pyproject.toml", "go.mod", "composer.json", "Gemfile"];
    for (const manifest of manifestPriority) {
      const manifestPath = path.join(projectRoot, manifest);
      if (fs.existsSync(manifestPath)) {
        try {
          const content = fs.readFileSync(manifestPath, "utf-8");
          if (manifest === "package.json") {
            const parsed = JSON.parse(content);
            if (parsed.name) {
              projectName = parsed.name.replace(/^@[^/]+\//, "");
              break;
            }
          } else if (manifest === "Cargo.toml") {
            const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
            if (nameMatch?.[1]) {
              projectName = nameMatch[1];
              break;
            }
          } else if (manifest === "pyproject.toml") {
            const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
            if (nameMatch?.[1]) {
              projectName = nameMatch[1];
              break;
            }
          } else if (manifest === "go.mod") {
            const moduleMatch = content.match(/module\s+(\S+)/);
            if (moduleMatch?.[1]) {
              projectName = moduleMatch[1].split("/").pop() || projectName;
              break;
            }
          }
        } catch {
          // Continue to next manifest
        }
      }
    }
    
    // Generate smart template with detected values
    const smartTemplate = generateSmartTemplate({
      project: projectName,
      language: detectedLang, // null if not detected - template will show TODO
      framework: detectedFramework ?? null,
      paradigm: detectedParadigm ?? null,
    });
    
    const today = new Date().toISOString().split("T")[0] ?? "unknown";
    let finalTemplate = smartTemplate.replace(/\{\{CURRENT_DATE\}\}/g, today);
    
    // Inject detected dependencies into context if available
    if (topDeps.length > 0 && finalTemplate.includes("context:")) {
      const depsComment = `  # Auto-detected dependencies (top ${topDeps.length}): ${topDeps.join(", ")}`;
      finalTemplate = finalTemplate.replace(
        /(context:)/,
        `${depsComment}\n  $1`
      );
    }
    
    fs.writeFileSync(dest, finalTemplate, "utf-8");
    
    console.log(`  ${ICONS.success} ${chalk.green("Created GUIDE.md")}`);
    
    // Display detection summary
    console.log(chalk.bold.cyan("\n  Detection Summary:\n"));
    
    const detected: string[] = [];
    const needsManual: string[] = [];
    
    if (detectedLang) {
      detected.push(`language=${detectedLang}`);
    } else {
      needsManual.push("language");
    }
    
    if (detectedFramework) {
      detected.push(`framework=${detectedFramework}`);
    } else {
      needsManual.push("framework");
    }
    
    if (detectedParadigm) {
      detected.push(`paradigm=${detectedParadigm}`);
    } else {
      needsManual.push("paradigm");
    }
    
    if (detectedRuntime) {
      detected.push(`runtime=${detectedRuntime}`);
    } else {
      needsManual.push("runtime");
    }
    
    // Print detected
    if (detected.length > 0) {
      console.log(`  ${chalk.green("✓ Detected:")} ${detected.join(", ")}`);
    }
    
    // Print needs manual
    if (needsManual.length > 0) {
      console.log(`  ${chalk.yellow("? Could not detect:")} ${needsManual.join(", ")} (please fill in manually)`);
    }
    
    if (topDeps.length > 0) {
      console.log(`  ${chalk.dim("•")} Found ${topDeps.length} dependencies in manifest`);
    }
    
    console.log(
      chalk.dim(`\nEdit the frontmatter, then run: ${chalk.cyan("guidemd lint")}
`)
    );
  });

program
  .command("schema")
  .description("Print the JSON Schema representation of the GUIDE.md spec")
  .action(() => {
    console.log(generateJsonSchema());
  });

// ── guidemd export ────────────────────────────────────────────────────────────
interface ExportOptions {
  target: ExportTarget;
  out: string;
  manifest?: boolean;
}

program
  .command("export [file]")
  .description("Export GUIDE.md to other AI context formats (CLAUDE.md, .cursorrules, AGENTS.md, .github/copilot-instructions.md, .aider.conf.yml, MCP manifest)")
  .option("-t, --target <type>", "Target format (claude, cursor, windsurf, agents, copilot, aider, or all)", "all")
  .option("-o, --out <dir>", "Output directory", ".")
  .option("-m, --manifest", "Generate MCP manifest.json for Model Context Protocol", false)
  .action((file: string = "GUIDE.md", opts: ExportOptions) => {
    printBanner();
    const targetFile = path.resolve(file);
    const outDir = path.resolve(opts.out);

    console.log(`  ${ICONS.export} Exporting: ${chalk.underline(targetFile)} to ${chalk.bold(opts.target)}\n`);

    const parsed = parseGuideFile(targetFile);
    if (!parsed.success) {
      console.log(`  ${ICONS.error} ${chalk.red(parsed.error)}`);
      process.exit(1);
    }

    const result = GuideMdSchema.safeParse(parsed.data);
    if (!result.success) {
      console.log(`  ${ICONS.error} ${chalk.red("Cannot export a file with schema errors. Run 'guidemd lint' first.")}`);
      process.exit(1);
    }

    const exportResults = exportGuide(result.data, parsed.content, outDir, opts.target);

    exportResults.forEach(res => {
      if (res.success) {
        console.log(`  ${ICONS.success} Created ${chalk.green(res.file)}`);
      } else {
        console.log(`  ${ICONS.error} Failed to create ${chalk.red(res.file)}`);
      }
    });

    // Export MCP manifest if requested
    if (opts.manifest) {
      const manifestResult = exportMcpManifest(result.data, parsed.content, outDir);
      if (manifestResult.success) {
        console.log(`  ${ICONS.mcp} Created ${chalk.cyan(manifestResult.file)}`);
        console.log(chalk.dim("    MCP-compatible IDEs can now discover this project's AI Interface capabilities"));
      } else {
        console.log(`  ${ICONS.error} Failed to create ${chalk.red(manifestResult.file)}`);
      }
    }
  });

// ── guidemd import ───────────────────────────────────────────────────────────
interface ImportOptions {
  out?: string;
  dryRun?: boolean;
}

program
  .command("import <file>")
  .description("Reverse-parse an AI context file (CLAUDE.md, .cursorrules, .windsurfrules, AGENTS.md) into a GUIDE.md")
  .option("-o, --out <path>", "Output path for the generated GUIDE.md", "GUIDE.md")
  .option("--dry-run", "Print to stdout instead of writing file")
  .action((file: string, opts: ImportOptions) => {
    printBanner();
    const sourceFile = path.resolve(file);
    
    console.log(`  ${ICONS.info} Importing: ${chalk.underline(sourceFile)}\n`);
    
    const result = importGuideFile(sourceFile);
    
    if (!result.success) {
      console.log(`  ${ICONS.error} ${chalk.red(result.error)}`);
      process.exit(1);
    }
    
    // Print warnings about unmapped fields
    if (result.warnings.length > 0) {
      console.log(chalk.yellow.bold(`\n  Import Warnings (${result.warnings.length}):`));
      result.warnings.forEach(w => {
        console.log(`    ${ICONS.warning} ${w}`);
      });
    }
    
    // Print mapped fields summary
    if (result.data) {
      console.log(chalk.green.bold(`\n  Successfully mapped fields:`));
      const fields = [
        result.data.project && `  ${ICONS.success} project: ${result.data.project}`,
        result.data.language && `  ${ICONS.success} language: ${Array.isArray(result.data.language) ? result.data.language.join(", ") : result.data.language}`,
        result.data.runtime && `  ${ICONS.success} runtime: ${result.data.runtime}`,
        result.data.framework && `  ${ICONS.success} framework: ${Array.isArray(result.data.framework) ? result.data.framework.join(", ") : result.data.framework}`,
        result.data.description && `  ${ICONS.success} description: ${result.data.description.substring(0, 50)}...`,
        result.data.code_style && `  ${ICONS.success} code_style: configured`,
        result.data.guardrails && `  ${ICONS.success} guardrails: configured`,
        result.data.testing && `  ${ICONS.success} testing: configured`,
      ].filter(Boolean);
      
      fields.forEach(f => console.log(f));
    }
    
    if (opts.dryRun) {
      console.log(chalk.bold.cyan("\n  ── Generated GUIDE.md ──\n"));
      const yamlContent = matter.stringify(result.content, result.data as Record<string, unknown>);
      console.log(yamlContent);
      return;
    }
    
    const writeResult = writeImportedGuide(result, opts.out);
    if (writeResult.success) {
      console.log(`\n  ${ICONS.success} ${chalk.green(writeResult.message)}`);
      if (result.warnings.length > 0) {
        console.log(chalk.dim(`\n  Review the warnings above and adjust the generated GUIDE.md as needed.`));
      }
      // Exit non-zero if schema validation failed
      if (!result.schemaValid) {
        process.exit(1);
      }
    } else {
      console.log(`  ${ICONS.error} ${chalk.red(writeResult.message)}`);
      process.exit(1);
    }
  });

// ── guidemd badge ─────────────────────────────────────────────────────────────
program
  .command("badge")
  .description("Generate a Markdown badge for your README (Dynamic Grading)")
  .option("--file <path>", "GUIDE.md file path", "GUIDE.md")
  .action((opts: { file: string }) => {
    const targetFile = path.resolve(opts.file);
    const parsed = parseGuideFile(targetFile);
    
    let grade = "A"; // Default
    if (parsed.success) {
      const result = GuideMdSchema.safeParse(parsed.data);
      if (result.success) {
        const report = generateHealthReport(result.data, parsed.content);
        grade = report.score >= 90 ? "A" : report.score >= 80 ? "B" : report.score >= 70 ? "C" : "D";
      }
    }

    console.log("\n" + generateBadge(grade) + "\n");
    console.log(chalk.dim(`Badge generated for Grade ${grade}. Copy this into your README.md.\n`));
  });

// ── guidemd ci ────────────────────────────────────────────────────────────────
interface CiOptions {
  write?: boolean;
}

program
  .command("ci")
  .description("Generate a GitHub Action workflow template")
  .option("--write", "Create .github/workflows/guidemd.yml directly")
  .action((opts: CiOptions) => {
    const workflow = `name: AI Context Check (GUIDE.md)

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
    types: [ opened, synchronize, reopened ]

jobs:
  lint-guide:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install @prismteam/linter
        run: npm install -g @prismteam/linter

      - name: Lint GUIDE.md
        id: lint
        run: |
          # SECURITY: Ensure GUIDE.md path is validated before use in production CI
          if ! guidemd lint GUIDE.md --json > lint-results.json 2>&1; then
            echo "Lint failed"
            echo "failed=true" >> $GITHUB_OUTPUT
            cat lint-results.json
          else
            echo "failed=false" >> $GITHUB_OUTPUT
          fi
        continue-on-error: true

      - name: Generate Info Dashboard
        id: info
        run: |
          echo "## 📊 GUIDE.md AI-Readiness Report" > dashboard.md
          echo "" >> dashboard.md
          guidemd lint GUIDE.md > lint-output.txt 2>&1 || true
          if [ -f lint-output.txt ]; then
            if grep -q "GUIDE.md is valid" lint-output.txt; then
              echo "✅ **GUIDE.md is valid**" >> dashboard.md
            else
              echo "❌ **GUIDE.md has validation errors**" >> dashboard.md
              echo "" >> dashboard.md
              echo "<details><summary>Validation Details</summary>" >> dashboard.md
              echo "" >> dashboard.md
              echo '\`\`\`' >> dashboard.md
              # Filter out any lines that might contain secrets (source: secret-scan)
              grep -v "source.*secret-scan\|Potential secret" lint-output.txt | head -30 >> dashboard.md || true
              echo '\`\`\`' >> dashboard.md
              echo "" >> dashboard.md
              echo "*Note: Run \`guidemd lint\` locally for full details.*" >> dashboard.md
              echo "</details>" >> dashboard.md
            fi
          fi
          cat dashboard.md

      - name: Post PR Comment
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const dashboard = fs.readFileSync('dashboard.md', 'utf8');
            const body = dashboard + "\n\n---\n*Generated by @guidemd/linter*";
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const botComment = comments.find(comment => 
              comment.user.type === 'Bot' && 
              comment.body.includes('GUIDE.md AI-Readiness Report')
            );
            if (botComment) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: botComment.id,
                body: body
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: body
              });
            }

      - name: Write to Job Summary
        run: cat dashboard.md >> $GITHUB_STEP_SUMMARY

      - name: Fail if lint errors
        if: steps.lint.outputs.failed == 'true'
        run: |
          echo "GUIDE.md validation failed. Please fix the errors above."
          exit 1
`;

    if (opts.write) {
      // Create the workflow file directly
      const workflowDir = path.join(process.cwd(), ".github", "workflows");
      const workflowPath = path.join(workflowDir, "guidemd.yml");
      
      try {
        // Create directories if they don't exist
        if (!fs.existsSync(workflowDir)) {
          fs.mkdirSync(workflowDir, { recursive: true });
        }
        
        fs.writeFileSync(workflowPath, workflow, "utf-8");
        console.log(`${ICONS.success} ${chalk.green("Created")} ${chalk.underline(workflowPath)}`);
        console.log(chalk.dim("\nThe workflow will:"));
        console.log(chalk.dim("  • Run on every push to main/master and on PRs"));
        console.log(chalk.dim("  • Lint GUIDE.md and fail if there are errors"));
        console.log(chalk.dim("  • Post a dashboard comment on PRs"));
        console.log(chalk.dim("  • Write results to $GITHUB_STEP_SUMMARY"));
      } catch (err) {
        console.log(`${ICONS.error} ${chalk.red("Failed to create workflow file")}`);
        console.log(chalk.red(err instanceof Error ? err.message : "Unknown error"));
        process.exit(1);
      }
    } else {
      // Print to stdout
      console.log(chalk.bold.cyan("\n# GitHub Action Template (.github/workflows/guidemd.yml)\n"));
      console.log(chalk.dim("------------------------------------------------------------"));
      console.log(workflow);
      console.log(chalk.dim("------------------------------------------------------------\n"));
      console.log(`To save this automatically, run: ${chalk.cyan("guidemd ci --write")}\n`);
    }
  });

// ── guidemd optimize ──────────────────────────────────────────────────────────
interface OptimizeOptions {
  json?: boolean;
}

program
  .command("optimize [file]")
  .description("Analyze GUIDE.md for token efficiency and structural improvements")
  .option("--json", "Output results as JSON (for CI/tooling integration)")
  .action((file: string = "GUIDE.md", opts: OptimizeOptions) => {
    if (!opts.json) {
      printBanner();
    }
    const targetFile = path.resolve(file);
    
    if (!opts.json) {
      console.log(`  ${ICONS.optimize} Analyzing: ${chalk.underline(targetFile)}\n`);
    }

    const parsed = parseGuideFile(targetFile);
    if (!parsed.success) {
      if (opts.json) {
        console.log(JSON.stringify({ valid: false, error: parsed.error }));
      } else {
        console.log(`  ${ICONS.error} ${chalk.red(parsed.error)}`);
      }
      process.exit(1);
    }

    const result = GuideMdSchema.safeParse(parsed.data);
    if (!result.success) {
      const error = "Cannot optimize a file with schema errors.";
      if (opts.json) {
        console.log(JSON.stringify({ valid: false, error }));
      } else {
        console.log(`  ${ICONS.error} ${chalk.red(error)}`);
      }
      process.exit(1);
    }

    const suggestions = optimizeGuide(result.data, parsed.content);

    if (opts.json) {
      const jsonOutput = {
        valid: true,
        optimized: suggestions.length === 0,
        suggestions: suggestions.map(s => ({
          type: s.type,
          impact: s.impact,
          message: s.message,
          recommendation: s.recommendation,
        })),
        suggestionCount: suggestions.length,
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
      process.exit(suggestions.length > 0 ? 1 : 0);
      return;
    }

    if (suggestions.length === 0) {
      console.log(`  ${ICONS.success} ${chalk.green("Your GUIDE.md is already highly optimized!")}`);
      return;
    }

    console.log(chalk.bold(`Found ${suggestions.length} optimization opportunities:`));
    console.log(chalk.dim("─".repeat(50)));

    suggestions.forEach((s, i) => {
      const impactColor = s.impact === "high" ? chalk.red : s.impact === "medium" ? chalk.yellow : chalk.blue;
      console.log(`\n  ${chalk.bold(`${i + 1}. [${s.type.toUpperCase()}]`)}`);
      console.log(`     ${chalk.dim("Impact:")} ${impactColor(s.impact.toUpperCase())}`);
      console.log(`     ${chalk.dim("Issue:")} ${s.message}`);
      console.log(`     ${chalk.green("Recommendation:")} ${s.recommendation}`);
    });

    console.log("\n" + chalk.dim("Optimizing helps reduce token usage and keeps instructions clear for AI agents.\n"));
  });

// ── guidemd info ──────────────────────────────────────────────────────────────
interface InfoOptions {
  json?: boolean;
}

program
  .command("info [file]")
  .description("Display a high-level health report of the project's AI-readiness")
  .option("--json", "Output results as JSON (for CI/tooling integration)")
  .action((file: string = "GUIDE.md", opts: InfoOptions) => {
    if (!opts.json) {
      printBanner();
    }
    const targetFile = path.resolve(file);

    const parsed = parseGuideFile(targetFile);
    if (!parsed.success) {
      if (opts.json) {
        console.log(JSON.stringify({ valid: false, error: parsed.error }));
      } else {
        console.log(`  ${ICONS.error} ${chalk.red(parsed.error)}`);
      }
      process.exit(1);
    }

    const result = GuideMdSchema.safeParse(parsed.data);
    if (!result.success) {
      const error = "Cannot generate info for a file with schema errors.";
      if (opts.json) {
        console.log(JSON.stringify({ valid: false, error }));
      } else {
        console.log(`  ${ICONS.error} ${chalk.red(error)}`);
      }
      process.exit(1);
    }

    const report = generateHealthReport(result.data, parsed.content);

    if (opts.json) {
      const wordCount = parsed.content.split(/\s+/).filter((w: string) => w.length > 0).length;
      const jsonOutput = {
        valid: true,
        score: report.score,
        grade: report.score >= 90 ? "A" : report.score >= 80 ? "B" : report.score >= 70 ? "C" : "D",
        project: result.data.project,
        language: result.data.language,
        framework: result.data.framework,
        stats: {
          wordCount,
          tokenDensity: report.tokenDensity,
          syncStatus: report.syncStatus,
          sectionScore: report.sectionScore,
          guardrailCoverage: report.bestPractices.coverage,
        },
        sections: report.sectionCompleteness.map(s => ({
          name: s.name,
          present: s.present,
          wordCount: s.wordCount,
        })),
        suggestions: report.suggestions,
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
      return;
    }

    printDashboard(report);
  });

// ── guidemd diff ─────────────────────────────────────────────────────────────
program
  .command("diff [file]")
  .description("Compare two GUIDE.md files and show what changed (use --git to diff against HEAD)")
  .argument("[compare]", "File to compare against (or omit with --git flag)")
  .option("--git", "Diff against git HEAD instead of a file")
  .option("--breaking", "Only show changes that affect AI agent behavior")
  .option("--json", "Output as JSON instead of formatted text")
  .action(async (file: string = "GUIDE.md", compareFile: string | undefined, opts: DiffOptions & { git?: boolean; json?: boolean }) => {
    printBanner();
    const targetFile = path.resolve(file);

    try {
      let result;
      
      if (opts.git) {
        console.log(`  ${ICONS.info} Diffing ${chalk.underline(targetFile)} against ${chalk.cyan("git HEAD")}\n`);
        result = await diffGit(targetFile, { breaking: opts.breaking });
      } else if (compareFile) {
        const comparePath = path.resolve(compareFile);
        console.log(`  ${ICONS.info} Diffing ${chalk.underline(targetFile)} against ${chalk.underline(comparePath)}\n`);
        result = diffGuides(comparePath, targetFile, { breaking: opts.breaking });
      } else {
        console.log(`  ${ICONS.error} ${chalk.red("Either provide a file to compare or use --git flag")}`);
        process.exit(1);
      }

      if (opts.json) {
        console.log(formatDiffJson(result));
      } else {
        console.log(formatDiff(result));
      }

      process.exit(result.breaking ? 1 : 0);
    } catch (error) {
      console.log(`  ${ICONS.error} ${chalk.red(`Diff failed: ${error}`)}`);
      process.exit(1);
    }
  });

// ── guidemd watch ─────────────────────────────────────────────────────────────
interface WatchOptions {
  skipSecretScan?: boolean;
}

program
  .command("watch [file]")
  .description("Watch mode: re-run lint on every save of GUIDE.md")
  .option("--skip-secret-scan", "Skip scanning for secrets (not recommended)")
  .action(async (file: string = "GUIDE.md", opts: WatchOptions) => {
    await watchGuideFile(file, opts.skipSecretScan);
  });

// ── guidemd install-hooks ─────────────────────────────────────────────────────
interface InstallHooksOptions {
  manager?: HookManager;
  uninstall?: boolean;
}

program
  .command("install-hooks")
  .description("Install a git pre-commit hook to keep GUIDE.md in sync (The Guardian)")
  .option("-m, --manager <type>", "Hook manager: husky, raw, or auto (default: auto)", "auto")
  .option("--uninstall", "Remove the Guardian hook")
  .action((opts: InstallHooksOptions) => {
    printBanner();
    
    const manager = opts.manager || "auto";
    
    if (opts.uninstall) {
      console.log(`  ${ICONS.guardian} Removing Guardian hook...\n`);
      const result = uninstallHook(manager);
      
      if (result.success) {
        console.log(`  ${ICONS.success} ${chalk.green(result.message)}`);
      } else {
        console.log(`  ${ICONS.warning} ${chalk.yellow(result.message)}`);
      }
      return;
    }

    console.log(`  ${ICONS.guardian} Installing Guardian (Git hook)...\n`);
    
    const detected = detectHookManager();
    console.log(`  ${ICONS.info} Detected hook manager: ${chalk.cyan(detected)}`);
    
    const result = installHook(manager);
    
    if (result.success) {
      console.log(`  ${ICONS.success} ${chalk.green(result.message)}`);
      console.log(`  ${ICONS.info} Hook path: ${chalk.dim(result.hookPath)}`);
      console.log(chalk.dim(`
The Guardian will now:
  • Run "guidemd lint --sync" before every commit
  • Auto-stage GUIDE.md if it was updated during sync
  • Block commits if GUIDE.md has validation errors
`));
    } else {
      console.log(`  ${ICONS.error} ${chalk.red(result.message)}`);
      process.exit(1);
    }
  });

// ── guidemd serve (MCP) ────────────────────────────────────────────────────────
interface ServeOptions {
  port?: string;
}

program
  .command("serve [file]")
  .description("Launch a local MCP server to expose GUIDE.md as structured Tools and Resources")
  .action((file: string = "GUIDE.md") => {
    const targetFile = path.resolve(file);
    
    // Redirect all UI output to stderr so stdout remains clean for JSON-RPC
    const log = (msg: string) => process.stderr.write(msg + "\n");

    const banner = chalk.bold.cyan("\n╔═══════════════════════════╗\n") +
                   chalk.bold.cyan("  ║     GUIDE.md  Linter      ║\n") +
                   chalk.bold.cyan("  ║  AI Context Interface     ║\n") +
                   chalk.bold.cyan("  ╚═══════════════════════════╝\n");
    
    log(banner);

    const parsed = parseGuideFile(targetFile);
    if (!parsed.success) {
      log(`  ${ICONS.error} ${chalk.red(parsed.error)}`);
      process.exit(1);
    }

    const schemaResult = GuideMdSchema.safeParse(parsed.data);
    if (!schemaResult.success) {
      log(`  ${ICONS.error} ${chalk.red("Cannot serve a file with schema errors. Run 'guidemd lint' first.")}`);
      process.exit(1);
    }

    log(`  ${ICONS.mcp} Starting local MCP server...\n`);
    log(`  ${ICONS.info} Exposing: ${chalk.underline(targetFile)}`);
    log(`  ${ICONS.info} Protocol: JSON-RPC 2.0 (stdio)`);
    log(`  ${ICONS.info} Tools: ${chalk.cyan("get_context, get_naming_conventions, get_architecture, get_guardrails, get_testing_requirements, get_runtime_info")}`);
    log(`  ${ICONS.info} Resources: ${chalk.cyan("guidemd://frontmatter, guidemd://overview, guidemd://domain, guidemd://decisions, guidemd://antipatterns")}`);
    log(chalk.dim("\n  Listening for requests from Claude Desktop, Cursor, etc.\n"));

    const projectRoot = path.dirname(targetFile);
    const server = new McpServer(schemaResult.data, parsed.content, projectRoot);
    server.start();
  });

// ── guidemd generate-readme ───────────────────────────────────────────────────
interface GenerateReadmeOptions {
  template?: string;
  dryRun?: boolean;
  badge?: boolean;
}

program
  .command("generate-readme [file]")
  .description("Generate a human-friendly README.md from your GUIDE.md frontmatter with optional AI-Readiness badge")
  .option("-t, --template <path>", "Use a custom Handlebars-like template file")
  .option("--dry-run", "Print to stdout instead of writing README.md")
  .option("--badge", "Inject dynamically generated AI-Readiness badge from doctor score", true)
  .action(async (file: string = "GUIDE.md", opts: GenerateReadmeOptions) => {
    printBanner();
    const targetFile = path.resolve(file);

    console.log(`  ${ICONS.readme} Generating README from ${chalk.underline(targetFile)}\n`);

    const parsed = parseGuideFile(targetFile);
    if (!parsed.success) {
      console.log(`  ${ICONS.error} ${chalk.red(parsed.error)}`);
      process.exit(1);
    }

    const schemaResult = GuideMdSchema.safeParse(parsed.data);
    if (!schemaResult.success) {
      console.log(`  ${ICONS.error} ${chalk.red("Cannot generate README from a file with schema errors. Run 'guidemd lint' first.")}`);
      process.exit(1);
    }

    // Calculate AI-Readiness grade from health report
    let grade = "C";
    if (opts.badge !== false) {
      const healthReport = generateHealthReport(schemaResult.data, parsed.content);
      grade = healthReport.score >= 90 ? "A" : healthReport.score >= 80 ? "B" : healthReport.score >= 70 ? "C" : healthReport.score >= 60 ? "D" : "F";
      console.log(`  ${ICONS.info} AI-Readiness Grade: ${chalk.bold(grade)} (${healthReport.score}/100)\n`);
    }

    const result = generateReadme(schemaResult.data, parsed.content, opts.template, opts.badge !== false ? grade : undefined);
    if (!result.success) {
      console.log(`  ${ICONS.error} ${chalk.red(result.error)}`);
      process.exit(1);
    }

    if (opts.dryRun) {
      console.log(result.content);
      return;
    }

    const readmePath = path.join(path.dirname(targetFile), "README.md");
    fs.writeFileSync(readmePath, result.content, "utf-8");
    console.log(`  ${ICONS.success} ${chalk.green("Created")} ${chalk.underline(readmePath)}`);
    if (opts.badge !== false) {
      console.log(`  ${ICONS.success} ${chalk.green("Injected AI-Readiness Badge:")} Grade ${chalk.bold(grade)}`);
    }
    console.log(chalk.dim(`\nThis README was auto-generated from your GUIDE.md. Re-run with ${chalk.cyan("--dry-run")} to preview changes.\n`));
  });

// ── guidemd add <module> ─────────────────────────────────────────────────────
interface AddOptions {
  force?: boolean;
}

program
  .command("add <module>")
  .description("Add a reusable Guide Module to your GUIDE.md (e.g., 'nextjs-security')")
  .option("--force", "Overwrite conflicting fields instead of skipping")
  .action(async (moduleName: string, opts: AddOptions) => {
    printBanner();

    console.log(`  ${ICONS.registry} Adding module: ${chalk.bold(moduleName)}\n`);

    // First, parse existing GUIDE.md
    const guidePath = path.resolve("GUIDE.md");
    const parsed = parseGuideFile(guidePath);
    if (!parsed.success) {
      console.log(`  ${ICONS.error} ${chalk.red(parsed.error)}`);
      process.exit(1);
    }

    // Validate current frontmatter
    const schemaResult = GuideMdSchema.safeParse(parsed.data);
    if (!schemaResult.success) {
      console.log(`  ${ICONS.error} ${chalk.red("Cannot add modules to a file with schema errors. Run 'guidemd lint' first.")}`);
      process.exit(1);
    }

    // Fetch module info first (for display)
    const info = await getModuleInfo(moduleName);
    if (!info.success || !info.module) {
      console.log(`  ${ICONS.error} ${chalk.red(info.error || `Module "${moduleName}" not found.`)}`);
      console.log(chalk.dim(`\nTry 'guidemd registry list' to see available modules.\n`));
      process.exit(1);
    }

    if (info.module.description) {
      console.log(`  ${ICONS.info} ${chalk.cyan(info.module.description)}\n`);
    }

    // Merge module into existing data
    const addResult = await addModule(parsed.data, moduleName, opts.force ?? false);

    if (!addResult.success) {
      console.log(`  ${ICONS.error} ${chalk.red(addResult.error)}`);
      process.exit(1);
    }

    // Validate merged data
    const mergedSchemaResult = GuideMdSchema.safeParse(addResult.mergedData);
    if (!mergedSchemaResult.success) {
      console.log(`  ${ICONS.error} ${chalk.red("Module merged into invalid state. The module may conflict with your existing frontmatter.")}`);
      const errors = mergedSchemaResult.error.errors.map((e) => `    ${e.path.join(".")}: ${e.message}`);
      console.log(chalk.red(errors.join("\n")));
      process.exit(1);
    }

    // Write updated GUIDE.md
    const originalContent = fs.readFileSync(guidePath, "utf-8");
    const matterParsed = matter(originalContent);
    const newContent = matter.stringify(matterParsed.content, addResult.mergedData);
    fs.writeFileSync(guidePath, newContent, "utf-8");

    console.log(`  ${ICONS.success} ${chalk.green("Module added successfully!")}`);

    if (addResult.conflicts.length > 0) {
      console.log(chalk.yellow(`\n  ${ICONS.warning} ${addResult.conflicts.length} conflict(s) resolved:`));
      addResult.conflicts.forEach((c) => {
        const color = c.resolution === "overwritten" ? chalk.red : c.resolution === "merged" ? chalk.blue : chalk.yellow;
        console.log(`    ${color("•")} ${c.field}: ${color(c.resolution)}`);
      });
    }

    console.log(chalk.dim(`\nRun 'guidemd lint' to verify the merged frontmatter is valid.\n`));
  });

// ── guidemd registry ──────────────────────────────────────────────────────────
program
  .command("registry")
  .description("Manage reusable Guide Modules (Context Hub)")
  .addCommand(
    program
      .createCommand("list")
      .description("List available modules in the registry")
      .action(async () => {
        printBanner();
        console.log(`  ${ICONS.registry} Fetching available modules...\n`);

        const result = await listModules();
        if (!result.success || result.modules.length === 0) {
          console.log(`  ${ICONS.warning} ${chalk.yellow("No modules found in registry.")}`);
          console.log(chalk.dim(`\nThe registry may be empty, or the GitHub source (guidemd/registry) is unavailable.\n`));
          return;
        }

        console.log(chalk.bold.cyan(`  Found ${result.modules.length} module(s):\n`));
        result.modules.forEach((m) => {
          console.log(`  ${chalk.bold(m.name)}`);
          if (m.description) console.log(`    ${chalk.dim(m.description)}`);
          if (m.tags.length > 0) console.log(`    ${chalk.dim("Tags:")} ${m.tags.join(", ")}`);
          console.log();
        });
      })
  )
  .addCommand(
    program
      .createCommand("search <query>")
      .description("Search modules by keyword")
      .action(async (query: string) => {
        printBanner();
        console.log(`  ${ICONS.registry} Searching for "${chalk.cyan(query)}"...\n`);

        const result = await searchModules(query);
        if (!result.success || result.modules.length === 0) {
          console.log(`  ${ICONS.warning} ${chalk.yellow(`No modules matching "${query}" found.`)}`);
          return;
        }

        console.log(chalk.bold.cyan(`  Found ${result.modules.length} result(s):\n`));
        result.modules.forEach((m) => {
          console.log(`  ${chalk.bold(m.name)}`);
          if (m.description) console.log(`    ${chalk.dim(m.description)}`);
          console.log();
        });
      })
  )
  .addCommand(
    program
      .createCommand("info <module>")
      .description("Show details about a specific module")
      .action(async (moduleName: string) => {
        printBanner();
        console.log(`  ${ICONS.registry} Fetching info for ${chalk.bold(moduleName)}...\n`);

        const info = await getModuleInfo(moduleName);
        if (!info.success || !info.module) {
          console.log(`  ${ICONS.error} ${chalk.red(info.error || `Module "${moduleName}" not found.`)}`);
          process.exit(1);
        }

        const m = info.module;
        console.log(chalk.bold.cyan(`  ${m.name}\n`));
        if (m.description) console.log(`  ${chalk.dim("Description:")} ${m.description}`);
        if (m.version) console.log(`  ${chalk.dim("Version:")} ${m.version}`);
        if (m.tags && m.tags.length > 0) console.log(`  ${chalk.dim("Tags:")} ${m.tags.join(", ")}`);
        console.log(`\n  ${chalk.dim("Content:")}`);
        console.log(chalk.dim(JSON.stringify(m.content, null, 2).split("\n").map((l) => "  " + l).join("\n")));
        console.log();
      })
  );

// ── guidemd generate-docs ─────────────────────────────────────────────────────
program
  .command("generate-docs")
  .description("Regenerate documentation site from the live Zod schema")
  .option("-o, --out <dir>", "Output directory for generated docs", "docs")
  .action((opts: { out: string }) => {
    printBanner();
    console.log(`  ${ICONS.info} Generating documentation from schema...\n`);

    const outDir = path.resolve(opts.out);
    
    // Ensure docs directory exists
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Generate spec.html from schema
    const specHtml = generateSpecHtml();
    const specPath = path.join(outDir, "spec.html");
    fs.writeFileSync(specPath, specHtml, "utf-8");
    console.log(`  ${ICONS.success} ${chalk.green("Generated")} ${chalk.underline(specPath)}`);

    console.log(chalk.dim(`
Documentation generated successfully!
The spec.html file now reflects the current Zod schema.
`));
  });

function generateSpecHtml(): string {
  const jsonSchema = zodToJsonSchema(GuideMdSchema, { target: "jsonSchema7" }) as {
    required?: string[];
    properties?: Record<string, {
      type?: string;
      description?: string;
      default?: unknown;
      anyOf?: Array<{ description?: string }>;
    }>;
  };

  const requiredFieldsSet = new Set(jsonSchema.required ?? []);
  const properties = jsonSchema.properties ?? {};
  const requiredFields: string[] = [];
  const optionalFields: string[] = [];

  for (const field of Object.keys(properties)) {
    if (requiredFieldsSet.has(field)) {
      requiredFields.push(field);
    } else {
      optionalFields.push(field);
    }
  }

  const generateFieldDoc = (field: string) => {
    const prop = properties[field];
    if (!prop) return "";

    const type = prop.type ?? "any";
    const description = prop.description ?? "";
    const defaultValue = prop.default ?? null;

    return `
    <div class="field-card">
      <div class="field-header">
        <span class="field-name">${field}</span>
        <span class="badge badge-${requiredFieldsSet.has(field) ? "required" : "optional"}">${requiredFieldsSet.has(field) ? "Required" : "Optional"}</span>
        <span class="badge badge-type">${type}</span>
      </div>
      ${description ? `<div class="field-description">${description}</div>` : ""}
      ${defaultValue !== null ? `<div class="field-default">Default: ${JSON.stringify(defaultValue)}</div>` : ""}
    </div>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GUIDE.md Specification (Generated)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6; color: #333; background: #f8fafc;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 0 20px; }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; padding: 60px 0; text-align: center;
    }
    header h1 { font-size: 2.5rem; margin-bottom: 10px; }
    header p { opacity: 0.9; font-size: 1.2rem; }
    main {
      background: white; margin: 40px auto; padding: 60px;
      border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    h2 {
      font-size: 1.8rem; margin: 40px 0 20px; color: #1a202c;
      border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;
    }
    .field-card {
      background: #f8fafc; border: 1px solid #e2e8f0;
      border-radius: 8px; padding: 20px; margin: 15px 0;
    }
    .field-header {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 10px; flex-wrap: wrap;
    }
    .field-name {
      font-family: 'Fira Code', monospace;
      font-size: 1.1rem; font-weight: 600; color: #1a202c;
    }
    .badge {
      font-size: 0.75rem; padding: 3px 10px;
      border-radius: 20px; font-weight: 600; text-transform: uppercase;
    }
    .badge-required { background: #fef3c7; color: #92400e; }
    .badge-optional { background: #e0e7ff; color: #3730a3; }
    .badge-type { background: #dbeafe; color: #1e40af; }
    .field-description { color: #475569; margin-top: 10px; }
    .field-default { color: #64748b; font-size: 0.9rem; font-style: italic; }
    code {
      font-family: 'Fira Code', monospace; background: #f1f5f9;
      padding: 2px 6px; border-radius: 4px; font-size: 0.9em;
    }
    footer {
      background: #0f172a; color: #94a3b8;
      padding: 40px 0; text-align: center; margin-top: 60px;
    }
    .generated-notice {
      background: #eff6ff; border: 1px solid #3b82f6;
      color: #1e40af; padding: 12px 20px;
      border-radius: 8px; margin-bottom: 30px;
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>GUIDE.md Specification</h1>
      <p>Generated from live Zod schema</p>
    </div>
  </header>

  <main class="container">
    <div class="generated-notice">
      <strong>Auto-Generated</strong> — This documentation was generated from the live Zod schema 
      on ${new Date().toISOString().split('T')[0]}.
    </div>

    <h2>Required Fields</h2>
    ${requiredFields.map(generateFieldDoc).join("")}

    <h2>Optional Fields</h2>
    ${optionalFields.map(generateFieldDoc).join("")}
  </main>

  <footer>
    <div class="container">
      <p>Generated by <code>guidemd generate-docs</code></p>
    </div>
  </footer>
</body>
</html>`;
}

program.parse();
