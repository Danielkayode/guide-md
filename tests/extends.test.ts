import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveInheritance, CircularDependencyError, ResolutionError } from "../src/parser/resolver.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("extends (inheritance)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-extends-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("local path resolution", () => {
    it("should resolve relative local file paths", async () => {
      // Create a base guide
      const baseContent = `---
guide_version: "1.0.0"
project: "base-project"
language: typescript
strict_typing: true
error_protocol: verbose
code_style:
  max_line_length: 80
---

Base content
`;
      fs.writeFileSync(path.join(tempDir, "base.md"), baseContent);

      // Create a child guide that extends the base
      const childData = {
        extends: "./base.md",
        guide_version: "1.0.0",
        project: "child-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        code_style: {
          max_line_length: 100, // Override base value
        },
      };

      const result = await resolveInheritance(childData, tempDir);

      expect(result.errors).toHaveLength(0);
      expect(result.data.project).toBe("child-project"); // Child takes precedence
      expect((result.data as any).code_style.max_line_length).toBe(100); // Child overrides
    });

    it("should resolve parent directory paths", async () => {
      // Create base in parent
      const baseContent = `---
guide_version: "1.0.0"
project: "parent-base"
language: typescript
strict_typing: true
error_protocol: verbose
---

Base
`;
      fs.writeFileSync(path.join(tempDir, "base.md"), baseContent);

      // Create subdirectory with child
      const subDir = path.join(tempDir, "sub");
      fs.mkdirSync(subDir, { recursive: true });

      const childData = {
        extends: "../base.md",
        guide_version: "1.0.0",
        project: "sub-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = await resolveInheritance(childData, subDir);

      expect(result.errors).toHaveLength(0);
      expect(result.data.project).toBe("sub-project");
    });

    it("should report error for non-existent local file", async () => {
      const childData = {
        extends: "./nonexistent.md",
        guide_version: "1.0.0",
        project: "child-project",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = await resolveInheritance(childData, tempDir);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].extends).toBe("./nonexistent.md");
      expect(result.errors[0].message).toContain("not found");
    });
  });

  describe("deep merging", () => {
    it("should deeply merge nested objects", async () => {
      const baseContent = `---
guide_version: "1.0.0"
project: "base"
language: typescript
strict_typing: true
error_protocol: verbose
code_style:
  max_line_length: 80
  indentation: "2 spaces"
  naming_convention: camelCase
guardrails:
  no_hallucination: true
  scope_creep_prevention: true
---

Base
`;
      fs.writeFileSync(path.join(tempDir, "base.md"), baseContent);

      const childData = {
        extends: "./base.md",
        guide_version: "1.0.0",
        project: "child",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        code_style: {
          max_line_length: 120, // Override just this
        },
        guardrails: {
          cite_sources: true, // Add new field
        },
      };

      const result = await resolveInheritance(childData, tempDir);

      expect((result.data as any).code_style.max_line_length).toBe(120); // Child value
      expect((result.data as any).code_style.indentation).toBe("2 spaces"); // From base
      expect((result.data as any).code_style.naming_convention).toBe("camelCase"); // From base
      expect((result.data as any).guardrails.no_hallucination).toBe(true); // From base
      expect((result.data as any).guardrails.scope_creep_prevention).toBe(true); // From base
      expect((result.data as any).guardrails.cite_sources).toBe(true); // From child
    });

    it("should handle arrays correctly (child replaces parent arrays)", async () => {
      const baseContent = `---
guide_version: "1.0.0"
project: "base"
language: typescript
strict_typing: true
error_protocol: verbose
context:
  entry_points:
    - src/index.ts
    - src/lib.ts
---

Base
`;
      fs.writeFileSync(path.join(tempDir, "base.md"), baseContent);

      const childData = {
        extends: "./base.md",
        guide_version: "1.0.0",
        project: "child",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        context: {
          entry_points: ["src/main.ts"], // Replace array
        },
      };

      const result = await resolveInheritance(childData, tempDir);

      // Child's array should replace parent's
      expect((result.data as any).context.entry_points).toEqual(["src/main.ts"]);
    });
  });

  describe("multiple inheritance", () => {
    it("should resolve multiple extends in order", async () => {
      // Create first base
      const base1Content = `---
guide_version: "1.0.0"
project: "base1"
language: typescript
strict_typing: true
error_protocol: verbose
code_style:
  max_line_length: 80
---

Base1
`;
      fs.writeFileSync(path.join(tempDir, "base1.md"), base1Content);

      // Create second base
      const base2Content = `---
guide_version: "1.0.0"
project: "base2"
language: python
strict_typing: true
error_protocol: verbose
code_style:
  max_line_length: 100
  naming_convention: snake_case
---

Base2
`;
      fs.writeFileSync(path.join(tempDir, "base2.md"), base2Content);

      const childData = {
        extends: ["./base1.md", "./base2.md"],
        guide_version: "1.0.0",
        project: "child",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = await resolveInheritance(childData, tempDir);

      // base1 comes first, base2 overrides it, then child overrides
      // But actually: resolution is in reverse order, so base2 takes precedence over base1
      expect((result.data as any).code_style.max_line_length).toBe(100); // From base2 (overrides base1's 80)
      expect((result.data as any).code_style.naming_convention).toBe("snake_case"); // From base2
      expect(result.data.language).toBe("typescript"); // From child (overrides base2's python)
    });
  });

  describe("circular dependency detection", () => {
    it("should detect simple circular dependency", async () => {
      // Create A that extends B
      const contentA = `---
extends: "./b.md"
guide_version: "1.0.0"
project: "a"
language: typescript
strict_typing: true
error_protocol: verbose
---

A
`;
      fs.writeFileSync(path.join(tempDir, "a.md"), contentA);

      // Create B that extends A (circular!)
      const contentB = `---
extends: "./a.md"
guide_version: "1.0.0"
project: "b"
language: typescript
strict_typing: true
error_protocol: verbose
---

B
`;
      fs.writeFileSync(path.join(tempDir, "b.md"), contentB);

      const data = {
        extends: "./a.md",
        guide_version: "1.0.0",
        project: "start",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      await expect(resolveInheritance(data, tempDir)).rejects.toThrow(CircularDependencyError);
    });

    it("should detect indirect circular dependency", async () => {
      // Create A that extends B
      const contentA = `---
extends: "./b.md"
guide_version: "1.0.0"
project: "a"
language: typescript
strict_typing: true
error_protocol: verbose
---

A
`;
      fs.writeFileSync(path.join(tempDir, "a.md"), contentA);

      // Create B that extends C
      const contentB = `---
extends: "./c.md"
guide_version: "1.0.0"
project: "b"
language: typescript
strict_typing: true
error_protocol: verbose
---

B
`;
      fs.writeFileSync(path.join(tempDir, "b.md"), contentB);

      // Create C that extends A (indirect circular!)
      const contentC = `---
extends: "./a.md"
guide_version: "1.0.0"
project: "c"
language: typescript
strict_typing: true
error_protocol: verbose
---

C
`;
      fs.writeFileSync(path.join(tempDir, "c.md"), contentC);

      const data = {
        extends: "./a.md",
        guide_version: "1.0.0",
        project: "start",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      await expect(resolveInheritance(data, tempDir)).rejects.toThrow(CircularDependencyError);
    });

    it("should include chain in circular dependency error", async () => {
      const contentA = `---
extends: "./b.md"
guide_version: "1.0.0"
project: "a"
language: typescript
strict_typing: true
error_protocol: verbose
---

A
`;
      fs.writeFileSync(path.join(tempDir, "a.md"), contentA);

      const contentB = `---
extends: "./a.md"
guide_version: "1.0.0"
project: "b"
language: typescript
strict_typing: true
error_protocol: verbose
---

B
`;
      fs.writeFileSync(path.join(tempDir, "b.md"), contentB);

      const data = {
        extends: "./a.md",
        guide_version: "1.0.0",
        project: "start",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      try {
        await resolveInheritance(data, tempDir);
        expect.fail("Should have thrown CircularDependencyError");
      } catch (e) {
        expect(e).toBeInstanceOf(CircularDependencyError);
        expect((e as CircularDependencyError).chain).toContain("./a.md");
        expect((e as CircularDependencyError).chain).toContain("./b.md");
      }
    });
  });

  describe("no extends", () => {
    it("should return local data unchanged when no extends field", async () => {
      const data = {
        guide_version: "1.0.0",
        project: "standalone",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
        custom_field: "value",
      };

      const result = await resolveInheritance(data, tempDir);

      expect(result.errors).toHaveLength(0);
      expect(result.data.project).toBe("standalone");
      expect((result.data as Record<string, unknown>).custom_field).toBe("value");
    });
  });

  describe("invalid extends entries", () => {
    it("should report error for non-string extends entries", async () => {
      const data = {
        extends: 123, // Invalid type
        guide_version: "1.0.0",
        project: "test",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = await resolveInheritance(data as any, tempDir);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Invalid extends entry");
    });

    it("should handle array with invalid entries", async () => {
      const data = {
        extends: ["./valid.md", 123, "./another.md"], // Middle one is invalid
        guide_version: "1.0.0",
        project: "test",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      const result = await resolveInheritance(data as any, tempDir);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes("Invalid extends entry"))).toBe(true);
    });
  });

  describe("case sensitivity", () => {
    it("should detect circular dependencies case-insensitively", async () => {
      // Windows is case-insensitive
      const contentA = `---
extends: "./B.md"
guide_version: "1.0.0"
project: "a"
language: typescript
strict_typing: true
error_protocol: verbose
---

A
`;
      fs.writeFileSync(path.join(tempDir, "a.md"), contentA);

      const contentB = `---
extends: "./A.md"
guide_version: "1.0.0"
project: "b"
language: typescript
strict_typing: true
error_protocol: verbose
---

B
`;
      fs.writeFileSync(path.join(tempDir, "B.md"), contentB);

      const data = {
        extends: "./a.md",
        guide_version: "1.0.0",
        project: "start",
        language: "typescript",
        strict_typing: true,
        error_protocol: "verbose",
      };

      // On case-insensitive file systems, this should still detect the cycle
      await expect(resolveInheritance(data, tempDir)).rejects.toThrow(CircularDependencyError);
    });
  });
});
