import fs from "node:fs";
import path from "node:path";

const PARADIGM_IGNORED_DIRS = new Set(["node_modules", "dist", ".git", ".next", ".nuxt", "build", "coverage", "target", "__pycache__", ".tox", "venv", ".venv"]);
const PARADIGM_MAX_DEPTH = 10;
const PARADIGM_SAMPLE_SIZE = 20;

interface KeywordCounts {
  classCount: number;
  functionCount: number;
  lambdaCount: number;
  traitCount: number;
  implCount: number;
  structCount: number;
  interfaceCount: number;
  dataClassCount: number;
  blockCount: number;
}

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

function getSampleFiles(projectRoot: string, extension: string): string[] {
  const allFiles = readdirRecursive(projectRoot, PARADIGM_MAX_DEPTH, PARADIGM_IGNORED_DIRS);
  const matchingFiles = allFiles.filter(f => f.endsWith(extension));
  
  // Return first N files (simplistic sampling)
  return matchingFiles.slice(0, PARADIGM_SAMPLE_SIZE);
}

function countKeywordsInFile(filePath: string, patterns: RegExp[]): number[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return patterns.map(pattern => (content.match(pattern) || []).length);
  } catch {
    return patterns.map(() => 0);
  }
}

function detectPythonParadigm(projectRoot: string): "oop" | "functional" | "mixed" | null {
  const files = getSampleFiles(projectRoot, ".py");
  if (files.length === 0) return null;

  let classCount = 0;
  let defCount = 0;
  let lambdaCount = 0;
  let comprehensionCount = 0;

  for (const file of files) {
    const [classes = 0, funcs = 0, lambdas = 0, comprehensions = 0] = countKeywordsInFile(file, [
      /^\s*class\s+\w+/gm,
      /^\s*def\s+\w+/gm,
      /\blambda\b/g,
      /\[.*\s+for\s+.*\s+in\s+.*\]|\{.*\s+for\s+.*\s+in\s+.*\}|\(.*\s+for\s+.*\s+in\s+.*\)/g,
    ]);
    classCount += classes;
    defCount += funcs;
    lambdaCount += lambdas;
    comprehensionCount += comprehensions;
  }

  const totalFunctionalIndicators = lambdaCount + comprehensionCount;
  
  // High class count relative to functions → OOP
  if (classCount > defCount * 0.3) {
    return "oop";
  }
  
  // High lambda/comprehension usage → Functional
  if (totalFunctionalIndicators > defCount * 0.2) {
    return "functional";
  }
  
  // Mixed if both present
  if (classCount > 0 && totalFunctionalIndicators > 0) {
    return "mixed";
  }
  
  return classCount > 0 ? "oop" : "functional";
}

