import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { GuideMdFrontmatter } from "../schema/index.js";
import { init } from "es-module-lexer";
import { readDependencies } from "./deps.js";
import { detectEcosystem } from "../doctor/ecosystem-signatures.js";
import { detectParadigm as detectUniversalParadigm } from "./paradigm.js";

// Performance tuning constants for paradigm detection
// These balance accuracy vs. analysis time for large codebases
const PARADIGM_SAMPLE_SIZE = 50; // Maximum files to sample for detection
const PARADIGM_ANALYSIS_CAP = 30; // Cap at 30 for actual AST analysis (performance limit)
const PARADIGM_ENTRY_PRIORITY = 10; // Number of entry point files to prioritize

// Paradigm detection scoring thresholds
const PARADIGM_OOP_CLASS_THRESHOLD = 3; // Minimum class declarations to strongly indicate OOP
const PARADIGM_OOP_DECORATOR_THRESHOLD = 5; // Minimum decorators to strongly indicate OOP
const PARADIGM_OOP_DOMINANCE_MULTIPLIER = 1.5; // OOP score must exceed functional score by this factor
const PARADIGM_FUNCTIONAL_HOOK_THRESHOLD = 3; // Minimum React hooks to strongly indicate functional
const PARADIGM_FUNCTIONAL_DOMINANCE_MULTIPLIER = 1.2; // Functional score must exceed OOP score by this factor
const PARADIGM_READDIR_MAX_DEPTH = 10; // Max directory depth for recursive scanning to avoid node_modules hang
const PARADIGM_IGNORED_DIRS = new Set(["node_modules", "dist", ".git", ".next", ".nuxt", "build", "coverage"]);

export interface Drift {
  field: string;
  actual: string;
  expected: string;
  message: string;
}

export interface SyncResult {
  synced: boolean;
  drifts: Drift[];
  data: GuideMdFrontmatter;
}

/**
 * Detects drift between GUIDE.md frontmatter and the actual project state.
 */
function getFrameworks(data: Record<string, unknown>): string[] {
  const fw = data.framework;
  if (Array.isArray(fw) && fw.every((f): f is string => typeof f === "string")) return fw;
  if (typeof fw === "string") return [fw];
  return [];
}

function getEntryPoints(data: Record<string, unknown>): string[] {
  const ctx = data.context;
  if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
    const eps = (ctx as Record<string, unknown>).entry_points;
    if (Array.isArray(eps) && eps.every((e): e is string => typeof e === "string")) return eps;
  }
  return [];
}

