import { GuideMdFrontmatter } from "../schema/index.js";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type ExportTarget = "claude" | "cursor" | "windsurf" | "agents" | "copilot" | "aider" | "all";

export interface ExportResult {
  target: string;
  file: string;
  success: boolean;
}

// ─── Adapters ────────────────────────────────────────────────────────────────

interface ExporterAdapter {
  fileName: string;
  transform: (data: GuideMdFrontmatter, instructions: string) => string;
}

const ClaudeAdapter: ExporterAdapter = {
  fileName: "CLAUDE.md",
  transform: (data, instructions) => {
    return `<context>
# Project: ${data.project}
${data.description || ""}

## Tech Stack
- Language: ${Array.isArray(data.language) ? data.language.join(", ") : data.language}
${data.runtime ? `- Runtime: ${data.runtime}` : ""}
${data.framework ? `- Framework: ${Array.isArray(data.framework) ? data.framework.join(", ") : data.framework}` : ""}
${data.strict_typing ? "- Strict Typing: Enabled" : ""}
</context>

<rules>
## Coding Standards
- Error Protocol: ${data.error_protocol}
${data.code_style ? `- Indentation: ${data.code_style.indentation}` : ""}
${data.code_style ? `- Naming: ${data.code_style.naming_convention}` : ""}

${data.testing?.required ? `## Testing\n- Framework: ${data.testing.framework}\n- Coverage: ${data.testing.coverage_threshold}%` : ""}

## Instructions
${instructions.trim()}
</rules>`;
  }
};

const CursorAdapter: ExporterAdapter = {
  fileName: ".cursorrules",
  transform: (data, instructions) => {
    const rules = instructions
      .split("\n")
      .filter(line => line.trim().length > 0)
      .map(line => line.startsWith("-") || line.startsWith("#") ? line : `- ${line}`)
      .join("\n");

    const metadata = {
      project: data.project,
      context: data.context?.entry_points || [],
      rules: "Strict adherence required. Use @-directives to reference files mentioned in entry_points."
    };

    return matter.stringify(`\n# Project Rules\n${rules}`, metadata);
  }
};

const WindsurfAdapter: ExporterAdapter = {
  fileName: ".windsurfrules",
  transform: (data, instructions) => {
    return `# Windsurf Rules: ${data.project}\n\n${ClaudeAdapter.transform(data, instructions)}`;
  }
};

const AgentsAdapter: ExporterAdapter = {
  fileName: "AGENTS.md",
  transform: (data, instructions) => {
    const guardrails = data.guardrails;
    const rules: string[] = [];
    
    if (guardrails?.no_hallucination) {
      rules.push("- **No Hallucination**: Do not invent APIs, packages, or type signatures");
    }
    if (guardrails?.scope_creep_prevention) {
      rules.push("- **Scope Creep Prevention**: Only modify files/functions explicitly referenced");
    }
    if (guardrails?.dry_run_on_destructive) {
      rules.push("- **Destructive Operations**: Always preview destructive changes before executing");
    }
    if (guardrails?.cite_sources) {
      rules.push("- **Cite Sources**: Include inline comments citing documentation for unfamiliar APIs");
    }
    if (data.code_style) {
      rules.push(`- **Code Style**: Max line length ${data.code_style.max_line_length}, ${data.code_style.indentation} indentation, ${data.code_style.naming_convention} naming`);
    }
    if (data.error_protocol) {
      rules.push(`- **Error Protocol**: ${data.error_protocol}`);
    }
    if (data.strict_typing) {
      rules.push("- **Strict Typing**: Always use explicit types; never 'any' or untyped params");
    }

    return `# ${data.project}

${data.description || ""}

## Constraints

- **Language**: ${Array.isArray(data.language) ? data.language.join(", ") : data.language}
${data.runtime ? `- **Runtime**: ${data.runtime}` : ""}
${data.framework ? `- **Framework**: ${Array.isArray(data.framework) ? data.framework.join(", ") : data.framework}` : ""}
${data.testing?.required ? `- **Testing**: ${data.testing.framework} with ${data.testing.coverage_threshold}% coverage` : ""}
${data.context?.architecture_pattern ? `- **Architecture**: ${data.context.architecture_pattern}` : ""}

## Rules

${rules.length > 0 ? rules.join("\n") : "- Follow standard best practices for the tech stack"}

## Instructions

${instructions.trim()}`;
  }
};

