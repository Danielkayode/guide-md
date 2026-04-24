import { GuideMdFrontmatter } from "../schema/index.js";
import { TOOLS, callTool, ToolCallResult } from "./tools.js";
import { BASE_RESOURCES, readResource, ResourceContent, SkillResource } from "./resources.js";
import { logRateLimit } from "./audit.js";
import { detectSkills, validateSkill } from "../skills/index.js";
import path from "node:path";

// ─── Security Configuration ─────────────────────────────────────────────────

const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB max request size
const VALID_METHODS = new Set([
  "initialize",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/read"
]);

// ─── Rate Limiting Configuration ─────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 120; // Max 120 requests per minute
const RATE_LIMIT_BURST_SIZE = 10; // Max 10 requests in a burst

// ─── Types ─────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | undefined;
  method: string;
  params?: Record<string, unknown> | undefined;
}

// ─── Input Validation ───────────────────────────────────────────────────────────
// Export security functions for testing
export { isValidId, isValidMethod, isValidParams, validateRequest, deepSanitize };

/**
 * Validates a JSON-RPC request ID to prevent injection attacks.
 */
function isValidId(id: unknown): id is number | string | undefined {
  if (id === undefined) return true;
  if (typeof id === "number") return Number.isInteger(id) && id >= 0 && id < 1000000;
  if (typeof id === "string") return id.length <= 100 && /^[a-zA-Z0-9_-]+$/.test(id);
  return false;
}

/**
 * Validates a JSON-RPC method name.
 */
function isValidMethod(method: unknown): method is string {
  return typeof method === "string" && VALID_METHODS.has(method);
}

/**
 * Validates that params is a safe object without prototype pollution risks.
 * Recursively checks all nested objects.
 */
function isValidParams(params: unknown): params is Record<string, unknown> {
  if (params === undefined) return true;
  if (typeof params !== "object" || params === null) return false;
  if (Array.isArray(params)) return false;
  
  return validateObjectDeep(params as Record<string, unknown>);
}

/**
 * Recursively validates an object and its nested properties for prototype pollution risks.
 * Handles both string and Symbol keys.
 */
function validateObjectDeep(obj: Record<string, unknown>, depth = 0): boolean {
  // Prevent deeply nested objects from causing stack overflow
  if (depth > 10) return false;
  
  // Check for dangerous keys that could cause prototype pollution
  const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);
  
  // Use Reflect.ownKeys to catch both string and Symbol keys
  for (const key of Reflect.ownKeys(obj)) {
    // Skip Symbol keys - they cannot cause prototype pollution on plain objects
    if (typeof key === "symbol") continue;
    
    if (dangerousKeys.has(key)) return false;
    if (key.length > 100) return false; // Prevent key flooding
    
    const value = obj[key];
    
    // Recursively check nested objects
    if (value !== null && typeof value === "object") {
      if (Array.isArray(value)) {
        // Check array elements
        for (const item of value) {
          if (item !== null && typeof item === "object" && !Array.isArray(item)) {
            if (!validateObjectDeep(item as Record<string, unknown>, depth + 1)) {
              return false;
            }
          }
        }
      } else {
        // Check nested object
        if (!validateObjectDeep(value as Record<string, unknown>, depth + 1)) {
          return false;
        }
      }
    }
  }
  
  return true;
}

/**
 * Creates a null-prototype object to prevent prototype pollution.
 */
function createNullProtoObject(): Record<string, unknown> {
  return Object.create(null);
}

/**
 * Deep sanitizes a parsed value by:
 * 1. Replacing all objects with null-prototype objects
 * 2. Removing dangerous keys (__proto__, constructor, prototype)
 * 3. Limiting nesting depth
 */
function deepSanitize(value: unknown, depth = 0): unknown {
  // Prevent stack overflow from deeply nested structures
  if (depth > 20) {
    throw new Error("JSON nesting depth exceeded maximum allowed");
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => deepSanitize(item, depth + 1));
  }

  // Create null-prototype object
  const sanitized = createNullProtoObject();
  const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);

  for (const key of Object.keys(value as Record<string, unknown>)) {
    // Skip dangerous keys entirely
    if (dangerousKeys.has(key)) {
      continue;
    }

    // Validate key length to prevent key flooding
    if (key.length > 100) {
      throw new Error(`Key length exceeds maximum: ${key.slice(0, 20)}...`);
    }

    // Validate key doesn't contain null bytes or other control characters
    if (key.includes("\x00") || key.includes("\x01") || key.includes("\x02")) {
      throw new Error("Key contains invalid characters");
    }

    sanitized[key] = deepSanitize((value as Record<string, unknown>)[key], depth + 1);
  }

  // Freeze the object to prevent runtime mutation
  Object.freeze(sanitized);

  return sanitized;
}

