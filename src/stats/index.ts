import fs from "node:fs";
import path from "node:path";

export interface ContextDensityReport {
  guideSize: number;
  totalRepoSize: number;
  densityScore: number;
  efficiency: "efficient" | "balanced" | "verbose" | "sparse";
  breakdown: {
    sourceCodeSize: number;
    documentationSize: number;
    configSize: number;
    otherSize: number;
  };
  recommendations: string[];
}

interface SizeBreakdown {
  sourceCodeSize: number;
  documentationSize: number;
  configSize: number;
  otherSize: number;
}

/**
 * Calculates the Context Density Score comparing GUIDE.md size to total repository size.
 * Helps users understand if they are over-providing or under-providing context.
 */
export function calculateContextDensity(
  guidePath: string,
  projectRoot: string = process.cwd()
): ContextDensityReport {
  const guideSize = fs.statSync(guidePath).size;
  const breakdown = calculateSizeBreakdown(projectRoot, guidePath);
  const totalRepoSize = Object.values(breakdown).reduce((a, b) => a + b, 0);

  // Calculate density score as percentage
  // A well-balanced GUIDE.md should be ~0.1% to 1% of total repo size
  const densityScore = totalRepoSize > 0 ? (guideSize / totalRepoSize) * 100 : 0;

  // Determine efficiency rating
  let efficiency: ContextDensityReport["efficiency"];
  if (densityScore < 0.01) {
    efficiency = "sparse"; // Less than 0.01% - probably too little context
  } else if (densityScore > 5) {
    efficiency = "verbose"; // More than 5% - probably too much context
  } else if (densityScore >= 0.1 && densityScore <= 1) {
    efficiency = "efficient"; // Sweet spot
  } else {
    efficiency = "balanced"; // Acceptable range
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (efficiency === "sparse") {
    recommendations.push(`GUIDE.md is only ${formatBytes(guideSize)} (${densityScore.toFixed(3)}% of repo). Consider adding more context.`);
  } else if (efficiency === "verbose") {
    recommendations.push(`GUIDE.md is ${densityScore.toFixed(2)}% of total repo size. Consider trimming content.`);
  }

  const sourceRatio = totalRepoSize > 0 ? (breakdown.sourceCodeSize / totalRepoSize) * 100 : 0;
  if (sourceRatio < 50 && totalRepoSize > 100000) {
    recommendations.push("Source code appears to be less than 50% of the repository. Check for large binary files.");
  }

  if (breakdown.documentationSize > guideSize * 5) {
    recommendations.push("Other documentation is significantly larger than GUIDE.md. Consider migrating relevant info to GUIDE.md.");
  }

  return {
    guideSize,
    totalRepoSize,
    densityScore,
    efficiency,
    breakdown,
    recommendations,
  };
}

function calculateSizeBreakdown(projectRoot: string, guidePath: string): SizeBreakdown {
  const result: SizeBreakdown = {
    sourceCodeSize: 0,
    documentationSize: 0,
    configSize: 0,
    otherSize: 0,
  };

  const sourceExtensions = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".rb", ".go", ".rs", ".java", ".kt",
    ".php", ".cs", ".cpp", ".c", ".h", ".hpp",
    ".swift", ".scala", ".clj", ".erl", ".ex",
    ".elm", ".hs", ".lhs", ".lua", ".r", ".sh",
  ]);

  const docExtensions = new Set([
    ".md", ".mdx", ".rst", ".txt", ".adoc",
  ]);

  const configFiles = new Set([
    "package.json", "tsconfig.json", ".eslintrc", ".eslintrc.json",
    ".prettierrc", ".gitignore", "Makefile", "dockerfile",
    ".dockerignore", "yarn.lock", "package-lock.json", "pnpm-lock.yaml",
    "Cargo.toml", "Cargo.lock", "pyproject.toml", "requirements.txt",
    "setup.py", "go.mod", "go.sum", "Gemfile", "Gemfile.lock",
    "pom.xml", "build.gradle", "composer.json", "composer.lock",
  ]);

  const configExtensions = new Set([
    ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg",
  ]);

  function walkDir(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip certain directories
        if (entry.isDirectory()) {
          if (shouldSkipDir(entry.name)) continue;
          walkDir(fullPath);
        } else {
          const size = getFileSize(fullPath);
          if (fullPath === guidePath) continue; // Don't count GUIDE.md in breakdown

          const ext = path.extname(entry.name).toLowerCase();
          const baseName = entry.name.toLowerCase();

          if (sourceExtensions.has(ext)) {
            result.sourceCodeSize += size;
          } else if (docExtensions.has(ext)) {
            result.documentationSize += size;
          } else if (configExtensions.has(ext) || configFiles.has(baseName)) {
            result.configSize += size;
          } else {
            result.otherSize += size;
          }
        }
      }
    } catch {
      // Ignore errors (permission denied, etc.)
    }
  }

  walkDir(projectRoot);
  return result;
}

function shouldSkipDir(name: string): boolean {
  const skipDirs = new Set([
    "node_modules", ".git", "dist", "build", "out",
    ".next", ".nuxt", "coverage", ".coverage", "__pycache__",
    ".tox", ".venv", "venv", "env", ".env", "target",
    "bin", "obj", "Debug", "Release", ".idea", ".vscode",
    ".vs", "vendor", "Pods", ".gradle", "build-cache",
  ]);
  return skipDirs.has(name.toLowerCase());
}

function getFileSize(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Formats the Context Density Report for CLI display.
 */
export function formatDensityReport(report: ContextDensityReport): string {
  const lines: string[] = [];

  lines.push(`  Context Density Score: ${report.densityScore.toFixed(3)}%`);
  lines.push(`  Efficiency Rating: ${report.efficiency.toUpperCase()}`);
  lines.push("");
  lines.push(`  GUIDE.md Size: ${formatBytes(report.guideSize)}`);
  lines.push(`  Total Repository Size: ${formatBytes(report.totalRepoSize)}`);
  lines.push("");
  lines.push("  Breakdown:");
  lines.push(`    • Source Code: ${formatBytes(report.breakdown.sourceCodeSize)}`);
  lines.push(`    • Documentation: ${formatBytes(report.breakdown.documentationSize)}`);
  lines.push(`    • Configuration: ${formatBytes(report.breakdown.configSize)}`);
  lines.push(`    • Other: ${formatBytes(report.breakdown.otherSize)}`);

  if (report.recommendations.length > 0) {
    lines.push("");
    lines.push("  Recommendations:");
    report.recommendations.forEach((rec, i) => {
      lines.push(`    ${i + 1}. ${rec}`);
    });
  }

  return lines.join("\n");
}

/**
 * Returns a short summary of the density score for badge/tooltip use.
 */
export function getDensitySummary(report: ContextDensityReport): string {
  const emoji = {
    efficient: "✨",
    balanced: "✓",
    verbose: "⚠",
    sparse: "ℹ",
  };

  return `${emoji[report.efficiency]} ${report.densityScore.toFixed(2)}% context density (${report.efficiency})`;
}