const CopilotAdapter: ExporterAdapter = {
  fileName: ".github/copilot-instructions.md",
  transform: (data, instructions) => {
    return `<!-- guidemd:generated -->
# ${data.project}

${data.description || ""}

## Project Context

- **Language**: ${Array.isArray(data.language) ? data.language.join(", ") : data.language}
${data.runtime ? `- **Runtime**: ${data.runtime}` : ""}
${data.framework ? `- **Framework**: ${Array.isArray(data.framework) ? data.framework.join(", ") : data.framework}` : ""}
- **Strict Typing**: ${data.strict_typing ? "Enabled" : "Disabled"}
- **Error Protocol**: ${data.error_protocol || "verbose"}

${data.code_style ? `## Code Style

- Max line length: ${data.code_style.max_line_length}
- Indentation: ${data.code_style.indentation}
- Naming convention: ${data.code_style.naming_convention}
${data.code_style.max_function_lines ? `- Max function lines: ${data.code_style.max_function_lines}` : ""}
` : ""}

${data.guardrails ? `## Guardrails

${data.guardrails.no_hallucination ? "- Do not invent APIs, packages, or type signatures\n" : ""}${data.guardrails.scope_creep_prevention ? "- Only modify files/functions explicitly referenced in the prompt\n" : ""}${data.guardrails.dry_run_on_destructive ? "- Preview destructive operations before executing\n" : ""}${data.guardrails.cite_sources ? "- Cite documentation sources when using unfamiliar APIs\n" : ""}` : ""}

## AI Instructions

${instructions.trim()}`;
  }
};

/**
 * Escapes a string value for safe YAML emission.
 * Quotes strings that contain special characters or start with YAML indicators.
 */
function escapeYamlString(value: string): string {
  // Check if string needs quoting
  const needsQuoting = /[:#\"'{[\],>&*!|]/.test(value) ||
    value.startsWith("-") ||
    value.startsWith("?") ||
    value.startsWith("%") ||
    /^(true|false|null|yes|no|on|off)$/i.test(value) ||
    /\n/.test(value) ||
    value.trim() !== value;
  
  if (!needsQuoting) {
    return value;
  }
  
  // Use double quotes and escape special characters
  return '"' + value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t") + '"';
}

const AiderAdapter: ExporterAdapter = {
  fileName: ".aider.conf.yml",
  transform: (data) => {
    const config: Record<string, unknown> = {
      // Map GUIDE.md fields to Aider's known YAML keys
      auto_commits: data.guardrails?.dry_run_on_destructive === false, // inverse
    };
    
    // Map ai_model_target to model if specified
    if (data.ai_model_target) {
      const model = Array.isArray(data.ai_model_target) ? data.ai_model_target[0] : data.ai_model_target;
      config.model = model;
    }
    
    // Build read list from entry_points
    if (data.context?.entry_points && data.context.entry_points.length > 0) {
      config.read = data.context.entry_points;
    }
    
    // Add custom metadata as comments in the YAML content
    const lines: string[] = [
      "# Aider configuration generated from GUIDE.md",
      "# https://aider.chat/docs/config/aider_conf.html"
    ];
    
    // Add language hint as comment
    if (data.language) {
      const lang = Array.isArray(data.language) ? data.language[0] : data.language;
      lines.push(`# Language: ${lang}`);
    }
    
    // Add framework hint as comment
    if (data.framework) {
      const fw = Array.isArray(data.framework) ? data.framework.join(", ") : data.framework;
      lines.push(`# Framework: ${fw}`);
    }
    
    // Add code style as comment
    if (data.code_style?.max_line_length) {
      lines.push(`# Max line length: ${data.code_style.max_line_length}`);
    }
    
    // Add error protocol as comment
    if (data.error_protocol) {
      lines.push(`# Error protocol: ${data.error_protocol}`);
    }
    
    lines.push("");
    
    // Add actual YAML config with proper escaping
    Object.entries(config).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        lines.push(`${key}:`);
        value.forEach(v => {
          if (typeof v === "string") {
            lines.push(`  - ${escapeYamlString(v)}`);
          } else {
            lines.push(`  - ${v}`);
          }
        });
      } else if (typeof value === "boolean") {
        lines.push(`${key}: ${value}`);
      } else if (typeof value === "string") {
        lines.push(`${key}: ${escapeYamlString(value)}`);
      } else if (typeof value === "number") {
        lines.push(`${key}: ${value}`);
      }
    });
    
    return lines.join("\n");
  }
};

const ADAPTERS: Record<string, ExporterAdapter> = {
  claude: ClaudeAdapter,
  cursor: CursorAdapter,
  windsurf: WindsurfAdapter,
  agents: AgentsAdapter,
  copilot: CopilotAdapter,
  aider: AiderAdapter
};

// ─── Core Logic ─────────────────────────────────────────────────────────────

/**
 * Exports GUIDE.md to various AI context formats.
 * Creates necessary directories (e.g., .github/) for nested file paths.
 */
export function exportGuide(data: GuideMdFrontmatter, instructions: string, targetDir: string, target: ExportTarget): ExportResult[] {
  const results: ExportResult[] = [];
  const toExport = target === "all" ? (Object.keys(ADAPTERS) as ExportTarget[]) : [target];

  for (const t of toExport) {
    const adapter = ADAPTERS[t];
    if (!adapter) continue;

    const content = adapter.transform(data, instructions);
    const filePath = path.join(targetDir, adapter.fileName);
    
    try {
      // Ensure parent directories exist for nested paths like .github/copilot-instructions.md
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, content, "utf-8");
      results.push({ target: t, file: adapter.fileName, success: true });
    } catch (e) {
      results.push({ target: t, file: adapter.fileName, success: false });
    }
  }

  return results;
}

