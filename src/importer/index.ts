import { GuideMdFrontmatter, GuideMdSchema } from "../schema/index.js";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

// ─── Security: ReDoS Protection ───────────────────────────────────────────────
// Export for external regex validation
export { isReDoSSafe };

const REGEX_TIMEOUT_MS = 1000; // Maximum time for any regex operation

/**
 * Security: Analyzes regex pattern for ReDoS vulnerabilities.
 * Rejects patterns with dangerous nested quantifiers that cause catastrophic backtracking.
 */
function isReDoSSafe(pattern: string): boolean {
  // Reject patterns with nested quantifiers like (a+)+, (a*)*, (a+)*, etc.
  // These are the primary cause of catastrophic backtracking
  const dangerousPatterns = [
    /\([^)]*\+\)\+/,     // (something+)+ - nested plus
    /\([^)]*\*\)\*/,     // (something*)* - nested star
    /\([^)]*\+\)\*/,     // (something+)* - mixed nested
    /\([^)]*\*\)\+/,     // (something*)+ - mixed nested
    /\([^)]*\{[^}]+\}\)\{/, // (something{n,m}){x,y} - nested braces
    /\(\?[:=!][^)]+\)[*+]/, // lookahead/behind followed by quantifier
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  // Check for excessive nesting depth (more than 5 levels of nested groups)
  let depth = 0;
  let maxDepth = 0;
  const hasNonCapturing = pattern.includes('(?:');
  for (const char of pattern) {
    if (char === '(' && !hasNonCapturing) {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === ')') {
      depth--;
    }
  }

  if (maxDepth > 5) {
    return false;
  }

  return true;
}

/**
 * Security: Executes a regex with pre-flight safety checks against ReDoS attacks.
 * NOTE: This function performs safety checks BEFORE execution but cannot interrupt
 * a running regex. The timeout check only catches slow regexes that complete.
 * For truly dangerous patterns, use isReDoSSafe() to reject them upfront.
 */
function safeRegexExec(
  pattern: string,
  flags: string,
  content: string,
  timeoutMs: number = REGEX_TIMEOUT_MS
): RegExpMatchArray | null {
  // Quick check: reject inputs that are too large
  if (content.length > 1024 * 1024) { // 1MB limit
    throw new Error("Input too large for regex processing");
  }

  // Security: Reject known-dangerous patterns that cause catastrophic backtracking
  if (!isReDoSSafe(pattern)) {
    throw new Error("Regex pattern rejected: potentially unsafe nested quantifiers detected");
  }

  // For simplicity and portability, use a synchronous approach with try/catch
  // and a simple execution time check
  const start = Date.now();
  const regex = new RegExp(pattern, flags);
  const result = content.match(regex);

  if (Date.now() - start > timeoutMs) {
    throw new Error(`Regex operation timed out after ${timeoutMs}ms - possible ReDoS attack`);
  }

  return result;
}

/**
 * Security: Wrapper for String.prototype.match with ReDoS protection.
 * NOTE: Pre-compiled regexes should be checked at creation time using isReDoSSafe().
 * This function provides input size limits and post-execution timeout detection.
 */
function safeMatch(content: string, regex: RegExp, timeoutMs: number = REGEX_TIMEOUT_MS): RegExpMatchArray | null {
  if (content.length > 1024 * 1024) {
    throw new Error("Input too large for regex processing");
  }

  const start = Date.now();
  const result = content.match(regex);

  if (Date.now() - start > timeoutMs) {
    throw new Error(`Regex operation timed out after ${timeoutMs}ms - possible ReDoS attack`);
  }

  return result;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  success: boolean;
  schemaValid: boolean;
  data: GuideMdFrontmatter | null;
  content: string;
  warnings: string[];
  unmappedFields: string[];
  error?: string;
}

export type ImportSourceType = "claude" | "cursor" | "windsurf" | "agents";

// ─── Source Detection ───────────────────────────────────────────────────────────

/**
 * Detects the type of AI context file based on filename.
 */
