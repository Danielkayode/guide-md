// ─── Registry Sources: Local Cache + GitHub Fallback ────────────────────────────

import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import matter from "gray-matter";
import { RegistrySource, GuideModule, RegistryEntry } from "./types.js";

const CACHE_DIR = path.join(os.homedir(), ".guidemd", "modules");
const INDEX_PATH = path.join(os.homedir(), ".guidemd", "registry.json");
const INDEX_HASH_PATH = path.join(os.homedir(), ".guidemd", "registry.json.sha256");
const GITHUB_BASE = "https://raw.githubusercontent.com/guidemd/registry/main/modules";

// ─── Security Utilities ───────────────────────────────────────────────────────

/**
 * Validates and sanitizes a module name to prevent path traversal attacks.
 * Only allows alphanumeric characters, hyphens, underscores, and dots.
 * Rejects any name containing path traversal sequences.
 */
export function sanitizeModuleName(name: string): string | null {
  // Reject empty or overly long names
  if (!name || name.length === 0 || name.length > 100) {
    return null;
  }

  // Reject path traversal attempts
  if (name.includes("..") || name.includes("/") || name.includes("\\") || name.includes("%")) {
    return null;
  }

  // Only allow safe characters: alphanumeric, hyphens, underscores, dots
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return null;
  }

  // Reject hidden files and reserved names
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith(".") || lowerName === "con" || lowerName === "prn" || 
      lowerName === "aux" || lowerName === "nul" || lowerName === "com1" ||
      lowerName === "com2" || lowerName === "com3" || lowerName === "com4" ||
      lowerName === "lpt1" || lowerName === "lpt2" || lowerName === "lpt3") {
    return null;
  }

  return name;
}

/**
 * Ensures a resolved file path is within the allowed cache directory.
 * This provides defense-in-depth against path traversal even if sanitization is bypassed.
 * Exported for testing.
 */
export function isPathWithinCache(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const resolvedCache = path.resolve(CACHE_DIR);
  return resolved.startsWith(resolvedCache + path.sep) || resolved === resolvedCache;
}

// ─── Hash Utilities ───────────────────────────────────────────────────────────

function computeHash(data: string): string {
  return crypto.createHash("sha256").update(data, "utf-8").digest("hex");
}

function readHash(filePath: string): string | null {
  const hashPath = `${filePath}.sha256`;
  if (!fs.existsSync(hashPath)) return null;
  try {
    return fs.readFileSync(hashPath, "utf-8").trim();
  } catch {
    return null;
  }
}

function writeHash(filePath: string, hash: string): void {
  const hashPath = `${filePath}.sha256`;
  const tempPath = `${hashPath}.tmp`;
  try {
    // Write to temp file first, then atomic rename
    fs.writeFileSync(tempPath, hash, "utf-8");
    fs.renameSync(tempPath, hashPath);
  } catch {
    // Ignore hash write failures
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup failure
    }
  }
}

function verifyFileIntegrity(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const expectedHash = readHash(filePath);
  if (!expectedHash) return false; // No hash to verify against
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const actualHash = computeHash(content);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function modulePath(name: string): string | null {
  const sanitized = sanitizeModuleName(name);
  if (!sanitized) {
    return null;
  }
  return path.join(CACHE_DIR, `${sanitized}.guide`);
}

function readIndex(): RegistryEntry[] {
  if (!fs.existsSync(INDEX_PATH)) return [];
  // Verify integrity before using cached index (prevents "Silent Empty Index" bug)
  if (!verifyFileIntegrity(INDEX_PATH)) {
    console.warn("[guidemd] Registry index hash mismatch. Cache may be corrupted.");
    return [];
  }
  try {
    const raw = fs.readFileSync(INDEX_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.modules) ? parsed.modules : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: RegistryEntry[]): void {
  ensureCacheDir();
  const content = JSON.stringify({ version: "1.0.0", modules: entries }, null, 2);
  const tempPath = `${INDEX_PATH}.tmp`;
  try {
    // Atomic write: write to temp then rename
    fs.writeFileSync(tempPath, content, "utf-8");
    fs.renameSync(tempPath, INDEX_PATH);
    // Store hash for integrity verification
    writeHash(INDEX_PATH, computeHash(content));
  } catch {
    // Cleanup on failure
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup failure
    }
  }
}

// ─── Fuzzy Search Utilities ───────────────────────────────────────────────────

/**
 * Computes Levenshtein distance between two strings.
 * Uses 1D array to avoid TypeScript strict null check issues.
 */
function levenshteinDistance(a: string, b: string): number {
  const cols = a.length + 1;
  const rows = b.length + 1;
  const matrix: number[] = new Array(cols * rows).fill(0);

  const get = (i: number, j: number): number => matrix[i * cols + j]!;
  const set = (i: number, j: number, val: number): void => {
    matrix[i * cols + j] = val;
  };

  for (let i = 0; i < rows; i++) set(i, 0, i);
  for (let j = 0; j < cols; j++) set(0, j, j);

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      set(
        i,
        j,
        b[i - 1] === a[j - 1]
          ? get(i - 1, j - 1)
          : Math.min(
              get(i - 1, j - 1) + 1, // substitution
              get(i, j - 1) + 1,     // insertion
              get(i - 1, j) + 1      // deletion
            )
      );
    }
  }
  return get(rows - 1, cols - 1);
}

