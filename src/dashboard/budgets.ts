import { GuideMdFrontmatter } from "../schema/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenBudgetStatus {
  section: string;
  budget: number | null;
  used: number;
  overage: number;
  percentage: number;
  withinBudget: boolean;
}

export interface BudgetReport {
  sections: TokenBudgetStatus[];
  totalBudget: number | null;
  totalUsed: number;
  withinTotalBudget: boolean;
}

// ─── Token Counting ───────────────────────────────────────────────────────────

/**
 * Approximates token count from text.
 * Uses a simple heuristic: words × 1.3 (average tokens per word for English).
 * This is a lightweight approximation; for precise counts, tiktoken would be needed.
 * 
 * @param text The text to count tokens for
 * @returns Approximate token count
 */
export function approximateTokens(text: string): number {
  // Count words (sequences of alphanumeric characters)
  const words = text.split(/\s+/).filter(w => w.length > 0);
  // Apply average tokens per word multiplier
  return Math.ceil(words.length * 1.3);
}

/**
 * Counts tokens for a specific section in the markdown content.
 * Sections are identified by headers (## Section Name).
 * 
 * @param content The full markdown content
 * @param sectionName The section header to count (e.g., "Project Overview")
 * @returns Token count for the section
 */
export function countSectionTokens(content: string, sectionName: string): number {
  const lines = content.split("\n");
  let capturing = false;
  let sectionContent: string[] = [];

  for (const line of lines) {
    // Match headers at any level
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    const headerText = headerMatch?.[2]?.trim();
    if (headerText) {
      
      if (capturing) {
        // We've hit a new section, stop capturing
        break;
      }
      
      if (headerText.toLowerCase() === sectionName.toLowerCase()) {
        capturing = true;
        continue;
      }
    }
    
    if (capturing) {
      sectionContent.push(line);
    }
  }

  return approximateTokens(sectionContent.join("\n"));
}

/**
 * Counts total tokens in frontmatter (serialized as YAML).
 * This is a rough estimate since frontmatter is typically small.
 * 
 * @param data The frontmatter data object
 * @returns Approximate token count for frontmatter
 */
export function countFrontmatterTokens(data: Record<string, unknown>): number {
  // Serialize to a rough YAML representation
  const yamlLines: string[] = [];
  
  function serialize(obj: unknown, indent = 0): void {
    if (obj === null || obj === undefined) return;
    
    if (typeof obj === "object" && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          yamlLines.push(`${" ".repeat(indent)}${key}:`);
          serialize(value, indent + 2);
        } else if (Array.isArray(value)) {
          yamlLines.push(`${" ".repeat(indent)}${key}:`);
          value.forEach(item => {
            if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
              yamlLines.push(`${" ".repeat(indent)}  - ${item}`);
            }
          });
        } else if (value !== undefined) {
          yamlLines.push(`${" ".repeat(indent)}${key}: ${value}`);
        }
      }
    }
  }
  
  serialize(data);
  return approximateTokens(yamlLines.join("\n"));
}

// ─── Budget Analysis ───────────────────────────────────────────────────────────

/**
 * Analyzes token budgets against actual usage.
 * 
 * @param data The parsed frontmatter data with token_budgets
 * @param content The markdown body content
 * @returns Budget report with status for each section
 */
export function analyzeTokenBudgets(data: GuideMdFrontmatter, content: string): BudgetReport {
  const sections: TokenBudgetStatus[] = [];
  const budgets = data.token_budgets;
  
  // Analyze guardrails section if budget is set
  if (budgets?.guardrails) {
    const used = countSectionTokens(content, "What NOT to do") + 
                 countSectionTokens(content, "Guardrails");
    const budget = budgets.guardrails;
    const overage = Math.max(0, used - budget);
    
    sections.push({
      section: "guardrails",
      budget,
      used,
      overage,
      percentage: Math.min(100, (used / budget) * 100),
      withinBudget: used <= budget,
    });
  }
  
  // Analyze context section if budget is set
  if (budgets?.context) {
    const used = countSectionTokens(content, "Project Overview") +
                 countSectionTokens(content, "Domain Vocabulary") +
                 countSectionTokens(content, "Non-Obvious Decisions");
    const budget = budgets.context;
    const overage = Math.max(0, used - budget);
    
    sections.push({
      section: "context",
      budget,
      used,
      overage,
      percentage: Math.min(100, (used / budget) * 100),
      withinBudget: used <= budget,
    });
  }
  
  // Calculate total usage
  const totalUsed = approximateTokens(content) + countFrontmatterTokens(data as Record<string, unknown>);
  const totalBudget = budgets?.total ?? null;
  
  return {
    sections,
    totalBudget,
    totalUsed,
    withinTotalBudget: totalBudget === null || totalUsed <= totalBudget,
  };
}

/**
 * Renders a budget bar for display.
 * 
 * @param percentage Percentage filled (can exceed 100 for over-budget)
 * @param width Bar width in characters
 * @returns ASCII bar string
 */
export function renderBudgetBar(percentage: number, width: number = 20): string {
  if (percentage > 100) {
    // Over budget - show proportional overage with different character
    const overageRatio = (percentage - 100) / 100;
    const overageChars = Math.min(width, Math.round(overageRatio * width));
    const baseFilled = width;
    return "█".repeat(baseFilled) + "▓".repeat(overageChars) + ` +${Math.round(percentage - 100)}%`;
  }
  
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Generates warnings for budget overages.
 * 
 * @param report The budget report
 * @returns Array of warning messages
 */
export function generateBudgetWarnings(report: BudgetReport): string[] {
  const warnings: string[] = [];
  
  for (const section of report.sections) {
    if (!section.withinBudget) {
      warnings.push(
        `Token budget exceeded for ${section.section}: ${section.used}/${section.budget} tokens (${section.overage} overage)`
      );
    } else if (section.percentage > 90) {
      warnings.push(
        `Token budget at ${section.percentage.toFixed(0)}% for ${section.section} (${section.used}/${section.budget} tokens)`
      );
    }
  }
  
  if (!report.withinTotalBudget && report.totalBudget) {
    const overage = report.totalUsed - report.totalBudget;
    warnings.push(
      `Total token budget exceeded: ${report.totalUsed}/${report.totalBudget} tokens (${overage} overage)`
    );
  }
  
  return warnings;
}
