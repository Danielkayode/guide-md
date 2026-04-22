import { fetchModule, sanitizeModuleName } from "../registry/sources.js";
import { GuideMdFrontmatter } from "../schema/index.js";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

// ─── SSRF Protection Configuration ────────────────────────────────────────────

// Export for testing
export { isValidRemoteUrl, fetchSecure, isDangerousKey, deepMerge };

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "169.254.169.254", // AWS metadata
  "metadata.google.internal", // GCP metadata
  "metadata", // Short metadata name (Azure, GCP)
]);

const BLOCKED_IP_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private Class B
  /^192\.168\./, // Private Class C
  /^169\.254\./, // Link-local
  /^fc00:/i, // IPv6 Unique Local
  /^fe80:/i, // IPv6 Link-local
];

/**
 * Validates a URL to prevent SSRF attacks.
 * Only allows HTTPS URLs to specific trusted domains.
 */
function isValidRemoteUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS
    if (url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Block blocked hosts
    if (BLOCKED_HOSTS.has(hostname)) {
      return false;
    }

    // Block IP-based attacks
    if (BLOCKED_IP_PATTERNS.some(pattern => pattern.test(hostname))) {
      return false;
    }

    // Block punycode homograph attacks
    if (hostname.includes("xn--")) {
      return false;
    }

    // Block URLs with credentials
    if (url.username || url.password) {
      return false;
    }

    // Block non-standard ports
    if (url.port && url.port !== "443") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Securely fetches a remote URL with SSRF protection.
 */
async function fetchSecure(url: string): Promise<Response> {
  if (!isValidRemoteUrl(url)) {
    throw new Error(`SSRF protection: URL not allowed: ${url}`);
  }

  // Additional fetch options for security
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "guidemd-linter/1.0 (Security-Audited)",
      },
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export class CircularDependencyError extends Error {
  chain: string[];
  
  constructor(message: string, chain: string[]) {
    super(message);
    this.name = "CircularDependencyError";
    this.chain = chain;
  }
}

export interface ResolutionError {
  extends: string;
  message: string;
}

export interface ResolveResult {
  data: Record<string, unknown>;
  errors: ResolutionError[];
}

// ─── Resolution ─────────────────────────────────────────────────────────────────

/**
 * Normalizes an extends identifier for consistent circular detection.
 * Converts relative paths to absolute paths where possible.
 */
function normalizeExtendsId(ext: string, basePath: string): string {
  // Normalize local file paths to absolute paths
  if (ext.startsWith("./") || ext.startsWith("../")) {
    return path.resolve(basePath, ext).toLowerCase();
  }
  // Normalize registry names and URLs to lowercase
  return ext.toLowerCase();
}

/**
 * Recursively resolves the 'extends' field in the frontmatter.
 * Merges inherited data into the local data (local takes precedence).
 * 
 * Supports:
 * - Local file paths (e.g., extends: "./base-guide.md")
 * - Registry module names (e.g., extends: "typescript-strict")
 * - Remote URLs (e.g., extends: "https://example.com/guide.md")
 * 
 * @param localData The local frontmatter data containing the 'extends' field
 * @param basePath The base directory for resolving relative file paths
 * @param visited Set of already visited extends to detect circular dependencies
 * @param chain Array tracking the current extends chain for error reporting
 * @returns ResolveResult with merged data and any resolution errors
 * @throws CircularDependencyError if a circular extends chain is detected
 */
export async function resolveInheritance(
  localData: Record<string, unknown>,
  basePath: string = process.cwd(),
  visited: Set<string> = new Set(),
  chain: string[] = [],
  projectRoot?: string
): Promise<ResolveResult> {
  // Track the original project root for security boundary checks
  const resolvedProjectRoot = projectRoot ? path.resolve(projectRoot) : path.resolve(basePath);
  if (!localData.extends) {
    return { data: localData, errors: [] };
  }

  const extensions = Array.isArray(localData.extends)
    ? localData.extends
    : [localData.extends];

  let mergedData = { ...localData };
  const errors: ResolutionError[] = [];

  // Resolve extensions in reverse order so that earlier ones take precedence
  // If you have [base, middleware], middleware overrides base, and local overrides both.
  for (const ext of extensions.reverse()) {
    // Runtime type check: skip non-string extends entries
    if (typeof ext !== "string") {
      errors.push({
        extends: String(ext),
        message: `Invalid extends entry: expected string, received ${typeof ext}`
      });
      continue;
    }
    // Normalize the extends identifier for consistent circular detection
    const normalizedExt = normalizeExtendsId(ext, basePath);
    
    if (visited.has(normalizedExt)) {
      const errorChain = [...chain, ext];
      throw new CircularDependencyError(
        `Circular extends chain detected: ${errorChain.join(" -> ")}`,
        errorChain
      );
    }
    
    const newChain = [...chain, ext];
    visited.add(normalizedExt);

    let parentData: Record<string, unknown> | null = null;
    let resolvedPath: string | null = null;

    try {
      if (ext.startsWith("http://") || ext.startsWith("https://")) {
        // Remote URL - use SSRF-protected fetch
        const response = await fetchSecure(ext);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${ext}`);
        }
        const text = await response.text();
        const parsed = matter(text);
        parentData = parsed.data;
        resolvedPath = ext;
      } else if (ext.startsWith("./") || ext.startsWith("../") || ext.endsWith(".md") || ext.endsWith(".guide")) {
        // Local file path - validate for path traversal
        const filePath = path.resolve(basePath, ext);
        
        // Normalize paths for comparison
        const normalizedFilePath = path.normalize(filePath);
        const normalizedProjectRoot = path.normalize(resolvedProjectRoot);

        // Check that the resolved file path doesn't escape outside the project root
        // Allow files within the project tree, including parent directories of subfolders
        const isWithinProject = normalizedFilePath.startsWith(normalizedProjectRoot + path.sep) ||
                                normalizedFilePath === normalizedProjectRoot;

        // Additional security: Block absolute paths outside project and obvious traversal attacks
        const isAbsoluteTraversal = path.isAbsolute(ext) &&
                                  !normalizedFilePath.startsWith(normalizedProjectRoot);

        if (isAbsoluteTraversal || (!isWithinProject && ext.startsWith("/"))) {
          throw new Error(`Path traversal detected in extends: ${ext}`);
        }
        
        if (!fs.existsSync(filePath)) {
          throw new Error(`Local extends file not found: ${filePath}`);
        }
        
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = matter(content);
        parentData = parsed.data;
        resolvedPath = path.dirname(filePath);
      } else {
        // Assume it's a registry module - validate name first
        if (!sanitizeModuleName(ext)) {
          throw new Error(`Invalid registry module name: ${ext}`);
        }
        const module = await fetchModule(ext, "github");
        if (module) {
          parentData = module.content as Record<string, unknown>;
          resolvedPath = basePath; // Registry modules don't have a local path
        } else {
          throw new Error(`Registry module not found: ${ext}`);
        }
      }

      if (parentData) {
        // Recursive resolution for the parent (pass projectRoot to maintain security boundary)
        const parentResult = await resolveInheritance(parentData, resolvedPath || basePath, visited, newChain, resolvedProjectRoot);
        
        // Collect any errors from parent resolution
        errors.push(...parentResult.errors);
        
        // Remove 'extends' from parent data before merging (we've already resolved it)
        const { extends: _, ...parentWithoutExtends } = parentResult.data;
        
        // Merge parent into local (deep merge for nested objects)
        mergedData = deepMerge(parentWithoutExtends, mergedData);
      }
    } catch (e) {
      if (e instanceof CircularDependencyError) {
        throw e; // Re-throw circular dependency errors
      }
      // Surface non-circular resolution failures as errors
      errors.push({
        extends: ext,
        message: (e as Error).message || `Failed to resolve extension: ${ext}`
      });
    }
  }

  // Remove 'extends' from final merged data (it's been resolved)
  const { extends: _, ...finalData } = mergedData;
  return { data: finalData, errors };
}

// ─── Prototype Pollution Protection ───────────────────────────────────────────

export const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Checks if a key is dangerous and could lead to prototype pollution.
 */
function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.has(key);
}

/**
 * Securely merges two objects with prototype pollution protection.
 * Prevents keys like __proto__, constructor, and prototype from polluting Object.prototype.
 */
function deepMerge(parent: any, child: any): any {
  // Create a null-prototype object to prevent prototype pollution on the result itself
  const result: any = Object.create(null);
  
  // Copy parent properties safely
  for (const key of Object.keys(parent)) {
    if (!isDangerousKey(key)) {
      result[key] = parent[key];
    }
  }

  for (const key of Object.keys(child)) {
    // Skip dangerous keys to prevent prototype pollution
    if (isDangerousKey(key)) {
      console.warn(`[guidemd] Security: Ignoring dangerous key "${key}" during merge`);
      continue;
    }

    const parentVal = result[key]; // Use result instead of parent to handle overwritten values
    const childVal = child[key];

    if (
      parentVal &&
      childVal &&
      typeof parentVal === "object" &&
      typeof childVal === "object" &&
      !Array.isArray(parentVal) &&
      !Array.isArray(childVal)
    ) {
      result[key] = deepMerge(parentVal, childVal);
    } else {
      result[key] = childVal;
    }
  }

  return result;
}