/**
 * Normalized fuzzy score (0 = exact match, 1 = completely different).
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const dist = levenshteinDistance(q, t);
  return dist / Math.max(q.length, t.length);
}

/**
 * Performs fuzzy search across registry entries.
 * Returns entries where exact substring match OR fuzzy score is below threshold.
 */
function fuzzySearchEntries(entries: RegistryEntry[], query: string, threshold = 0.4): RegistryEntry[] {
  const q = query.toLowerCase();
  const results: { entry: RegistryEntry; score: number }[] = [];

  for (const entry of entries) {
    // Exact substring matches get priority (score 0)
    if (
      entry.name.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.tags.some((t) => t.toLowerCase().includes(q))
    ) {
      results.push({ entry, score: 0 });
      continue;
    }

    // Fuzzy matching against name, description, and tags
    let bestScore = Infinity;
    bestScore = Math.min(bestScore, fuzzyScore(q, entry.name));
    bestScore = Math.min(bestScore, fuzzyScore(q, entry.description));
    for (const tag of entry.tags) {
      bestScore = Math.min(bestScore, fuzzyScore(q, tag));
    }

    if (bestScore <= threshold) {
      results.push({ entry, score: bestScore });
    }
  }

  // Sort: exact matches first, then by fuzzy score ascending
  results.sort((a, b) => a.score - b.score);
  return results.map((r) => r.entry);
}

// ─── Registry Sources ─────────────────────────────────────────────────────────

/**
 * Fetches a raw text file over HTTPS with retry logic.
 * Retries up to 3 times with exponential backoff.
 */
