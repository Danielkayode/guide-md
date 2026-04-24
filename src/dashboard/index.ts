import { GuideMdFrontmatter } from "../schema/index.js";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { analyzeTokenBudgets, renderBudgetBar, generateBudgetWarnings, BudgetReport, TokenBudgetStatus } from "./budgets.js";

/**
 * Status of a documentation section in the GUIDE.md.
 */
export interface SectionStatus {
  /** Section name (e.g., "Project Overview") */
  name: string;
  /** Whether the section is present and populated */
  present: boolean;
  /** Word count in the section */
  wordCount: number;
  /** Density of negative constraints (0-1 scale) */
  constraintDensity: number;
}

/**
 * Comprehensive health report for a GUIDE.md file.
 * Used by the dashboard to display AI-readiness metrics.
 */
export interface HealthReport {
  /** Overall score 0-100 */
  score: number;
  /** Token density rating and word count */
  tokenDensity: string;
  /** Token efficiency score 0-100 */
  tokenScore: number;
  /** Sync status description with days since update */
  syncStatus: string;
  /** Sync freshness score 0-100 */
  syncScore: number;
  /** Status of required sections */
  sectionCompleteness: SectionStatus[];
  /** Section completeness score 0-100 */
  sectionScore: number;
  /** Guardrails/best practices coverage */
  bestPractices: {
    /** Total number of best practice items */
    total: number;
    /** Number of enabled best practices */
    enabled: number;
    /** Coverage percentage 0-100 */
    coverage: number;
  };
  /** Compatibility ratings for different AI models */
  modelCompatibility: { model: string; rating: string }[];
  /** List of improvement suggestions */
  suggestions: string[];
  /** Optional token budget analysis report */
  tokenBudgets?: BudgetReport | undefined;
}

const NEGATIVE_CONSTRAINTS = ["no", "never", "don't", "prevent", "avoid", "stop", "restricted", "limited"];

function analyzeSection(content: string, sectionName: string): SectionStatus {
  const lines = content.split("\n");
  let capturing = false;
  let words: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+/);
    if (headerMatch) {
      const headerText = line.replace(/^#{1,6}\s+/, "").trim();
      if (headerText === sectionName) {
        capturing = true;
        continue;
      }
      if (capturing) break;
    }
    if (capturing) {
      words.push(...line.toLowerCase().split(/\s+/).filter(w => w.length > 0));
    }
  }

  const constraintCount = words.filter(w => NEGATIVE_CONSTRAINTS.includes(w.replace(/[^\w]/g, ""))).length;
  const density = words.length > 0 ? constraintCount / (words.length / 10) : 0; // Constraints per 10 words

  return { 
    name: sectionName, 
    present: words.length > 5, 
    wordCount: words.length,
    constraintDensity: Math.min(1, density)
  };
}

function countEnabledGuardrails(data: GuideMdFrontmatter): { total: number; enabled: number } {
  if (!data.guardrails) return { total: 5, enabled: 0 };
  const guards = [
    data.guardrails.no_hallucination,
    data.guardrails.scope_creep_prevention,
    data.guardrails.dry_run_on_destructive,
    data.guardrails.cite_sources,
    data.guardrails.max_response_scope !== undefined
  ];
  return {
    total: guards.length,
    enabled: guards.filter(Boolean).length
  };
}

export function generateHealthReport(data: GuideMdFrontmatter, content: string): HealthReport {
  let score = 100;
  const suggestions: string[] = [];

  // 1. Token Density
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  let density = "Excellent";
  let tokenScore = 100;

  if (wordCount > 1000) {
    density = "Low (Too Verbose)";
    tokenScore = 60;
    score -= 30;
    suggestions.push("Consider trimming content to under 1000 words for better token efficiency");
  } else if (wordCount > 500) {
    density = "Moderate";
    tokenScore = 85;
    score -= 15;
  } else if (wordCount < 100) {
    density = "Sparse";
    tokenScore = 70;
    score -= 20;
    suggestions.push("Add more context - under 100 words may not provide enough guidance");
  }

  // 2. Sync Status
  const updated = data.last_updated ? new Date(data.last_updated) : new Date(0);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
  let syncStatus = "Perfectly Synced";
  let syncScore = 100;

  if (diffDays > 180) {
    syncStatus = "Stale (> 6 months)";
    syncScore = 40;
    score -= 40;
    suggestions.push("Update last_updated - file is over 6 months old");
  } else if (diffDays > 30) {
    syncStatus = "Needs Attention";
    syncScore = 75;
    score -= 20;
    suggestions.push("Run `guidemd sync` to ensure frontmatter matches current project state");
  }

  // 3. Section Completeness & Semantic Quality
  const requiredSections = [
    "Project Overview",
    "Domain Vocabulary",
    "Non-Obvious Decisions",
    "What NOT to do"
  ];
  
  const sectionCompleteness = requiredSections.map(section => analyzeSection(content, section));
  
  // Guardrails/What NOT to do need negative constraints
  const whatNotToDo = sectionCompleteness.find(s => s.name === "What NOT to do");
  if (whatNotToDo && whatNotToDo.present && whatNotToDo.constraintDensity < 0.2) {
    score -= 15;
    suggestions.push("'What NOT to do' section lacks negative constraints (e.g., 'never', 'don't'). Be more explicit about anti-patterns.");
  }

  const populatedSections = sectionCompleteness.filter(s => s.present).length;
  const sectionScore = Math.round((populatedSections / requiredSections.length) * 100);
  score -= (100 - sectionScore) / 2;

  // 4. Best Practices
  const guardrails = countEnabledGuardrails(data);
  const coverage = Math.round((guardrails.enabled / guardrails.total) * 100);
  score -= (100 - coverage) / 3;

  // 5. Model Compatibility
  const compatibility = [
    { model: "Claude 3.5 Sonnet", rating: score > 90 ? "Native" : "Excellent" },
    { model: "GPT-4o", rating: "Excellent" },
    { model: "Llama 3 (70B)", rating: score > 70 ? "Good" : "Fair" }
  ];

  // 6. Token Budgets
  const tokenBudgets = data.token_budgets ? analyzeTokenBudgets(data, content) : undefined;
  if (tokenBudgets) {
    const budgetWarnings = generateBudgetWarnings(tokenBudgets);
    suggestions.push(...budgetWarnings);
    
    // Penalize score for budget overages
    const overageCount = tokenBudgets.sections.filter(s => !s.withinBudget).length;
    score -= overageCount * 10;
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    tokenDensity: `${density} (${wordCount} words)`,
    tokenScore,
    syncStatus: `${syncStatus} (${diffDays} days ago)`,
    syncScore,
    sectionCompleteness,
    sectionScore,
    bestPractices: { ...guardrails, coverage },
    modelCompatibility: compatibility,
    suggestions,
    tokenBudgets
  };
}

