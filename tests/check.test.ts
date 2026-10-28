import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCheck } from "../src/check/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("check", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-check-test-"));
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        name: "check-test-project",
        version: "1.0.0",
        devDependencies: { vitest: "^4.0.0" },
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns valid results structure for a well-formed GUIDE.md", async () => {
    const guidePath = path.join(tempDir, "GUIDE.md");
    fs.writeFileSync(
      guidePath,
      `---\nguide_version: 0.2.5\nproject: test-project\nlanguage: typescript\nstrict_typing: true\nerror_protocol: verbose\n---\n\n# AI Instructions\nA test project.\n## Project Overview\nTest project.\n## Domain Vocabulary\nTest: entity.\n## Non-Obvious Decisions\nNone.\n## What NOT to do\nNever skip tests.\n`,
    );

    const result = await runCheck(guidePath, { minScore: 50 });

    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("checks");
    expect(result.checks).toHaveProperty("lint");
    expect(result.checks).toHaveProperty("info");
    expect(result.checks).toHaveProperty("doctor");
    expect(result.checks).toHaveProperty("verify");
    expect(result.checks.info).toHaveProperty("score");
    expect(result.checks.info).toHaveProperty("grade");
    expect(result.checks.info).toHaveProperty("passesGate");
  });

  it("info check respects minScore threshold", async () => {
    const guidePath = path.join(tempDir, "GUIDE.md");
    fs.writeFileSync(
      guidePath,
      `---\nguide_version: 0.2.5\nproject: test-project\nlanguage: typescript\nstrict_typing: true\nerror_protocol: verbose\n---\n\n# AI Instructions\nA short test project description for the check command.\n## Project Overview\nTest project.\n## Domain Vocabulary\nTest: entity.\n## Non-Obvious Decisions\nNone.\n## What NOT to do\nNever skip tests.\n`,
    );

    const lowThreshold = await runCheck(guidePath, { minScore: 0 });
    expect(lowThreshold.checks.info?.passesGate).toBe(true);

    const highThreshold = await runCheck(guidePath, { minScore: 100 });
    expect(highThreshold.checks.info?.passesGate).toBe(false);
  });

  it("returns error for missing file", async () => {
    const result = await runCheck("/nonexistent/GUIDE.md", { minScore: 50 });

    expect(result.valid).toBe(false);
    expect(result.checks.error).toContain("not found");
  });

  it("marks info check invalid when score below minScore", async () => {
    const guidePath = path.join(tempDir, "GUIDE.md");
    fs.writeFileSync(
      guidePath,
      `---\nguide_version: 0.2.5\nproject: test-project\nlanguage: typescript\nstrict_typing: true\nerror_protocol: verbose\n---\n\n# AI Instructions\nShort.\n`,
    );

    const result = await runCheck(guidePath, { minScore: 90 });

    expect(result.checks.info?.valid).toBe(false);
    expect(result.checks.info?.score).toBeLessThan(90);
    expect(result.checks.info?.passesGate).toBe(false);
  });
});
