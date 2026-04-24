import { GuideMdFrontmatter } from "../schema/index.js";
import { renderTemplate } from "./parser.js";
import { extractMappedSections, renderMappedSections } from "./mapping.js";
import { DEFAULT_TEMPLATE, generateBadges, generateGuardrailsSummary, generateSmartTemplate, generateAiReadinessBadge } from "./templates.js";
export { generateSmartTemplate };
import fs from "node:fs";

/**
 * Result of README generation operation.
 */
export interface GenerateResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Generated README content (empty if failed) */
  content: string;
  /** Error message if generation failed */
  error?: string;
}

/**
 * Generates a README.md string from a parsed GUIDE.md.
 * Uses the built-in template by default, or a custom template file if provided.
 * Optionally injects an AI-Readiness badge based on the doctor grade.
 * 
 * @param data - Parsed GUIDE.md frontmatter data
 * @param content - Full GUIDE.md markdown content (body after frontmatter)
 * @param customTemplatePath - Optional path to custom template file
 * @param badgeGrade - Optional AI-readiness grade for badge injection (A-F)
 * @returns GenerateResult with success status and content or error
 * 
 * @example
 * ```typescript
 * const result = generateReadme(frontmatter, markdownContent);
 * if (result.success) {
 *   fs.writeFileSync('README.md', result.content);
 * }
 * ```
 * 
 * @security Template rendering sanitizes all user input to prevent XSS
 */
export function generateReadme(
  data: GuideMdFrontmatter,
  content: string,
  customTemplatePath?: string,
  badgeGrade?: string
): GenerateResult {
  try {
    const template = customTemplatePath
      ? fs.readFileSync(customTemplatePath, "utf-8")
      : DEFAULT_TEMPLATE;

    // ── 1. Smart Mapping: extract sections from markdown body ────────────────
    const mappedSections = extractMappedSections(content);
    const mappedContent = renderMappedSections(mappedSections);
    const mappedToc = mappedSections.length > 0
      ? mappedSections.map((s) => `  - [${s.readmeHeader}](#${s.readmeHeader.toLowerCase().replace(/\s+/g, "-")})`).join("\n")
      : "";

    // ── 2. Build template data object ─────────────────────────────────────────
    const templateData: Record<string, unknown> = {
      ...data,
      badgeLine: generateBadges(data as unknown as Record<string, unknown>),
      aiReadinessBadge: badgeGrade ? generateAiReadinessBadge(badgeGrade) : "",
      guardrails_summary: generateGuardrailsSummary(data as unknown as Record<string, unknown>),
      mappedSections: mappedContent,
      mappedToc,
      // Flatten nested fields for easy template access
      architecture_pattern: data.context?.architecture_pattern,
      entry_points: data.context?.entry_points,
      off_limits: data.context?.off_limits,
      code_style: data.code_style,
      guardrails: data.guardrails,
      testing: data.testing,
    };

    // ── 3. Render template ──────────────────────────────────────────────────
    const readme = renderTemplate(template, templateData);

    return { success: true, content: readme };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error generating README";
    return { success: false, content: "", error: message };
  }
}

/**
 * Extracts value from a guidemd HTML comment marker in README content.
 * Pattern: <!-- guidemd:fieldName -->value<!-- /guidemd:fieldName -->
 */
function extractMarker(readmeContent: string, field: string): string | null {
  const regex = new RegExp(`<!--\\s*guidemd:${field}\\s*-->(.*?)<!--\\s*/guidemd:${field}\\s*-->`, "is");
  const match = readmeContent.match(regex);
  return match?.[1]?.trim() ?? null;
}

/**
 * Parses the Tech Stack section from README markdown.
 * Finds the H2 "Tech Stack" section and extracts key-value pairs from table or list format.
 */
