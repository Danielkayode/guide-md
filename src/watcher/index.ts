import chokidar from "chokidar";
import chalk from "chalk";
import path from "node:path";
import { lintGuideFile, LintResult } from "../linter/index.js";
import { GuideMdSchema } from "../schema/index.js";
import { parseGuideFile } from "../parser/index.js";
import { resolveInheritance } from "../parser/resolver.js";
import { detectDrift } from "../linter/sync.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatchOptions {
  file: string;
  skipSecretScan?: boolean | undefined;
}

export interface WatchResult {
  valid: boolean;
  timestamp: Date;
  diagnostics: { errors: number; warnings: number };
  drifts?: number | undefined;
}

// ─── Icons ──────────────────────────────────────────────────────────────────────

const ICONS = {
  success: chalk.green("✔"),
  error: chalk.red("✖"),
  warning: chalk.yellow("⚠"),
  info: chalk.cyan("ℹ"),
  watch: chalk.blue("👁"),
  sync: chalk.blue("🔄"),
};

// ─── Formatting ─────────────────────────────────────────────────────────────────

function clearScreen(): void {
  // Clear terminal and move cursor to top-left
  process.stdout.write("\x1B[2J\x1B[0f");
}

function printHeader(filePath: string): void {
  console.log(chalk.bold.cyan("╔════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║     GUIDE.md  Watch Mode                       ║"));
  console.log(chalk.bold.cyan("╚════════════════════════════════════════════════╝"));
  console.log(`\n  ${ICONS.watch} Watching: ${chalk.underline(filePath)}`);
  console.log(chalk.dim(`  ${ICONS.info} Press Ctrl+C to exit\n`));
}

function printTimestamp(): void {
  const now = new Date();
  const timeStr = now.toLocaleTimeString();
  console.log(chalk.gray(`\n[${timeStr}] Change detected, running lint...\n`));
}

function printResults(result: WatchResult, filePath: string): void {
  const statusIcon = result.valid ? ICONS.success : ICONS.error;
  const statusColor = result.valid ? chalk.green : chalk.red;
  
  console.log(statusColor(`  ${statusIcon} ${result.valid ? "GUIDE.md is valid" : "Validation failed"}`));
  
  if (result.diagnostics.errors > 0) {
    console.log(chalk.red(`     ${result.diagnostics.errors} error(s)`));
  }
  if (result.diagnostics.warnings > 0) {
    console.log(chalk.yellow(`     ${result.diagnostics.warnings} warning(s)`));
  }
  if (result.drifts && result.drifts > 0) {
    console.log(chalk.blue(`     ${ICONS.sync} ${result.drifts} drift(s) detected`));
  }
  
  if (result.valid && result.diagnostics.warnings === 0 && (!result.drifts || result.drifts === 0)) {
    console.log(chalk.green.bold("\n  ✓ GUIDE.md is valid\n"));
  }
}

// ─── Lint Runner ──────────────────────────────────────────────────────────────

/**
 * Runs the full lint + drift detection pipeline.
 */
async function runLint(filePath: string, skipSecretScan?: boolean): Promise<WatchResult> {
  const startTime = Date.now();
  
  // Run lint
  const lintResult = await lintGuideFile(filePath, { skipSecretScan });
  
  let drifts = 0;
  
  // Run drift detection if lint passed and we have valid data
  if (lintResult.valid && lintResult.data) {
    try {
      const driftResult = await detectDrift(lintResult.data, filePath);
      drifts = driftResult.length;
    } catch {
      // Ignore drift detection errors
    }
  }
  
  const errors = lintResult.diagnostics.filter(d => d.severity === "error").length;
  const warnings = lintResult.diagnostics.filter(d => d.severity === "warning").length;
  
  return {
    valid: errors === 0,
    timestamp: new Date(),
    diagnostics: { errors, warnings },
    drifts: drifts > 0 ? drifts : undefined,
  };
}

// ─── Main Watch Function ──────────────────────────────────────────────────────

export interface WatchHandle {
  stop: () => Promise<void>;
  onResult?: ((result: WatchResult) => void) | undefined;
}

/**
 * Starts watching a GUIDE.md file for changes and runs lint on every save.
 * 
 * @param options Watch options including file path and configuration
 * @param onResult Optional callback for programmatic consumption of results
 * @returns A handle with stop function for controlling the watcher
 */
export function startWatch(options: WatchOptions, onResult?: (result: WatchResult) => void): WatchHandle {
  const filePath = path.resolve(options.file);
  const fileDir = path.dirname(filePath);
  
  // Create watcher
  const watcher = chokidar.watch(filePath, {
    persistent: true,
    ignoreInitial: false, // Run on startup
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });
  
  let isRunning = false;
  
  // Handler for file changes
  const handleChange = async () => {
    if (isRunning) return; // Prevent concurrent runs
    isRunning = true;
    
    clearScreen();
    printHeader(filePath);
    printTimestamp();
    
    try {
      const result = await runLint(filePath, options.skipSecretScan);
      printResults(result, filePath);
      // Call the callback if provided for programmatic use
      onResult?.(result);
    } catch (error) {
      console.log(chalk.red(`  ${ICONS.error} Error running lint: ${error instanceof Error ? error.message : "Unknown error"}`));
    } finally {
      isRunning = false;
      console.log(chalk.dim("\n  Waiting for changes..."));
    }
  };
  
  // Set up event handlers
  watcher
    .on("change", handleChange)
    .on("add", handleChange)
    .on("error", (error: Error) => {
      console.error(chalk.red(`\n  ${ICONS.error} Watcher error: ${error.message}`));
    });
  
  // Handle Ctrl+C gracefully
  const gracefulShutdown = async () => {
    console.log(chalk.yellow("\n\n  Stopping watcher..."));
    await watcher.close();
    console.log(chalk.green(`  ${ICONS.success} Watcher stopped\n`));
    process.exit(0);
  };
  
  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
  
  return {
    stop: async () => {
      await watcher.close();
      process.removeListener("SIGINT", gracefulShutdown);
      process.removeListener("SIGTERM", gracefulShutdown);
    },
    onResult,
  };
}

/**
 * Runs watch mode for a GUIDE.md file.
 * This function returns a promise that resolves when the watcher is stopped.
 * 
 * @param filePath Path to the GUIDE.md file to watch
 * @param skipSecretScan Whether to skip secret scanning
 * @returns Promise that resolves when the watcher is stopped via Ctrl+C
 */
export async function watchGuideFile(filePath: string = "GUIDE.md", skipSecretScan?: boolean): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  
  // Verify file exists
  const parsed = parseGuideFile(resolvedPath);
  if (!parsed.success) {
    console.error(chalk.red(`\n  ${ICONS.error} ${parsed.error}`));
    process.exit(1);
  }
  
  // Create a promise that resolves when the watcher is stopped
  let resolvePromise: (() => void) | undefined;
  const stopPromise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  
  const handle = startWatch({ file: filePath, skipSecretScan });
  
  // Override the graceful shutdown to resolve our promise
  const originalStop = handle.stop;
  handle.stop = async () => {
    await originalStop();
    resolvePromise?.();
  };
  
  // Handle Ctrl+C to stop gracefully
  const gracefulShutdown = async () => {
    console.log(chalk.yellow("\n\n  Stopping watcher..."));
    await handle.stop();
    console.log(chalk.green(`  ${ICONS.success} Watcher stopped\n`));
    process.exit(0);
  };
  
  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
  
  return stopPromise;
}
