# Developer SDK Guide: Building @guidemd/linter Plugins

This guide walks you through building, testing, and publishing plugins for the GUIDE.md ecosystem.

> **⚠️ Implementation Status**: The plugin system described in this document is planned but **not yet fully implemented** in the current release. The `GuidemdPlugin` interface and plugin loading mechanism are defined in documentation but the plugin runtime is still under development. The examples and API signatures documented here represent the target design.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Plugin Structure](#plugin-structure)
3. [Building a Security Audit Plugin](#building-a-security-audit-plugin)
4. [Using Internal Modules](#using-internal-modules)
5. [Registering Your Plugin](#registering-your-plugin)
6. [Testing Your Plugin](#testing-your-plugin)
7. [Publishing](#publishing)
8. [API Reference](#api-reference)

---

## Getting Started

### Prerequisites

- Node.js 18+
- TypeScript knowledge
- Familiarity with GUIDE.md structure

### Installation

```bash
npm install @guidemd/linter
npm install -D @types/node typescript zod
```

### Project Structure

```
my-guidemd-plugin/
├── src/
│   └── index.ts          # Plugin entry point
├── examples/
│   └── test-guide.md     # Test GUIDE.md file
├── package.json
├── tsconfig.json
└── README.md
```

---

## Plugin Structure

A minimal plugin exports a single `GuidemdPlugin` object:

```typescript
import { GuidemdPlugin } from "@guidemd/linter";

const myPlugin: GuidemdPlugin = {
  name: "com.example.my-plugin",
  version: "1.0.0",
  hooks: {
    beforeLint: async (context) => {
      console.log(`Linting ${context.data.project}...`);
    }
  }
};

export default myPlugin;
```

### The GuidemdPlugin Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Unique identifier (reverse-domain notation) |
| `version` | `string` | Yes | Semantic version |
| `hooks` | `PluginHooks` | Yes | Lifecycle hooks |
| `schema` | `PluginSchemaExtension` | No | Custom YAML fields |
| `signatures` | `PluginSignature[]` | No | Doctor detection patterns |
| `exporters` | `PluginExporter[]` | No | Custom export adapters |

---

## Building a Security Audit Plugin

This example creates a "Security Audit" plugin that:
1. Adds custom `security` fields to the schema
2. Detects security-related dependencies
3. Adds a custom lint rule for security best practices
4. Generates a security section in README

### Step 1: Define the Schema Extension

```typescript
// src/index.ts
import { z } from "zod";
import { GuidemdPlugin, PluginSignature, PluginExporter } from "@guidemd/linter";

// Define security schema
const SecuritySchema = z.object({
  require_auth: z.boolean().default(true),
  allowed_origins: z.array(z.string()).optional(),
  secrets_vault: z.enum(["vault", "aws-sm", "azure-kv", "gcp-sm"]).optional(),
  owasp_level: z.enum(["L1", "L2", "L3"]).default("L1"),
  audit_endpoints: z.boolean().default(false),
  dependency_scan: z.enum(["off", "warn", "block"]).default("warn"),
});

type SecurityConfig = z.infer<typeof SecuritySchema>;
```

### Step 2: Define Doctor Signatures

```typescript
// Security-related package signatures
const securitySignatures: PluginSignature[] = [
  {
    name: "Helmet",
    field: "security.middleware",
    type: "dependency",
    check: {
      packageKey: "dependencies",
      packageName: "helmet",
    }
  },
  {
    name: "express-rate-limit",
    field: "security.middleware",
    type: "dependency",
    check: {
      packageKey: "dependencies",
      packageName: "express-rate-limit",
    }
  },
  {
    name: "cors",
    field: "security.middleware",
    type: "dependency",
    check: {
      packageKey: "dependencies",
      packageName: "cors",
    }
  },
  {
    name: "jsonwebtoken",
    field: "security.auth",
    type: "dependency",
    check: {
      packageKey: "dependencies",
      packageName: "jsonwebtoken",
    }
  },
  {
    name: "passport",
    field: "security.auth",
    type: "dependency",
    check: {
      packageKey: "dependencies",
      packageName: "passport",
    }
  },
  {
    name: "bcrypt",
    field: "security.crypto",
    type: "dependency",
    check: {
      packageKey: "dependencies",
      packageName: "bcrypt",
    }
  },
  {
    name: "dotenv",
    field: "security.env",
    type: "dependency",
    check: {
      packageKey: "dependencies",
      packageName: "dotenv",
    }
  }
];
```

### Step 3: Implement the Plugin

```typescript
import { detectDrift } from "@guidemd/linter/linter/sync";
import { fetchModule } from "@guidemd/linter/registry/sources";
import fs from "node:fs";
import path from "node:path";

// Known vulnerable packages (example list)
const VULNERABLE_PACKAGES = [
  "lodash",  // Old versions have prototype pollution
  "minimist", // Old versions have prototype pollution
  "debug",   // Old versions have ReDoS
];

const securityPlugin: GuidemdPlugin = {
  name: "com.example.security-audit",
  version: "1.0.0",
  
  // Schema extension
  schema: {
    fields: {
      security: SecuritySchema
    },
    descriptions: {
      "security.require_auth": "All endpoints require authentication",
      "security.owasp_level": "Target OWASP ASVS compliance level (L1-L3)",
      "security.secrets_vault": "External secrets management service",
      "security.dependency_scan": "Scan for known vulnerable dependencies",
      "security.audit_endpoints": "Include endpoint audit in README"
    }
  },
  
  // Doctor signatures for detection
  signatures: securitySignatures,
  
  // Lifecycle hooks
  hooks: {
    beforeLint: async (context) => {
      const security = context.data.security as SecurityConfig | undefined;
      
      // Skip if no security config
      if (!security) {
        return;
      }
      
      // Check for .env file in off_limits
      const offLimits = context.data.context?.off_limits || [];
      const hasEnvProtected = offLimits.some(p => 
        p.includes(".env") || p.includes("secrets")
      );
      
      if (!hasEnvProtected && security.require_auth) {
        console.warn("[Security Plugin] Warning: .env files not in off_limits");
      }
      
      // Dependency scan if enabled
      if (security.dependency_scan !== "off") {
        const pkgPath = path.join(context.projectRoot, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          
          for (const vulnPkg of VULNERABLE_PACKAGES) {
            if (allDeps[vulnPkg]) {
              const level = security.dependency_scan;
              const msg = `[Security Plugin] ${level.toUpperCase()}: Found potentially vulnerable package: ${vulnPkg}`;
              if (level === "block") {
                throw new Error(msg);
              } else {
                console.warn(msg);
              }
            }
          }
        }
      }
    },
    
    afterSync: async (context, result) => {
      const security = context.data.security as SecurityConfig | undefined;
      
      // Check if security-related drift detected
      const securityDrifts = result.drifts.filter(d => 
        securitySignatures.some(sig => 
          d.field.includes(sig.field.split(".")[0]!)
        )
      );
      
      if (securityDrifts.length > 0) {
        console.log("[Security Plugin] Security-related drift detected:");
        for (const drift of securityDrifts) {
          console.log(`  - ${drift.message}`);
        }
      }
    },
    
    onGenerateReadme: async (context) => {
      const security = context.data.security as SecurityConfig | undefined;
      
      if (!security) {
        return null;
      }
      
      // Generate security section
      let section = `## Security\n\n`;
      section += `This project targets **OWASP ASVS Level ${security.owasp_level}** compliance.\n\n`;
      
      if (security.require_auth) {
        section += `- Authentication is required for all endpoints\n`;
      }
      
      if (security.secrets_vault) {
        section += `- Secrets are managed via ${security.secrets_vault}\n`;
      }
      
      if (security.allowed_origins) {
        section += `- CORS restricted to: ${security.allowed_origins.join(", ")}\n`;
      }
      
      if (security.dependency_scan !== "off") {
        section += `- Dependencies scanned for known vulnerabilities\n`;
      }
      
      section += `\n### Security Headers\n\n`;
      section += `The following security headers should be configured:\n`;
      section += `- Content-Security-Policy\n`;
      section += `- X-Content-Type-Options: nosniff\n`;
      section += `- X-Frame-Options: DENY\n`;
      section += `- Strict-Transport-Security\n`;
      
      return section;
    }
  }
};

export default securityPlugin;
```

### Step 4: Create Test GUIDE.md

```yaml
# examples/test-guide.md
---
guide_version: "1.0.0"
project: "secure-api"
description: "A secure REST API with authentication"
language: typescript
runtime: "node@20"
framework: "express"
strict_typing: true
error_protocol: verbose
security:
  require_auth: true
  owasp_level: "L2"
  secrets_vault: "vault"
  allowed_origins:
    - "https://app.example.com"
  dependency_scan: warn
  audit_endpoints: true
context:
  entry_points:
    - "src/index.ts"
  off_limits:
    - ".env"
    - ".env.*"
    - "secrets/"
    - "migrations/"
---

# AI Instructions

## Project Overview

This is a secure REST API implementing OWASP ASVS Level 2 requirements.

## Domain Vocabulary

- **JWT**: JSON Web Token for stateless authentication
- **RBAC**: Role-Based Access Control
- **MFA**: Multi-Factor Authentication

## What NOT to do

- Never commit .env files
- Never log sensitive data
- Never trust client input
```

---

## Using Internal Modules

### Parser (`@guidemd/linter/parser`)

Parse GUIDE.md files:

```typescript
import { parseGuideFile } from "@guidemd/linter/parser";

const result = parseGuideFile("path/to/GUIDE.md");
if (result.success) {
  console.log(result.data);    // Frontmatter
  console.log(result.content); // Markdown body
}
```

### Resolver (`@guidemd/linter/parser/resolver`)

Resolve inheritance chains:

```typescript
import { resolveInheritance } from "@guidemd/linter/parser/resolver";

const fullData = await resolveInheritance(localData);
```

### Linter (`@guidemd/linter/linter`)

Validate against schema:

```typescript
import { lintGuideFile, fixGuideFile } from "@guidemd/linter/linter";
import { GuideMdSchema } from "@guidemd/linter/schema";

const result = await lintGuideFile("path/to/GUIDE.md");
// or
const fixed = await fixGuideFile("path/to/GUIDE.md");
```

### Sync Engine (`@guidemd/linter/linter/sync`)

Detect and sync drift:

```typescript
import { detectDrift, syncGuideFile, detectParadigm } from "@guidemd/linter/linter/sync";

const drifts = await detectDrift(data, "GUIDE.md");
const syncResult = await syncGuideFile(data, "GUIDE.md");
const paradigm = await detectParadigm("./project-root");
```

### Registry (`@guidemd/linter/registry`)

Module operations:

```typescript
import { 
  listModules, 
  searchModules, 
  getModuleInfo, 
  addModule 
} from "@guidemd/linter/registry";

import { fetchModule, localSource, githubSource } from "@guidemd/linter/registry/sources";

import { mergeModule } from "@guidemd/linter/registry/merge";
```

### Doctor (`@guidemd/linter/doctor`)

Static analysis:

```typescript
import { runDoctor, detectFramework } from "@guidemd/linter/doctor";

const report = await runDoctor(data, content, projectRoot);
const framework = detectFramework(projectRoot);
```

### Exporter (`@guidemd/linter/exporter`)

Export to other formats:

```typescript
import { exportGuide, generateMcpManifest, generateBadge } from "@guidemd/linter/exporter";
```

### Profiler (`@guidemd/linter/profiler`)

Observability metrics:

```typescript
import { runProfile, generateJsonSchema } from "@guidemd/linter/profiler";
```

### Stats (`@guidemd/linter/stats`)

Context density:

```typescript
import { calculateContextDensity, formatDensityReport } from "@guidemd/linter/stats";
```

### Verify (`@guidemd/linter/verify`)

Cold start verification:

```typescript
import { runColdStartVerification } from "@guidemd/linter/verify";
```

### Generator (`@guidemd/linter/generator`)

README generation:

```typescript
import { generateReadme, backSyncFromReadme, generateSmartTemplate } from "@guidemd/linter/generator";
```

### Schema (`@guidemd/linter/schema`)

Zod schema definitions:

```typescript
import { GuideMdSchema, GuideMdFrontmatter } from "@guidemd/linter/schema";
```

---

## Registering Your Plugin

### Local Development

Create a `.guidemd/plugins/` directory in your project:

```bash
mkdir -p .guidemd/plugins
ln -s /path/to/my-plugin .guidemd/plugins/my-plugin
```

Register in GUIDE.md:

```yaml
---
plugins:
  - name: "com.example.my-plugin"
    path: ".guidemd/plugins/my-plugin"
---
```

### Via npm

Publish to npm and install:

```bash
npm install guidemd-plugin-security-audit
```

GUIDE.md:

```yaml
---
plugins:
  - name: "guidemd-plugin-security-audit"
    version: "^1.0.0"
---
```

### Via Registry

Add to the GUIDE.md registry:

```bash
guidemd add security-audit-plugin
```

---

## Testing Your Plugin

### Unit Tests

```typescript
// test/plugin.test.ts
import { describe, it, expect } from "vitest";
import securityPlugin from "../src/index";

describe("Security Plugin", () => {
  it("should have required properties", () => {
    expect(securityPlugin.name).toBe("com.example.security-audit");
    expect(securityPlugin.version).toBe("1.0.0");
    expect(securityPlugin.hooks).toBeDefined();
  });
  
  it("should define security schema", () => {
    expect(securityPlugin.schema).toBeDefined();
    expect(securityPlugin.schema!.fields.security).toBeDefined();
  });
  
  it("should have doctor signatures", () => {
    expect(securityPlugin.signatures).toBeDefined();
    expect(securityPlugin.signatures!.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
// test/integration.test.ts
import { describe, it, expect } from "vitest";
import { parseGuideFile } from "@guidemd/linter/parser";
import securityPlugin from "../src/index";

describe("Security Plugin Integration", () => {
  it("should detect missing .env protection", async () => {
    const mockContext = {
      data: {
        project: "test",
        security: { require_auth: true },
        context: { off_limits: [] }  // Missing .env
      },
      content: "",
      projectRoot: "/tmp/test",
      filePath: "/tmp/test/GUIDE.md"
    };
    
    // Capture console.warn
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    
    await securityPlugin.hooks.beforeLint!(mockContext as any);
    
    console.warn = originalWarn;
    
    expect(warnings.some(w => w.includes(".env files not in off_limits"))).toBe(true);
  });
});
```

### E2E Test Script

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest",
    "test:e2e": "tsx test/e2e.ts"
  }
}
```

```typescript
// test/e2e.ts
import { execSync } from "child_process";
import fs from "node:fs";

// Setup test project
const testDir = "/tmp/guidemd-plugin-test";
fs.mkdirSync(testDir, { recursive: true });
fs.writeFileSync(`${testDir}/GUIDE.md`, `
---
guide_version: "1.0.0"
project: "e2e-test"
language: typescript
strict_typing: true
error_protocol: verbose
plugins:
  - name: "com.example.security-audit"
    path: "../src/index.ts"
security:
  require_auth: true
  owasp_level: "L2"
---
`);

// Run lint
const output = execSync("npx guidemd lint", { cwd: testDir, encoding: "utf-8" });
console.log(output);

// Verify security warnings present
if (output.includes(".env files not in off_limits")) {
  console.log("✓ E2E test passed: Security warning detected");
} else {
  console.error("✗ E2E test failed: Security warning not found");
  process.exit(1);
}
```

---

## Publishing

### npm Registry

1. Build your plugin:

```bash
tsc
```

2. Create package.json:

```json
{
  "name": "guidemd-plugin-security-audit",
  "version": "1.0.0",
  "description": "Security audit plugin for @guidemd/linter",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "keywords": ["guidemd", "plugin", "security", "audit"],
  "peerDependencies": {
    "@guidemd/linter": ">=0.1.0",
    "zod": "^3.0.0"
  },
  "files": ["dist/", "README.md"],
  "license": "MIT"
}
```

3. Publish:

```bash
npm publish
```

### GUIDE.md Registry

Submit a PR to `guidemd/registry` with your plugin module:

```yaml
# modules/security-audit-plugin.guide
---
name: security-audit-plugin
description: OWASP ASVS compliance and security best practices
version: "1.0.0"
tags: ["security", "owasp", "audit", "compliance"]
dependencies: []
---

plugin:
  npm_package: "guidemd-plugin-security-audit"
  min_linter_version: "0.1.0"
  config_schema:
    security:
      type: object
      properties:
        owasp_level:
          type: string
          enum: ["L1", "L2", "L3"]
        require_auth:
          type: boolean
```

---

## API Reference

### Types

```typescript
// Core plugin interface
interface GuidemdPlugin {
  name: string;
  version: string;
  hooks: PluginHooks;
  schema?: PluginSchemaExtension;
  signatures?: PluginSignature[];
  exporters?: PluginExporter[];
}

// Hook context
interface HookContext {
  data: GuideMdFrontmatter;
  content: string;
  projectRoot: string;
  filePath: string;
}

// Lifecycle hooks
interface PluginHooks {
  beforeLint?: (context: HookContext) => Promise<void> | void;
  afterSync?: (context: HookContext, result: SyncResult) => Promise<void> | void;
  onGenerateReadme?: (context: HookContext) => Promise<string | null> | string | null;
}

// Schema extension
interface PluginSchemaExtension {
  fields: Record<string, z.ZodTypeAny>;
  descriptions?: Record<string, string>;
}

// Doctor signature
interface PluginSignature {
  name: string;
  field: string;
  type: "file" | "dependency" | "custom";
  check: SignatureCheck;
  detector?: (projectRoot: string, pkg: PackageJson | null) => Promise<boolean>;
}

// Custom exporter
interface PluginExporter {
  target: string;
  fileName: string;
  transform: (data: GuideMdFrontmatter, content: string) => string;
}
```

### Utility Functions

```typescript
// Parse GUIDE.md
function parseGuideFile(filePath: string): ParseResult;

// Resolve inheritance
function resolveInheritance(
  localData: Record<string, unknown>,
  visited?: Set<string>
): Promise<Record<string, unknown>>;

// Lint
function lintGuideFile(filePath: string): Promise<LintResult>;
function fixGuideFile(filePath: string): Promise<FixResult>;

// Sync
function detectDrift(data: GuideMdFrontmatter, filePath: string): Promise<Drift[]>;
function syncGuideFile(data: GuideMdFrontmatter, filePath: string): Promise<SyncResult>;
function detectParadigm(projectRoot: string): Promise<"oop" | "functional" | null>;

// Registry
function listModules(): Promise<RegistryListResult>;
function searchModules(query: string): Promise<RegistryListResult>;
function getModuleInfo(name: string): Promise<RegistryInfoResult>;
function addModule(
  existing: Record<string, unknown>,
  moduleName: string,
  force?: boolean
): Promise<AddModuleResult>;

// Doctor
function runDoctor(
  data: GuideMdFrontmatter,
  content: string,
  projectRoot?: string
): Promise<DoctorReport>;
function detectFramework(projectRoot?: string): string | null;

// Export
function exportGuide(
  data: GuideMdFrontmatter,
  instructions: string,
  targetDir: string,
  target: ExportTarget
): ExportResult[];

// Profile
function runProfile(
  data: GuideMdFrontmatter,
  content: string,
  projectRoot?: string
): ProfileReport;

// Verify
function runColdStartVerification(
  data: GuideMdFrontmatter,
  content: string,
  projectRoot?: string
): Promise<VerificationResult>;

// Generator
function generateReadme(
  data: GuideMdFrontmatter,
  content: string,
  customTemplatePath?: string,
  badgeGrade?: string
): GenerateResult;
```

---

## Example: Hello World Plugin

See [`../examples/security-plugin/`](../examples/security-plugin/) for a complete, working example that adds a "Security Audit" rule to the lint command.

---

## Best Practices

1. **Use reverse-domain naming**: `com.company.plugin-name`
2. **Version carefully**: Follow semver
3. **Handle errors gracefully**: Don't crash the linter
4. **Log clearly**: Prefix messages with `[Plugin Name]`
5. **Respect config**: Check for `config` field in plugin registration
6. **Test thoroughly**: Unit, integration, and E2E tests
7. **Document well**: Include examples in README
8. **Keep dependencies minimal**: Avoid bloat

---

## Troubleshooting

### Plugin not loading

- Check `name` matches registration in GUIDE.md
- Verify file path is correct (absolute or relative to GUIDE.md)
- Ensure TypeScript is compiled if using `.ts`

### Schema not applied

- Verify Zod schema is valid
- Check field names don't conflict with core schema
- Ensure `fields` object structure is correct

### Hook not firing

- Verify hook name is correct (`beforeLint`, `afterSync`, `onGenerateReadme`)
- Check plugin is registered in GUIDE.md frontmatter
- Add logging to confirm hook execution

### Type errors

- Ensure `@guidemd/linter` is installed as peer dependency
- Check TypeScript version compatibility (5.0+)
- Verify `zod` is installed

---

## Resources

- [GUIDE.md Specification](./SPECIFICATION.md)
- [Core Architecture](./FEATURES.md)
- [Registry Modules](../fixtures/registry/)
- [Plugin Examples](../examples/)

---

**Happy plugin building!**
