import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GuideMdFrontmatter } from "../schema/index.js";
import chalk from "chalk";

// ─── Load External Configuration ───────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "signatures.json");

interface SignatureConfig {
  signatures: Array<{
    name: string;
    type: "file" | "dependency";
    field: string;
    check: {
      configFiles?: string[];
      files?: string[];
      folders?: string[];
      packageKey?: "dependencies" | "devDependencies";
      packageName?: string;
    };
  }>;
  keywordMap: Record<string, string[]>;
}

function loadConfig(): SignatureConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(chalk.yellow(`Warning: Failed to load doctor signatures (${reason}). Using fallback configuration.`));
    return {
      signatures: [],
      keywordMap: {
        strict_typing: ["types", "interfaces"],
        error_protocol: ["errors", "exceptions"]
      }
    };
  }
}

const CONFIG = loadConfig();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DoctorIssue {
  type: "redundancy" | "fingerprint-mismatch" | "logic-conflict" | "security";
  severity: "error" | "warning";
  field: string;
  message: string;
  recommendation: string;
}

export interface DoctorReport {
  valid: boolean;
  issues: DoctorIssue[];
  stats: {
    filesScanned: number;
    signaturesFound: string[];
  };
}

// ─── Configuration-Aware Detection ───────────────────────────────────────────

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
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

function checkDependency(
  pkg: PackageJson,
  packageKey: "dependencies" | "devDependencies",
  packageName: string
): boolean {
  const deps = pkg[packageKey];
  if (!deps) return false;
  // Handle scoped packages (@scope/name)
  if (packageName.includes("/")) {
    return deps[packageName] !== undefined;
  }
  // Check exact match or any key containing the name
  return Object.keys(deps).some(key => 
    key === packageName || key.endsWith(`/${packageName}`)
  );
}

function checkSignature(
  sig: SignatureConfig["signatures"][0],
  projectRoot: string,
  pkg: PackageJson | null
): boolean {
  // File-based detection
  if (sig.type === "file" && sig.check.files) {
    for (const file of sig.check.files) {
      if (fs.existsSync(path.join(projectRoot, file))) {
        return true;
      }
    }
  }
  
  // Folder-based detection
  if (sig.type === "file" && sig.check.folders) {
    for (const folder of sig.check.folders) {
      if (fs.existsSync(path.join(projectRoot, folder))) {
        return true;
      }
    }
  }
  
  // Dependency-based detection (Configuration-Aware)
  if (sig.type === "dependency" && sig.check.packageKey && sig.check.packageName && pkg) {
    const hasDep = checkDependency(pkg, sig.check.packageKey, sig.check.packageName);
    
    // If configFiles are specified, they provide stronger evidence for disambiguation
    if (hasDep && sig.check.configFiles) {
      for (const configFile of sig.check.configFiles) {
        if (fs.existsSync(path.join(projectRoot, configFile))) {
          return true; // Has both dependency AND config file - strong match
        }
      }
      // Has dependency but no config file - weak match (may be transitive dependency)
      return false;
    }
    
    if (hasDep) {
      return true;
    }
  }
  
  return false;
}

