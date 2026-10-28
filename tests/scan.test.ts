import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scanDirectory } from "../src/scan/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("scan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-scan-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects GUIDE.md, AGENTS.md, .cursorrules, and copilot instructions", async () => {
    fs.writeFileSync(path.join(tempDir, "GUIDE.md"), "---\nproject: alpha\n---\n\n# Guide\nbody\n");
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Agents\nbody\n");
    fs.writeFileSync(path.join(tempDir, ".cursorrules"), "# Cursor rules\nbody\n");
    fs.mkdirSync(path.join(tempDir, ".github"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, ".github/copilot-instructions.md"),
      "# Copilot\nbody\n",
    );

    const result = await scanDirectory(tempDir);

    const types = new Set(result.files.map(f => f.type));
    expect(types.has("guidemd")).toBe(true);
    expect(types.has("agents")).toBe(true);
    expect(types.has("cursor")).toBe(true);
    expect(types.has("copilot")).toBe(true);
    expect(result.totalFiles).toBeGreaterThanOrEqual(4);
    expect(result.root).toBe(tempDir);
  });

  it("scores GUIDE.md files and assigns grades", async () => {
    fs.writeFileSync(
      path.join(tempDir, "GUIDE.md"),
      `---\nguide_version: 1.0.0
project: alpha
description: A test project for scanning
language: typescript
strict_typing: true
error_protocol: verbose
last_updated: "2026-01-01"
context:
  entry_points:
    - src/index.ts
  off_limits:
    - secrets/
guardrails:
  no_hallucination: true
  scope_creep_prevention: true
testing:
  required: true
---
# AI Instructions

Build great software.
`,
    );

    const result = await scanDirectory(tempDir);
    const guide = result.files.find(f => f.type === "guidemd");

    expect(guide).toBeDefined();
    expect(guide!.valid).toBe(true);
    expect(guide!.score).toBeGreaterThanOrEqual(0);
    expect(guide!.score).toBeLessThanOrEqual(100);
    expect(guide!.grade).toBeDefined();
  });

  it("detects secrets in context files", async () => {
    fs.writeFileSync(
      path.join(tempDir, "AGENTS.md"),
      `# Agents

sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234
`,
    );

    const result = await scanDirectory(tempDir);
    const agents = result.files.find(f => f.type === "agents");

    expect(agents!.hasSecrets).toBe(true);
    expect(result.summary.withSecrets).toBeGreaterThanOrEqual(1);
  });

  it("reports invalid files when parse fails", async () => {
    fs.writeFileSync(
      path.join(tempDir, "GUIDE.md"),
      "no frontmatter at all\n---\nbroken\n",
    );

    const result = await scanDirectory(tempDir);
    expect(result.summary.invalid).toBeGreaterThanOrEqual(1);
  });

  it("returns empty results for a directory with no AI context files", async () => {
    fs.writeFileSync(path.join(tempDir, "README.md"), "# Hello\n");

    const result = await scanDirectory(tempDir);

    expect(result.totalFiles).toBe(0);
    expect(result.files).toHaveLength(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
