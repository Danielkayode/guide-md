import { z } from "zod";

// ─── Skill Frontmatter Schema ────────────────────────────────────────────────

/**
 * Schema for SKILL.md frontmatter validation.
 * Skills are directory-based capabilities defined by a SKILL.md file.
 */
export const SkillSchema = z.object({
  // ── Required Fields ───────────────────────────────────────────────────────
  name: z
    .string()
    .min(1, "name is required")
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'name must be kebab-case (e.g., "code-analyzer", "api-client")'
    ),

  description: z
    .string()
    .min(20, "description should be at least 20 characters")
    .max(500, "description should not exceed 500 characters"),

  version: z
    .string()
    .regex(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
      "version must follow Semantic Versioning (e.g., '1.0.0', '2.1.0-beta.1')"
    ),

  // ── Optional Fields ─────────────────────────────────────────────────────
  author: z.string().optional(),

  tags: z
    .array(z.string())
    .optional()
    .describe("Tags for categorizing and discovering skills"),

  ai_capabilities: z
    .array(
      z.enum([
        "tool_use",
        "long_context",
        "structured_output",
        "code_execution",
        "vision",
        "reasoning",
        "agentic",
      ])
    )
    .optional()
    .describe("AI capabilities required to execute this skill"),

  entry_point: z
    .string()
    .optional()
    .describe("Primary file to execute or reference (relative to skill directory)"),

  dependencies: z
    .array(z.string())
    .optional()
    .describe("External dependencies required by this skill"),
});

// ─── Type Export ─────────────────────────────────────────────────────────────

export type SkillFrontmatter = z.infer<typeof SkillSchema>;
