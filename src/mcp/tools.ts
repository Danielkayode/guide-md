import { GuideMdFrontmatter } from "../schema/index.js";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOLS: McpTool[] = [
  {
    name: "get_context",
    description: "Retrieve complete project context from GUIDE.md including overview, domain vocabulary, and architecture",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_naming_conventions",
    description: "Get code style preferences: naming convention (camelCase/snake_case), max line length, indentation, function size limits",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_architecture",
    description: "Get project architecture info: entry points, off-limits files/folders, architecture pattern (layered/hexagonal/etc)",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_guardrails",
    description: "Get AI behavior constraints: no_hallucination flag, dry_run_on_destructive, scope_creep_prevention, max_response_scope",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_testing_requirements",
    description: "Get testing configuration: required flag, framework, coverage threshold, test_alongside_code preference",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_runtime_info",
    description: "Get runtime and framework info: language, runtime version, framework, strict_typing, error_protocol",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
}

export function callTool(name: string, data: GuideMdFrontmatter, content: string): ToolCallResult {
  switch (name) {
    case "get_context":
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            project: data.project,
            description: data.description,
            guide_version: data.guide_version,
            last_updated: data.last_updated,
            ai_model_target: data.ai_model_target
          }, null, 2)
        }]
      };

    case "get_naming_conventions":
      return {
        content: [{
          type: "text",
          text: data.code_style
            ? JSON.stringify({
                naming_convention: data.code_style.naming_convention,
                max_line_length: data.code_style.max_line_length,
                indentation: data.code_style.indentation,
                max_function_lines: data.code_style.max_function_lines,
                prefer_immutability: data.code_style.prefer_immutability,
                prefer_early_returns: data.code_style.prefer_early_returns
              }, null, 2)
            : "No code_style configured in GUIDE.md"
        }]
      };

    case "get_architecture":
      return {
        content: [{
          type: "text",
          text: data.context
            ? JSON.stringify({
                entry_points: data.context.entry_points,
                off_limits: data.context.off_limits,
                architecture_pattern: data.context.architecture_pattern
              }, null, 2)
            : "No context section configured in GUIDE.md"
        }]
      };

    case "get_guardrails":
      return {
        content: [{
          type: "text",
          text: data.guardrails
            ? JSON.stringify({
                no_hallucination: data.guardrails.no_hallucination,
                scope_creep_prevention: data.guardrails.scope_creep_prevention,
                cite_sources: data.guardrails.cite_sources,
                dry_run_on_destructive: data.guardrails.dry_run_on_destructive,
                max_response_scope: data.guardrails.max_response_scope
              }, null, 2)
            : "No guardrails configured in GUIDE.md"
        }]
      };

    case "get_testing_requirements":
      return {
        content: [{
          type: "text",
          text: data.testing
            ? JSON.stringify({
                required: data.testing.required,
                framework: data.testing.framework,
                coverage_threshold: data.testing.coverage_threshold,
                test_alongside_code: data.testing.test_alongside_code
              }, null, 2)
            : "No testing section configured in GUIDE.md"
        }]
      };

    case "get_runtime_info":
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            language: data.language,
            runtime: data.runtime,
            framework: data.framework,
            strict_typing: data.strict_typing,
            error_protocol: data.error_protocol
          }, null, 2)
        }]
      };

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }]
      };
  }
}