export function generateBadge(grade: string = "A"): string {
  const colors: Record<string, string> = {
    "A": "brightgreen",
    "B": "green",
    "C": "yellow",
    "D": "orange",
    "F": "red"
  };
  const color = colors[grade] || "blue";
  return `[![AI-Ready](https://img.shields.io/badge/AI--Ready-Grade_${grade}-${color}?style=for-the-badge&logo=ai)](https://guidemd.dev)`;
}

// ─── MCP Manifest Export ─────────────────────────────────────────────────────

export interface McpManifest {
  schema_version: string;
  project: string;
  description: string;
  ai_interface: {
    protocol: "guidemd";
    version: string;
    capabilities: string[];
    tools: Array<{
      name: string;
      description: string;
      parameters?: Record<string, unknown>;
    }>;
    resources: Array<{
      uri: string;
      mimeType: string;
      description: string;
    }>;
  };
  context: {
    entry_points: string[];
    off_limits: string[];
    architecture_pattern?: string | undefined;
  };
  runtime: {
    language: string | string[];
    runtime?: string | undefined;
    framework?: string | string[] | undefined;
    strict_typing?: boolean | undefined;
  };
  guardrails: {
    no_hallucination: boolean;
    scope_creep_prevention: boolean;
    dry_run_on_destructive: boolean;
    max_response_scope?: string | undefined;
  };
}

/**
 * Generates an MCP-compatible manifest.json file.
 * This allows MCP-compatible IDEs to instantly see the project's AI Interface capabilities.
 */
export function generateMcpManifest(data: GuideMdFrontmatter, content: string): McpManifest {
  const frameworks = Array.isArray(data.framework) ? data.framework : data.framework ? [data.framework] : [];
  const languages = Array.isArray(data.language) ? data.language : data.language ? [data.language] : [];

  return {
    schema_version: "1.0.0",
    project: data.project,
    description: data.description || "",
    ai_interface: {
      protocol: "guidemd",
      version: data.guide_version || "1.0.0",
      capabilities: [
        "context_awareness",
        "code_generation",
        "refactoring",
        "documentation",
        "testing",
      ],
      tools: [
        {
          name: "get_context",
          description: "Retrieve the complete GUIDE.md frontmatter and context",
        },
        {
          name: "get_naming_conventions",
          description: "Get the project's naming conventions and code style rules",
        },
        {
          name: "get_architecture",
          description: "Get the project's architecture pattern and constraints",
        },
        {
          name: "get_guardrails",
          description: "Get the AI guardrails and safety constraints",
        },
        {
          name: "get_testing_requirements",
          description: "Get the testing framework and coverage requirements",
        },
        {
          name: "get_runtime_info",
          description: "Get the runtime and dependency information",
        },
      ],
      resources: [
        {
          uri: "guidemd://frontmatter",
          mimeType: "application/json",
          description: "Complete GUIDE.md frontmatter as structured data",
        },
        {
          uri: "guidemd://overview",
          mimeType: "text/markdown",
          description: "Project overview section from GUIDE.md",
        },
        {
          uri: "guidemd://domain",
          mimeType: "text/markdown",
          description: "Domain vocabulary and terminology",
        },
        {
          uri: "guidemd://decisions",
          mimeType: "text/markdown",
          description: "Non-obvious architectural decisions",
        },
        {
          uri: "guidemd://antipatterns",
          mimeType: "text/markdown",
          description: "Anti-patterns and what NOT to do",
        },
      ],
    },
    context: {
      entry_points: data.context?.entry_points || [],
      off_limits: data.context?.off_limits || [],
      architecture_pattern: data.context?.architecture_pattern,
    },
    runtime: {
      language: languages,
      runtime: data.runtime,
      framework: frameworks.length > 0 ? frameworks : undefined,
      strict_typing: data.strict_typing,
    },
    guardrails: {
      no_hallucination: data.guardrails?.no_hallucination ?? false,
      scope_creep_prevention: data.guardrails?.scope_creep_prevention ?? false,
      dry_run_on_destructive: data.guardrails?.dry_run_on_destructive ?? false,
      max_response_scope: data.guardrails?.max_response_scope,
    },
  };
}

/**
 * Exports the MCP manifest to a file.
 */
export function exportMcpManifest(
  data: GuideMdFrontmatter,
  content: string,
  targetDir: string
): { success: boolean; file: string } {
  const manifest = generateMcpManifest(data, content);
  const filePath = path.join(targetDir, "guidemd-manifest.json");

  try {
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), "utf-8");
    return { success: true, file: "guidemd-manifest.json" };
  } catch (e) {
    return { success: false, file: "guidemd-manifest.json" };
  }
}
