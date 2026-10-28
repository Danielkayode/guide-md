import fs from "node:fs";
import path from "node:path";
import { GuideMdSchema, GuideMdFrontmatter } from "../schema/index.js";
import { parseGuideFile } from "../parser/index.js";
import { lintGuideFile } from "../linter/index.js";
import { generateHealthReport } from "../dashboard/index.js";
import { runDoctor } from "../doctor/index.js";
import { runColdStartVerification } from "../verify/index.js";

export interface CheckResults {
  valid: boolean;
  checks: {
    lint?: CheckLintResult;
    info?: CheckInfoResult;
    doctor?: CheckDoctorResult;
    verify?: CheckVerifyResult;
    error?: string;
  };
}

interface CheckLintResult {
  valid: boolean;
  errors: number;
  warnings: number;
}

interface CheckInfoResult {
  valid: boolean;
  score: number;
  grade: string;
  minScore: number;
  passesGate: boolean;
}

interface CheckDoctorResult {
  valid: boolean;
  errors: number;
  warnings: number;
}

interface CheckVerifyResult {
  valid: boolean;
  score: number;
}

const GRADE_THRESHOLDS: Array<{ min: number; grade: string }> = [
  { min: 90, grade: "A" },
  { min: 80, grade: "B" },
  { min: 70, grade: "C" },
  { min: 60, grade: "D" },
  { min: 0, grade: "F" },
];

function gradeForScore(score: number): string {
  for (const { min, grade } of GRADE_THRESHOLDS) {
    if (score >= min) return grade;
  }
  return "F";
}

/**
 * Runs the full CI check suite: lint + info + doctor + verify.
 * Returns combined results without exiting the process.
 */
export async function runCheck(
  file: string = "GUIDE.md",
  opts: { minScore?: number } = {},
): Promise<CheckResults> {
  const minScore = opts.minScore ?? 80;
  const target = path.resolve(file);
  const results: CheckResults["checks"] = {};
  let overallValid = true;

  const parsed = parseGuideFile(target);
  if (!parsed.success) {
    results.error = parsed.error;
    return { valid: false, checks: results };
  }

  const schemaResult = GuideMdSchema.safeParse(parsed.data);
  if (!schemaResult.success) {
    results.error = "Schema validation failed";
    return { valid: false, checks: results };
  }

  // ── 1. Lint ──────────────────────────────────────────────────────────────
  const lintResult = await lintGuideFile(target, { skipSecretScan: true });
  const lintErrors = lintResult.diagnostics.filter(
    (d) => d.severity === "error",
  ).length;
  results.lint = {
    valid: lintResult.valid,
    errors: lintErrors,
    warnings: lintResult.diagnostics.filter(
      (d) => d.severity === "warning",
    ).length,
  };
  if (!lintResult.valid) overallValid = false;

  // ── 2. Info (health score) ───────────────────────────────────────────────
  const report = generateHealthReport(schemaResult.data, parsed.content);
  const scorePass = report.score >= minScore;
  results.info = {
    valid: scorePass,
    score: report.score,
    grade: gradeForScore(report.score),
    minScore,
    passesGate: scorePass,
  };
  if (!scorePass) overallValid = false;

  // ── 3. Doctor ────────────────────────────────────────────────────────────
  const doctorReport = await runDoctor(
    schemaResult.data,
    parsed.content,
    path.dirname(target),
  );
  const doctorErrors = doctorReport.issues.filter(
    (i) => i.severity === "error",
  ).length;
  results.doctor = {
    valid: doctorErrors === 0,
    errors: doctorErrors,
    warnings: doctorReport.issues.filter(
      (i) => i.severity === "warning",
    ).length,
  };
  if (doctorErrors > 0) overallValid = false;

  // ── 4. Verify ────────────────────────────────────────────────────────────
  const verifyReport = await runColdStartVerification(
    schemaResult.data,
    parsed.content,
    path.dirname(target),
  );
  results.verify = {
    valid: verifyReport.valid,
    score: verifyReport.score,
  };
  if (!verifyReport.valid) overallValid = false;

  return { valid: overallValid, checks: results };
}

export type { GuideMdFrontmatter };