function generateMismatchIssue(sig: SignatureConfig["signatures"][0], data: GuideMdFrontmatter): DoctorIssue | null {
  const fieldParts = sig.field.split(".");
  const baseField = fieldParts[0] as keyof GuideMdFrontmatter;
  const subField = fieldParts[1];
  
  // Check framework field
  if (baseField === "framework" && sig.field === "framework") {
    const frameworks = Array.isArray(data.framework) 
      ? data.framework 
      : data.framework ? [data.framework] : [];
    const sigNameLower = sig.name.toLowerCase();
    
    if (!frameworks.some(f => f?.toLowerCase().includes(sigNameLower))) {
      return {
        type: "fingerprint-mismatch",
        severity: "warning",
        field: "framework",
        message: `${sig.name} detected in project but not listed in GUIDE.md frameworks.`,
        recommendation: `Add '${sigNameLower.split(" ")[0]}' to your framework list to help the AI use the correct tools and patterns.`
      };
    }
  }
  
  // Check language field
  if (baseField === "language" && sig.name === "TypeScript") {
    const langs = Array.isArray(data.language) ? data.language : [data.language];
    if (!langs.some(lang => typeof lang === "string" && lang.toLowerCase() === "typescript")) {
      return {
        type: "fingerprint-mismatch",
        severity: "error",
        field: "language",
        message: "tsconfig.json found but language is not set to 'typescript' in GUIDE.md.",
        recommendation: "Set 'language: typescript' to ensure the AI generates type-safe code."
      };
    }
  }
  
  // Check testing.framework
  if (baseField === "testing" && subField === "framework") {
    const currentFramework = data.testing?.framework?.toLowerCase();
    const sigNameLower = sig.name.toLowerCase();
    if (!currentFramework || !currentFramework.includes(sigNameLower)) {
      return {
        type: "fingerprint-mismatch",
        severity: "warning",
        field: "testing.framework",
        message: `${sig.name} detected in package.json but testing.framework is '${currentFramework || "not set"}'.`,
        recommendation: `Set testing.framework to '${sig.name}' to align GUIDE.md with your actual test setup.`
      };
    }
  }
  
  // Check context.architecture_pattern for state management
  if (baseField === "context" && subField === "state_management") {
    const currentState = data.context?.state_management?.toLowerCase();
    const sigNameLower = sig.name.toLowerCase();
    if (!currentState || !currentState.includes(sigNameLower)) {
      return {
        type: "fingerprint-mismatch",
        severity: "warning",
        field: "context.state_management",
        message: `${sig.name} detected in dependencies but state_management is '${currentState || "not set"}'.`,
        recommendation: `Set context.state_management to '${sig.name}' for accurate AI context.`
      };
    }
  }
  
  return null;
}

// ─── Deep Static Analysis ─────────────────────────────────────────────────────

function checkTsconfigStrict(data: GuideMdFrontmatter, projectRoot: string): DoctorIssue[] {
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath) || !data.strict_typing) return [];
  try {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
    const isStrict = tsconfig.compilerOptions?.strict === true;
    if (!isStrict) {
      return [{
        type: "logic-conflict",
        severity: "warning",
        field: "strict_typing",
        message: "GUIDE.md requests 'strict_typing: true', but 'strict' is false in tsconfig.json.",
        recommendation: "Enable 'strict: true' in tsconfig.json to match your AI context rules."
      }];
    }
  } catch {
    // Ignore parse errors for tsconfig
  }
  return [];
}

function checkRuntimeDrift(data: GuideMdFrontmatter, projectRoot: string): DoctorIssue[] {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath) || !data.runtime) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const nodeVersionMatch = data.runtime.match(/node@(\d+)/);
    if (nodeVersionMatch && pkg.engines?.node) {
      const guideVersion = nodeVersionMatch[1];
      if (!pkg.engines.node.includes(guideVersion)) {
        return [{
          type: "logic-conflict",
          severity: "warning",
          field: "runtime",
          message: `Runtime drift: GUIDE.md says node@${guideVersion}, but package.json engines.node is '${pkg.engines.node}'.`,
          recommendation: "Sync your package.json engines to match your target AI runtime."
        }];
      }
    }
  } catch {
    // Ignore parse errors for package.json
  }
  return [];
}

function checkFrameworkVersions(data: GuideMdFrontmatter, pkg: PackageJson | null): DoctorIssue[] {
  if (!pkg) return [];
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const frameworks = Array.isArray(data.framework)
    ? data.framework
    : data.framework ? [data.framework] : [];

  return frameworks.flatMap((fw) => {
    const [name, declaredVersion] = fw.split("@");
    if (!name || !allDeps[name]) return [];
    const actualVersion = allDeps[name].replace(/[\^~]/, "");
    if (!declaredVersion || actualVersion === declaredVersion) return [];
    return [{
      type: "logic-conflict" as const,
      severity: "warning" as const,
      field: "framework",
      message: `Framework version mismatch: ${name} is ${actualVersion} in package.json but ${declaredVersion} in GUIDE.md.`,
      recommendation: `Update GUIDE.md to framework: "${name}@${actualVersion}" to match package.json.`
    }];
  });
}