/**
 * Securely parses JSON with prototype pollution protection.
 * Uses a two-pass approach: parse then deep sanitize.
 */
function secureJsonParse(text: string): unknown {
  // First, do a quick scan for obvious prototype pollution attempts
  // Check for __proto__, constructor, or prototype as object keys (with optional whitespace)
  const pollutionPattern = /"\s*(__proto__|constructor|prototype)\s*"\s*:/;
  if (pollutionPattern.test(text)) {
    throw new Error("Prototype pollution attempt detected in JSON");
  }

  // Parse the JSON (this creates objects with default prototype)
  const parsed = JSON.parse(text);

  // Deep sanitize to remove any pollution and create null-prototype objects
  return deepSanitize(parsed);
}

/**
 * Validates and sanitizes a complete JSON-RPC request.
 * Returns null if the request is invalid or potentially malicious.
 */
function validateRequest(request: unknown): JsonRpcRequest | null {
  if (!request || typeof request !== "object") return null;
  
  const req = request as Record<string, unknown>;
  
  // Validate jsonrpc version
  if (req.jsonrpc !== "2.0") return null;
  
  // Validate id
  if (!isValidId(req.id)) return null;
  
  // Validate method
  if (!isValidMethod(req.method)) return null;
  
  // Validate params
  if (!isValidParams(req.params)) return null;
  
  // Construct validated request
  return {
    jsonrpc: "2.0",
    id: req.id,
    method: req.method,
    params: req.params
  };
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string | undefined;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export class McpServer {
  private data: GuideMdFrontmatter;
  private content: string;
  private projectRoot: string;
  private skillResources: SkillResource[] = [];
  // Rate limiting state
  private requestTimestamps: number[] = [];
  private lastRequestTime: number = 0;

  constructor(data: GuideMdFrontmatter, content: string, projectRoot: string = process.cwd()) {
    this.data = data;
    this.content = content;
    this.projectRoot = projectRoot;
    this.discoverSkills();
  }

  /**
   * Discovers and validates skills in the project to expose as MCP resources.
   */
  private discoverSkills(): void {
    try {
      const skills = detectSkills(this.projectRoot);
      this.skillResources = skills
        .map(skill => {
          const validation = validateSkill(skill.path);
          if (validation.valid && validation.data) {
            return {
              uri: `guidemd://skills/${validation.data.name}`,
              name: `Skill: ${validation.data.name}`,
              description: validation.data.description,
              mimeType: "text/markdown",
              skillPath: skill.path
            };
          }
          return null;
        })
        .filter((s): s is SkillResource => s !== null);
    } catch (error) {
      this.skillResources = [];
    }
  }

  /**
   * Checks if the current request is within rate limits.
   * Returns true if allowed, false if rate limited.
   */
  private checkRateLimit(): boolean {
    const now = Date.now();

    // Clean up old timestamps outside the window
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > windowStart);

    // Check burst limit (requests in last 100ms)
    const burstStart = now - 100;
    const burstCount = this.requestTimestamps.filter(ts => ts > burstStart).length;
    if (burstCount >= RATE_LIMIT_BURST_SIZE) {
      return false;
    }

    // Check window limit
    if (this.requestTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }

    // Record this request
    this.requestTimestamps.push(now);
    this.lastRequestTime = now;
    return true;
  }

  handleRequest(request: JsonRpcRequest): JsonRpcResponse {
    // Validate request before processing
    const validated = validateRequest(request);
    if (!validated) {
      return this.errorResponse(request.id, -32600, "Invalid Request");
    }

    switch (validated.method) {
      case "initialize":
        return this.handleInitialize(validated);
      case "tools/list":
        return this.handleToolsList(validated);
      case "tools/call":
        return this.handleToolsCall(validated);
      case "resources/list":
        return this.handleResourcesList(validated);
      case "resources/read":
        return this.handleResourcesRead(validated);
      default:
        return this.errorResponse(validated.id, -32601, "Method not found");
    }
  }

  private handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
          resources: {}
        },
        serverInfo: {
          name: "guidemd-mcp",
          version: "0.1.0"
        }
      }
    };
  }

  private handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { tools: TOOLS }
    };
  }

  private handleToolsCall(request: JsonRpcRequest): JsonRpcResponse {
    const name = request.params?.name;
    if (typeof name !== "string") {
      return this.errorResponse(request.id, -32602, "Missing or invalid tool name");
    }

    const result = callTool(name, this.data, this.content);

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: result.content
      }
    };
  }

  private handleResourcesList(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { 
        resources: [...BASE_RESOURCES, ...this.skillResources] 
      }
    };
  }

  private handleResourcesRead(request: JsonRpcRequest): JsonRpcResponse {
    const uri = request.params?.uri;
    if (typeof uri !== "string") {
      return this.errorResponse(request.id, -32602, "Missing or invalid resource URI");
    }

    if (process.env.NODE_ENV === "test") {
      console.error(`Requested URI: ${uri}`);
      console.error(`Available skill URIs: ${this.skillResources.map(s => s.uri).join(", ")}`);
    }

    const resource = readResource(uri, this.data, this.content, this.skillResources);
    if (!resource) {
      return this.errorResponse(request.id, -32602, `Resource not found: ${uri}`);
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        contents: [resource]
      }
    };
  }

  private errorResponse(id: number | string | undefined, code: number, message: string): JsonRpcResponse {
    // Security: Validate the ID before returning it to prevent ID reflection attacks
    const safeId = isValidId(id) ? id : undefined;
    return {
      jsonrpc: "2.0",
      id: safeId,
      error: { code, message }
    };
  }

  start(): void {
    process.stdin.setEncoding("utf-8");
    
    let buffer = "";
    let totalSize = 0;
    
    process.stdin.on("data", (chunk: string) => {
      // Security: Enforce maximum request size to prevent DoS (using byte length, not character count)
      totalSize += Buffer.byteLength(chunk, "utf8");
      if (totalSize > MAX_REQUEST_SIZE) {
        const errorResponse: JsonRpcResponse = {
          jsonrpc: "2.0",
          error: { code: -32600, message: "Request too large" }
        };
        process.stdout.write(JSON.stringify(errorResponse) + "\n");
        process.exit(1);
        return;
      }
      
      buffer += chunk;
      
      // Handle line-delimited JSON-RPC
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (!line.trim()) continue;

        // Security: Check rate limits before processing
        if (!this.checkRateLimit()) {
          // Security: Log rate limit events for audit trail
          logRateLimit();
          const errorResponse: JsonRpcResponse = {
            jsonrpc: "2.0",
            id: undefined,
            error: { code: -32000, message: "Rate limit exceeded" }
          };
          process.stdout.write(JSON.stringify(errorResponse) + "\n");
          continue;
        }

        // Security: Check individual line length
        if (line.length > 100000) {
          const errorResponse: JsonRpcResponse = {
            jsonrpc: "2.0",
            id: undefined,
            error: { code: -32600, message: "Request line too large" }
          };
          process.stdout.write(JSON.stringify(errorResponse) + "\n");
          continue;
        }

        try {
          const request = secureJsonParse(line) as JsonRpcRequest;
          const response = this.handleRequest(request);
          process.stdout.write(JSON.stringify(response) + "\n");
        } catch (e) {
          // Handle parse errors without leaking internal details
          const errorResponse: JsonRpcResponse = {
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" }
          };
          process.stdout.write(JSON.stringify(errorResponse) + "\n");
        }
      }
    });
    
    // Handle stdin end gracefully
    process.stdin.on("end", () => {
      // Process any remaining content in buffer
      if (buffer.trim()) {
        // Security: Check rate limits before processing final buffer
        if (!this.checkRateLimit()) {
          logRateLimit();
          const errorResponse: JsonRpcResponse = {
            jsonrpc: "2.0",
            id: undefined,
            error: { code: -32000, message: "Rate limit exceeded" }
          };
          process.stdout.write(JSON.stringify(errorResponse) + "\n");
          return;
        }

        try {
          const request = secureJsonParse(buffer) as JsonRpcRequest;
          const response = this.handleRequest(request);
          process.stdout.write(JSON.stringify(response) + "\n");
        } catch {
          const errorResponse: JsonRpcResponse = {
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" }
          };
          process.stdout.write(JSON.stringify(errorResponse) + "\n");
        }
      }
    });
  }
}
