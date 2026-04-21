import { z } from "zod";

// ─── Primitive Enums ─────────────────────────────────────────────────────────

const ErrorProtocol = z.enum(["verbose", "silent", "structured"], {
  errorMap: () => ({
    message: `Must be one of: "verbose" | "silent" | "structured"`,
  }),
});

const ScopeEnum = z.enum(["file", "function", "class", "module"]);

const SupportedLanguage = z.enum([
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "kotlin",
  "swift",
  "cpp",
  "c",
  "csharp",
  "ruby",
  "php",
  "scala",
  "haskell",
  "elixir",
  "zig",
]);

// ─── Sub-Schemas ─────────────────────────────────────────────────────────────

const CodeStyleSchema = z.object({
  max_line_length: z
    .number()
    .int()
    .min(40, "max_line_length must be at least 40 characters")
    .max(300, "max_line_length should not exceed 300")
    .default(100),

  indentation: z
    .union([
      z.literal("tabs"),
      z.string().regex(/^\d+ spaces$/, 'Must be "tabs" or e.g. "2 spaces"'),
    ])
    .default("2 spaces"),

  naming_convention: z
    .enum(["camelCase", "snake_case", "PascalCase", "kebab-case", "SCREAMING_SNAKE"])
    .default("camelCase"),

  max_function_lines: z
    .number()
    .int()
    .min(5)
    .max(500)
    .optional()
    .describe("Soft limit: AI should split functions exceeding this length"),

  prefer_immutability: z.boolean().default(false),
  prefer_early_returns: z.boolean().default(true),
});

const GuardrailsSchema = z.object({
  no_hallucination: z
    .boolean()
    .default(true)
    .describe("AI must not invent APIs, packages, or type signatures"),

  cite_sources: z
    .boolean()
    .default(false)
    .describe(
      "AI should include inline comments citing documentation when using unfamiliar APIs"
    ),

  scope_creep_prevention: z
    .boolean()
    .default(true)
    .describe(
      "AI must only modify files/functions explicitly referenced in the prompt"
    ),

  dry_run_on_destructive: z
    .boolean()
    .default(false)
    .describe("AI must preview destructive operations before executing them"),

  max_response_scope: ScopeEnum.default("function").describe(
    "Max unit of code AI should generate unprompted"
  ),
});

const TestingSchema = z.object({
  required: z.boolean().default(false),
  framework: z.string().optional(),
  coverage_threshold: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Minimum test coverage % AI should target"),
  test_alongside_code: z
    .boolean()
    .default(false)
    .describe(
      "If true, AI should generate tests in the same response as implementation"
    ),
});

const ContextSchema = z.object({
  entry_points: z
    .array(z.string())
    .optional()
    .describe("Key files/modules AI should treat as roots for navigation"),

  off_limits: z
    .array(z.string())
    .optional()
    .describe("Glob patterns of files/dirs the AI must never modify"),

  architecture_pattern: z
    .enum([
      "mvc",
      "clean",
      "hexagonal",
      "layered",
      "microservices",
      "monolith",
      "serverless",
      "event-driven",
    ])
    .optional(),

  state_management: z.string().optional(),
});

// ─── Root Schema ─────────────────────────────────────────────────────────────

export const GuideMdSchema = z
  .object({
    // ── Inheritance ──────────────────────────────────────────────────────────
    extends: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Inherit rules from other GUIDE.md files (Registry names or URLs)"),

    // ── Required Identity Fields ───────────────────────────────────────────────
    guide_version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, 'guide_version must be semver format, e.g. "1.0.0"'),

    project: z
      .string()
      .min(2, "project name must be at least 2 characters")
      .max(100),

    // ── Language & Stack ──────────────────────────────────────────────────────
    language: z.union([
      SupportedLanguage,
      z.array(SupportedLanguage).min(1, "Provide at least one language"),
    ]),

    runtime: z
      .string()
      .optional()
      .describe('e.g. "node@22", "bun@1.1", "python@3.12"'),

    framework: z.union([z.string(), z.array(z.string())]).optional(),

    // ── AI Behaviour Controls ─────────────────────────────────────────────────
    strict_typing: z
      .boolean()
      .describe("Instructs AI to always use explicit types; never 'any' or untyped params"),

    error_protocol: ErrorProtocol.describe(
      "How AI should handle and surface errors in generated code"
    ),

    ai_model_target: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Models this guide is tuned for, e.g. ["claude-3-5-sonnet", "gpt-4o"]'),

    // ── Code Quality ─────────────────────────────────────────────────────
    code_style: CodeStyleSchema.optional(),
    guardrails: GuardrailsSchema.optional(),
    testing: TestingSchema.optional(),
    context: ContextSchema.optional(),

    // ── Human Metadata ────────────────────────────────────────────────────────
    description: z
      .string()
      .min(20, "description should be at least 20 chars — give the AI real context")
      .max(500)
      .optional(),

    last_updated: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "last_updated must be ISO date format: YYYY-MM-DD")
      .optional(),

    maintainers: z
      .array(z.string().email("Each maintainer should be a valid email or handle"))
      .optional(),

    // ── Registry Lock ─────────────────────────────────────────────────────────
    modules: z
      .array(z.string())
      .optional()
      .describe("Registry modules installed via 'guidemd add'. Used by sync to check for updates."),

    // ── Token Budgets ─────────────────────────────────────────────────────────
    token_budgets: z
      .object({
        guardrails: z.number().int().min(0).optional().describe("Max tokens for guardrails section"),
        context: z.number().int().min(0).optional().describe("Max tokens for context section"),
        total: z.number().int().min(0).optional().describe("Total token budget for entire GUIDE.md"),
      })
      .optional()
      .describe("Token budgets per section for controlling AI context size"),
  })
  .strict(); // Disallows unknown keys — keeps the spec tight

// ─── Type Export ─────────────────────────────────────────────────────────────
export type GuideMdFrontmatter = z.infer<typeof GuideMdSchema>;
