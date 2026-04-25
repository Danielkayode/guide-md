import fs from "node:fs";
import path from "node:path";

export interface Dependency {
  name: string;
  version: string;
}

// ─── Individual Manifest Readers ──────────────────────────────────────────────

function readPackageJson(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "package.json");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    const deps: Dependency[] = [];
    
    if (parsed.dependencies) {
      for (const [name, version] of Object.entries(parsed.dependencies)) {
        deps.push({ name, version: String(version) });
      }
    }
    if (parsed.devDependencies) {
      for (const [name, version] of Object.entries(parsed.devDependencies)) {
        deps.push({ name, version: String(version) });
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function readRequirementsTxt(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "requirements.txt");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const deps: Dependency[] = [];
    
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      // Parse package==version, package>=version, package~=version, etc.
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*([=~<>!]+)\s*(.+)$/);
      if (match?.[1] && match[3]) {
        deps.push({ name: match[1], version: match[3] });
      } else {
        // Just package name without version
        deps.push({ name: trimmed, version: "*" });
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function readPyprojectToml(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "pyproject.toml");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const deps: Dependency[] = [];
    
    // Simple line-based parsing for [tool.poetry.dependencies] or [project.dependencies]
    let inPoetryDeps = false;
    let inProjectDeps = false;
    
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      
      if (trimmed === "[tool.poetry.dependencies]") {
        inPoetryDeps = true;
        inProjectDeps = false;
        continue;
      }
      if (trimmed === "[project.dependencies]") {
        inProjectDeps = true;
        inPoetryDeps = false;
        continue;
      }
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        inPoetryDeps = false;
        inProjectDeps = false;
        continue;
      }
      
      if (inPoetryDeps || inProjectDeps) {
        // Parse "package = \"version\"" or "package = { version = \"x\", ... }"
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]+)"|.+version\s*=\s*"([^"]+)".+)/);
        if (match?.[1]) {
          const name = match[1];
          const version = match[2] || match[3] || "*";
          deps.push({ name, version });
        }
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function readCargoToml(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "Cargo.toml");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const deps: Dependency[] = [];
    
    let inDeps = false;
    
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      
      if (trimmed === "[dependencies]" || trimmed === "[dev-dependencies]") {
        inDeps = true;
        continue;
      }
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        inDeps = false;
        continue;
      }
      
      if (inDeps) {
        // Parse "package = \"version\"" or "package = { version = \"x\", ... }"
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)"[^}]*\})/);
        if (match?.[1]) {
          const name = match[1];
          const version = match[2] || match[3] || "*";
          deps.push({ name, version });
        }
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function readGoMod(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "go.mod");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const deps: Dependency[] = [];
    
    let inRequire = false;
    
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith("require (") || trimmed.startsWith("require(")) {
        inRequire = true;
        continue;
      }
      if (inRequire && trimmed === ")") {
        inRequire = false;
        continue;
      }
      if (trimmed.startsWith("require ") && !trimmed.includes("(") && !trimmed.includes(")")) {
        // Single line require: require package version
        const match = trimmed.match(/require\s+(\S+)\s+(\S+)/);
        if (match?.[1] && match[2]) {
          deps.push({ name: match[1], version: match[2] });
        }
        continue;
      }
      
      if (inRequire) {
        // Parse "package version"
        const match = trimmed.match(/^(\S+)\s+(\S+)/);
        if (match?.[1] && match[2]) {
          deps.push({ name: match[1], version: match[2] });
        }
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function readPomXml(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "pom.xml");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const deps: Dependency[] = [];
    
    // Simple regex-based parsing for <dependency> blocks
    const depBlocks = content.match(/<dependency>[\s\S]*?<\/dependency>/g) || [];
    
    for (const block of depBlocks) {
      const groupMatch = block.match(/<groupId>([^<]+)<\/groupId>/);
      const artifactMatch = block.match(/<artifactId>([^<]+)<\/artifactId>/);
      const versionMatch = block.match(/<version>([^<$]+)<\/version>/);
      
      if (groupMatch?.[1] && artifactMatch?.[1]) {
        const name = `${groupMatch[1]}:${artifactMatch[1]}`;
        const version = versionMatch?.[1]?.trim() ?? "*";
        deps.push({ name, version });
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function readBuildGradle(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "build.gradle");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const deps: Dependency[] = [];
    
    // Match implementation 'group:name:version' or compile 'group:name:version'
    const regex = /(?:implementation|compile|api)\s+['"]([^'":]+):([^'":]+):?([^'"]*)['"]/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const group = match[1];
      const artifact = match[2];
      if (!group || !artifact) continue;
      const version = match[3] || "*";
      deps.push({ name: `${group}:${artifact}`, version });
    }
    return deps;
  } catch {
    return [];
  }
}

function readComposerJson(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "composer.json");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    const deps: Dependency[] = [];
    
    if (parsed.require) {
      for (const [name, version] of Object.entries(parsed.require)) {
        deps.push({ name, version: String(version) });
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function readGemfile(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "Gemfile");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const deps: Dependency[] = [];
    
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      // Parse gem 'name', 'version' or gem "name", "version"
      const match = trimmed.match(/gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
      if (match?.[1]) {
        const name = match[1];
        const version = match[2] ?? "*";
        deps.push({ name, version });
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function readPubspecYaml(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "pubspec.yaml");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const deps: Dependency[] = [];
    
    let inDeps = false;
    
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith("dependencies:") || trimmed.startsWith("dev_dependencies:")) {
        inDeps = true;
        continue;
      }
      if (trimmed.endsWith(":") && !trimmed.startsWith("#")) {
        inDeps = false;
        continue;
      }
      
      if (inDeps && trimmed) {
        // Parse "package: version" or just "package:"
        const match = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.+)?/);
        if (match?.[1]) {
          const name = match[1];
          const version = match[2] ?? "*";
          deps.push({ name, version });
        }
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function readMixExs(projectRoot: string): Dependency[] {
  const filePath = path.join(projectRoot, "mix.exs");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const deps: Dependency[] = [];
    
    // Parse {:dep, "~> version"} or {:dep, path: "..."} format
    const regex = /\{:([^,]+)\s*,\s*(?:"([^"]+)"|[^}]+)\}/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const name = match[1]?.trim();
      if (!name) continue;
      const version = match[2] ?? "*";
      deps.push({ name, version });
    }
    return deps;
  } catch {
    return [];
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

interface ManifestReader {
  file: string;
  reader: (projectRoot: string) => Dependency[];
}

const MANIFEST_READERS: ManifestReader[] = [
  { file: "package.json", reader: readPackageJson },
  { file: "requirements.txt", reader: readRequirementsTxt },
  { file: "pyproject.toml", reader: readPyprojectToml },
  { file: "Cargo.toml", reader: readCargoToml },
  { file: "go.mod", reader: readGoMod },
  { file: "pom.xml", reader: readPomXml },
  { file: "build.gradle", reader: readBuildGradle },
  { file: "composer.json", reader: readComposerJson },
  { file: "Gemfile", reader: readGemfile },
  { file: "pubspec.yaml", reader: readPubspecYaml },
  { file: "mix.exs", reader: readMixExs },
];

/**
 * Reads dependencies from whichever manifest file exists in the project root.
 * Returns an empty array if no manifest is found or cannot be read.
 */
export function readDependencies(projectRoot: string): Dependency[] {
  for (const { file, reader } of MANIFEST_READERS) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      return reader(projectRoot);
    }
  }
  return [];
}

/**
 * Detects which manifest file is being used by the project.
 * Returns null if no recognized manifest is found.
 */
export function detectManifestType(projectRoot: string): string | null {
  for (const { file } of MANIFEST_READERS) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      return file;
    }
  }
  return null;
}
