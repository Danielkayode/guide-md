import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrateGuide } from "../src/migrate/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("migrate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-migrate-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("adds missing required fields with defaults", () => {
    const guidePath = path.join(tempDir, "GUIDE.md");
    fs.writeFileSync(
      guidePath,
      `---\nproject: my-project\n---\n\n# AI Instructions\nHello.\n`,
    );

    const result = migrateGuide(guidePath, { write: false });

    expect(result.changed).toBe(true);
    expect(result.changes).toContain("guide_version: set to 0.2.5");
    expect(result.changes).toContain("language: set to typescript (default)");
    expect(result.changes).toContain("strict_typing: set to true (default)");
    expect(result.changes).toContain("error_protocol: set to verbose (default)");
    expect(result.version).toBe("0.2.5");
  });

  it("writes migrated frontmatter back to file", () => {
    const guidePath = path.join(tempDir, "GUIDE.md");
    fs.writeFileSync(
      guidePath,
      `---\nproject: my-project\n---\n\n# AI Instructions\nHello.\n`,
    );

    const result = migrateGuide(guidePath, { write: true });

    expect(result.changed).toBe(true);
    const written = fs.readFileSync(guidePath, "utf-8");
    expect(written).toContain("guide_version: 0.2.5");
    expect(written).toContain("language: typescript");
    expect(written).toContain("strict_typing: true");
    expect(written).toContain("error_protocol: verbose");
    expect(written).toContain("# AI Instructions");
    expect(written).toContain("Hello.");
  });

  it("does not change when already on latest version", () => {
    const guidePath = path.join(tempDir, "GUIDE.md");
    fs.writeFileSync(
      guidePath,
      `---\nguide_version: 0.2.5\nproject: my-project\nlanguage: typescript\nstrict_typing: true\nerror_protocol: verbose\n---\n\n# AI Instructions\nHello.\n`,
    );

    const result = migrateGuide(guidePath, { write: false });

    expect(result.changed).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it("updates guide_version when force is set", () => {
    const guidePath = path.join(tempDir, "GUIDE.md");
    fs.writeFileSync(
      guidePath,
      `---\nguide_version: 0.2.4\nproject: my-project\nlanguage: typescript\nstrict_typing: true\nerror_protocol: verbose\n---\n\n# AI Instructions\nHello.\n`,
    );

    const result = migrateGuide(guidePath, { force: true, write: false });

    expect(result.changed).toBe(true);
    expect(result.changes).toContain("guide_version: 0.2.4 → 0.2.5");
  });

  it("throws on missing file", () => {
    expect(() => migrateGuide("/nonexistent/GUIDE.md", { write: false })).toThrow(
      /not found/,
    );
  });

  it("throws on unparseable file", () => {
    const guidePath = path.join(tempDir, "GUIDE.md");
    fs.writeFileSync(guidePath, "not valid frontmatter at all\n---\nbroken");
    expect(() => migrateGuide(guidePath, { write: false })).toThrow();
  });

  it("does not write when write is false", () => {
    const guidePath = path.join(tempDir, "GUIDE.md");
    fs.writeFileSync(
      guidePath,
      `---\nproject: my-project\n---\n\n# AI Instructions\nHello.\n`,
    );
    const before = fs.readFileSync(guidePath, "utf-8");

    migrateGuide(guidePath, { write: false });

    const after = fs.readFileSync(guidePath, "utf-8");
    expect(after).toBe(before);
  });
});
