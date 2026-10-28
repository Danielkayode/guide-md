import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mergeGuides } from "../src/merge/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("merge", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-merge-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeGuide(dirName: string, frontmatter: string, body: string): string {
    const dir = path.join(tempDir, dirName);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "GUIDE.md");
    fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n${body}\n`);
    return file;
  }

  const baseFields = `guide_version: "1.0.0"
project: repo-a
description: Package A module for the monorepo build system
language: typescript
strict_typing: true
error_protocol: verbose`;

  it("merges two GUIDE.md files into one", () => {
    const file1 = writeGuide("package-a", `${baseFields}
context:
  entry_points:
    - src/a.ts`, "# Package A\nBuild A.\n");
    const file2 = writeGuide("package-b", `guide_version: "1.0.0"
project: repo-b
description: Package B module for the monorepo build system
language: go
strict_typing: false
error_protocol: silent
context:
  entry_points:
    - src/b.go
guardrails:
  no_hallucination: true`, "# Package B\nBuild B.\n");

    const output = path.join(tempDir, "GUIDE.md");
    const result = mergeGuides([file1, file2], output);

    expect(result.changed).toBe(true);
    expect(result.mergedFrom).toContain(file1);
    expect(result.mergedFrom).toContain(file2);
    expect(fs.existsSync(output)).toBe(true);

    // Later file (file2) wins on scalar conflicts
    expect(result.mergedData.project).toBe("repo-b");
    expect(result.mergedData.language).toBe("go");

    // Arrays merged uniquely
    const entryPoints = (result.mergedData.context as Record<string, unknown>).entry_points as string[];
    expect(entryPoints).toContain("src/a.ts");
    expect(entryPoints).toContain("src/b.go");

    // Bodies concatenated
    const written = fs.readFileSync(output, "utf-8");
    expect(written).toContain("Build A.");
    expect(written).toContain("Build B.");
  });

  it("reports conflicts for overwritten and merged fields", () => {
    const file1 = writeGuide("one", `guide_version: "1.0.0"
project: alpha
description: First package description with enough characters
language: typescript
strict_typing: true
error_protocol: verbose`, "# One\n");
    const file2 = writeGuide("two", `guide_version: "1.0.0"
project: beta
description: Second package description with enough characters
language: go
strict_typing: false
error_protocol: silent
context:
  off_limits:
    - secrets/`, "# Two\n");

    const result = mergeGuides([file1, file2], path.join(tempDir, "out.md"));

    expect(result.conflicts.length).toBeGreaterThan(0);
    const projectConflict = result.conflicts.find(c => c.field === "project");
    expect(projectConflict?.resolution).toBe("overwritten");
    expect(projectConflict?.sourceFile).toBe(file2);
  });

  it("does not write when nothing changed", () => {
    const file = writeGuide("only", `guide_version: "1.0.0"
project: alpha
description: Only package description long enough to pass validation
language: typescript
strict_typing: true
error_protocol: verbose`, "# Only\n");

    const output = path.join(tempDir, "GUIDE.md");
    mergeGuides([file], output);

    const first = fs.readFileSync(output, "utf-8");
    const result = mergeGuides([file], output);

    expect(result.changed).toBe(false);
    expect(fs.readFileSync(output, "utf-8")).toBe(first);
  });

  it("throws when a source file is missing", () => {
    expect(() =>
      mergeGuides([path.join(tempDir, "missing.md")], path.join(tempDir, "out.md")),
    ).toThrow(/not found/);
  });

  it("validates merged output against schema", () => {
    const file1 = writeGuide("a", `guide_version: "1.0.0"
project: alpha
description: Package A description long enough to pass validation
language: typescript
strict_typing: true
error_protocol: verbose`, "# A\n");
    const file2 = writeGuide("b", `guide_version: "1.0.0"
project: beta
description: Package B description long enough to pass validation
language: go
strict_typing: false
error_protocol: silent`, "# B\n");

    const result = mergeGuides([file1, file2], path.join(tempDir, "out.md"));

    expect(result.mergedData.project).toBe("beta");
    expect(result.mergedData.language).toBe("go");
    expect(result.mergedData.guide_version).toBeDefined();
  });
});
