import { Diagnostic } from "./index.js";

// ─── Secret Patterns ────────────────────────────────────────────────────────────

interface SecretPattern {
  name: string;
  pattern: RegExp;
  maskGroup?: number;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // OpenAI API keys
  { name: "OpenAI API Key", pattern: /sk-[a-zA-Z0-9]{48,}/g },
  // GitHub tokens
  { name: "GitHub Token", pattern: /ghp_[a-zA-Z0-9]{36,}/g },
  // Slack tokens
  { name: "Slack Token", pattern: /xox[baprs]-[a-zA-Z0-9-]+/g },
  // AWS Access Key ID
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/g },
  // Generic .env style patterns (API_KEY=value, etc.)
  { name: "Environment Variable Secret", pattern: /(?:API_KEY|SECRET_KEY|AUTH_TOKEN|ACCESS_TOKEN|PRIVATE_KEY|PASSWORD|SECRET)=([^\s"']+)/gi, maskGroup: 1 },
];

const SENSITIVE_YAML_KEYS = [
  /_KEY$/i,
  /_TOKEN$/i,
  /_SECRET$/i,
  /_PASSWORD$/i,
];

const PLACEHOLDER_VALUES = [
  /^YOUR_.*_HERE$/i,
  /^<.*>$/,
  /^\$\{.*\}$/,
  /^\[.*\]$/,
  /^\*+$/,
  /^\s*$/,
];

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface SecretScanResult {
  detected: boolean;
  violations: SecretViolation[];
}

export interface SecretViolation {
  line: number;
  key?: string;
  pattern: string;
  value: string;
  maskedValue: string;
}

// ─── Masking Utility ────────────────────────────────────────────────────────────

/**
 * Masks a secret value for display, showing only first 4 and last 4 chars.
 */
function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "****";
  }
  return value.slice(0, 4) + "****" + value.slice(-4);
}

/**
 * Checks if a value is a placeholder (should not be flagged).
 */
function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_VALUES.some(pattern => pattern.test(value));
}

// ─── Scanner ────────────────────────────────────────────────────────────────────

/**
 * Scans raw file content for potential secrets.
 * 
 * @param content The raw file content (including frontmatter and body)
 * @param filePath The file path (for diagnostics)
 * @returns SecretScanResult containing any detected violations
 */
export function scanForSecrets(content: string, filePath: string): SecretScanResult {
  const violations: SecretViolation[] = [];
  const lines = content.split("\n");
  
  // Scan each line for secret patterns
  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;
    
    // Check YAML keys that might contain secrets
    for (const keyPattern of SENSITIVE_YAML_KEYS) {
      const keyMatch = line.match(new RegExp(`^\\s*([a-zA-Z0-9_.]*${keyPattern.source.replace(/\//g, "")}\\s*):\\s*(.+)$`, "i"));
      if (keyMatch && keyMatch[1] && keyMatch[2]) {
        const key = keyMatch[1].trim();
        const value = keyMatch[2].trim().replace(/^["'](.*)["']$/, "$1"); // Strip quotes
        
        // Skip placeholders and empty values
        if (isPlaceholder(value) || value === "" || value === "null" || value === "~") {
          continue;
        }
        
        violations.push({
          line: lineNumber,
          key,
          pattern: "Sensitive YAML key with non-placeholder value",
          value,
          maskedValue: maskSecret(value),
        });
        return; // One violation per line is enough
      }
    }
    
    // Check against secret patterns
    for (const { name, pattern, maskGroup } of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      let match;
      while ((match = regex.exec(line)) !== null) {
        const rawValue = maskGroup ? match[maskGroup] : match[0];
        
        if (!rawValue) {
          continue;
        }
        
        const value = String(rawValue);
        
        if (isPlaceholder(value)) {
          continue;
        }
        
        violations.push({
          line: lineNumber,
          pattern: name,
          value,
          maskedValue: maskSecret(value),
        });
      }
    }
  });
  
  return {
    detected: violations.length > 0,
    violations,
  };
}

/**
 * Converts secret violations to diagnostics format.
 * 
 * @param result The secret scan result
 * @returns Diagnostics array for error reporting
 */
export function violationsToDiagnostics(result: SecretScanResult): Diagnostic[] {
  return result.violations.map(v => ({
    severity: "error" as const,
    source: "secret-scan" as const,
    field: v.key ? String(v.key) : "(secret)",
    message: `Potential secret detected: ${String(v.maskedValue)}`,
    received: "REDACTED_FOR_SECURITY",
  }));
}