export async function detectDrift(data: Record<string, unknown>, filePath: string): Promise<Drift[]> {
  const drifts: Drift[] = [];
  const projectRoot = path.dirname(filePath);

  // 1. Version Check (Frameworks) - Universal via readDependencies
  const deps = readDependencies(projectRoot);
  const depMap = new Map(deps.map(d => [d.name, d.version]));

  const frameworks = getFrameworks(data);

  frameworks.forEach((fw) => {
    const [name, version] = fw.split("@");
    if (name) {
      // Check for exact match or partial match for scoped/namespaced packages
      let actualVersion: string | undefined;
      
      // Try exact match first
      if (depMap.has(name)) {
        actualVersion = depMap.get(name);
      } else {
        // Try to find by suffix (e.g., package name without scope/namespace)
        for (const [depName, depVersion] of depMap) {
          if (depName === name || depName.endsWith(`/${name}`) || depName.endsWith(`:${name}`)) {
            actualVersion = depVersion;
            break;
          }
        }
      }
      
      if (actualVersion) {
        const cleanActualVersion = actualVersion.replace(/[\^~>=<]/, "");
        if (version && cleanActualVersion !== version) {
          drifts.push({
            field: "framework",
            actual: `${name}@${cleanActualVersion}`,
            expected: fw,
            message: `Framework version drift: ${name} is ${cleanActualVersion} in manifest but ${version} in GUIDE.md`,
          });
        }
      }
    }
  });

  // 1b. Framework existence check - warn if framework declared but not in deps
  const declaredLanguage = typeof data.language === "string" ? data.language : null;
  const detectedEcosystem = detectEcosystem(projectRoot);
  
  if (frameworks.length > 0 && deps.length > 0) {
    for (const fw of frameworks) {
      const [name] = fw.split("@");
      if (!name) continue;
      
      // Check if framework is found in dependencies
      let found = false;
      for (const [depName] of depMap) {
        if (depName.toLowerCase().includes(name.toLowerCase()) || 
            name.toLowerCase().includes(depName.toLowerCase().split(/[/:]/).pop() || "")) {
          found = true;
          break;
        }
      }
      
      if (!found) {
        drifts.push({
          field: "framework",
          actual: "not in dependencies",
          expected: name,
          message: `Framework '${name}' declared in GUIDE.md but not found in project dependencies.`,
        });
      }
    }
  }

  // 2. Dependency Check (Strict Typing -> tsconfig.json)
  if (data.strict_typing === true) {
    const tsConfigPath = path.join(projectRoot, "tsconfig.json");
    if (!fs.existsSync(tsConfigPath)) {
      drifts.push({
        field: "strict_typing",
        actual: "missing tsconfig.json",
        expected: "tsconfig.json",
        message: "strict_typing is enabled but no tsconfig.json was found.",
      });
    }
  }

  // 3. Folder Mapping (Entry Points & Structural Sync)
  const entryPoints = getEntryPoints(data);
  entryPoints.forEach((ep) => {
    const epPath = path.resolve(projectRoot, ep);
    if (!fs.existsSync(epPath)) {
      drifts.push({
        field: "context.entry_points",
        actual: "not found",
        expected: ep,
        message: `Entry point "${ep}" listed in GUIDE.md does not exist on disk.`,
      });
    }
  });

  // Structural Sync: Find new top-level directories
  try {
    const items = fs.readdirSync(projectRoot, { withFileTypes: true });
    const dirs = items
      .filter(item => item.isDirectory() && !item.name.startsWith(".") && item.name !== "node_modules")
      .map(item => item.name);

    dirs.forEach(dir => {
      if (!entryPoints.includes(dir) && !entryPoints.some(ep => ep.startsWith(dir + "/"))) {
        drifts.push({
          field: "context.entry_points",
          actual: dir,
          expected: "missing",
          message: `New directory "${dir}" detected but not in context.entry_points.`,
        });
      }
    });
  } catch (e) {}

  // 4. Language file existence check
  if (declaredLanguage) {
    const langToExt: Record<string, string> = {
      python: ".py",
      rust: ".rs",
      go: ".go",
      java: ".java",
      kotlin: ".kt",
      swift: ".swift",
      dart: ".dart",
      elixir: ".ex",
      ruby: ".rb",
      php: ".php",
      c: ".c",
      cpp: ".cpp",
      typescript: ".ts",
      javascript: ".js",
    };
    
    const ext = langToExt[declaredLanguage.toLowerCase()];
    if (ext) {
      const hasFiles = checkFilesWithExt(projectRoot, ext);
      if (!hasFiles) {
        drifts.push({
          field: "language",
          actual: `no ${ext} files found`,
          expected: declaredLanguage,
          message: `Language '${declaredLanguage}' declared but no ${ext} files found in project.`,
        });
      }
    }
  }

  // 5. Ecosystem detection comparison
  if (detectedEcosystem.language && declaredLanguage && 
      detectedEcosystem.language.toLowerCase() !== declaredLanguage.toLowerCase()) {
    drifts.push({
      field: "language",
      actual: detectedEcosystem.language,
      expected: declaredLanguage,
      message: `Detected language is '${detectedEcosystem.language}' but GUIDE.md declares '${declaredLanguage}'.`,
    });
  }

  // 6. Paradigm Detection (Universal)
  let detectedParadigm: string | null = null;
  
  if (detectedEcosystem.paradigm) {
    // Use pre-detected paradigm from ecosystem (e.g., Go is always procedural)
    detectedParadigm = detectedEcosystem.paradigm;
  } else if (declaredLanguage) {
    // Use universal text-based detection
    detectedParadigm = detectUniversalParadigm(projectRoot, declaredLanguage);
  } else {
    // Fallback to TypeScript-based detection for JS/TS projects
    detectedParadigm = await detectTsParadigm(projectRoot);
  }
  
  const currentParadigm = typeof data.paradigm === "string" ? data.paradigm : undefined;
  // Only report drift if paradigm is explicitly set and differs from detected
  if (detectedParadigm && currentParadigm && detectedParadigm !== currentParadigm) {
    drifts.push({
      field: "paradigm",
      actual: detectedParadigm,
      expected: currentParadigm,
      message: `Detected ${detectedParadigm} paradigm but GUIDE.md says ${currentParadigm}.`,
    });
  }

  return drifts;
}

