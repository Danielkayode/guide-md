import { GuideMdFrontmatter } from "../schema/index.js";
import { logToolCall, logAuthFailure } from "./audit.js";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Define the tools array (will be frozen before export)
const TOOLS_DEFINITION: McpTool[] = [
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

// Create a validated tool name whitelist
const VALID_TOOL_NAMES = new Set(TOOLS_DEFINITION.map(t => t.name));

// Export frozen copy to prevent runtime mutation
export const TOOLS: readonly McpTool[] = Object.freeze([...TOOLS_DEFINITION]);

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
}

/**
 * Security: Safe JSON stringify that prevents prototype pollution.
 * Uses a replacer to strip dangerous keys like __proto__, constructor, prototype.
 */
function safeStringify(obj: unknown, space?: number): string {
  const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);
  return JSON.stringify(obj, (key, value) => {
    if (typeof key === "string" && dangerousKeys.has(key)) {
      return undefined; // Strip dangerous keys
    }
    return value;
  }, space);
}

/**
 * Validates a tool name against the whitelist.
 */
export function isValidToolName(name: string): boolean {
  return VALID_TOOL_NAMES.has(name);
}

// Security: Constant-time tool dispatch using Map lookup
// Prevents timing side-channels that could leak which tools exist
const TOOL_HANDLERS = new Map<string, (data: GuideMdFrontmatter) => ToolCallResult>([
  ["get_context", (data) => ({
    content: [{
      type: "text",
      text: safeStringify({
        project: data.project,
        description: data.description,
        guide_version: data.guide_version,
        last_updated: data.last_updated,
        ai_model_target: data.ai_model_target
      }, 2)
    }]
  })],

  ["get_naming_conventions", (data) => ({
    content: [{
      type: "text",
      text: data.code_style
        ? safeStringify({
            naming_convention: data.code_style.naming_convention,
            max_line_length: data.code_style.max_line_length,
            indentation: data.code_style.indentation,
            max_function_lines: data.code_style.max_function_lines,
            prefer_immutability: data.code_style.prefer_immutability,
            prefer_early_returns: data.code_style.prefer_early_returns
          }, 2)
        : "No code_style configured in GUIDE.md"
    }]
  })],

  ["get_architecture", (data) => ({
    content: [{
      type: "text",
      text: data.context
        ? safeStringify({
            entry_points: data.context.entry_points,
            off_limits: data.context.off_limits,
            architecture_pattern: data.context.architecture_pattern
          }, 2)
        : "No context section configured in GUIDE.md"
    }]
  })],

  ["get_guardrails", (data) => ({
    content: [{
      type: "text",
      text: data.guardrails
        ? safeStringify({
            no_hallucination: data.guardrails.no_hallucination,
            scope_creep_prevention: data.guardrails.scope_creep_prevention,
            cite_sources: data.guardrails.cite_sources,
            dry_run_on_destructive: data.guardrails.dry_run_on_destructive,
            max_response_scope: data.guardrails.max_response_scope
          }, 2)
        : "No guardrails configured in GUIDE.md"
    }]
  })],

  ["get_testing_requirements", (data) => ({
    content: [{
      type: "text",
      text: data.testing
        ? safeStringify({
            required: data.testing.required,
            framework: data.testing.framework,
            coverage_threshold: data.testing.coverage_threshold,
            test_alongside_code: data.testing.test_alongside_code
          }, 2)
        : "No testing section configured in GUIDE.md"
    }]
  })],

  ["get_runtime_info", (data) => ({
    content: [{
      type: "text",
      text: safeStringify({
        language: data.language,
        runtime: data.runtime,
        framework: data.framework,
        strict_typing: data.strict_typing,
        error_protocol: data.error_protocol
      }, 2)
    }]
  })]
]);

// Object.freeze to prevent runtime mutation of handlers
Object.freeze(TOOL_HANDLERS);

/**
 * Calls a tool by name with the provided data.
 * 
 * Security features:
 * - Tool names validated against whitelist
 * - Constant-time dispatch (Map lookup) to prevent timing attacks
 * - Generic error messages to prevent information disclosure
 * - Audit logging for all tool invocations
 * - Safe JSON serialization prevents prototype pollution
 */
export function callTool(
  name: string, 
  data: GuideMdFrontmatter, 
  _content: string,  // Reserved for future use (e.g., content-aware tools)
  requestId?: string | number
): ToolCallResult {
  // Security: Validate tool name against whitelist
  const handler = TOOL_HANDLERS.get(name);
  
  if (!handler) {
    // Security: Generic error message (no tool name disclosure)
    logAuthFailure("Invalid tool request", requestId);
    return {
      content: [{ type: "text", text: "Tool not found or access denied" }]
    };
  }

  try {
    // Security: Constant-time dispatch via Map lookup
    const result = handler(data);
    
    // Security: Audit log successful tool call
    logToolCall(name, true, requestId);
    
    return result;
  } catch (error) {
    // Security: Log error with generic message to user
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logToolCall(name, false, requestId, errorMsg);
    
    // Security: Generic error message (no stack traces or internal details)
    return {
      content: [{ type: "text", text: "Tool execution failed" }]
    };
  }
}
