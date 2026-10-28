import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { auditFile } from "../src/audit/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("audit", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-audit-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeGuide(content: string): string {
    const file = path.join(tempDir, "GUIDE.md");
    fs.writeFileSync(file, content);
    return file;
  }

  const cleanFrontmatter = `---
guide_version: 1.0.0
project: alpha
description: A clean test project
language: typescript
strict_typing: true
error_protocol: verbose
last_updated: "2026-01-15"
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
---`;

  it("passes a clean GUIDE.md", () => {
    const file = writeGuide(`${cleanFrontmatter}

# AI Instructions

Build great software.
`);

    const result = auditFile(file);

    expect(result.passed).toBe(true);
    expect(result.errors).toBe(0);
  });

  it("detects hardcoded secrets as errors", () => {
    const file = writeGuide(`${cleanFrontmatter}

# AI Instructions

sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234
`);

    const result = auditFile(file);

    expect(result.passed).toBe(false);
    expect(result.errors).toBeGreaterThan(0);
    const secretIssues = result.issues.filter(i => i.category === "secret");
    expect(secretIssues.length).toBeGreaterThan(0);
    expect(secretIssues[0].severity).toBe("error");
  });

  it("detects private key blocks", () => {
    const file = writeGuide(`${cleanFrontmatter}

# AI Instructions

-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJPBAN03K
-----END RSA PRIVATE KEY-----
`);

    const result = auditFile(file);

    expect(result.passed).toBe(false);
    expect(result.errors).toBeGreaterThan(0);
  });

  it("detects dangerous connection strings", () => {
    const file = writeGuide(`${cleanFrontmatter}

# AI Instructions

DB_URL=mongodb://admin:secret123@localhost:27017/mydb
`);

    const result = auditFile(file);

    expect(result.passed).toBe(false);
    const patternIssues = result.issues.filter(i => i.category === "dangerous_pattern");
    expect(patternIssues.length).toBeGreaterThan(0);
  });

  it("reports missing required frontmatter fields", () => {
    const file = writeGuide(`---
project: alpha
---

# AI Instructions

Body.
`);

    const result = auditFile(file);

    expect(result.passed).toBe(false);
    const missing = result.issues.filter(i => i.category === "missing_field");
    expect(missing.length).toBeGreaterThan(0);
  });

  it("reports stale last_updated as warning", () => {
    const file = writeGuide(`${cleanFrontmatter.replace("2026-01-15", "2020-01-01")}

# AI Instructions

Body.
`).replace("last_updated: 2020-01-01", 'last_updated: "2020-01-01"');

    const result = auditFile(file);

    const outdated = result.issues.filter(i => i.category === "outdated");
    expect(outdated.length).toBeGreaterThan(0);
    expect(outdated[0].severity).toBe("warning");
  });

  it("errors when file does not exist", () => {
    const result = auditFile(path.join(tempDir, "GUIDE.md"));

    expect(result.passed).toBe(false);
    expect(result.errors).toBe(1);
    expect(result.issues[0].message).toContain("not found");
  });
});
