import fs from "node:fs";
import path from "node:path";
import { GuideMdFrontmatter } from "../schema/index.js";

export interface VerificationResult {
  valid: boolean;
  score: number;
  canReconstruct: {
    dependencyTree: boolean;
    buildScripts: boolean;
    entryPoints: boolean;
    architecture: boolean;
  };
  findings: VerificationFinding[];
  recommendations: string[];
  stats: {
    requiredFieldsPresent: number;
    totalRequiredFields: number;
    criticalSectionsPresent: number;
    totalCriticalSections: number;
  };
}

export interface VerificationFinding {
  type: "critical" | "warning" | "info";
  category: "dependency" | "build" | "entry" | "architecture" | "general";
  message: string;
  recommendation: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
}

/**
 * Simulates a "Cold Start" for an AI agent.
 * Verifies that GUIDE.md provides enough context to reconstruct the project's
 * dependency tree and build scripts without any other documentation.
 */
export async function runColdStartVerification(
  data: GuideMdFrontmatter,
  content: string,
  projectRoot: string = process.cwd()
): Promise<VerificationResult> {
  const findings: VerificationFinding[] = [];
  const recommendations: string[] = [];
  const canReconstruct = {
    dependencyTree: false,
    buildScripts: false,
    entryPoints: false,
    architecture: false,
  };

  // Load package.json if it exists
  const packageJson = loadPackageJson(projectRoot);

  // 1. Verify Dependency Tree Reconstructability
  const depResult = verifyDependencyTree(data, packageJson);
  canReconstruct.dependencyTree = depResult.sufficient;
  findings.push(...depResult.findings);

  // 2. Verify Build Scripts Reconstructability
  const buildResult = verifyBuildScripts(data, packageJson, projectRoot);
  canReconstruct.buildScripts = buildResult.sufficient;
  findings.push(...buildResult.findings);

  // 3. Verify Entry Points
  const entryResult = verifyEntryPoints(data, projectRoot);
  canReconstruct.entryPoints = entryResult.sufficient;
  findings.push(...entryResult.findings);

  // 4. Verify Architecture Documentation
  const archResult = verifyArchitecture(data, content);
  canReconstruct.architecture = archResult.sufficient;
  findings.push(...archResult.findings);

  // Calculate score based on reconstruction capability
  const score = calculateVerificationScore(canReconstruct, findings);

  // Generate recommendations based on findings
  for (const finding of findings.filter(f => f.type === "critical" || f.type === "warning")) {
    recommendations.push(finding.recommendation);
  }

  // Count stats
  const requiredFields = ["project", "language", "runtime", "description"];
  const requiredFieldsPresent = requiredFields.filter(f => {
    const val = (data as any)[f];
    return val !== undefined && val !== "" && val !== null;
  }).length;

  const criticalSections = ["Project Overview", "Domain Vocabulary"];
  const criticalSectionsPresent = criticalSections.filter(section => 
    hasSection(content, section)
  ).length;

  return {
    valid: score >= 70,
    score,
    canReconstruct,
    findings,
    recommendations: [...new Set(recommendations)],
    stats: {
      requiredFieldsPresent,
      totalRequiredFields: requiredFields.length,
      criticalSectionsPresent,
      totalCriticalSections: criticalSections.length,
    },
  };
}

function loadPackageJson(projectRoot: string): PackageJson | null {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
}

interface VerificationCategoryResult {
  sufficient: boolean;
  findings: VerificationFinding[];
}