function detectRustParadigm(projectRoot: string): "oop" | "functional" | null {
  const files = getSampleFiles(projectRoot, ".rs");
  if (files.length === 0) return null;

  let traitCount = 0;
  let implCount = 0;
  let structCount = 0;
  let fnCount = 0;
  let mapFilterCount = 0;

  for (const file of files) {
    const [traits = 0, impls = 0, structs = 0, fns = 0, maps = 0] = countKeywordsInFile(file, [
      /\btrait\s+\w+/g,
      /\bimpl\b/g,
      /\bstruct\s+\w+/g,
      /\bfn\s+\w+/g,
      /\.map\(|\.filter\(|\.iter\(\)/g,
    ]);
    traitCount += traits;
    implCount += impls;
    structCount += structs;
    fnCount += fns;
    mapFilterCount += maps;
  }

  // Heavy trait/impl/struct usage → OOP-like
  if (traitCount + implCount + structCount > fnCount * 0.3) {
    return "oop";
  }
  
  // Heavy map/filter/iter chaining → Functional
  if (mapFilterCount > fnCount * 0.2) {
    return "functional";
  }
  
  return structCount > 0 ? "oop" : "functional";
}

function detectJavaParadigm(projectRoot: string): "oop" | null {
  const files = getSampleFiles(projectRoot, ".java");
  if (files.length === 0) return null;

  let classCount = 0;
  let interfaceCount = 0;

  for (const file of files) {
    const [classes = 0, interfaces = 0] = countKeywordsInFile(file, [
      /\bclass\s+\w+/g,
      /\binterface\s+\w+/g,
    ]);
    classCount += classes;
    interfaceCount += interfaces;
  }

  // Java is always OOP if we find classes
  return classCount > 0 ? "oop" : null;
}

function detectKotlinParadigm(projectRoot: string): "oop" | "mixed" | null {
  const files = getSampleFiles(projectRoot, ".kt");
  if (files.length === 0) {
    // Also check .kts files
    const scriptFiles = getSampleFiles(projectRoot, ".kts");
    if (scriptFiles.length === 0) return null;
  }

  const ktFiles = [...getSampleFiles(projectRoot, ".kt"), ...getSampleFiles(projectRoot, ".kts")];
  
  let dataClassCount = 0;
  let lambdaCount = 0;
  let classCount = 0;

  for (const file of ktFiles) {
    const [dataClasses = 0, lambdas = 0, classes = 0] = countKeywordsInFile(file, [
      /\bdata\s+class\b/g,
      /\{[^}]*->[^}]*\}/g, // Simple lambda detection
      /\bclass\s+\w+/g,
    ]);
    dataClassCount += dataClasses;
    lambdaCount += lambdas;
    classCount += classes;
  }

  // Mix of data class and lambdas → mixed
  if (dataClassCount > 0 && lambdaCount > classCount * 0.2) {
    return "mixed";
  }
  
  return classCount > 0 ? "oop" : null;
}

function detectRubyParadigm(projectRoot: string): "oop" | "functional" | null {
  const files = getSampleFiles(projectRoot, ".rb");
  if (files.length === 0) return null;

  let classCount = 0;
  let blockCount = 0;
  let lambdaCount = 0;

  for (const file of files) {
    const [classes = 0, blocks = 0, lambdas = 0] = countKeywordsInFile(file, [
      /\bclass\s+\w+/g,
      /\bdo\s*[|][^|]*[|]\s*$/gm, // block with params
      /\blambda\b|\bproc\b/g,
    ]);
    classCount += classes;
    blockCount += blocks;
    lambdaCount += lambdas;
  }

  // Class dominant → OOP
  if (classCount > blockCount * 0.3) {
    return "oop";
  }
  
  // Heavy blocks/lambdas → Functional
  if (blockCount + lambdaCount > classCount * 2) {
    return "functional";
  }
  
  return classCount > 0 ? "oop" : "functional";
}

function detectPhpParadigm(projectRoot: string): "oop" | null {
  const files = getSampleFiles(projectRoot, ".php");
  if (files.length === 0) return null;

  let classCount = 0;

  for (const file of files) {
    const [classes = 0] = countKeywordsInFile(file, [/\bclass\s+\w+/g]);
    classCount += classes;
  }

  return classCount > 0 ? "oop" : null;
}

/**
 * Detects the programming paradigm using text-based heuristics.
 * Returns null if insufficient data to determine.
 */
export function detectParadigm(projectRoot: string, language: string): "oop" | "functional" | "mixed" | "imperative" | "procedural" | null {
  switch (language.toLowerCase()) {
    case "python":
      return detectPythonParadigm(projectRoot);
    case "go":
      return "procedural";
    case "rust":
      return detectRustParadigm(projectRoot);
    case "java":
      return detectJavaParadigm(projectRoot);
    case "kotlin":
      return detectKotlinParadigm(projectRoot);
    case "ruby":
      return detectRubyParadigm(projectRoot);
    case "php":
      return detectPhpParadigm(projectRoot);
    case "c":
    case "cpp":
      return "imperative";
    case "elixir":
      return "functional";
    case "dart":
      return "oop";
    default:
      return null;
  }
}
