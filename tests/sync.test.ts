import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectDrift, syncGuideFile } from "../src/linter/sync.js";
import { GuideMdFrontmatter } from "../src/schema/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("sync", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-sync-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createMockData = (overrides: Partial<GuideMdFrontmatter> = {}): GuideMdFrontmatter => ({
    guide_version: "1.0.0",
    project: "test-project",
    language: "typescript",
    strict_typing: true,
    error_protocol: "verbose",
    ...overrides,
  });

  describe("detectDrift", () => {
    it("should detect framework version drift from package.json", async () => {
      // Create package.json with different framework version
      const packageJson = {
        name: "test-project",
        dependencies: {
          express: "^4.18.2",
        },
      };
      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(packageJson, null, 2));

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const data = createMockData({
        framework: "express@4.17.0", // Different version in GUIDE.md
      });

      const drifts = await detectDrift(data, guidePath);

      const frameworkDrift = drifts.find(d => d.field === "framework");
      expect(frameworkDrift).toBeDefined();
      expect(frameworkDrift?.actual).toContain("4.18.2");
      expect(frameworkDrift?.expected).toContain("4.17.0");
    });

    it("should detect missing entry points", async () => {
      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const data = createMockData({
        context: {
          entry_points: ["src/index.ts", "src/nonexistent.ts"],
        },
      });

      const drifts = await detectDrift(data, guidePath);

      const entryPointDrift = drifts.find(d => d.field === "context.entry_points" && d.message.includes("nonexistent.ts"));
      expect(entryPointDrift).toBeDefined();
      expect(entryPointDrift?.message).toContain("does not exist");
    });

    it("should detect missing tsconfig.json when strict_typing is enabled", async () => {
      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const data = createMockData({
        strict_typing: true,
      });

      const drifts = await detectDrift(data, guidePath);

      const tsconfigDrift = drifts.find(d => d.field === "strict_typing");
      expect(tsconfigDrift).toBeDefined();
      expect(tsconfigDrift?.message).toContain("tsconfig.json");
    });

    it("should detect new directories not in entry_points", async () => {
      // Create directories
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.mkdirSync(path.join(tempDir, "lib"), { recursive: true });

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const data = createMockData({
        context: {
          entry_points: ["src/index.ts"],
        },
      });

      const drifts = await detectDrift(data, guidePath);

      const newDirDrift = drifts.find(d => d.field === "context.entry_points" && d.message.includes('"lib"'));
      expect(newDirDrift).toBeDefined();
    });

    it("should return empty array when no drift detected", async () => {
      // Create matching package.json
      const packageJson = {
        name: "test-project",
        dependencies: {
          express: "^4.17.0",
        },
      };
      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(packageJson, null, 2));

      // Create tsconfig.json
      fs.writeFileSync(path.join(tempDir, "tsconfig.json"), "{}");

      // Create entry point
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "export {}");

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const data = createMockData({
        framework: "express@4.17.0",
        strict_typing: true,
        context: {
          entry_points: ["src/index.ts"],
        },
      });

      const drifts = await detectDrift(data, guidePath);

      expect(drifts.length).toBe(0);
    });
  });

  describe("syncGuideFile", () => {
    it("should sync framework versions from package.json", async () => {
      // Create package.json with different framework version
      const packageJson = {
        name: "test-project",
        dependencies: {
          express: "^4.18.2",
        },
      };
      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(packageJson, null, 2));

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const data = createMockData({
        framework: "express@4.17.0",
      });

      const result = await syncGuideFile(data, guidePath);

      expect(result.synced).toBe(true);
      expect(result.drifts.length).toBeGreaterThan(0);

      const frameworkValue = Array.isArray(result.data.framework)
        ? result.data.framework[0]
        : result.data.framework;
      expect(frameworkValue).toContain("4.18.2");
    });

    it("should sync array of frameworks", async () => {
      const packageJson = {
        name: "test-project",
        dependencies: {
          express: "^4.18.2",
          lodash: "^4.17.21",
        },
      };
      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(packageJson, null, 2));

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const data = createMockData({
        framework: ["express@4.17.0", "lodash@4.17.20"],
      });

      const result = await syncGuideFile(data, guidePath);

      expect(result.synced).toBe(true);
      expect(Array.isArray(result.data.framework)).toBe(true);
    });

    it("should remove non-existent entry points", async () => {
      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      // Create one existing entry point
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "export {}");

      const data = createMockData({
        context: {
          entry_points: ["src/index.ts", "src/deleted.ts"],
        },
      });

      const result = await syncGuideFile(data, guidePath);

      expect(result.synced).toBe(true);
      expect(result.data.context?.entry_points).not.toContain("src/deleted.ts");
      expect(result.data.context?.entry_points).toContain("src/index.ts");
    });

    it("should add new directories to entry_points", async () => {
      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      // Create directories
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.mkdirSync(path.join(tempDir, "lib"), { recursive: true });

      const data = createMockData({
        context: {
          entry_points: ["src/index.ts"],
        },
      });

      const result = await syncGuideFile(data, guidePath);

      expect(result.synced).toBe(true);
      expect(result.data.context?.entry_points).toContain("lib");
    });

    it("should disable strict_typing when tsconfig.json is missing", async () => {
      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const data = createMockData({
        strict_typing: true,
      });

      const result = await syncGuideFile(data, guidePath);

      expect(result.synced).toBe(true);
      expect(result.data.strict_typing).toBe(false);
    });

    it("should update last_updated when changes are made", async () => {
      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      // Create a directory to trigger a drift
      fs.mkdirSync(path.join(tempDir, "new-dir"), { recursive: true });

      const oldDate = "2023-01-01";
      const data = createMockData({
        last_updated: oldDate,
        context: {
          entry_points: [],
        },
      });

      const result = await syncGuideFile(data, guidePath);

      expect(result.synced).toBe(true);
      expect(result.data.last_updated).not.toBe(oldDate);
      expect(result.data.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should not sync when there are no drifts", async () => {
      // Create matching structure
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "export {}");
      fs.writeFileSync(path.join(tempDir, "tsconfig.json"), "{}");

      const packageJson = {
        name: "test-project",
        dependencies: {
          express: "^4.17.0",
        },
      };
      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(packageJson, null, 2));

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const data = createMockData({
        framework: "express@4.17.0",
        context: {
          entry_points: ["src/index.ts"],
        },
      });

      const result = await syncGuideFile(data, guidePath);

      expect(result.synced).toBe(false);
      expect(result.drifts.length).toBe(0);
    });
  });
});