function parseTechStackSection(readmeContent: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = readmeContent.split("\n");
  let inTechStack = false;
  let inTable = false;
  let tableHeaders: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();

    // Detect H2 "Tech Stack" header (case insensitive)
    if (/^##\s+Tech Stack/i.test(trimmed)) {
      inTechStack = true;
      inTable = false;
      tableHeaders = [];
      continue;
    }

    // Stop at next H2 or higher (## or #)
    if (inTechStack && /^#{1,2}\s+/.test(line)) {
      break;
    }

    if (!inTechStack) continue;

    // Check for table header separator (|---|---|)
    if (/^\|[-|]+\|$/.test(trimmed)) {
      inTable = true;
      continue;
    }

    // Parse table rows: | Key | Value |
    const tableMatch = line.match(/^\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (tableMatch?.[1] && tableMatch?.[2]) {
      const key = tableMatch[1].trim();
      const value = tableMatch[2].trim();
      // Skip header rows and separator lines
      if (key && value && !key.match(/^-+$/)) {
        const normalizedKey = key.toLowerCase().replace(/\s+/g, "_").replace(/\*\*/g, "");
        // Strip HTML comments from value if present
        const cleanValue = value.replace(/<!--\s*\/?guidemd:[^>]+-->/g, "").trim();
        if (cleanValue) {
          result[normalizedKey] = cleanValue;
        }
      }
      continue;
    }

    // Parse list items: - **Key**: Value  or  * **Key**: Value
    const listMatch = line?.match(/^[-*]\s*\*?\*?([^:*]+)\*?\*?:\s*(.+)/);
    if (listMatch?.[1] && listMatch?.[2]) {
      const key = listMatch[1].trim();
      const value = listMatch[2].trim();
      if (key && value) {
        const normalizedKey = key.toLowerCase().replace(/\s+/g, "_");
        // Strip HTML comments from value if present
        const cleanValue = value.replace(/<!--\s*\/?guidemd:[^>]+-->/g, "").trim();
        if (cleanValue) {
          result[normalizedKey] = cleanValue;
        }
      }
    }
  }

  return result;
}

/**
 * Attempts to parse a README.md back into GUIDE.md frontmatter.
 * This is "Bi-Directional Sync" using Parser-Back mechanism.
 * Scans README.md for specific HTML comment markers (e.g. <!-- guidemd:stack -->).
 * If the text inside those markers has changed, updates the GUIDE.md YAML to match.
 * Falls back to parsing the Tech Stack section via Markdown Block Parser if markers are missing.
 */
export function backSyncFromReadme(readmeContent: string, existingData: GuideMdFrontmatter): GuideMdFrontmatter {
  const newData = { ...existingData };
  let changed = false;

  // Helper to update if marker value differs
  const updateIfChanged = <K extends keyof GuideMdFrontmatter>(
    field: K,
    value: GuideMdFrontmatter[K] | undefined
  ) => {
    if (value !== undefined && value !== "" && JSON.stringify(value) !== JSON.stringify(existingData[field])) {
      (newData as any)[field] = value;
      changed = true;
    }
  };

  // 1. Parse marked fields
  const project = extractMarker(readmeContent, "project");
  if (project) updateIfChanged("project", project);

  const description = extractMarker(readmeContent, "description");
  if (description) updateIfChanged("description", description);

  const language = extractMarker(readmeContent, "language");
  if (language) {
    const langs = language.split(/,\s*/).map(l => l.trim().toLowerCase()).filter(Boolean);
    updateIfChanged("language", langs.length === 1 ? (langs[0] as any) : (langs as any));
  }

  const runtime = extractMarker(readmeContent, "runtime");
  if (runtime) updateIfChanged("runtime", runtime);

  const framework = extractMarker(readmeContent, "framework");
  if (framework) {
    const fws = framework.split(/,\s*/).map(f => f.trim()).filter(Boolean);
    updateIfChanged("framework", fws.length === 1 ? fws[0] : fws);
  }

  const architecture = extractMarker(readmeContent, "architecture_pattern");
  if (architecture) {
    const validPatterns = ["mvc", "clean", "hexagonal", "layered", "microservices", "monolith", "serverless", "event-driven"];
    if (validPatterns.includes(architecture.toLowerCase())) {
      updateIfChanged("context", {
        ...existingData.context,
        architecture_pattern: architecture.toLowerCase() as any,
      });
    }
  }

  // 2. Fallback: Parse Tech Stack section via Markdown Block Parser
  const techStack = parseTechStackSection(readmeContent);

  if (!language && techStack.language) {
    const langs = techStack.language.split(/,\s*/).map(l => l.trim().toLowerCase()).filter(Boolean);
    if (langs.length > 0) {
      updateIfChanged("language", langs.length === 1 ? (langs[0] as any) : (langs as any));
    }
  }

  if (!runtime && techStack.runtime) {
    updateIfChanged("runtime", techStack.runtime);
  }

  if (!framework && techStack.framework) {
    const fws = techStack.framework.split(/,\s*/).map(f => f.trim()).filter(Boolean);
    updateIfChanged("framework", fws.length === 1 ? fws[0] : fws);
  }

  if (!project) {
    const projectMatch = readmeContent.match(/^#\s+(.+)/m);
    if (projectMatch?.[1]) {
      const title = projectMatch[1].trim().toLowerCase().replace(/\s+/g, "-");
      updateIfChanged("project", title);
    }
  }

  return newData;
}
