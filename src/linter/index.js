import { GuideMdSchema } from "../schema/index.js";
import { parseGuideFile } from "../parser/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {'error' | 'warning'} DiagnosticSeverity
 *
 * @typedef {Object} Diagnostic
 * @property {DiagnosticSeverity} severity
 * @property {string} field   - Dot-notation path to the offending field, e.g. "code_style.indentation"
 * @property {string} message - Human (and AI) readable explanation
 * @property {any}    [received] - The actual value that failed, if available
 *
 * @typedef {Object} LintResult
 * @property {boolean}     valid
 * @property {string}      file
 * @property {Diagnostic[]} diagnostics
 * @property {Record<string,any> | null} data  - The validated+defaulted data on success
 */

// ─── Warning Rules ────────────────────────────────────────────────────────────
// These are checks beyond Zod — soft best-practice recommendations.

const WARNING_RULES = [
  {
    field: "description",
    check: (data) => data.description && data.description.length < 60,
    message:
      "description is quite short. Consider expanding it — AI models use this as primary project context.",
  },
  {
    field: "guardrails.no_hallucination",
    check: (data) => data.guardrails?.no_hallucination === false,
    message:
      'Setting no_hallucination to false removes a critical AI guardrail. Are you sure?',
  },
  {
    field: "context.off_limits",
    check: (data) => !data.context?.off_limits,
    message:
      'No off_limits paths defined. Consider restricting sensitive directories like ".env", "migrations/", or "secrets/".',
  },
  {
    field: "ai_model_target",
    check: (data) => !data.ai_model_target,
    message:
      "No ai_model_target specified. Pinning to a model ensures consistent behavior across different AI tools.",
  },
  {
    field: "last_updated",
    check: (data) => {
      if (!data.last_updated) return true;
      const updated = new Date(data.last_updated);
      const now = new Date();
      const diffDays = (now - updated) / (1000 * 60 * 60 * 24);
      return diffDays > 180;
    },
    message: "GUIDE.md appears stale (last updated >6 months ago). Outdated context can mislead AI agents.",
  },
];

// ─── Core Linter ─────────────────────────────────────────────────────────────

/**
 * Lints a GUIDE.md file: parses it, validates with Zod, and runs soft-warning rules.
 *
 * @param {string} filePath
 * @returns {LintResult}
 */
export function lintGuideFile(filePath) {
  const diagnostics = [];

  // ── Step 1: Parse ─────────────────────────────────────────────────────────
  const parsed = parseGuideFile(filePath);

  if (!parsed.success) {
    diagnostics.push({
      severity: "error",
      field: "(file)",
      message: parsed.error,
    });
    return { valid: false, file: filePath, diagnostics, data: null };
  }

  // ── Step 2: Zod validation ────────────────────────────────────────────────
  const result = GuideMdSchema.safeParse(parsed.data);

  if (!result.success) {
    const zodErrors = result.error.errors.map((err) => ({
      severity: /** @type {DiagnosticSeverity} */ ("error"),
      field: err.path.join(".") || "(root)",
      message: err.message,
      received: err.received ?? undefined,
    }));

    // Still run warnings against raw data for partial guidance
    const warnings = runWarnings(parsed.data);
    return {
      valid: false,
      file: filePath,
      diagnostics: [...zodErrors, ...warnings],
      data: null,
    };
  }

  // ── Step 3: Soft warnings ─────────────────────────────────────────────────
  const warnings = runWarnings(result.data);

  return {
    valid: warnings.filter((w) => w.severity === "error").length === 0,
    file: filePath,
    diagnostics: warnings,
    data: result.data,
  };
}

/**
 * @param {Record<string, any>} data
 * @returns {Diagnostic[]}
 */
function runWarnings(data) {
  return WARNING_RULES.filter((rule) => rule.check(data)).map((rule) => ({
    severity: /** @type {DiagnosticSeverity} */ ("warning"),
    field: rule.field,
    message: rule.message,
  }));
}