async function fetchHttpsWithRetry(url: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetchHttpsOnce(url);
    } catch (e) {
      if (attempt === retries - 1) throw e;
      // Exponential backoff: 1s, 2s, 4s
      const delay = 1000 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

/**
 * Validates a URL is safe to fetch (prevents SSRF attacks).
 * Only allows HTTPS to known safe origins, blocks internal IPs.
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow HTTPS protocol
    if (parsed.protocol !== "https:") {
      return false;
    }
    
    // Only allow specific trusted hosts
    const allowedHosts = [
      "raw.githubusercontent.com",
      "github.com",
      "api.github.com"
    ];
    
    if (!allowedHosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
      return false;
    }
    
    // Block URLs with credentials
    if (parsed.username || parsed.password) {
      return false;
    }
    
    // Block URLs with unusual ports
    if (parsed.port && parsed.port !== "443") {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates redirect location is safe.
 */
function isSafeRedirect(originalUrl: string, redirectUrl: string): boolean {
  // Resolve relative URLs
  let resolvedUrl: string;
  try {
    resolvedUrl = new URL(redirectUrl, originalUrl).href;
  } catch {
    return false;
  }
  
  // Must pass all safety checks
  return isSafeUrl(resolvedUrl);
}

/**
 * Single fetch attempt (internal).
 */
function fetchHttpsOnce(url: string, redirectCount = 0): Promise<string> {
  // Prevent redirect loops
  if (redirectCount > 3) {
    return Promise.reject(new Error("Too many redirects"));
  }
  
  // Validate URL before fetching
  if (!isSafeUrl(url)) {
    return Promise.reject(new Error("Unsafe URL blocked by SSRF protection"));
  }
  
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const location = res.headers.location;
        if (location) {
          // Validate redirect is safe before following
          if (!isSafeRedirect(url, location)) {
            reject(new Error("Redirect to unsafe URL blocked"));
            return;
          }
          fetchHttpsOnce(location, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

/**
 * Attempts to parse a module file into a GuideModule.
 */
function parseModuleFile(name: string, raw: string): GuideModule | null {
  try {
    const parsed = matter(raw);
    if (!parsed.data || Object.keys(parsed.data).length === 0) return null;

    const module: GuideModule = {
      name,
      content: parsed.data as Record<string, unknown>,
    };
    if (parsed.data.version) module.version = parsed.data.version as string;
    if (parsed.data.description) module.description = parsed.data.description as string;
    if (parsed.data.tags) module.tags = parsed.data.tags as string[];
    return module;
  } catch {
    return null;
  }
}

// ─── Local Cache Source ───────────────────────────────────────────────────────

export const localSource: RegistrySource = {
  name: "local",

  async fetchModule(moduleName: string): Promise<GuideModule | null> {
    const filePath = modulePath(moduleName);
    if (!filePath) {
      console.warn(`[guidemd] Invalid module name: ${moduleName}`);
      return null;
    }
    if (!isPathWithinCache(filePath)) {
      console.warn(`[guidemd] Security: Module path escapes cache directory: ${moduleName}`);
      return null;
    }
    if (!fs.existsSync(filePath)) return null;
    // Verify integrity before returning cached module
    if (!verifyFileIntegrity(filePath)) {
      console.warn(`[guidemd] Module ${moduleName} cache hash mismatch. Will attempt refetch.`);
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return parseModuleFile(moduleName, raw);
  },

  async listModules(): Promise<RegistryEntry[]> {
    return readIndex();
  },

  async searchModules(query: string): Promise<RegistryEntry[]> {
    const entries = readIndex();
    return fuzzySearchEntries(entries, query);
  },
};

// ─── GitHub Remote Source ─────────────────────────────────────────────────────

export const githubSource: RegistrySource = {
  name: "github",

  async fetchModule(moduleName: string): Promise<GuideModule | null> {
    // Validate module name before making network request
    if (!sanitizeModuleName(moduleName)) {
      console.warn(`[guidemd] Invalid module name: ${moduleName}`);
      return null;
    }
    const url = `${GITHUB_BASE}/${moduleName}.guide`;
    try {
      const raw = await fetchHttpsWithRetry(url);
      const module = parseModuleFile(moduleName, raw);
      if (module) {
        // Cache locally for future offline use with hash verification
        ensureCacheDir();
        const filePath = modulePath(moduleName);
        if (filePath && isPathWithinCache(filePath)) {
          // Atomic write: write to temp file then rename to prevent TOCTOU race condition
          const tempPath = `${filePath}.tmp`;
          try {
            fs.writeFileSync(tempPath, raw, "utf-8");
            fs.renameSync(tempPath, filePath);
            writeHash(filePath, computeHash(raw));
          } catch {
            // Cleanup on failure
            try {
              fs.unlinkSync(tempPath);
            } catch {
              // Ignore cleanup failure
            }
          }
        }
      }
      return module;
    } catch {
      return null;
    }
  },

  async listModules(): Promise<RegistryEntry[]> {
    // Try to fetch the remote index
    const url = `${GITHUB_BASE}/../registry.json`;
    try {
      const raw = await fetchHttpsWithRetry(url);
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed.modules) ? parsed.modules : [];
      // Update local index with hash
      writeIndex(entries);
      return entries;
    } catch {
      // Fallback to local cache with integrity verification
      return readIndex();
    }
  },

  async searchModules(query: string): Promise<RegistryEntry[]> {
    const entries = await this.listModules();
    return fuzzySearchEntries(entries, query);
  },
};

/**
 * Attempts to fetch a module from local cache first, then GitHub.
 */
export async function fetchModule(
  name: string,
  source: "local" | "github" = "local"
): Promise<GuideModule | null> {
  if (source === "local") {
    const local = await localSource.fetchModule(name);
    if (local) return local;
    // Fallback to GitHub
    return githubSource.fetchModule(name);
  }
  // Force GitHub fetch (and update cache)
  return githubSource.fetchModule(name);
}