/**
 * Automatically syncs GUIDE.md frontmatter with the project state.
 */
export async function syncGuideFile(data: Record<string, unknown>, filePath: string): Promise<SyncResult> {
  const drifts = await detectDrift(data, filePath);
  const newData: Record<string, unknown> = { ...data };
  const projectRoot = path.dirname(filePath);
  let hasModifications = false;

  drifts.forEach((drift) => {
    // Sync framework versions
    if (drift.field === "framework") {
      const [name] = drift.expected.split("@");
      const actualVersion = drift.actual.split("@")[1];
      const fw = newData.framework;
      
      if (Array.isArray(fw) && fw.every((f): f is string => typeof f === "string")) {
        const oldFramework = JSON.stringify(fw);
        newData.framework = fw.map((f) => f.startsWith(name + "@") ? `${name}@${actualVersion}` : f);
        if (JSON.stringify(newData.framework) !== oldFramework) hasModifications = true;
      } else if (typeof fw === "string" && fw.startsWith(name + "@")) {
        newData.framework = `${name}@${actualVersion}`;
        hasModifications = true;
      }
    }

    // Sync strict_typing
    if (drift.field === "strict_typing" && drift.actual === "missing tsconfig.json") {
      if (newData.strict_typing !== false) {
        newData.strict_typing = false;
        hasModifications = true;
      }
    }

    // Sync entry_points
    if (drift.field === "context.entry_points") {
      const ctx = newData.context;
      const contextObj = (ctx && typeof ctx === "object" && !Array.isArray(ctx)) ? ctx as Record<string, unknown> : {};
      if (drift.actual === "not found") {
        const eps = contextObj.entry_points;
        if (Array.isArray(eps) && eps.every((e): e is string => typeof e === "string")) {
          const oldLength = eps.length;
          const filtered = eps.filter((ep) => ep !== drift.expected);
          if (filtered.length !== oldLength) {
            contextObj.entry_points = filtered;
            newData.context = contextObj;
            hasModifications = true;
          }
        }
      } else if (drift.expected === "missing") {
        const eps = contextObj.entry_points;
        const epsArr = Array.isArray(eps) && eps.every((e): e is string => typeof e === "string") ? eps : [];
        if (!epsArr.includes(drift.actual)) {
          epsArr.push(drift.actual);
          contextObj.entry_points = epsArr;
          newData.context = contextObj;
          hasModifications = true;
        }
      }
    }

    // Sync paradigm
    if (drift.field === "paradigm") {
      if (newData.paradigm !== drift.actual) {
        newData.paradigm = drift.actual;
        hasModifications = true;
      }
    }
  });

  // Sync last_updated only if actual modifications occurred
  if (hasModifications) {
    newData.last_updated = new Date().toISOString().split("T")[0];
  }

  return {
    synced: hasModifications,
    drifts,
    data: newData as GuideMdFrontmatter,
  };
}

/**
 * Recursively reads a directory up to a maximum depth, skipping ignored directories.
 * Returns absolute file paths.
 */
