import { describe, it, expect } from "vitest";
import { GuideMdSchema, GuideMdFrontmatter } from "../src/schema/index.js";
import { ZodError } from "zod";

describe("schema", () => {
  describe("required fields", () => {
    it("should validate with all required fields present", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should fail when guide_version is missing", () => {
      const data = {
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes("guide_version"))).toBe(true);
      }
    });

    it("should fail when guide_version is not semver format", () => {
      const data = {
        guide_version: "1.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("semver");
      }
    });

    it("should fail when project is missing", () => {
      const data = {
        guide_version: "1.0.0",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes("project"))).toBe(true);
      }
    });

    it("should fail when project is too short", () => {
      const data = {
        guide_version: "1.0.0",
        project: "a",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("at least 2 characters");
      }
    });

    it("should fail when language is missing", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes("language"))).toBe(true);
      }
    });

    it("should fail when strict_typing is missing", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        error_protocol: "verbose",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes("strict_typing"))).toBe(true);
      }
    });

    it("should fail when error_protocol is missing", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes("error_protocol"))).toBe(true);
      }
    });

    it("should fail when error_protocol is invalid", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "invalid",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("verbose");
        expect(result.error.errors[0].message).toContain("silent");
        expect(result.error.errors[0].message).toContain("structured");
      }
    });
  });

  describe("optional fields", () => {
    it("should accept runtime field", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        runtime: "node@20",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should accept framework as string", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        framework: "express",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should accept framework as array", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        framework: ["react", "nextjs"],
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should accept ai_model_target as string", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        ai_model_target: "claude-3-5-sonnet",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should accept ai_model_target as array", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        ai_model_target: ["claude-3-5-sonnet", "gpt-4o"],
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should accept description with minimum length", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        description: "This is a test project description that is long enough",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should fail when description is too short", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        description: "Short",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("at least 20 chars");
      }
    });

    it("should accept last_updated with valid ISO date", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        last_updated: "2024-01-15",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should fail when last_updated has invalid format", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        last_updated: "01-15-2024",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("YYYY-MM-DD");
      }
    });

    it("should accept maintainers as array of emails", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        maintainers: ["test@example.com", "admin@example.org"],
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should fail when maintainers contains invalid email", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        maintainers: ["not-an-email"],
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("valid email");
      }
    });
  });

  describe("code_style schema", () => {
    it("should accept valid code_style", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        code_style: {
          max_line_length: 100,
          indentation: "2 spaces",
          naming_convention: "camelCase",
          max_function_lines: 50,
          prefer_immutability: true,
          prefer_early_returns: true,
        },
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should fail when max_line_length is too low", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        code_style: {
          max_line_length: 20,
          indentation: "2 spaces",
          naming_convention: "camelCase",
        },
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("at least 40");
      }
    });

    it("should fail when max_line_length is too high", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        code_style: {
          max_line_length: 500,
          indentation: "2 spaces",
          naming_convention: "camelCase",
        },
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("not exceed 300");
      }
    });

    it("should fail when naming_convention is invalid", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        code_style: {
          max_line_length: 100,
          indentation: "2 spaces",
          naming_convention: "invalid_case",
        },
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
    });
  });

  describe("guardrails schema", () => {
    it("should accept valid guardrails", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        guardrails: {
          no_hallucination: true,
          cite_sources: false,
          scope_creep_prevention: true,
          dry_run_on_destructive: false,
          max_response_scope: "function",
        },
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });
  });

  describe("testing schema", () => {
    it("should accept valid testing config", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        testing: {
          required: true,
          framework: "vitest",
          coverage_threshold: 80,
          test_alongside_code: true,
        },
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should fail when coverage_threshold is above 100", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        testing: {
          required: true,
          framework: "vitest",
          coverage_threshold: 150,
        },
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
    });
  });

  describe("context schema", () => {
    it("should accept valid context", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        context: {
          entry_points: ["src/index.ts", "src/app.tsx"],
          off_limits: [".env", "secrets/"],
          architecture_pattern: "layered",
          state_management: "redux",
        },
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should fail when architecture_pattern is invalid", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        context: {
          architecture_pattern: "invalid_pattern",
        },
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
    });
  });

  describe("extends field", () => {
    it("should accept extends as string", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        extends: "./base-guide.md",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it("should accept extends as array", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        extends: ["./base-guide.md", "typescript-strict"],
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(true);
    });
  });

  describe("strict mode", () => {
    it("should reject unknown fields in strict mode", () => {
      const data = {
        guide_version: "1.0.0",
        project: "test-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        unknown_field: "value",
      };

      const result = GuideMdSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("Unrecognized key");
      }
    });
  });
});
