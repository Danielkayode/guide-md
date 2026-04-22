import fs from "node:fs";
import path from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { GuideMdFrontmatter, GuideMdSchema } from "../schema/index.js";
import { parseGuideFile } from "../parser/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileReport {
  entropy: SectionEntropy[];
  instructionRatio: InstructionRatio[];
  ghostContext: string[];
  compatibility: ModelCompatibility[];
  totalTokens: number;
}

export interface SectionEntropy {
  section: string;
  score: number; // 0 to 1, higher is better (less fluff)
  fluffDetected: string[];
  recommendation?: string;
}

export interface InstructionRatio {
  domain: string;
  instructionWords: number;
  codeUnits: number; // files, functions, etc.
  status: "balanced" | "over-instructed" | "under-instructed";
}

export interface ModelCompatibility {
  model: string;
  contextWindow: number;
  usagePercentage: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FLUFF_WORDS = ["please", "kindly", "really", "very", "basically", "actually", "just", "sort of", "maybe", "perhaps", "i think", "i believe"];

const MODELS = [
  { name: "Claude 3.5 Sonnet", window: 200000 },
  { name: "GPT-4o", window: 128000 },
  { name: "GPT-4o-mini", window: 128000 },
  { name: "Claude 3 Haiku", window: 200000 },
];

// ─── Profiler Logic ───────────────────────────────────────────────────────────

export function runProfile(data: GuideMdFrontmatter, content: string, projectRoot: string = process.cwd()): ProfileReport {
  const sections = splitSections(content);
  
  // 1. Entropy Analysis
  const entropy = sections.map(s => {
    const words = s.content.toLowerCase().split(/\s+/);
    const fluff = words.filter(w => FLUFF_WORDS.includes(w));
    const score = words.length > 0 ? 1 - (fluff.length / words.length) : 1;
    
    const result: { section: string; score: number; fluffDetected: string[]; recommendation?: string } = {
      section: s.name,
      score,
      fluffDetected: Array.from(new Set(fluff)),
    };
    if (score < 0.9) {
      result.recommendation = "Reduce filler words like 'please' or 'kindly' to save tokens and improve clarity.";
    }
    return result;
  });

  // 2. Instruction-to-Code Ratio
  const instructionRatio: InstructionRatio[] = [];
  
  // Check Testing
  const testFiles = countFiles(projectRoot, [".test.", ".spec.", "tests/"]);
  const testWords = (sections.find(s => s.name.toLowerCase().includes("test"))?.content.split(/\s+/).length || 0) + 
                    (data.testing ? 50 : 0); // YAML overhead
  
  instructionRatio.push({
    domain: "Testing",
    instructionWords: testWords,
    codeUnits: testFiles,
    status: testWords > 300 && testFiles < 2 ? "over-instructed" : testWords < 20 && testFiles > 10 ? "under-instructed" : "balanced"
  });

  // 3. Cross-Reference (Ghost Context)
  const ghostContext: string[] = [];
  if (data.context?.entry_points) {
    for (const ep of data.context.entry_points) {
      if (!fs.existsSync(path.join(projectRoot, ep))) {
        ghostContext.push(ep);
      }
    }
  }

  // 4. Compatibility Scoring
  const wordCount = content.split(/\s+/).length + JSON.stringify(data).length / 4;
  const totalTokens = Math.ceil(wordCount * 1.35); // Heuristic

  const compatibility = MODELS.map(m => ({
    model: m.name,
    contextWindow: m.window,
    usagePercentage: (totalTokens / m.window) * 100
  }));

  return {
    entropy,
    instructionRatio,
    ghostContext,
    compatibility,
    totalTokens
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitSections(content: string): { name: string, content: string }[] {
  const lines = content.split("\n");
  const sections: { name: string, content: string }[] = [];
  let currentSection = { name: "Root", content: "" };

  for (const line of lines) {
    if (line.startsWith("#")) {
      if (currentSection.content.trim()) sections.push({ ...currentSection });
      currentSection = { name: line.replace(/^#+\s+/, "").trim(), content: "" };
    } else {
      currentSection.content += line + "\n";
    }
  }
  if (currentSection.content.trim()) sections.push(currentSection);
  return sections;
}

// Security: Maximum depth to prevent infinite recursion from circular symlinks
const MAX_PROFILER_DEPTH = 10;

function countFiles(dir: string, patterns: string[], depth: number = 0): number {
  // Security: Prevent stack overflow from deeply nested directories or circular symlinks
  if (depth > MAX_PROFILER_DEPTH) {
    return 0;
  }
  
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Security: Skip symlinks to prevent escaping out of project directory
      if (entry.isSymbolicLink()) {
        continue;
      }
      
      if (entry.isDirectory()) {
        // Security: Recurse with depth limit
        count += countFiles(fullPath, patterns, depth + 1);
      } else if (entry.isFile()) {
        if (patterns.some(p => entry.name.includes(p))) count++;
      }
    }
  } catch (e) {
    // Ignore permission errors and continue
  }
  return count;
}

// ─── JSON Schema Generator ────────────────────────────────────────────────────

/**
 * Generates a complete JSON Schema from the Zod GuideMdSchema.
 * Provides full IntelliSense support including nested guardrails and context fields.
 */
export function generateJsonSchema(): string {
  const jsonSchema = zodToJsonSchema(GuideMdSchema, {
    name: "GuideMdFrontmatter",
    $refStrategy: "none",
    target: "jsonSchema7",
  });
  
  // Add metadata for better IDE support
  const schemaWithMeta = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://guidemd.dev/schema/1.0.0.json",
    "title": "GUIDE.md Frontmatter Specification",
    "description": "Schema for AI Context Interface standard GUIDE.md files",
    ...jsonSchema
  };
  
  return JSON.stringify(schemaWithMeta, null, 2);
}