function verifyDependencyTree(
  data: GuideMdFrontmatter,
  pkg: PackageJson | null
): VerificationCategoryResult {
  const findings: VerificationFinding[] = [];
  let sufficient = false;

  // Check if framework is documented
  const frameworks = Array.isArray(data.framework) ? data.framework : data.framework ? [data.framework] : [];
  
  if (frameworks.length === 0) {
    findings.push({
      type: "warning",
      category: "dependency",
      message: "No framework specified in GUIDE.md",
      recommendation: "Add 'framework' field to help AI understand project dependencies",
    });
  } else if (pkg) {
    // Verify frameworks match package.json dependencies
    for (const fw of frameworks) {
      const fwName = fw.split("@")[0]!;
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const hasDep = Object.keys(allDeps).some(key => 
        key.toLowerCase().includes(fwName.toLowerCase()) || 
        fwName.toLowerCase().includes(key.toLowerCase().replace(/^@[^/]+\//, ""))
      );
      
      if (!hasDep) {
        findings.push({
          type: "warning",
          category: "dependency",
          message: `Framework '${fw}' declared but not found in package.json dependencies`,
          recommendation: `Verify '${fw}' is correct or add it to dependencies`,
        });
      }
    }
  }

  // Check runtime specification
  if (!data.runtime) {
    findings.push({
      type: "critical",
      category: "dependency",
      message: "Runtime not specified in GUIDE.md",
      recommendation: "Add 'runtime' field (e.g., 'node@20', 'deno@1.40', 'bun@1.0')",
    });
  } else if (pkg?.engines) {
    // Validate runtime against engines
    const runtimeMatch = data.runtime.match(/(node|deno|bun)@(\d+)/);
    if (runtimeMatch && runtimeMatch[1]) {
      const runtime = runtimeMatch[1];
      const version = runtimeMatch[2];
      const engineVersion = runtime ? pkg.engines[runtime] : undefined;
      if (engineVersion && version && !engineVersion.includes(version)) {
        findings.push({
          type: "warning",
          category: "dependency",
          message: `Runtime version mismatch: GUIDE.md says ${data.runtime}, but package.json engines specifies '${engineVersion}'`,
          recommendation: `Align GUIDE.md runtime with package.json engines`,
        });
      }
    }
  }

  sufficient = frameworks.length > 0 && !!data.runtime && !!data.language;

  return { sufficient, findings };
}

function verifyBuildScripts(
  data: GuideMdFrontmatter,
  pkg: PackageJson | null,
  projectRoot: string
): VerificationCategoryResult {
  const findings: VerificationFinding[] = [];
  let sufficient = false;

  // Check for common build script indicators
  const hasBuildScript = pkg?.scripts && (
    pkg.scripts.build || 
    pkg.scripts.compile || 
    pkg.scripts["build:prod"]
  );

  if (!hasBuildScript) {
    findings.push({
      type: "info",
      category: "build",
      message: "No build scripts detected in package.json",
      recommendation: "If this is a compiled project, add build scripts to package.json",
    });
  }

  // Check for task runner configs (alternative build systems)
  const taskFiles = ["Makefile", "justfile", "Taskfile.yml", "gulpfile.js", "Gruntfile.js"];
  const hasTaskRunner = taskFiles.some(f => fs.existsSync(path.join(projectRoot, f)));

  // Look for build documentation in content
  const buildMentioned = data.context?.entry_points?.some(ep => 
    ep.toLowerCase().includes("build") || ep.toLowerCase().includes("dist")
  );

  if (!buildMentioned && hasBuildScript) {
    findings.push({
      type: "warning",
      category: "build",
      message: "Build scripts exist but no build entry points documented",
      recommendation: "Document build output directories in context.entry_points",
    });
  }

  sufficient = true; // Build scripts are optional for many projects

  return { sufficient, findings };
}

function verifyEntryPoints(
  data: GuideMdFrontmatter,
  projectRoot: string
): VerificationCategoryResult {
  const findings: VerificationFinding[] = [];
  let sufficient = false;

  const entryPoints = data.context?.entry_points || [];

  if (entryPoints.length === 0) {
    findings.push({
      type: "critical",
      category: "entry",
      message: "No entry points defined in GUIDE.md",
      recommendation: "Add 'context.entry_points' to help AI understand where to start",
    });
  } else {
    // Verify entry points exist
    for (const ep of entryPoints) {
      const epPath = path.join(projectRoot, ep);
      if (!fs.existsSync(epPath)) {
        findings.push({
          type: "critical",
          category: "entry",
          message: `Entry point '${ep}' does not exist in filesystem`,
          recommendation: `Create '${ep}' or update GUIDE.md with correct entry point`,
        });
      }
    }

    // Check if at least one entry point exists
    const existingEntries = entryPoints.filter(ep => 
      fs.existsSync(path.join(projectRoot, ep))
    );

    sufficient = existingEntries.length > 0;
  }

  return { sufficient, findings };
}

function verifyArchitecture(
  data: GuideMdFrontmatter,
  content: string
): VerificationCategoryResult {
  const findings: VerificationFinding[] = [];
  let sufficient = false;

  // Check architecture pattern
  if (!data.context?.architecture_pattern) {
    findings.push({
      type: "warning",
      category: "architecture",
      message: "No architecture pattern specified",
      recommendation: "Add 'context.architecture_pattern' (e.g., 'layered', 'clean', 'mvc')",
    });
  }

  // Check for critical sections
  const requiredSections = ["Project Overview", "Domain Vocabulary"];
  for (const section of requiredSections) {
    if (!hasSection(content, section)) {
      findings.push({
        type: "warning",
        category: "architecture",
        message: `Missing '${section}' section in GUIDE.md content`,
        recommendation: `Add '## ${section}' section to provide domain context`,
      });
    }
  }

  sufficient = hasSection(content, "Project Overview");

  return { sufficient, findings };
}

function hasSection(content: string, sectionName: string): boolean {
  const lines = content.split("\n");
  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      const headerText = headerMatch[2]!.trim();
      if (headerText.toLowerCase() === sectionName.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

function calculateVerificationScore(
  canReconstruct: { dependencyTree: boolean; buildScripts: boolean; entryPoints: boolean; architecture: boolean },
  findings: VerificationFinding[]
): number {
  let score = 0;

  // Base scores for each capability
  if (canReconstruct.dependencyTree) score += 30;
  if (canReconstruct.entryPoints) score += 30;
  if (canReconstruct.architecture) score += 25;
  if (canReconstruct.buildScripts) score += 15;

  // Deductions for critical issues
  const criticalCount = findings.filter(f => f.type === "critical").length;
  score -= criticalCount * 15;

  // Deductions for warnings
  const warningCount = findings.filter(f => f.type === "warning").length;
  score -= warningCount * 5;

  return Math.max(0, Math.min(100, score));
}