function renderBar(score: number, width: number = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  let color = chalk.green;
  if (score < 70) color = chalk.yellow;
  if (score < 40) color = chalk.red;
  return color("█".repeat(filled)) + chalk.gray("░".repeat(empty));
}

function renderGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function printDashboard(report: HealthReport): void {
  const grade = renderGrade(report.score);
  const gradeColor = grade === "A" ? chalk.green.bold : grade === "B" ? chalk.green : grade === "C" ? chalk.yellow : chalk.red;

  console.log(chalk.bold.cyan("\n╔════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║     📊  GUIDE.md AI-Readiness Dashboard        ║"));
  console.log(chalk.bold.cyan("╚════════════════════════════════════════════════╝\n"));
  
  console.log(`${chalk.bold("Overall AI Grade:")}  ${gradeColor(grade)}  ${report.score}/100`);
  console.log(`${renderBar(report.score)}\n`);

  console.log(chalk.dim("─".repeat(52)));

  console.log(`\n${chalk.bold("🛡️ Semantic Quality")} (Constraint Density)`);
  report.sectionCompleteness.forEach(s => {
    if (s.name === "What NOT to do") {
      const densityBar = "█".repeat(Math.floor(s.constraintDensity * 20)) + "░".repeat(20 - Math.floor(s.constraintDensity * 20));
      console.log(`   ${s.name.padEnd(22)} ${chalk.magenta(densityBar)} ${(s.constraintDensity * 100).toFixed(0)}%`);
    }
  });

  console.log(`\n${chalk.bold("📝 Section Status")}`);
  report.sectionCompleteness.forEach(section => {
    const icon = section.present ? chalk.green("✔") : chalk.red("✖");
    console.log(`   ${icon} ${section.name.padEnd(22)} ${chalk.gray(`(${section.wordCount} words)`)}`);
  });

  if (report.suggestions.length > 0) {
    console.log(chalk.bold("\n💡 Suggestions:"));
    report.suggestions.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
  }

  // Token Budgets Section
  if (report.tokenBudgets && report.tokenBudgets.sections.length > 0) {
    console.log(chalk.bold("\n📊 Token Budgets:"));
    console.log(chalk.dim("  ──────────────────────────"));
    
    for (const budget of report.tokenBudgets.sections) {
      const bar = renderBudgetBar(budget.percentage);
      const color = budget.withinBudget ? chalk.green : chalk.red;
      const icon = budget.withinBudget ? "✔" : "✖";
      
      console.log(`   ${color(icon)} ${budget.section.padEnd(12)} ${bar} ${budget.used}/${budget.budget}`);
      
      if (!budget.withinBudget) {
        console.log(chalk.red(`      ⚠ Overage: ${budget.overage} tokens`));
      }
    }
    
    // Show total if set
    if (report.tokenBudgets.totalBudget) {
      const totalPercent = (report.tokenBudgets.totalUsed / report.tokenBudgets.totalBudget) * 100;
      const totalBar = renderBudgetBar(totalPercent);
      const totalColor = report.tokenBudgets.withinTotalBudget ? chalk.green : chalk.red;
      const totalIcon = report.tokenBudgets.withinTotalBudget ? "✔" : "✖";
      
      console.log(chalk.dim("  ──────────────────────────"));
      console.log(`   ${totalColor(totalIcon)} ${"total".padEnd(12)} ${totalBar} ${report.tokenBudgets.totalUsed}/${report.tokenBudgets.totalBudget}`);
    }
    
    console.log();
  }
}
