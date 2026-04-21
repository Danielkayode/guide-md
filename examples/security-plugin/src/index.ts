/**
 * Security Audit Plugin for @guidemd/linter
 * 
 * A "Hello World" example plugin that demonstrates:
 * - Schema extension (custom YAML fields)
 * - Doctor signatures (framework detection)
 * - Lifecycle hooks (beforeLint, afterSync, onGenerateReadme)
 * - Custom lint rules
 * 
 * This plugin adds security audit capabilities to GUIDE.md files,
 * detecting security-related dependencies and enforcing best practices.
 */

import { z } from "zod";
import type { 
  GuidemdPlugin, 
  PluginSignature, 
  HookContext,
  SyncResult 
} from "@guidemd/linter";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
// 1. SCHEMA EXTENSION
// ============================================================================

const SecuritySchema = z.object({
  require_auth: z.boolean().default(true),
  allowed_origins: z.array(z.string().url()).optional(),
  secrets_vault: z.enum(["hashicorp-vault", "aws-sm", "azure-kv", "gcp-sm"]).optional(),
  owasp_level: z.enum(["L1", "L2", "L3"]).default("L1"),
  audit_endpoints: z.boolean().default(false),
  dependency_scan: z.enum(["off", "warn", "block"]).default("warn"),
});

type SecurityConfig = z.infer<typeof SecuritySchema>;

// ============================================================================
// 2. DOCTOR SIGNATURES
// ============================================================================

const securitySignatures: PluginSignature[] = [
  { name: "Helmet", field: "security.middleware", type: "dependency", check: { packageKey: "dependencies", packageName: "helmet" } },
  { name: "express-rate-limit", field: "security.middleware", type: "dependency", check: { packageKey: "dependencies", packageName: "express-rate-limit" } },
  { name: "cors", field: "security.middleware", type: "dependency", check: { packageKey: "dependencies", packageName: "cors" } },
  { name: "jsonwebtoken", field: "security.auth", type: "dependency", check: { packageKey: "dependencies", packageName: "jsonwebtoken" } },
  { name: "passport", field: "security.auth", type: "dependency", check: { packageKey: "dependencies", packageName: "passport" } },
  { name: "bcrypt", field: "security.crypto", type: "dependency", check: { packageKey: "dependencies", packageName: "bcrypt" } },
  { name: "dotenv", field: "security.env", type: "dependency", check: { packageKey: "dependencies", packageName: "dotenv" } },
];

// ============================================================================
// 3. VULNERABILITY DATABASE
// ============================================================================

const VULNERABLE_PACKAGES = ["lodash", "minimist", "debug", "semver", "jsonwebtoken"];

// ============================================================================
// 4. PLUGIN IMPLEMENTATION
// ============================================================================

const securityAuditPlugin: GuidemdPlugin = {
  name: "com.example.security-audit",
  version: "1.0.0",
  
  schema: {
    fields: { security: SecuritySchema },
    descriptions: {
      "security.require_auth": "All endpoints require authentication",
      "security.owasp_level": "Target OWASP ASVS compliance level",
      "security.secrets_vault": "External secrets management service",
      "security.dependency_scan": "Scan dependencies for known vulnerabilities",
    }
  },
  
  signatures: securitySignatures,
  
  hooks: {
    beforeLint: async (context: HookContext) => {
      const security = context.data.security as SecurityConfig | undefined;
      if (!security) return;
      
      console.log(`[Security Plugin] Auditing ${context.data.project}...`);
      
      // Check .env protection
      const offLimits = context.data.context?.off_limits || [];
      const hasEnvProtected = offLimits.some(p => p.includes(".env") || p.includes("secrets"));
      
      if (!hasEnvProtected && security.require_auth) {
        console.warn("[Security Plugin] WARNING: .env files not in off_limits");
      }
      
      // Dependency vulnerability scan
      if (security.dependency_scan !== "off") {
        const pkgPath = path.join(context.projectRoot, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          
          for (const vulnPkg of VULNERABLE_PACKAGES) {
            if (allDeps[vulnPkg]) {
              const msg = `Found potentially vulnerable package: ${vulnPkg}`;
              if (security.dependency_scan === "block") {
                throw new Error(`[Security Plugin] BLOCKED: ${msg}`);
              } else {
                console.warn(`[Security Plugin] WARNING: ${msg}`);
              }
            }
          }
        }
      }
    },
    
    afterSync: async (context: HookContext, result: SyncResult) => {
      const security = context.data.security as SecurityConfig | undefined;
      if (!security) return;
      
      const securityDrifts = result.drifts.filter(d => 
        securitySignatures.some(sig => d.field.includes(sig.field.split(".")[0]!))
      );
      
      if (securityDrifts.length > 0) {
        console.log("[Security Plugin] Security drift detected:");
        securityDrifts.forEach(d => console.log(`  - ${d.message}`));
      }
    },
    
    onGenerateReadme: async (context: HookContext) => {
      const security = context.data.security as SecurityConfig | undefined;
      if (!security) return null;
      
      let section = `## Security\n\n`;
      section += `This project targets **OWASP ASVS Level ${security.owasp_level}** compliance.\n\n`;
      
      if (security.require_auth) {
        section += `- Authentication required for all endpoints\n`;
      }
      if (security.secrets_vault) {
        section += `- Secrets managed via ${security.secrets_vault}\n`;
      }
      if (security.allowed_origins) {
        section += `- CORS restricted to: ${security.allowed_origins.join(", ")}\n`;
      }
      
      section += `\n### Security Headers\n`;
      section += `- Content-Security-Policy\n`;
      section += `- X-Content-Type-Options: nosniff\n`;
      section += `- X-Frame-Options: DENY\n`;
      
      return section;
    }
  }
};

export default securityAuditPlugin;
