import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { lintGuideFile, fixGuideFile, detectLanguage } from "../src/linter/index.js";
import type { Diagnostic } from "../src/linter/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("linter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-lint-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("warning rules", () => {
    it("should warn when description is too short", async () => {
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
description: "Short desc"
---

# Test
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const warning = result.diagnostics.find(d => d.field === "description" && d.severity === "warning");
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("quite short");
    });

    it("should warn when no_hallucination is false", async () => {
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
guardrails:
  no_hallucination: false
---

# Test
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const warning = result.diagnostics.find(d => d.field === "guardrails.no_hallucination");
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("critical AI guardrail");
    });

    it("should warn when off_limits is not defined", async () => {
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
---

# Test
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const warning = result.diagnostics.find(d => d.field === "context.off_limits");
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("No off_limits paths defined");
    });

    it("should warn when ai_model_target is not specified", async () => {
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
---

# Test
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const warning = result.diagnostics.find(d => d.field === "ai_model_target");
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("No ai_model_target specified");
    });

    it("should warn when GUIDE.md is stale (last_updated > 6 months)", async () => {
      const oldDate = "2023-01-01"; // More than 6 months ago
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
last_updated: "${oldDate}"
---

# Test
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const warning = result.diagnostics.find(d => d.field === "last_updated");
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("stale");
    });

    it("should warn when GUIDE.md exceeds 200 lines", async () => {
      const lines = ["---", 'guide_version: "1.0.0"', 'project: "test"', "language: typescript", "strict_typing: true", "error_protocol: verbose", "---", ""];
      // Generate content that exceeds 200 lines
      for (let i = 0; i < 250; i++) {
        lines.push(`Line ${i} with some content to make this file longer than 200 lines`);
      }
      const content = lines.join("\n");
      
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const warning = result.diagnostics.find(d => d.field === "file.length");
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("exceeds 200 lines");
    });
  });

  describe("secret scanning", () => {
    it("should detect OpenAI API key pattern", async () => {
      const fakeKey = "sk-" + "a".repeat(48);
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
---

# Test

API_KEY=${fakeKey}
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const secretError = result.diagnostics.find(d => d.source === "secret-scan");
      expect(secretError).toBeDefined();
      expect(secretError?.severity).toBe("error");
    });

    it("should detect GitHub token pattern", async () => {
      const fakeToken = "ghp_" + "a".repeat(36);
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
---

# Test

GH_TOKEN=${fakeToken}
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const secretError = result.diagnostics.find(d => d.source === "secret-scan");
      expect(secretError).toBeDefined();
    });

    it("should detect AWS Access Key pattern", async () => {
      const fakeKey = "AKIA" + "A".repeat(16);
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
---

# Test

AWS_ACCESS_KEY_ID: ${fakeKey}
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const secretError = result.diagnostics.find(d => d.source === "secret-scan");
      expect(secretError).toBeDefined();
    });

    it("should detect Slack token pattern", async () => {
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
slack_token: xoxb-token123456
---

# Test
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const secretError = result.diagnostics.find(d => d.source === "secret-scan");
      expect(secretError).toBeDefined();
    });

    it("should not flag placeholder values", async () => {
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
api_key: YOUR_API_KEY_HERE
---

# Test
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      const secretError = result.diagnostics.find(d => d.source === "secret-scan");
      expect(secretError).toBeUndefined();
    });

    it("should skip secret scan when skipSecretScan option is true", async () => {
      const fakeKey = "sk-" + "a".repeat(48);
      const content = `---
guide_version: "1.0.0"
project: "test-project"
language: typescript
strict_typing: true
error_protocol: verbose
---

# Test

API_KEY=${fakeKey}
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath, { skipSecretScan: true });

      const secretError = result.diagnostics.find(d => d.source === "secret-scan");
      expect(secretError).toBeUndefined();
    });
  });

  describe("schema validation", () => {
    it("should report schema errors for invalid data", async () => {
      const content = `---
guide_version: "invalid-version"
project: "tp"
language: "invalid-lang"
strict_typing: true
error_protocol: "invalid"
---

# Test
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await lintGuideFile(filePath);

      expect(result.valid).toBe(false);
      expect(result.diagnostics.some(d => d.severity === "error" && d.source === "schema")).toBe(true);
    });
  });

  describe("fix functionality", () => {
    it("should add missing required fields", async () => {
      const content = `---
---

# Test Project
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await fixGuideFile(filePath);

      expect(result.appliedFixes.length).toBeGreaterThan(0);
      expect(result.appliedFixes.some(f => f.includes("guide_version"))).toBe(true);
      expect(result.appliedFixes.some(f => f.includes("project"))).toBe(true);
      expect(result.appliedFixes.some(f => f.includes("language"))).toBe(true);
    });

    it("should add last_updated field", async () => {
      const content = `---
guide_version: "1.0.0"
project: "test"
language: typescript
strict_typing: true
error_protocol: verbose
---

# Test
`;
      const filePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(filePath, content);

      const result = await fixGuideFile(filePath);

      expect(result.appliedFixes.some(f => f.includes("last_updated"))).toBe(true);
    });
  });

  describe("detectLanguage", () => {
    it("should detect typescript from .ts files", () => {
      // Create a mock directory with TypeScript files
      const projectDir = path.join(tempDir, "ts-project");
      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(projectDir, "src", "index.ts"), "export const x = 1;");
      fs.writeFileSync(path.join(projectDir, "src", "utils.ts"), "export const y = 2;");
      
      const guidePath = path.join(projectDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");
      
      const detected = detectLanguage(guidePath);
      expect(detected).toBe("typescript");
    });

    it("should detect python from .py files", () => {
      const projectDir = path.join(tempDir, "py-project");
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, "main.py"), "print('hello')");
      
      const guidePath = path.join(projectDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");
      
      const detected = detectLanguage(guidePath);
      expect(detected).toBe("python");
    });

    it("should default to typescript when no files found", () => {
      const projectDir = path.join(tempDir, "empty-project");
      fs.mkdirSync(projectDir, { recursive: true });
      
      const guidePath = path.join(projectDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");
      
      const detected = detectLanguage(guidePath);
      expect(detected).toBe("typescript");
    });
  });
});
