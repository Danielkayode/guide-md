import { GuideMdFrontmatter } from "../schema/index.js";
import { TOOLS, callTool, ToolCallResult } from "./tools.js";
import { RESOURCES, readResource, ResourceContent } from "./resources.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
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

  constructor(data: GuideMdFrontmatter, content: string) {
    this.data = data;
    this.content = content;
  }

  handleRequest(request: JsonRpcRequest): JsonRpcResponse {
    switch (request.method) {
      case "initialize":
        return this.handleInitialize(request);
      case "tools/list":
        return this.handleToolsList(request);
      case "tools/call":
        return this.handleToolsCall(request);
      case "resources/list":
        return this.handleResourcesList(request);
      case "resources/read":
        return this.handleResourcesRead(request);
      default:
        return this.errorResponse(request.id, -32601, "Method not found");
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
      result: { resources: RESOURCES }
    };
  }

  private handleResourcesRead(request: JsonRpcRequest): JsonRpcResponse {
    const uri = request.params?.uri;
    if (typeof uri !== "string") {
      return this.errorResponse(request.id, -32602, "Missing or invalid resource URI");
    }

    const resource = readResource(uri, this.data, this.content);
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
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message }
    };
  }

  start(): void {
    process.stdin.setEncoding("utf-8");
    
    let buffer = "";
    
    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      
      // Handle line-delimited JSON-RPC
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const request = JSON.parse(line) as JsonRpcRequest;
          const response = this.handleRequest(request);
          process.stdout.write(JSON.stringify(response) + "\n");
        } catch (e) {
          // Silently ignore parse errors (malformed JSON)
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
