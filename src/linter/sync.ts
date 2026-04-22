import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { GuideMdFrontmatter } from "../schema/index.js";
import { init } from "es-module-lexer";

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
export async function detectDrift(data: GuideMdFrontmatter, filePath: string): Promise<Drift[]> {
  const drifts: Drift[] = [];
  const projectRoot = path.dirname(filePath);

  // 1. Version Check (Frameworks)
  const pkgPath = findPackageJson(filePath);
  if (pkgPath) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const frameworks = Array.isArray(data.framework) 
      ? data.framework 
      : data.framework 
        ? [data.framework] 
        : [];

    frameworks.forEach((fw) => {
      const [name, version] = fw.split("@");
      if (name && deps[name]) {
        const actualVersion = deps[name].replace(/[\^~]/, "");
        if (version && actualVersion !== version) {
          drifts.push({
            field: "framework",
            actual: `${name}@${actualVersion}`,
            expected: fw,
            message: `Framework version drift: ${name} is ${actualVersion} in package.json but ${version} in GUIDE.md`,
          });
        }
      }
    });
  }

  // 2. Dependency Check (Strict Typing -> tsconfig.json)
  if (data.strict_typing) {
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
  const entryPoints = data.context?.entry_points || [];
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

  // 4. Paradigm Detection (Async AST-based)
  const detectedParadigm = await detectParadigm(projectRoot);
  const currentParadigm = (data as any).paradigm;
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
export async function syncGuideFile(data: GuideMdFrontmatter, filePath: string): Promise<SyncResult> {
  const drifts = await detectDrift(data, filePath);
  const newData = { ...data } as any;
  const projectRoot = path.dirname(filePath);

  drifts.forEach((drift) => {
    // Sync framework versions
    if (drift.field === "framework") {
      const [name] = drift.expected.split("@");
      const actualVersion = drift.actual.split("@")[1];
      
      if (Array.isArray(newData.framework)) {
        newData.framework = newData.framework.map((fw: string) => 
          fw.startsWith(name + "@") ? `${name}@${actualVersion}` : fw
        );
      } else if (typeof newData.framework === "string" && newData.framework.startsWith(name + "@")) {
        newData.framework = `${name}@${actualVersion}`;
      }
    }

    // Sync strict_typing
    if (drift.field === "strict_typing" && drift.actual === "missing tsconfig.json") {
      newData.strict_typing = false;
    }

    // Sync entry_points
    if (drift.field === "context.entry_points") {
      if (drift.actual === "not found") {
        if (newData.context?.entry_points) {
          newData.context.entry_points = newData.context.entry_points.filter((ep: string) => ep !== drift.expected);
        }
      } else if (drift.expected === "missing") {
        newData.context = newData.context || {};
        newData.context.entry_points = newData.context.entry_points || [];
        if (!newData.context.entry_points.includes(drift.actual)) {
          newData.context.entry_points.push(drift.actual);
        }
      }
    }

    // Sync paradigm
    if (drift.field === "paradigm") {
      newData.paradigm = drift.actual;
    }

    // Sync last_updated if anything changed
    newData.last_updated = new Date().toISOString().split("T")[0];
  });

  return {
    synced: drifts.length > 0,
    drifts,
    data: newData,
  };
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
 * Detects paradigm using AST-based analysis with TypeScript compiler API.
 * Uses weighted sampling instead of random 50-file limit.
 */
export async function detectParadigm(projectRoot: string): Promise<"oop" | "functional" | null> {
  try {
    const allFiles: string[] = [];
    const files = fs.readdirSync(projectRoot, { recursive: true });
    
    // Collect all JS/TS files
    for (const f of files) {
      if (typeof f !== "string") continue;
      if (![".ts", ".js", ".tsx", ".jsx"].some(ext => f.endsWith(ext))) continue;
      if (f.includes("node_modules") || f.includes("dist") || f.includes(".d.ts")) continue;
      allFiles.push(path.join(projectRoot, f));
    }
    
    if (allFiles.length === 0) return null;
    
    // Weighted sampling: prioritize entry points and diverse locations
    const sampleSize = Math.min(allFiles.length, 50);
    const sample: string[] = [];
    
    // Priority 1: src/index and main entry points
    const entryPoints = allFiles.filter(f => 
      /src\/(index|main)\.(ts|js)x?$/.test(f) ||
      /app\/(page|layout)\.(ts|js)x?$/.test(f)
    );
    sample.push(...entryPoints.slice(0, 10));
    
    // Priority 2: Files in src/ directory (not tests)
    const srcFiles = allFiles.filter(f => 
      f.includes("/src/") && 
      !f.includes(".test.") && 
      !f.includes(".spec.")
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
    
    for (const file of sample.slice(0, 30)) { // Cap at 30 for performance
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
    if (totalClasses >= 3 || totalDecorators >= 5 || totalOop > totalFunc * 1.5) {
      return "oop";
    }
    
    // Strong Functional: more hooks/arrow functions than classes
    if (totalHooks >= 3 || totalFunc >= totalOop * 1.2) {
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