function checkRedundancy(data: GuideMdFrontmatter, content: string): DoctorIssue[] {
  const paragraphs = content.split(/\n\s*\n/);
  return paragraphs.flatMap((para) => {
    const cleanPara = para.toLowerCase().replace(/[^\w\s]/g, "");
    const words = cleanPara.split(/\s+/).filter(w => w.length > 3);
    if (words.length < 5) return [];

    return Object.entries(CONFIG.keywordMap).flatMap(([field, keywords]) => {
      const value = getField(data as Record<string, unknown>, field);
      if (value === undefined || value === false) return [];

      const overlap = keywords.filter(k => cleanPara.includes(k));
      const overlapRatio = overlap.length / keywords.length;
      if (overlapRatio <= 0.6) return [];

      return [{
        type: "redundancy" as const,
        severity: "warning" as const,
        field,
        message: `Paragraph starting with "${para.substring(0, 30)}..." repeats logic from YAML field '${field}'.`,
        recommendation: `Remove this paragraph from Markdown. The AI already knows about ${field} from the frontmatter.`
      }];
    });
  });
}

export async function runDoctor(data: GuideMdFrontmatter, content: string, projectRoot: string = process.cwd()): Promise<DoctorReport> {
  const pkg = loadPackageJson(projectRoot);

  // 1. Architectural Fingerprinting (pure computation)
  const signatureResults = CONFIG.signatures.map(sig => ({
    found: checkSignature(sig, projectRoot, pkg),
    mismatch: generateMismatchIssue(sig, data),
    name: sig.name,
    fileCount: sig.check.files?.length ?? 0,
  }));

  const signatureIssues = signatureResults
    .filter(r => r.found && r.mismatch)
    .map(r => r.mismatch!);

  const signaturesFound = signatureResults
    .filter(r => r.found)
    .map(r => r.name);

  const filesScanned = signatureResults.reduce((sum, r) => sum + r.fileCount, 0);

  // 2-4. Pure issue generators composed via concat
  const issues: DoctorIssue[] = [
    ...signatureIssues,
    ...checkTsconfigStrict(data, projectRoot),
    ...checkRuntimeDrift(data, projectRoot),
    ...checkFrameworkVersions(data, pkg),
    ...checkRedundancy(data, content),
  ];

  return {
    valid: issues.filter(i => i.severity === "error").length === 0,
    issues,
    stats: {
      filesScanned,
      signaturesFound
    }
  };
}

function getField(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((prev, curr) => {
    if (prev && typeof prev === "object" && !Array.isArray(prev)) {
      return (prev as Record<string, unknown>)[curr];
    }
    return undefined;
  }, obj);
}

/**
 * Detects the primary framework from project configuration files and package.json.
 * Returns the detected framework name or null if unclear.
 */
export function detectFramework(projectRoot: string = process.cwd()): string | null {
  const pkg = loadPackageJson(projectRoot);
  if (!pkg) return null;
  
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  
  // Priority order for framework detection
  const frameworkPriority = [
    { name: "next", key: "next" },
    { name: "react", key: "react" },
    { name: "vue", key: "vue" },
    { name: "svelte", key: "svelte" },
    { name: "angular", key: "@angular/core" },
    { name: "nuxt", key: "nuxt" },
    { name: "express", key: "express" },
    { name: "fastify", key: "fastify" },
    { name: "nest", key: "@nestjs/core" },
    { name: "hono", key: "hono" },
    { name: "astro", key: "astro" },
    { name: "remix", key: "@remix-run/node" },
    { name: "solid", key: "solid-js" },
    { name: "preact", key: "preact" },
    { name: "lit", key: "lit" },
  ];
  
  for (const fw of frameworkPriority) {
    const depVersion = allDeps[fw.key];
    if (depVersion !== undefined) {
      const version = depVersion.replace(/[\^~]/, "").split(".")[0];
      return version ? `${fw.name}@${version}` : fw.name;
    }
  }
  
  return null;
}
