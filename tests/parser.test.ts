import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseGuideFile, ParseResult } from "../src/parser/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("parser", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("parseGuideFile", () => {
    it("should parse a valid GUIDE.md file correctly", () => {
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
---

# Test Project

This is a test project.
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = parseGuideFile(filePath);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      });
      expect(result.content).toContain("# Test Project");
      expect(result.error).toBeNull();
    });

    it("should throw error for invalid filename (not GUIDE.md)", () => {
      const content = `---
guide_version: "1.0.0"
project: "test"
language: typescript
strict_typing: true
error_protocol: verbose
---

Content
`;
      const filePath = path.join(tempDir, "guide.md");
      fs.writeFileSync(filePath, content);

      const result = parseGuideFile(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid filename: "guide.md"');
      expect(result.error).toContain('GUIDE.md" (uppercase)');
    });

    it("should throw error for missing frontmatter", () => {
      const content = `# Test Project

This file has no frontmatter.
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = parseGuideFile(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No frontmatter found");
    });

    it("should throw error for malformed YAML frontmatter", () => {
      const content = `---
guide_version: "1.0.0"
project: "test"
language: typescript
strict_typing: true
error_protocol: verbose
invalid: yaml: here: :
---

Content
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = parseGuideFile(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain("YAML frontmatter parse error");
    });

    it("should throw error for non-existent file", () => {
      const filePath = path.join(tempDir, "GUIDE.md");

      const result = parseGuideFile(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("should parse complex frontmatter with nested objects", () => {
      const content = `---
guide_version: "1.0.0"
project: "complex-project"
language:
  - typescript
  - javascript
runtime: "node@20"
framework:
  - react
  - nextjs
strict_typing: true
error_protocol: structured
ai_model_target:
  - claude-3-5-sonnet
  - gpt-4o
code_style:
  max_line_length: 120
  indentation: "4 spaces"
  naming_convention: camelCase
  max_function_lines: 40
  prefer_immutability: true
  prefer_early_returns: true
guardrails:
  no_hallucination: true
  cite_sources: false
  scope_creep_prevention: true
  dry_run_on_destructive: true
  max_response_scope: function
testing:
  required: true
  framework: vitest
  coverage_threshold: 80
  test_alongside_code: true
context:
  entry_points:
    - src/index.ts
    - src/app.tsx
  off_limits:
    - .env
    - node_modules
  architecture_pattern: layered
  state_management: redux
description: "A complex test project with all features"
last_updated: "2024-01-15"
maintainers:
  - test@example.com
---

# Complex Project
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = parseGuideFile(filePath);

      expect(result.success).toBe(true);
      expect(result.data?.guide_version).toBe("1.0.0");
      expect(result.data?.project).toBe("complex-project");
      expect(Array.isArray(result.data?.language)).toBe(true);
      expect((result.data as any)?.code_style?.max_line_length).toBe(120);
      expect((result.data as any)?.guardrails?.no_hallucination).toBe(true);
    });
  });
});