export function detectImportSource(filePath: string): ImportSourceType | null {
  const basename = path.basename(filePath).toLowerCase();
  
  if (basename === "claude.md") return "claude";
  if (basename === ".cursorrules") return "cursor";
  if (basename === ".windsurfrules") return "windsurf";
  if (basename === "agents.md") return "agents";
  
  return null;
}

// ─── Parsers ────────────────────────────────────────────────────────────────────

/**
 * Parses CLAUDE.md format (XML-style blocks).
 */
function parseClaudeFormat(content: string): { data: Partial<GuideMdFrontmatter>; instructions: string; unmapped: string[] } {
  const data: Partial<GuideMdFrontmatter> = {
    guide_version: "1.0.0",
    strict_typing: true,
    error_protocol: "verbose",
  };
  const unmapped: string[] = [];
  
  // Extract context block - Security: Use safeMatch with ReDoS protection
  const contextMatch = safeMatch(content, /<context>([\s\S]*?)<\/context>/);
  const contextContent = contextMatch?.[1];
  if (contextContent) {
    // Extract project name
    const projectMatch = safeMatch(contextContent, /# Project:\s*(.+)/m);
    const projectName = projectMatch?.[1];
    if (projectName) {
      data.project = projectName.trim();
    }

    // Extract description (text after project name until ## or <)
    const descMatch = safeMatch(contextContent, /# Project:[^\n]*\n+([\s\S]*?)(?=\n##|\n<|$)/);
    if (descMatch?.[1]) {
      const desc = descMatch[1].trim();
      // Only use if it's not empty, doesn't start with #, and is at least 20 chars (schema requirement)
      if (desc && !desc.startsWith("#") && desc.length >= 20) {
        data.description = desc;
      }
    }

    // Extract tech stack
    const techStackMatch = safeMatch(contextContent, /## Tech Stack([\s\S]*?)(?=##|<|$)/);
    const techContent = techStackMatch?.[1];
    if (techContent) {
      const langMatch = safeMatch(techContent, /Language:\s*(.+)/);
      if (langMatch?.[1]) {
        const langs = langMatch[1].split(/,\s*/).map(l => l.trim().toLowerCase());
        data.language = langs.length === 1 ? langs[0] as any : langs as any;
      }

      const runtimeMatch = safeMatch(techContent, /Runtime:\s*(.+)/);
      if (runtimeMatch?.[1]) {
        data.runtime = runtimeMatch[1].trim();
      }

      const frameworkMatch = safeMatch(techContent, /Framework:\s*(.+)/);
      if (frameworkMatch?.[1]) {
        const fw = frameworkMatch[1].split(/,\s*/).map(f => f.trim());
        data.framework = fw.length === 1 ? fw[0] : fw;
      }

      const strictMatch = safeMatch(techContent, /Strict Typing:\s*(Enabled|Disabled)/);
      if (strictMatch?.[1]) {
        data.strict_typing = strictMatch[1] === "Enabled";
      }
    }
  }
  
  // Extract rules block
  const rulesMatch = safeMatch(content, /<rules>([\s\S]*?)<\/rules>/);
  const rulesContent = rulesMatch?.[1];
  if (rulesContent) {
    // Extract error protocol
    const errorProtocolMatch = safeMatch(rulesContent, /Error Protocol:\s*(verbose|silent|structured)/);
    if (errorProtocolMatch?.[1]) {
      data.error_protocol = errorProtocolMatch[1] as "verbose" | "silent" | "structured";
    }

    // Extract code style hints
    const indentMatch = safeMatch(rulesContent, /Indentation:\s*(.+)/);
    const namingMatch = safeMatch(rulesContent, /Naming:\s*(.+)/);
    if (indentMatch?.[1] || namingMatch?.[1]) {
      data.code_style = {
        max_line_length: 100,
        indentation: indentMatch?.[1]?.trim() ?? "2 spaces",
        naming_convention: namingMatch?.[1] ? parseNamingConvention(namingMatch[1].trim()) as any : "camelCase",
        prefer_immutability: false,
        prefer_early_returns: true,
      };
    }

    // Extract testing hints
    const testingMatch = safeMatch(rulesContent, /## Testing\n([\s\S]*?)(?=##|<|$)/);
    const testingContent = testingMatch?.[1];
    if (testingContent) {
      const frameworkMatch = safeMatch(testingContent, /Framework:\s*(.+)/);
      const coverageMatch = safeMatch(testingContent, /Coverage:\s*(\d+)%/);

      data.testing = {
        required: true,
        test_alongside_code: false,
        framework: frameworkMatch?.[1],
        coverage_threshold: coverageMatch?.[1] ? parseInt(coverageMatch[1], 10) : undefined,
      };
    }
  }
  
  // Extract instructions (everything after rules or the main content)
  const instructionsMatch = safeMatch(content, /## Instructions\n([\s\S]*?)(?=<\/rules>|$)/);
  const instructions = instructionsMatch?.[1]?.trim() ?? "";
  
  // Default values
  if (!data.guide_version) data.guide_version = "1.0.0";
  if (!data.error_protocol) data.error_protocol = "verbose";
  if (!data.language) {
    data.language = "typescript";
    unmapped.push("Could not detect language, defaulting to 'typescript'");
  }
  if (!data.project) {
    data.project = "imported-project";
    unmapped.push("Could not detect project name, using default");
  }
  
  return { data, instructions, unmapped };
}

/**
 * Parses .cursorrules format (YAML frontmatter + markdown).
 */
function parseCursorrulesFormat(content: string): { data: Partial<GuideMdFrontmatter>; instructions: string; unmapped: string[] } {
  const unmapped: string[] = [];
  
  try {
    const parsed = matter(content);
    const frontmatter = parsed.data || {};
    
    const data: Partial<GuideMdFrontmatter> = {
      guide_version: "1.0.0",
      project: frontmatter.project || "imported-project",
      language: "typescript",
      strict_typing: true,
      error_protocol: "verbose",
    };
    
    // Map known cursorrules fields - only map string entries
    if (frontmatter.context && Array.isArray(frontmatter.context)) {
      const stringEntries = frontmatter.context.filter((item): item is string => typeof item === "string");
      if (stringEntries.length > 0) {
        data.context = {
          entry_points: stringEntries,
        };
      }
    }
    
    // Try to extract language from rules content
    const rulesContent = parsed.content || "";
    const langMatch = safeMatch(rulesContent, /@(typescript|javascript|python|rust|go|java)/i);
    if (langMatch?.[1]) {
      data.language = langMatch[1].toLowerCase() as any;
    }
    
    // Extract any unmapped fields
    const knownFields = ["project", "context", "rules"];
    Object.keys(frontmatter).forEach(key => {
      if (!knownFields.includes(key)) {
        unmapped.push(`Frontmatter field '${key}' not auto-mapped to GUIDE.md schema`);
      }
    });
    
    return { data, instructions: rulesContent, unmapped };
  } catch (e) {
    // Fallback: treat entire content as markdown instructions
    return {
      data: {
        guide_version: "1.0.0",
        project: "imported-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      },
      instructions: content,
      unmapped: ["Failed to parse frontmatter, treating entire file as instructions"],
    };
  }
}

/**
 * Parses .windsurfrules format (similar to CLAUDE.md).
 */
function parseWindsurfFormat(content: string): { data: Partial<GuideMdFrontmatter>; instructions: string; unmapped: string[] } {
  // Windsurf format is similar to CLAUDE.md but wrapped in a header
  // Strip the header and parse as CLAUDE.md
  const withoutHeader = content.replace(/^# Windsurf Rules:[^\n]*\n+/, "");
  return parseClaudeFormat(withoutHeader);
}

/**
 * Parses AGENTS.md format (OpenAI agents style).
 */
function parseAgentsFormat(content: string): { data: Partial<GuideMdFrontmatter>; instructions: string; unmapped: string[] } {
  const data: Partial<GuideMdFrontmatter> = {
    guide_version: "1.0.0",
    strict_typing: true,
    error_protocol: "verbose",
  };
  const unmapped: string[] = [];
  
  // Extract project name from H1
  const projectMatch = safeMatch(content, /^#\s+(.+)$/m);
  const projectName = projectMatch?.[1];
  if (projectName) {
    data.project = projectName.trim();
  } else {
    data.project = "imported-project";
  }

  // Extract description (first paragraph after H1)
  const descMatch = safeMatch(content, /^#[^\n]*\n+([^\n#].*?)(?=\n##|\n#|$)/s);
  const description = descMatch?.[1];
  if (description) {
    data.description = description.trim();
  }
  
  // Extract constraints from ## Constraints section
  const constraintsMatch = safeMatch(content, /## Constraints([\s\S]*?)(?=##|$)/);
  const constraints = constraintsMatch?.[1];
  if (constraints) {
    // Handle both plain "Language:" and markdown bold "**Language**:" formats
    const langMatch = safeMatch(constraints, /\*?\*?Language\*?\*?:\s*(.+)/);
    if (langMatch?.[1]) {
      const langs = langMatch[1].split(/,\s*/).map(l => l.trim().toLowerCase());
      data.language = langs.length === 1 ? langs[0] as any : langs as any;
    }

    const runtimeMatch = safeMatch(constraints, /\*?\*?Runtime\*?\*?:\s*(.+)/);
    if (runtimeMatch?.[1]) {
      data.runtime = runtimeMatch[1].trim();
    }

    const frameworkMatch = safeMatch(constraints, /\*?\*?Framework\*?\*?:\s*(.+)/);
    if (frameworkMatch?.[1]) {
      const fw = frameworkMatch[1].split(/,\s*/).map(f => f.trim());
      data.framework = fw.length === 1 ? fw[0] : fw;
    }

    const testingMatch = safeMatch(constraints, /\*?\*?Testing\*?\*?:\s*(.+)\s+with\s+(\d+)%/);
    if (testingMatch?.[1]) {
      data.testing = {
        required: true,
        test_alongside_code: false,
        framework: testingMatch[1].trim(),
        coverage_threshold: testingMatch[2] ? parseInt(testingMatch[2], 10) : undefined,
      };
    }

    const archMatch = safeMatch(constraints, /\*?\*?Architecture\*?\*?:\s*(.+)/);
    if (archMatch?.[1]) {
      data.context = {
        architecture_pattern: archMatch[1].trim() as any,
      };
    }
  }
  
  // Extract rules from ## Rules section
  const rulesMatch = safeMatch(content, /## Rules([\s\S]*?)(?=##|$)/);
  const rulesContent = rulesMatch?.[1];
  if (rulesContent) {
    const guardrails: any = {};
    
    if (rulesContent.includes("No Hallucination")) {
      guardrails.no_hallucination = true;
    }
    if (rulesContent.includes("Scope Creep Prevention")) {
      guardrails.scope_creep_prevention = true;
    }
    if (rulesContent.includes("Destructive")) {
      guardrails.dry_run_on_destructive = true;
    }
    if (rulesContent.includes("Cite Sources")) {
      guardrails.cite_sources = true;
    }
    if (rulesContent.includes("Code Style")) {
      const styleMatch = safeMatch(rulesContent, /Code Style[^\n]*max line length (\d+)[^,]*,\s*(.+?) indentation/);
      if (styleMatch?.[1] && styleMatch?.[2]) {
        data.code_style = {
          max_line_length: parseInt(styleMatch[1], 10),
          indentation: styleMatch[2].trim(),
          naming_convention: "camelCase",
          prefer_immutability: false,
          prefer_early_returns: true,
        };
      }
    }
    
    if (Object.keys(guardrails).length > 0) {
      data.guardrails = guardrails;
    }
  }
  
  // Extract instructions from ## Instructions section
  const instructionsMatch = safeMatch(content, /## Instructions([\s\S]*?)$/);
  const instructions = instructionsMatch?.[1]?.trim() ?? "";
  
  // Defaults
  if (!data.language) {
    data.language = "typescript";
    unmapped.push("Could not detect language, defaulting to 'typescript'");
  }
  
  return { data, instructions, unmapped };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function parseNamingConvention(value: string): string {
  const normalized = value.toLowerCase().replace(/[-_\s]/g, "");
  const conventions: Record<string, string> = {
    camelcase: "camelCase",
    snakecase: "snake_case",
    pascalcase: "PascalCase",
    kebabcase: "kebab-case",
    screamingsnakecase: "SCREAMING_SNAKE",
  };
  return conventions[normalized] || "camelCase";
}

// ─── Main Import Function ───────────────────────────────────────────────────────

/**
 * Imports an AI context file and converts it to GUIDE.md format.
 * 
 * @param filePath Path to the AI context file (CLAUDE.md, .cursorrules, .windsurfrules, AGENTS.md)
 * @returns ImportResult containing the parsed data and any warnings
 */
export function importGuideFile(filePath: string): ImportResult {
  const resolved = path.resolve(filePath);
  
  // Check file exists
  if (!fs.existsSync(resolved)) {
    return {
      success: false,
      schemaValid: false,
      data: null,
      content: "",
      warnings: [],
      unmappedFields: [],
      error: `File not found: ${resolved}`,
    };
  }
  
  // Detect source type
  const sourceType = detectImportSource(resolved);
  if (!sourceType) {
    return {
      success: false,
      schemaValid: false,
      data: null,
      content: "",
      warnings: [],
      unmappedFields: [],
      error: `Unsupported file format. Supported: CLAUDE.md, .cursorrules, .windsurfrules, AGENTS.md`,
    };
  }
  
  // Read file
  let content: string;
  try {
    content = fs.readFileSync(resolved, "utf-8");
  } catch (err) {
    return {
      success: false,
      schemaValid: false,
      data: null,
      content: "",
      warnings: [],
      unmappedFields: [],
      error: `Could not read file: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
  
  // Parse based on source type
  let result: { data: Partial<GuideMdFrontmatter>; instructions: string; unmapped: string[] };
  
  switch (sourceType) {
    case "claude":
      result = parseClaudeFormat(content);
      break;
    case "cursor":
      result = parseCursorrulesFormat(content);
      break;
    case "windsurf":
      result = parseWindsurfFormat(content);
      break;
    case "agents":
      result = parseAgentsFormat(content);
      break;
    default:
      return {
        success: false,
        schemaValid: false,
        data: null,
        content: "",
        warnings: [],
        unmappedFields: [],
        error: `Parser not implemented for source type: ${sourceType}`,
      };
  }
  
  // Add source comment to instructions
  const sourceName = path.basename(resolved);
  const instructionsWithHeader = `# Imported from ${sourceName}\n\n## AI Instructions\n\n${result.instructions}`;
  
  // Build warnings
  const warnings: string[] = [];
  if (result.unmapped.length > 0) {
    warnings.push(...result.unmapped.map(u => `⚠ ${u}`));
  }
  
  // Validate required fields
  if (!result.data.project) {
    warnings.push("⚠ Project name not found, using default");
  }
  if (!result.data.language) {
    warnings.push("⚠ Language not detected, defaulting to 'typescript'");
  }
  
  // Validate the imported data against the schema
  const validationResult = GuideMdSchema.safeParse(result.data);
  const schemaValid = validationResult.success;
  if (!schemaValid) {
    const schemaErrors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    warnings.push(`⚠ Schema validation failed: ${schemaErrors.join(', ')}`);
  }
  
  return {
    success: schemaValid, // Mark success=false when schema validation fails
    schemaValid,
    data: result.data as GuideMdFrontmatter,
    content: instructionsWithHeader,
    warnings,
    unmappedFields: result.unmapped,
  };
}

/**
 * Writes the imported GUIDE.md data to a file.
 * 
 * @param result The import result containing data and content
 * @param outputPath Path to write the GUIDE.md file (default: "./GUIDE.md")
 * @returns Success status and message
 */
export function writeImportedGuide(result: ImportResult, outputPath: string = "./GUIDE.md"): { success: boolean; message: string } {
  if (!result.success || !result.data) {
    return { success: false, message: "Cannot write: import was not successful" };
  }
  
  try {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const yamlContent = matter.stringify(result.content, result.data as Record<string, unknown>);
    fs.writeFileSync(outputPath, yamlContent, "utf-8");
    return { success: true, message: `Written to ${outputPath}` };
  } catch (err) {
    return { 
      success: false, 
      message: `Failed to write file: ${err instanceof Error ? err.message : "Unknown error"}` 
    };
  }
}
