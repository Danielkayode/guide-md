import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { importGuideFile, writeImportedGuide, detectImportSource, ImportResult } from "../src/importer/index.js";
import { exportGuide } from "../src/exporter/index.js";
import { GuideMdSchema, GuideMdFrontmatter } from "../src/schema/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("importer", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-import-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("detectImportSource", () => {
    it("should detect CLAUDE.md", () => {
      const result = detectImportSource("/path/to/CLAUDE.md");
      expect(result).toBe("claude");
    });

    it("should detect claude.md (lowercase)", () => {
      const result = detectImportSource("/path/to/claude.md");
      expect(result).toBe("claude");
    });

    it("should detect .cursorrules", () => {
      const result = detectImportSource("/path/to/.cursorrules");
      expect(result).toBe("cursor");
    });

    it("should detect .windsurfrules", () => {
      const result = detectImportSource("/path/to/.windsurfrules");
      expect(result).toBe("windsurf");
    });

    it("should detect AGENTS.md", () => {
      const result = detectImportSource("/path/to/AGENTS.md");
      expect(result).toBe("agents");
    });

    it("should return null for unknown files", () => {
      const result = detectImportSource("/path/to/README.md");
      expect(result).toBeNull();
    });
  });

  describe("CLAUDE.md import", () => {
    it("should import from CLAUDE.md format", () => {
      const claudeContent = `<context>
# Project: my-claude-project
This is a sample project description.
## Tech Stack
- Language: typescript
- Runtime: node@20
- Framework: express
- Strict Typing: Enabled
</context>
<rules>
## Coding Standards
- Error Protocol: verbose
- Indentation: 2 spaces
- Naming: camelCase
## Testing
- Framework: jest
- Coverage: 85%
## Instructions
Follow these rules carefully.
</rules>`;

      const filePath = path.join(tempDir, "CLAUDE.md");
      fs.writeFileSync(filePath, claudeContent);
      const result = importGuideFile(filePath);

      expect(result.success).toBe(true);
      expect(result.data?.project).toBe("my-claude-project");
      expect(result.data?.description).toBe("This is a sample project description.");
      expect(result.data?.language).toBe("typescript");
      expect(result.data?.runtime).toBe("node@20");
      expect(result.data?.framework).toBe("express");
      expect(result.data?.strict_typing).toBe(true);
      expect(result.data?.error_protocol).toBe("verbose");
      expect(result.data?.testing?.framework).toBe("jest");
      expect(result.data?.testing?.coverage_threshold).toBe(85);
    });

    it("should handle multiple languages in CLAUDE.md", () => {
      const claudeContent = `<context>
# Project: multi-lang-project
Description here.
## Tech Stack
- Language: typescript, javascript, python
</context>
<rules>
## Instructions
Test content.
</rules>`;

      const filePath = path.join(tempDir, "CLAUDE.md");
      fs.writeFileSync(filePath, claudeContent);
      const result = importGuideFile(filePath);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data?.language)).toBe(true);
      expect((result.data?.language as string[])).toContain("typescript");
      expect((result.data?.language as string[])).toContain("javascript");
    });
  });

  describe(".cursorrules import", () => {
    it("should import from .cursorrules format", () => {
      const cursorContent = `---
project: my-cursor-project
context:
  - src/index.ts
  - src/app.tsx
rules: Strict adherence required
---
# Project Rules
- Use TypeScript for all new code
- Follow functional programming patterns
- Write tests for all functions
`;

      const filePath = path.join(tempDir, ".cursorrules");
      fs.writeFileSync(filePath, cursorContent);
      const result = importGuideFile(filePath);

      expect(result.success).toBe(true);
      expect(result.data?.project).toBe("my-cursor-project");
      expect(result.data?.context?.entry_points).toContain("src/index.ts");
    });

    it("should extract language from @-directives in content", () => {
      const cursorContent = `---
project: test
---
# Rules
@typescript follow these patterns
Use @react hooks appropriately
`;

      const filePath = path.join(tempDir, ".cursorrules");
      fs.writeFileSync(filePath, cursorContent);
      const result = importGuideFile(filePath);

      expect(result.success).toBe(true);
      expect(result.data?.language).toBe("typescript");
    });
  });

  describe("AGENTS.md import", () => {
    it("should import from AGENTS.md format", () => {
      const agentsContent = `# my-agents-project
This is a description for the agents project.
## Constraints
- **Language**: typescript, javascript
- **Runtime**: node@18
- **Framework**: nextjs
- **Testing**: vitest with 90% coverage
- **Architecture**: layered
## Rules
- **No Hallucination**: Do not invent APIs, packages, or type signatures
- **Scope Creep Prevention**: Only modify files/functions explicitly referenced
- **Destructive Operations**: Always preview destructive changes before executing
- **Code Style**: Max line length 100, 2 spaces indentation
## Instructions
These are the detailed instructions for AI agents.
`;

      const filePath = path.join(tempDir, "AGENTS.md");
      fs.writeFileSync(filePath, agentsContent);
      const result = importGuideFile(filePath);

      expect(result.success).toBe(true);
      expect(result.data?.project).toBe("my-agents-project");
      expect(result.data?.description).toBe("This is a description for the agents project.");
      expect(Array.isArray(result.data?.language)).toBe(true);
      expect(result.data?.runtime).toBe("node@18");
      expect(result.data?.framework).toBe("nextjs");
      expect(result.data?.testing?.framework).toBe("vitest");
      expect(result.data?.testing?.coverage_threshold).toBe(90);
      expect(result.data?.context?.architecture_pattern).toBe("layered");
      expect(result.data?.guardrails?.no_hallucination).toBe(true);
      expect(result.data?.guardrails?.scope_creep_prevention).toBe(true);
      expect(result.data?.guardrails?.dry_run_on_destructive).toBe(true);
    });
  });

  describe(".windsurfrules import", () => {
    it("should import from .windsurfrules format (similar to CLAUDE.md)", () => {
      const windsurfContent = `# Windsurf Rules: my-windsurf-project
<context>
# Project: my-windsurf-project
Windsurf project description.
## Tech Stack
- Language: python
- Framework: fastapi
</context>
<rules>
## Instructions
Follow Python best practices.
</rules>`;

      const filePath = path.join(tempDir, ".windsurfrules");
      fs.writeFileSync(filePath, windsurfContent);
      const result = importGuideFile(filePath);

      expect(result.success).toBe(true);
      expect(result.data?.project).toBe("my-windsurf-project");
      expect(result.data?.language).toBe("python");
      expect(result.data?.framework).toBe("fastapi");
    });
  });

  describe("round-trip: export to CLAUDE.md then import back", () => {
    it("should maintain project name through round-trip", () => {
      // FIX: Added explicit type and `as const` to prevent TS literal widening
      const mockData: GuideMdFrontmatter = {
        guide_version: "1.0.0",
        project: "round-trip-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        runtime: "node@20",
        description: "A project for testing round-trip conversion",
      };

      const instructions = "# Test\nInstructions here.";
      exportGuide(mockData, instructions, tempDir, "claude");

      // Now import it back
      const claudePath = path.join(tempDir, "CLAUDE.md");
      const importResult = importGuideFile(claudePath);

      expect(importResult.success).toBe(true);
      expect(importResult.data?.project).toBe("round-trip-project");
      expect(importResult.data?.language).toBe("typescript");
      expect(importResult.data?.runtime).toBe("node@20");
    });
  });

  describe("error handling", () => {
    it("should return error for non-existent file", () => {
      const result = importGuideFile("/nonexistent/path/file.md");
      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("should return error for unsupported file format", () => {
      const filePath = path.join(tempDir, "README.md");
      fs.writeFileSync(filePath, "# Just a readme");
      const result = importGuideFile(filePath);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported file format");
    });
  });

  describe("writeImportedGuide", () => {
    it("should write imported data to GUIDE.md file", () => {
      const importResult: ImportResult = {
        success: true,
        schemaValid: true,
        data: {
          guide_version: "1.0.0",
          project: "written-project",
          language: "typescript",
          strict_typing: true,
          error_protocol: "verbose",
        },
        content: "# AI Instructions\nTest content.",
        warnings: [],
        unmappedFields: [],
      };

      const outputPath = path.join(tempDir, "output", "GUIDE.md");
      const result = writeImportedGuide(importResult, outputPath);

      expect(result.success).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);
      const written = fs.readFileSync(outputPath, "utf-8");
      expect(written).toContain("guide_version: 1.0.0");
      expect(written).toContain("project: written-project");
    });

    it("should return error when import was not successful", () => {
      const importResult: ImportResult = {
        success: false,
        schemaValid: false,
        data: null,
        content: "",
        warnings: [],
        unmappedFields: [],
      };

      const outputPath = path.join(tempDir, "GUIDE.md");
      const result = writeImportedGuide(importResult, outputPath);

      expect(result.success).toBe(false);
      expect(result.message).toContain("import was not successful");
    });
  });
});