function readdirRecursive(dir: string, maxDepth: number, ignoreSet: Set<string>, currentDepth = 0): string[] {
  if (currentDepth >= maxDepth) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoreSet.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...readdirRecursive(fullPath, maxDepth, ignoreSet, currentDepth + 1));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return results;
}

function findPackageJson(startPath: string): string | null {
  let current = path.dirname(startPath);
  const root = path.parse(current).root;
  
  while (current !== root) {
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) return pkgPath;
    current = path.dirname(current);
  }
  
  const pkgPath = path.join(current, "package.json");
  if (fs.existsSync(pkgPath)) return pkgPath;
  
  return null;
}

interface ParadigmScore {
  oopScore: number;
  funcScore: number;
  classCount: number;
  arrowFuncCount: number;
  decoratorCount: number;
  hookUsageCount: number;
}

/**
 * Analyzes a single file using TypeScript compiler API for accurate AST-based detection.
 * Returns scores for OOP vs Functional patterns by counting actual AST nodes.
 */
function analyzeFileWithAst(filePath: string): Partial<ParadigmScore> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Create TypeScript source file for AST parsing
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );
    
    const scores: Partial<ParadigmScore> = {
      classCount: 0,
      arrowFuncCount: 0,
      decoratorCount: 0,
      hookUsageCount: 0
    };
    
    // Walk the AST to count paradigm indicators
    function visitNode(node: ts.Node) {
      // Class declarations (OOP indicator)
      if (ts.isClassDeclaration(node)) {
        scores.classCount = (scores.classCount || 0) + 1;
        
        // Check for decorators on class (TypeScript 5+ compatible)
        const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
        if (decorators && decorators.length > 0) {
          scores.decoratorCount = (scores.decoratorCount || 0) + decorators.length;
        }
      }
      
      // Method declarations with decorators (TypeScript 5+ compatible)
      if (ts.isMethodDeclaration(node)) {
        const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
        if (decorators && decorators.length > 0) {
          scores.decoratorCount = (scores.decoratorCount || 0) + decorators.length;
        }
      }
      
      // Property declarations with decorators (NestJS, Angular pattern) (TypeScript 5+ compatible)
      if (ts.isPropertyDeclaration(node)) {
        const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
        if (decorators && decorators.length > 0) {
          scores.decoratorCount = (scores.decoratorCount || 0) + decorators.length;
        }
      }
      
      // Arrow functions (Functional indicator)
      if (ts.isArrowFunction(node)) {
        scores.arrowFuncCount = (scores.arrowFuncCount || 0) + 1;
      }
      
      // Function declarations (neutral but count as functional style)
      if (ts.isFunctionDeclaration(node)) {
        scores.arrowFuncCount = (scores.arrowFuncCount || 0) + 1;
      }
      
      // Function expressions (e.g., const fn = function() {})
      if (ts.isFunctionExpression(node)) {
        scores.arrowFuncCount = (scores.arrowFuncCount || 0) + 1;
      }
      
      // Call expressions for React hooks detection
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (ts.isIdentifier(expression)) {
          const name = expression.text;
          // React Hooks pattern: useXxx (e.g., useState, useEffect)
          if (/^use[A-Z][A-Za-z0-9]*$/.test(name)) {
            scores.hookUsageCount = (scores.hookUsageCount || 0) + 1;
          }
        }
      }
      
      ts.forEachChild(node, visitNode);
    }
    
    visitNode(sourceFile);
    return scores;
  } catch (e) {
    return {};
  }
}

/**
 * Checks if any files with the given extension exist in the project.
 */
function checkFilesWithExt(projectRoot: string, ext: string): boolean {
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(ext)) {
        return true;
      }
    }
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Detects paradigm using AST-based analysis with TypeScript compiler API.
 * Uses weighted sampling instead of random 50-file limit.
 */
