import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { exportGuide, ExportTarget, generateBadge, generateMcpManifest, exportMcpManifest } from "../src/exporter/index.js";
import { GuideMdFrontmatter } from "../src/schema/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("exporter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-export-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const mockData: GuideMdFrontmatter = {
    guide_version: "1.0.0",
    project: "test-project",
    language: "typescript",
    runtime: "node@20",
    framework: "express",
    strict_typing: true,
    error_protocol: "verbose",
    ai_model_target: "claude-3-5-sonnet",
    description: "A test project for export functionality",
    code_style: {
      max_line_length: 100,
      indentation: "2 spaces",
      naming_convention: "camelCase",
      max_function_lines: 50,
      prefer_immutability: true,
      prefer_early_returns: true,
    },
    guardrails: {
      no_hallucination: true,
      cite_sources: false,
      scope_creep_prevention: true,
      dry_run_on_destructive: true,
      max_response_scope: "function",
    },
    testing: {
      required: true,
      framework: "vitest",
      coverage_threshold: 80,
      test_alongside_code: true,
    },
    context: {
      entry_points: ["src/index.ts", "src/app.ts"],
      off_limits: [".env", "node_modules"],
      architecture_pattern: "layered",
    },
  };

  const instructions = `
# AI Instructions

## Project Overview
This is a test project.

## Domain Vocabulary
- **Entity**: A domain object

## Non-Obvious Decisions
We use layered architecture for separation of concerns.

## What NOT to do
Don't use global state.
`;

  describe("CLAUDE.md export", () => {
    it("should export to CLAUDE.md format", () => {
      const results = exportGuide(mockData, instructions, tempDir, "claude");

      expect(results).toHaveLength(1);
      expect(results[0].target).toBe("claude");
      expect(results[0].file).toBe("CLAUDE.md");
      expect(results[0].success).toBe(true);

      const content = fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("<context>");
      expect(content).toContain("<rules>");
      expect(content).toContain("Project: test-project");
      expect(content).toContain("Language: typescript");
      expect(content).toContain("Error Protocol: verbose");
    });
  });

  describe(".cursorrules export", () => {
    it("should export to .cursorrules format", () => {
      const results = exportGuide(mockData, instructions, tempDir, "cursor");

      expect(results).toHaveLength(1);
      expect(results[0].target).toBe("cursor");
      expect(results[0].file).toBe(".cursorrules");
      expect(results[0].success).toBe(true);

      const content = fs.readFileSync(path.join(tempDir, ".cursorrules"), "utf-8");
      expect(content).toContain("Project Rules");
      // Cursor uses YAML frontmatter
      expect(content).toContain("project: test-project");
    });
  });

  describe(".windsurfrules export", () => {
    it("should export to .windsurfrules format", () => {
      const results = exportGuide(mockData, instructions, tempDir, "windsurf");

      expect(results).toHaveLength(1);
      expect(results[0].target).toBe("windsurf");
      expect(results[0].file).toBe(".windsurfrules");
      expect(results[0].success).toBe(true);

      const content = fs.readFileSync(path.join(tempDir, ".windsurfrules"), "utf-8");
      expect(content).toContain("Windsurf Rules");
      expect(content).toContain("- Language: typescript");
      });
      });

      describe("AGENTS.md export", () => {
      it("should export to AGENTS.md format", () => {
      const results = exportGuide(mockData, instructions, tempDir, "agents");

      expect(results).toHaveLength(1);
      expect(results[0].target).toBe("agents");
      expect(results[0].file).toBe("AGENTS.md");
      expect(results[0].success).toBe(true);

      const content = fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf-8");
      expect(content).toContain("# test-project");
      expect(content).toContain("## Constraints");
      expect(content).toContain("## Rules");
      expect(content).toContain("No Hallucination");
      expect(content).toContain("Scope Creep Prevention");
      expect(content).toContain("- **Language**: typescript");
    });
  });

  describe("copilot-instructions.md export", () => {
    it("should export to copilot format", () => {
      const results = exportGuide(mockData, instructions, tempDir, "copilot");

      expect(results).toHaveLength(1);
      expect(results[0].target).toBe("copilot");
      expect(results[0].file).toBe(".github/copilot-instructions.md");
      expect(results[0].success).toBe(true);

      const content = fs.readFileSync(path.join(tempDir, ".github/copilot-instructions.md"), "utf-8");
      expect(content).toContain("<!-- guidemd:generated -->");
      expect(content).toContain("# test-project");
      expect(content).toContain("## Project Context");
      expect(content).toContain("## AI Instructions");
    });

    it("should create .github directory if it doesn't exist", () => {
      const results = exportGuide(mockData, instructions, tempDir, "copilot");

      expect(fs.existsSync(path.join(tempDir, ".github"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".github/copilot-instructions.md"))).toBe(true);
    });
  });

  describe(".aider.conf.yml export", () => {
    it("should export to aider format", () => {
      const results = exportGuide(mockData, instructions, tempDir, "aider");

      expect(results).toHaveLength(1);
      expect(results[0].target).toBe("aider");
      expect(results[0].file).toBe(".aider.conf.yml");
      expect(results[0].success).toBe(true);

      const content = fs.readFileSync(path.join(tempDir, ".aider.conf.yml"), "utf-8");
      expect(content).toContain("# Aider configuration generated from GUIDE.md");
      expect(content).toContain("auto_commits:");
    });

    it("should properly escape special YAML characters", () => {
      const specialData = {
        ...mockData,
        project: "test:project:with:colons",
      };

      const results = exportGuide(specialData, instructions, tempDir, "aider");

      const content = fs.readFileSync(path.join(tempDir, ".aider.conf.yml"), "utf-8");
      // Should be valid YAML
      expect(content).toContain("# Language: typescript");
    });
  });

  describe("all targets export", () => {
    it("should export to all targets when target is 'all'", () => {
      const results = exportGuide(mockData, instructions, tempDir, "all");

      expect(results.length).toBe(7); // claude, cursor, windsurf, agents, copilot, aider, json-schema
      expect(results.every(r => r.success)).toBe(true);

      // Verify all files were created
      expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".cursorrules"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".windsurfrules"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "AGENTS.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".github/copilot-instructions.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".aider.conf.yml"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "guidemd.schema.json"))).toBe(true);
    });
  });

  describe("badge generation", () => {
    it("should generate badge for grade A", () => {
      const badge = generateBadge("A");

      expect(badge).toContain("AI-Ready");
      expect(badge).toContain("Grade_A");
      expect(badge).toContain("brightgreen");
      expect(badge).toContain("shields.io");
    });

    it("should generate badge for grade B", () => {
      const badge = generateBadge("B");

      expect(badge).toContain("Grade_B");
      expect(badge).toContain("green");
    });

    it("should generate badge for grade C", () => {
      const badge = generateBadge("C");

      expect(badge).toContain("Grade_C");
      expect(badge).toContain("yellow");
    });

    it("should generate badge for grade D", () => {
      const badge = generateBadge("D");

      expect(badge).toContain("Grade_D");
      expect(badge).toContain("orange");
    });

    it("should generate badge for grade F", () => {
      const badge = generateBadge("F");

      expect(badge).toContain("Grade_F");
      expect(badge).toContain("red");
    });
  });

  describe("MCP manifest", () => {
    it("should generate MCP manifest", () => {
      const manifest = generateMcpManifest(mockData, instructions);

      expect(manifest.schema_version).toBe("1.0.0");
      expect(manifest.project).toBe("test-project");
      expect(manifest.ai_interface.protocol).toBe("guidemd");
      expect(manifest.ai_interface.capabilities).toContain("context_awareness");
      expect(manifest.ai_interface.capabilities).toContain("code_generation");
      expect(manifest.ai_interface.tools).toHaveLength(6);
      expect(manifest.ai_interface.resources).toHaveLength(5);
      expect(manifest.context.entry_points).toContain("src/index.ts");
      expect(manifest.guardrails.no_hallucination).toBe(true);
    });

    it("should handle array languages correctly", () => {
      const multiLangData: GuideMdFrontmatter = {
        ...mockData,
        language: ["typescript", "javascript"],
      };

      const manifest = generateMcpManifest(multiLangData, instructions);

      expect(Array.isArray(manifest.runtime.language)).toBe(true);
      expect(manifest.runtime.language).toContain("typescript");
      expect(manifest.runtime.language).toContain("javascript");
    });

    it("should handle array frameworks correctly", () => {
      const multiFrameworkData = {
        ...mockData,
        framework: ["react", "nextjs"],
      };

      const manifest = generateMcpManifest(multiFrameworkData, instructions);

      expect(Array.isArray(manifest.runtime.framework)).toBe(true);
      expect(manifest.runtime.framework).toContain("react");
      expect(manifest.runtime.framework).toContain("nextjs");
    });

    it("should export MCP manifest to file", () => {
      const result = exportMcpManifest(mockData, instructions, tempDir);

      expect(result.success).toBe(true);
      expect(result.file).toBe("guidemd-manifest.json");
      expect(fs.existsSync(path.join(tempDir, "guidemd-manifest.json"))).toBe(true);

      const content = fs.readFileSync(path.join(tempDir, "guidemd-manifest.json"), "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.project).toBe("test-project");
    });
  });
});
