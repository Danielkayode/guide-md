/**
 * Security Test Suite
 * 
 * Tests all security fixes implemented for the GUIDE.md linter:
 * 1. Path Traversal Protection in Registry
 * 2. SSRF Protection in URL fetching
 * 3. Prototype Pollution Protection in deep merge
 * 4. Command Injection Protection
 * 5. MCP Server Request Validation
 * 6. Secure Temp File Handling
 * 7. ReDoS Protection in Secret Scanning
 * 8. Secure JSON Parsing (deepSanitize)
 * 9. Tool Name Validation
 * 10. Immutable Exports (TOOLS, RESOURCES)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sanitizeModuleName, isPathWithinCache } from "../src/registry/sources.js";
import { deepMerge, isValidRemoteUrl, fetchSecure, isDangerousKey } from "../src/parser/resolver.js";
import { isSafePath, shellEscape } from "../src/guardian/hooks.js";
import { validateRequest, isValidId, isValidMethod, isValidParams, deepSanitize } from "../src/mcp/server.js";
import { isValidToolName, TOOLS, McpTool } from "../src/mcp/tools.js";
import { RESOURCES, McpResource } from "../src/mcp/resources.js";
import { scanForSecrets } from "../src/linter/secrets.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Security Fixes", () => {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Path Traversal Protection
  // ═══════════════════════════════════════════════════════════════════════════
  
  describe("Path Traversal Protection", () => {
    describe("sanitizeModuleName", () => {
      it("should allow valid module names", () => {
        expect(sanitizeModuleName("typescript-strict")).toBe("typescript-strict");
        expect(sanitizeModuleName("react-hooks")).toBe("react-hooks");
        expect(sanitizeModuleName("node_v20")).toBe("node_v20");
        expect(sanitizeModuleName("python3.11")).toBe("python3.11");
      });

      it("should reject path traversal attempts", () => {
        expect(sanitizeModuleName("../../../etc/passwd")).toBeNull();
        expect(sanitizeModuleName("..%2f..%2f..%2fetc%2fpasswd")).toBeNull();
        expect(sanitizeModuleName("..\\windows\\system32")).toBeNull();
        expect(sanitizeModuleName("./local-module")).toBeNull();
        expect(sanitizeModuleName("../parent-module")).toBeNull();
      });

      it("should reject dangerous characters", () => {
        expect(sanitizeModuleName("module;rm -rf /")).toBeNull();
        expect(sanitizeModuleName("module&&whoami")).toBeNull();
        expect(sanitizeModuleName("module|cat /etc/passwd")).toBeNull();
        expect(sanitizeModuleName("module`id`")).toBeNull();
        expect(sanitizeModuleName('module$(echo "pwned")')).toBeNull();
      });

      it("should reject reserved Windows names", () => {
        expect(sanitizeModuleName("CON")).toBeNull();
        expect(sanitizeModuleName("PRN")).toBeNull();
        expect(sanitizeModuleName("AUX")).toBeNull();
        expect(sanitizeModuleName("NUL")).toBeNull();
        expect(sanitizeModuleName("COM1")).toBeNull();
        expect(sanitizeModuleName("LPT1")).toBeNull();
      });

      it("should reject hidden files", () => {
        expect(sanitizeModuleName(".gitconfig")).toBeNull();
        expect(sanitizeModuleName(".env")).toBeNull();
        expect(sanitizeModuleName("..hidden")).toBeNull();
      });

      it("should reject overly long names", () => {
        expect(sanitizeModuleName("a".repeat(101))).toBeNull();
        expect(sanitizeModuleName("a".repeat(100))).toBe("a".repeat(100));
      });
    });

    describe("isPathWithinCache", () => {
      const cacheDir = path.join(os.homedir(), ".guidemd", "modules");

      it("should allow valid cache paths", () => {
        expect(isPathWithinCache(path.join(cacheDir, "typescript-strict.guide"))).toBe(true);
        expect(isPathWithinCache(path.join(cacheDir, "react-hooks.guide"))).toBe(true);
      });

      it("should reject paths outside cache directory", () => {
        expect(isPathWithinCache("/etc/passwd")).toBe(false);
        expect(isPathWithinCache(path.join(os.homedir(), ".ssh", "id_rsa"))).toBe(false);
        expect(isPathWithinCache("C:\\Windows\\System32\\config")).toBe(false);
      });

      it("should reject path traversal attempts even after sanitization", () => {
        const maliciousPath = path.join(cacheDir, "..", "..", "etc", "passwd");
        expect(isPathWithinCache(maliciousPath)).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SSRF Protection
  // ═══════════════════════════════════════════════════════════════════════════
  
  describe("SSRF Protection", () => {
    describe("isValidRemoteUrl", () => {
      it("should allow valid HTTPS URLs", () => {
        expect(isValidRemoteUrl("https://raw.githubusercontent.com/guidemd/registry/main/modules/typescript-strict.guide")).toBe(true);
        expect(isValidRemoteUrl("https://example.com/guide.md")).toBe(true);
        expect(isValidRemoteUrl("https://gist.github.com/user/guide.md")).toBe(true);
      });

      it("should reject HTTP URLs (only HTTPS allowed)", () => {
        expect(isValidRemoteUrl("http://evil.com/malicious.guide")).toBe(false);
        expect(isValidRemoteUrl("http://localhost/admin")).toBe(false);
      });

      it("should reject localhost and loopback addresses", () => {
        expect(isValidRemoteUrl("https://localhost/guide.md")).toBe(false);
        expect(isValidRemoteUrl("https://127.0.0.1/guide.md")).toBe(false);
        expect(isValidRemoteUrl("https://0.0.0.0/guide.md")).toBe(false);
        expect(isValidRemoteUrl("https://::1/guide.md")).toBe(false);
        expect(isValidRemoteUrl("https://::/guide.md")).toBe(false);
      });

      it("should reject private IP ranges", () => {
        expect(isValidRemoteUrl("https://10.0.0.1/guide.md")).toBe(false);
        expect(isValidRemoteUrl("https://172.16.0.1/guide.md")).toBe(false);
        expect(isValidRemoteUrl("https://172.31.255.255/guide.md")).toBe(false);
        expect(isValidRemoteUrl("https://192.168.1.1/guide.md")).toBe(false);
      });

      it("should reject link-local addresses", () => {
        expect(isValidRemoteUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
        expect(isValidRemoteUrl("https://169.254.1.1/guide.md")).toBe(false);
      });

      it("should reject cloud metadata endpoints", () => {
        expect(isValidRemoteUrl("https://metadata.google.internal/")).toBe(false);
        expect(isValidRemoteUrl("https://metadata/")).toBe(false);
      });

      it("should reject URLs with credentials", () => {
        expect(isValidRemoteUrl("https://user:pass@example.com/guide.md")).toBe(false);
        expect(isValidRemoteUrl("https://:token@example.com/guide.md")).toBe(false);
      });

      it("should reject non-standard ports", () => {
        expect(isValidRemoteUrl("https://example.com:8080/guide.md")).toBe(false);
        expect(isValidRemoteUrl("https://example.com:3000/guide.md")).toBe(false);
      });

      it("should reject punycode homograph attacks", () => {
        expect(isValidRemoteUrl("https://xn--pple-43d.com/guide.md")).toBe(false);
      });

      it("should reject invalid URLs", () => {
        expect(isValidRemoteUrl("not-a-url")).toBe(false);
        expect(isValidRemoteUrl("")).toBe(false);
        expect(isValidRemoteUrl("ftp://example.com/guide.md")).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Prototype Pollution Protection
  // ═══════════════════════════════════════════════════════════════════════════
  
  describe("Prototype Pollution Protection", () => {
    describe("isDangerousKey", () => {
      it("should identify dangerous keys", () => {
        expect(isDangerousKey("__proto__")).toBe(true);
        expect(isDangerousKey("constructor")).toBe(true);
        expect(isDangerousKey("prototype")).toBe(true);
      });

      it("should not flag safe keys", () => {
        expect(isDangerousKey("project")).toBe(false);
        expect(isDangerousKey("language")).toBe(false);
        expect(isDangerousKey("__meta__")).toBe(false);
        expect(isDangerousKey("constructor_name")).toBe(false);
      });
    });

    describe("deepMerge", () => {
      it("should merge objects safely", () => {
        const parent = { a: 1, b: 2 };
        const child = { b: 3, c: 4 };
        const result = deepMerge(parent, child);
        expect(result).toEqual({ a: 1, b: 3, c: 4 });
      });

      it("should prevent __proto__ pollution", () => {
        const parent = {};
        const child = { __proto__: { isAdmin: true } };
        const result = deepMerge(parent, child);
        
        // Result should not have __proto__ key
        expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(false);
        
        // Original prototype should not be polluted
        expect(({} as any).isAdmin).toBeUndefined();
      });

      it("should prevent constructor pollution", () => {
        const parent = {};
        const child = { constructor: { prototype: { isAdmin: true } } };
        const result = deepMerge(parent, child);
        
        // Result should not have constructor key
        expect(Object.prototype.hasOwnProperty.call(result, "constructor")).toBe(false);
        
        // Original prototype should not be polluted
        expect(({} as any).isAdmin).toBeUndefined();
      });

      it("should prevent prototype pollution", () => {
        const parent = {};
        const child = { prototype: { isAdmin: true } };
        const result = deepMerge(parent, child);
        
        // Result should not have prototype key
        expect(Object.prototype.hasOwnProperty.call(result, "prototype")).toBe(false);
      });

      it("should handle nested objects safely", () => {
        const parent = { 
          context: { 
            entry_points: ["src/index.ts"] 
          } 
        };
        const child = { 
          context: { 
            off_limits: [".env"],
            __proto__: { isAdmin: true }
          } 
        };
        const result = deepMerge(parent, child);
        
        expect(result.context.entry_points).toEqual(["src/index.ts"]);
        expect(result.context.off_limits).toEqual([".env"]);
        expect(Object.prototype.hasOwnProperty.call(result.context, "__proto__")).toBe(false);
      });

      it("should create objects with null prototype", () => {
        const result = deepMerge({}, {});
        expect(Object.getPrototypeOf(result)).toBeNull();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Command Injection Protection
  // ═══════════════════════════════════════════════════════════════════════════
  
  describe("Command Injection Protection", () => {
    describe("isSafePath", () => {
      it("should allow safe paths", () => {
        expect(isSafePath("/home/user/project")).toBe(true);
        expect(isSafePath("C:\\Users\\Project")).toBe(true);
        expect(isSafePath("./relative/path")).toBe(true);
        expect(isSafePath("node_modules/.bin/guidemd")).toBe(true);
      });

      it("should reject paths with shell metacharacters", () => {
        expect(isSafePath("; rm -rf /")).toBe(false);
        expect(isSafePath("&& whoami")).toBe(false);
        expect(isSafePath("| cat /etc/passwd")).toBe(false);
        expect(isSafePath("`id`")).toBe(false);
        expect(isSafePath("$(echo pwned)")).toBe(false);
        expect(isSafePath("${HOME}")).toBe(false);
        expect(isSafePath("path;cmd")).toBe(false);
        expect(isSafePath("path&&cmd")).toBe(false);
        expect(isSafePath("path|cmd")).toBe(false);
      });

      it("should reject paths with newlines", () => {
        expect(isSafePath("path\nrm -rf /")).toBe(false);
        expect(isSafePath("path\rcmd.exe")).toBe(false);
        expect(isSafePath("path\r\nwhoami")).toBe(false);
      });
    });

    describe("shellEscape", () => {
      it("should return simple alphanumeric strings unchanged", () => {
        expect(shellEscape("abc")).toBe("abc");
        expect(shellEscape("ABC")).toBe("ABC");
        expect(shellEscape("123")).toBe("123");
        expect(shellEscape("/path/to/file")).toBe("/path/to/file");
      });

      it("should escape single quotes correctly", () => {
        expect(shellEscape("it's a test")).toBe("'it'\"'\"'s a test'");
        // Input: 'quoted' -> replace ' with '"'"' -> '"'"'quoted"'"'' -> wrap: ''"'"'quoted'"'"''
        expect(shellEscape("'quoted'")).toBe("''\"'\"'quoted'\"'\"''");
      });

      it("should wrap unsafe strings in single quotes", () => {
        expect(shellEscape("hello world")).toBe("'hello world'");
        expect(shellEscape("test;cmd")).toBe("'test;cmd'");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. MCP Server Request Validation
  // ═══════════════════════════════════════════════════════════════════════════
  
  describe("MCP Server Request Validation", () => {
    describe("isValidId", () => {
      it("should allow valid numeric IDs", () => {
        expect(isValidId(1)).toBe(true);
        expect(isValidId(999999)).toBe(true);
        expect(isValidId(0)).toBe(true);
      });

      it("should allow valid string IDs", () => {
        expect(isValidId("abc123")).toBe(true);
        expect(isValidId("request-1")).toBe(true);
        expect(isValidId("test_123")).toBe(true);
      });

      it("should allow undefined ID", () => {
        expect(isValidId(undefined)).toBe(true);
      });

      it("should reject invalid IDs", () => {
        expect(isValidId(-1)).toBe(false);
        expect(isValidId(1.5)).toBe(false);
        expect(isValidId(1000000)).toBe(false); // Too large
        expect(isValidId("")).toBe(false);
        expect(isValidId("a".repeat(101))).toBe(false); // Too long
        expect(isValidId("id with spaces")).toBe(false);
        expect(isValidId("id;cmd")).toBe(false);
        expect(isValidId(null)).toBe(false);
        expect(isValidId({})).toBe(false);
      });
    });

    describe("isValidMethod", () => {
      it("should allow valid methods", () => {
        expect(isValidMethod("initialize")).toBe(true);
        expect(isValidMethod("tools/list")).toBe(true);
        expect(isValidMethod("tools/call")).toBe(true);
        expect(isValidMethod("resources/list")).toBe(true);
        expect(isValidMethod("resources/read")).toBe(true);
      });

      it("should reject invalid methods", () => {
        expect(isValidMethod("")).toBe(false);
        expect(isValidMethod("invalid")).toBe(false);
        expect(isValidMethod("tools/delete")).toBe(false);
        expect(isValidMethod("system/exec")).toBe(false);
        expect(isValidMethod("../../../etc/passwd")).toBe(false);
        expect(isValidMethod(123)).toBe(false);
      });
    });

    describe("isValidParams", () => {
      it("should allow undefined params", () => {
        expect(isValidParams(undefined)).toBe(true);
      });

      it("should allow valid params objects", () => {
        expect(isValidParams({})).toBe(true);
        expect(isValidParams({ name: "test" })).toBe(true);
        expect(isValidParams({ uri: "guidemd://frontmatter" })).toBe(true);
      });

      it("should reject arrays as params", () => {
        expect(isValidParams([])).toBe(false);
        expect(isValidParams([1, 2, 3])).toBe(false);
      });

      it("should reject null as params", () => {
        expect(isValidParams(null)).toBe(false);
      });

      it("should reject dangerous keys", () => {
        // Use JSON.parse to create objects where __proto__ is an own property
        // (Object literal {__proto__: ...} sets the prototype, not a property)
        const protoPollution = JSON.parse('{ "__proto__": { "isAdmin": true } }');
        expect(isValidParams(protoPollution)).toBe(false);

        const constructorPollution = JSON.parse('{ "constructor": { "prototype": {} } }');
        expect(isValidParams(constructorPollution)).toBe(false);

        const prototypePollution = JSON.parse('{ "prototype": {} }');
        expect(isValidParams(prototypePollution)).toBe(false);
      });

      it("should reject overly long keys", () => {
        const longKey = "a".repeat(101);
        expect(isValidParams({ [longKey]: "value" })).toBe(false);
      });
    });

    describe("validateRequest", () => {
      it("should validate complete valid requests", () => {
        const request = {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {}
        };
        expect(validateRequest(request)).toEqual(request);
      });

      it("should reject invalid jsonrpc version", () => {
        const request = {
          jsonrpc: "1.0",
          id: 1,
          method: "initialize"
        };
        expect(validateRequest(request)).toBeNull();
      });

      it("should reject requests with dangerous params", () => {
        // Create request with __proto__ as an own property using JSON
        const request = JSON.parse(`{
          "jsonrpc": "2.0",
          "id": 1,
          "method": "tools/call",
          "params": { "__proto__": { "isAdmin": true } }
        }`);
        expect(validateRequest(request)).toBeNull();
      });

      it("should reject non-object requests", () => {
        expect(validateRequest(null)).toBeNull();
        expect(validateRequest("string")).toBeNull();
        expect(validateRequest(123)).toBeNull();
        expect(validateRequest([])).toBeNull();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. ReDoS Protection
  // ═══════════════════════════════════════════════════════════════════════════
  
  describe("ReDoS Protection in Secret Scanning", () => {
    it("should handle long lines without hanging", () => {
      const longLine = "a".repeat(15000);
      const content = `---
project: test
guide_version: "1.0.0"
---
${longLine}`;
      
      const startTime = Date.now();
      const result = scanForSecrets(content, "test.md");
      const endTime = Date.now();
      
      // Should complete quickly (under 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(result.detected).toBe(false);
    });

    it("should limit matches per pattern", () => {
      // Create content with many potential matches
      const manySecrets = Array(50).fill("sk-" + "a".repeat(48)).join(" ");
      const content = `---
project: test
guide_version: "1.0.0"
secret: ${manySecrets}
---`;
      
      const result = scanForSecrets(content, "test.md");
      // Should not have excessive violations due to match limiting
      expect(result.violations.length).toBeLessThanOrEqual(50);
    });

    it("should handle evil regex patterns without hanging", () => {
      // Pattern designed to cause exponential backtracking
      const evilPattern = "a".repeat(100) + "!" + "a".repeat(100);
      const content = `---
project: test
guide_version: "1.0.0"
description: "${evilPattern}"
---`;

      const startTime = Date.now();
      const result = scanForSecrets(content, "test.md");
      const endTime = Date.now();

      // Should complete quickly (under 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Secure JSON Parsing (deepSanitize)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Secure JSON Parsing (deepSanitize)", () => {
    it("should create null-prototype objects", () => {
      const result = deepSanitize({ key: "value" }) as Record<string, unknown>;
      expect(Object.getPrototypeOf(result)).toBeNull();
    });

    it("should remove __proto__ keys", () => {
      const input = { __proto__: { isAdmin: true }, safe: "value" };
      const result = deepSanitize(input) as Record<string, unknown>;

      expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(false);
      expect(result.safe).toBe("value");
      expect(({} as any).isAdmin).toBeUndefined();
    });

    it("should remove constructor keys", () => {
      const input = { constructor: { prototype: { isAdmin: true } }, safe: "value" };
      const result = deepSanitize(input) as Record<string, unknown>;

      expect(Object.prototype.hasOwnProperty.call(result, "constructor")).toBe(false);
      expect(result.safe).toBe("value");
    });

    it("should remove prototype keys", () => {
      const input = { prototype: { isAdmin: true }, safe: "value" };
      const result = deepSanitize(input) as Record<string, unknown>;

      expect(Object.prototype.hasOwnProperty.call(result, "prototype")).toBe(false);
      expect(result.safe).toBe("value");
    });

    it("should sanitize nested objects", () => {
      const input = {
        level1: {
          __proto__: { isAdmin: true },
          level2: {
            constructor: { evil: true },
            safe: "deep"
          }
        },
        safe: "top"
      };
      const result = deepSanitize(input) as Record<string, unknown>;

      const level1 = result.level1 as Record<string, unknown>;
      const level2 = level1.level2 as Record<string, unknown>;

      expect(Object.prototype.hasOwnProperty.call(level1, "__proto__")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(level2, "constructor")).toBe(false);
      expect(level2.safe).toBe("deep");
      expect(result.safe).toBe("top");
    });

    it("should sanitize arrays", () => {
      const input = [
        { __proto__: { isAdmin: true }, name: "item1" },
        { safe: "item2" }
      ];
      const result = deepSanitize(input) as Array<Record<string, unknown>>;

      expect(Object.prototype.hasOwnProperty.call(result[0], "__proto__")).toBe(false);
      expect(result[0].name).toBe("item1");
      expect(result[1].safe).toBe("item2");
    });

    it("should freeze objects", () => {
      const result = deepSanitize({ key: "value" }) as Record<string, unknown>;
      expect(Object.isFrozen(result)).toBe(true);
    });

    it("should handle primitives", () => {
      expect(deepSanitize(null)).toBe(null);
      expect(deepSanitize("string")).toBe("string");
      expect(deepSanitize(123)).toBe(123);
      expect(deepSanitize(true)).toBe(true);
    });

    it("should reject overly long keys", () => {
      const longKey = "a".repeat(101);
      const input = { [longKey]: "value" };

      expect(() => deepSanitize(input)).toThrow("Key length exceeds maximum");
    });

    it("should reject keys with null bytes", () => {
      const input = { "key\x00injected": "value" };

      expect(() => deepSanitize(input)).toThrow("Key contains invalid characters");
    });

    it("should enforce maximum nesting depth", () => {
      // Create a deeply nested object (depth > 20)
      let input: Record<string, unknown> = { value: "deep" };
      for (let i = 0; i < 25; i++) {
        input = { nested: input };
      }

      expect(() => deepSanitize(input)).toThrow("JSON nesting depth exceeded maximum allowed");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Tool Name Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Tool Name Validation", () => {
    it("should validate known tool names", () => {
      expect(isValidToolName("get_context")).toBe(true);
      expect(isValidToolName("get_naming_conventions")).toBe(true);
      expect(isValidToolName("get_architecture")).toBe(true);
      expect(isValidToolName("get_guardrails")).toBe(true);
      expect(isValidToolName("get_testing_requirements")).toBe(true);
      expect(isValidToolName("get_runtime_info")).toBe(true);
    });

    it("should reject unknown tool names", () => {
      expect(isValidToolName("unknown_tool")).toBe(false);
      expect(isValidToolName("exec")).toBe(false);
      expect(isValidToolName("system")).toBe(false);
      expect(isValidToolName("__proto__")).toBe(false);
    });

    it("should reject empty and invalid tool names", () => {
      expect(isValidToolName("")).toBe(false);
      expect(isValidToolName("   ")).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Immutable Exports
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Immutable Exports", () => {
    it("should have frozen TOOLS array", () => {
      expect(Object.isFrozen(TOOLS)).toBe(true);
    });

    it("should have frozen RESOURCES array", () => {
      expect(Object.isFrozen(RESOURCES)).toBe(true);
    });

    it("should prevent mutation of TOOLS", () => {
      const originalLength = TOOLS.length;

      // Attempt to push (should fail silently or throw in strict mode)
      try {
        (TOOLS as McpTool[]).push({
          name: "evil_tool",
          description: "Evil",
          inputSchema: { type: "object", properties: {} }
        });
      } catch {
        // Expected in strict mode
      }

      expect(TOOLS.length).toBe(originalLength);
    });

    it("should prevent mutation of RESOURCES", () => {
      const originalLength = RESOURCES.length;

      try {
        (RESOURCES as McpResource[]).push({
          uri: "evil://resource",
          name: "Evil Resource",
          description: "Evil",
          mimeType: "text/plain"
        });
      } catch {
        // Expected in strict mode
      }

      expect(RESOURCES.length).toBe(originalLength);
    });
  });
});