async function detectTsParadigm(projectRoot: string): Promise<"oop" | "functional" | null> {
  try {
    const allFiles: string[] = [];
    const files = readdirRecursive(projectRoot, PARADIGM_READDIR_MAX_DEPTH, PARADIGM_IGNORED_DIRS);
    
    // Collect all JS/TS files
    for (const f of files) {
      if (![".ts", ".js", ".tsx", ".jsx"].some(ext => f.endsWith(ext))) continue;
      if (f.includes(".d.ts")) continue;
      allFiles.push(f);
    }
    
    if (allFiles.length === 0) return null;
    
    // Weighted sampling: prioritize entry points and diverse locations
    const sampleSize = Math.min(allFiles.length, PARADIGM_SAMPLE_SIZE);
    const sample: string[] = [];
    
    // Priority 1: src/index and main entry points
    const entryPoints = allFiles.filter(f => 
      /src\/(index|main)\.(ts|js)x?$/.test(f) ||
      /app\/(page|layout)\.(ts|js)x?$/.test(f)
    );
    sample.push(...entryPoints.slice(0, PARADIGM_ENTRY_PRIORITY));
    
    // Priority 2: Files in src/ directory (not tests)
    const testPatterns = /(\.test\.|\.spec\.|__tests__|__mocks__)/;
    const srcFiles = allFiles.filter(f => 
      f.includes("/src/") && 
      !testPatterns.test(f)
    );
    
    // Priority 3: Fill remaining with diverse selection
    const remainingNeeded = sampleSize - sample.length;
    if (remainingNeeded > 0 && srcFiles.length > 0) {
      // Pick evenly distributed samples from srcFiles
      const step = Math.max(1, Math.floor(srcFiles.length / remainingNeeded));
      for (let i = 0; i < remainingNeeded && i * step < srcFiles.length; i++) {
        const file = srcFiles[i * step];
        if (file && !sample.includes(file)) {
          sample.push(file);
        }
      }
    }
    
    // Fill with any remaining files if needed
    if (sample.length < sampleSize) {
      for (const f of allFiles) {
        if (!sample.includes(f)) {
          sample.push(f);
          if (sample.length >= sampleSize) break;
        }
      }
    }
    
    // Analyze all sampled files
    let totalOop = 0;
    let totalFunc = 0;
    let totalClasses = 0;
    let totalDecorators = 0;
    let totalHooks = 0;
    
    for (const file of sample.slice(0, PARADIGM_ANALYSIS_CAP)) { // Performance cap for AST analysis
      const scores = analyzeFileWithAst(file);
      
      // Weight the scores: classes and decorators strongly indicate OOP
      totalClasses += scores.classCount || 0;
      totalDecorators += scores.decoratorCount || 0;
      totalOop += (scores.classCount || 0) * 2 + (scores.decoratorCount || 0) * 1.5;
      
      // Arrow functions and hooks indicate functional
      totalHooks += scores.hookUsageCount || 0;
      totalFunc += (scores.arrowFuncCount || 0) + (scores.hookUsageCount || 0) * 1.5;
    }
    
    // Decision logic with confidence thresholds
    // Strong OOP: multiple classes or decorators found
    if (totalClasses >= PARADIGM_OOP_CLASS_THRESHOLD || totalDecorators >= PARADIGM_OOP_DECORATOR_THRESHOLD || totalOop > totalFunc * PARADIGM_OOP_DOMINANCE_MULTIPLIER) {
      return "oop";
    }
    
    // Strong Functional: more hooks/arrow functions than classes
    if (totalHooks >= PARADIGM_FUNCTIONAL_HOOK_THRESHOLD || totalFunc >= totalOop * PARADIGM_FUNCTIONAL_DOMINANCE_MULTIPLIER) {
      return "functional";
    }
    
    // Default to functional if we see any modern patterns but not strong OOP
    if (totalFunc > 0 && totalOop === 0) {
      return "functional";
    }
    
    // Ambiguous or insufficient data
    return null;
  } catch (e) {
    return null;
  }
}
