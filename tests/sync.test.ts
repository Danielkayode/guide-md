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

  describe("Universal Ecosystem Detection", () => {
    it("should detect Python project with requirements.txt", async () => {
      // Create Python project structure
      const requirementsTxt = `fastapi==0.104.1
uvicorn>=0.24.0
pydantic~=2.5.0
`;
      fs.writeFileSync(path.join(tempDir, "requirements.txt"), requirementsTxt);
      fs.writeFileSync(path.join(tempDir, "main.py"), "from fastapi import FastAPI\n");

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      // Import and test ecosystem detection
      const { detectEcosystem } = await import("../src/doctor/ecosystem-signatures.js");
      const ecosystem = detectEcosystem(tempDir);

      expect(ecosystem.language).toBe("python");
      expect(ecosystem.framework).toBe("fastapi");
    });

    it("should detect Python project with pyproject.toml", async () => {
      const pyprojectToml = `[tool.poetry.dependencies]
python = "^3.11"
django = "^4.2"
djangorestframework = "^3.14"
`;
      fs.writeFileSync(path.join(tempDir, "pyproject.toml"), pyprojectToml);

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const { detectEcosystem } = await import("../src/doctor/ecosystem-signatures.js");
      const ecosystem = detectEcosystem(tempDir);

      expect(ecosystem.language).toBe("python");
      expect(ecosystem.framework).toBe("django");
    });

    it("should detect Go project with go.mod", async () => {
      const goMod = `module example.com/myapp

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/stretchr/testify v1.8.4
)
`;
      fs.writeFileSync(path.join(tempDir, "go.mod"), goMod);
      fs.writeFileSync(path.join(tempDir, "main.go"), "package main\n\nimport \"github.com/gin-gonic/gin\"\n");

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const { detectEcosystem } = await import("../src/doctor/ecosystem-signatures.js");
      const ecosystem = detectEcosystem(tempDir);

      expect(ecosystem.language).toBe("go");
      expect(ecosystem.framework).toBe("gin");
      expect(ecosystem.paradigm).toBe("procedural");
    });

    it("should detect Rust project with Cargo.toml", async () => {
      const cargoToml = `[package]
name = "myapp"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1.34", features = ["full"] }
axum = "0.7"
serde = { version = "1.0", features = ["derive"] }
`;
      fs.writeFileSync(path.join(tempDir, "Cargo.toml"), cargoToml);

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const { detectEcosystem } = await import("../src/doctor/ecosystem-signatures.js");
      const ecosystem = detectEcosystem(tempDir);

      expect(ecosystem.language).toBe("rust");
      expect(ecosystem.framework).toBe("axum");
      expect(ecosystem.runtime).toBe("async");
    });

    it("should detect PHP project with composer.json", async () => {
      const composerJson = {
        name: "myapp/myapp",
        require: {
          "laravel/framework": "^10.0",
          "php": "^8.2"
        }
      };
      fs.writeFileSync(path.join(tempDir, "composer.json"), JSON.stringify(composerJson, null, 2));

      const guidePath = path.join(tempDir, "GUIDE.md");
      fs.writeFileSync(guidePath, "---\n---\n");

      const { detectEcosystem } = await import("../src/doctor/ecosystem-signatures.js");
      const ecosystem = detectEcosystem(tempDir);

      expect(ecosystem.language).toBe("php");
      expect(ecosystem.framework).toBe("laravel");
    });
  });

  describe("Universal Dependency Reading", () => {
    it("should read Python dependencies from requirements.txt", async () => {
      const requirementsTxt = `fastapi==0.104.1
uvicorn>=0.24.0
pydantic~=2.5.0
requests
`;
      fs.writeFileSync(path.join(tempDir, "requirements.txt"), requirementsTxt);

      const { readDependencies } = await import("../src/linter/deps.js");
      const deps = readDependencies(tempDir);

      expect(deps.length).toBeGreaterThan(0);
      const fastapi = deps.find(d => d.name === "fastapi");
      expect(fastapi).toBeDefined();
      expect(fastapi?.version).toBe("0.104.1");
    });

    it("should read Go dependencies from go.mod", async () => {
      const goMod = `module example.com/myapp

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/stretchr/testify v1.8.4
)
`;
      fs.writeFileSync(path.join(tempDir, "go.mod"), goMod);

      const { readDependencies } = await import("../src/linter/deps.js");
      const deps = readDependencies(tempDir);

      expect(deps.length).toBeGreaterThan(0);
      const gin = deps.find(d => d.name.includes("gin"));
      expect(gin).toBeDefined();
    });
  });
});
