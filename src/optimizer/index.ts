import { GuideMdFrontmatter } from "../schema/index.js";

export interface OptimizationSuggestion {
  type: "redundancy" | "token-density" | "structural";
  message: string;
  impact: "low" | "medium" | "high";
  recommendation: string;
}

// ─── N-Gram Overlap Analysis ───────────────────────────────────────────────────

/**
 * Tokenizes text into lowercase word tokens.
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) || [];
}

/**
 * Generates n-grams from an array of tokens.
 */
function generateNgrams(tokens: string[], n: number): string[] {
  const grams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    grams.push(tokens.slice(i, i + n).join(" "));
  }
  return grams;
}

/**
 * Collects all n-grams (1-gram and 2-gram) from YAML field names and values.
 */
function collectSchemaNgrams(data: Record<string, unknown>, prefix = ""): Set<string> {
  const ngrams = new Set<string>();

  for (const [key, value] of Object.entries(data)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    // Add field name tokens and ngrams
    const keyTokens = tokenize(key);
    generateNgrams(keyTokens, 1).forEach(g => ngrams.add(g));
    generateNgrams(keyTokens, 2).forEach(g => ngrams.add(g));

    // Add value tokens if primitive
    if (typeof value === "string") {
      const valTokens = tokenize(value);
      generateNgrams(valTokens, 1).forEach(g => ngrams.add(g));
      generateNgrams(valTokens, 2).forEach(g => ngrams.add(g));
    } else if (typeof value === "boolean" || typeof value === "number") {
      tokenize(String(value)).forEach(g => ngrams.add(g));
    } else if (Array.isArray(value)) {
      value.forEach(item => {
        if (typeof item === "string") {
          const valTokens = tokenize(item);
          generateNgrams(valTokens, 1).forEach(g => ngrams.add(g));
          generateNgrams(valTokens, 2).forEach(g => ngrams.add(g));
        }
      });
    } else if (value !== null && typeof value === "object") {
      // Recurse into nested objects
      const nested = collectSchemaNgrams(value as Record<string, unknown>, fieldPath);
      nested.forEach(g => ngrams.add(g));
    }
  }

  return ngrams;
}

/**
 * Computes overlap ratio between sentence n-grams and schema n-grams.
 */
function computeOverlapRatio(sentenceTokens: string[], schemaNgrams: Set<string>): number {
  const sentenceNgrams = new Set([
    ...generateNgrams(sentenceTokens, 1),
    ...generateNgrams(sentenceTokens, 2),
  ]);
  if (sentenceNgrams.size === 0) return 0;

  let overlap = 0;
  for (const gram of sentenceNgrams) {
    if (schemaNgrams.has(gram)) overlap++;
  }
  return overlap / sentenceNgrams.size;
}

/**
 * Analyzes GUIDE.md markdown body for sentences with high N-gram overlap
 * with YAML schema keywords. Flags them for removal to maximize token density.
 */
function analyzeNgramOverlap(data: GuideMdFrontmatter, content: string): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const schemaNgrams = collectSchemaNgrams(data as unknown as Record<string, unknown>);

  // Split content into sentences (rough approximation)
  const sentences = content
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  const flaggedSentences: string[] = [];

  for (const sentence of sentences) {
    const tokens = tokenize(sentence);
    const ratio = computeOverlapRatio(tokens, schemaNgrams);

    // If >70% of the sentence's n-grams exist in schema, it's likely redundant
    if (ratio > 0.7 && tokens.length >= 4) {
      flaggedSentences.push(sentence);
    }
  }

  if (flaggedSentences.length > 0) {
    const preview = flaggedSentences.slice(0, 3).map(s => `"${s.substring(0, 60)}..."`).join(", ");
    suggestions.push({
      type: "token-density",
      message: `Detected ${flaggedSentences.length} sentence(s) with high keyword overlap (${(0.7 * 100).toFixed(0)}%+) against YAML schema fields.`,
      impact: flaggedSentences.length > 5 ? "high" : "medium",
      recommendation: `Remove or consolidate these redundant sentences to maximize token density: ${preview}${flaggedSentences.length > 3 ? " and others." : "."}`,
    });
  }

  return suggestions;
}

// ─── Main Optimizer ────────────────────────────────────────────────────────────

/**
 * Analyzes the GUIDE.md for token-density and structural optimizations.
 */
export function optimizeGuide(data: GuideMdFrontmatter, content: string): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const lowercaseContent = content.toLowerCase();

  // 1. Language Redundancy
  const languages = Array.isArray(data.language) ? data.language : [data.language];
  languages.forEach(lang => {
    if (lowercaseContent.includes(`use ${lang}`) || lowercaseContent.includes(`written in ${lang}`)) {
      suggestions.push({
        type: "redundancy",
        message: `Instruction explicitly mentions using ${lang}, which is already in the YAML.`,
        impact: "low",
        recommendation: `Remove the verbal instruction "Use ${lang}"; the AI already knows this from the frontmatter.`
      });
    }
  });

  // 2. Code Style Redundancy
  if (data.code_style) {
    if (data.code_style.naming_convention && lowercaseContent.includes(data.code_style.naming_convention.toLowerCase())) {
      suggestions.push({
        type: "redundancy",
        message: `Markdown repeats the naming convention: ${data.code_style.naming_convention}.`,
        impact: "medium",
        recommendation: `Remove mentions of "${data.code_style.naming_convention}" from Markdown; the 'code_style.naming_convention' field covers this.`
      });
    }
    
    if (data.code_style.indentation && lowercaseContent.includes(data.code_style.indentation.toLowerCase())) {
      suggestions.push({
        type: "redundancy",
        message: `Markdown repeats the indentation rule: ${data.code_style.indentation}.`,
        impact: "low",
        recommendation: `Remove indentation instructions; 'code_style.indentation' is already set.`
      });
    }
  }

  // 3. Architecture Pattern Redundancy
  if (data.context?.architecture_pattern && lowercaseContent.includes(data.context.architecture_pattern)) {
    suggestions.push({
      type: "redundancy",
      message: `Markdown repeats the architecture pattern: ${data.context.architecture_pattern}.`,
      impact: "medium",
      recommendation: `Remove descriptions of "${data.context.architecture_pattern}" architecture that repeat the YAML field.`
    });
  }

  // 4. Token Density: Verbose Instructions
  const paragraphCount = content.split("\n\n").length;
  const wordCount = content.split(/\s+/).length;
  if (wordCount > 500) {
    suggestions.push({
      type: "token-density",
      message: `The Markdown content is quite verbose (${wordCount} words).`,
      impact: "high",
      recommendation: "Convert long paragraphs into bullet points. AI models process structured lists more efficiently and at a lower token cost."
    });
  }

  // 5. Pattern Extraction: Looking for "always" or "never"
  const strongRules = (content.match(/(always|never|strictly) \w+/gi) || []).length;
  if (strongRules > 5) {
    suggestions.push({
      type: "structural",
      message: "Detected multiple 'Always/Never' rules in Markdown.",
      impact: "medium",
      recommendation: "Consider moving these into a custom 'behavioral_rules' array in your YAML (if using an extended schema) to keep the core instructions clean."
    });
  }

  // 6. N-Gram Overlap Analysis (Semantic Optimizer)
  const ngramSuggestions = analyzeNgramOverlap(data, content);
  suggestions.push(...ngramSuggestions);

  return suggestions;
}
