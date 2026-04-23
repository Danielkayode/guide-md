# Registry Guide

**Reusable Modules for GUIDE.md**

The Registry provides pre-built, battle-tested configurations for common technology stacks. Instead of writing GUIDE.md from scratch, compose your configuration from reusable modules.

---

## Table of Contents

1. [What is the Registry?](#what-is-the-registry)
2. [Quick Start](#quick-start)
3. [Available Modules](#available-modules)
4. [Using Modules](#using-modules)
5. [Creating Custom Modules](#creating-custom-modules)
6. [Module Resolution](#module-resolution)
7. [Inheritance & Merging](#inheritance--merging)
8. [Registry Sources](#registry-sources)
9. [Best Practices](#best-practices)

---

## What is the Registry?

The Registry is a repository of reusable GUIDE.md configurations (called "modules") that can be mixed and matched to build your project's AI context.

### Key Concepts

| Term | Description |
|------|-------------|
| **Module** | A `.guide` file containing frontmatter that can be inherited |
| **Inheritance** | Using `extends` to import module configurations |
| **Deep Merge** | Combining multiple modules with conflict resolution |
| **Source** | Where modules are fetched from (local cache or GitHub) |

### Why Use Modules?

1. **DRY** — Don't repeat common configurations
2. **Community** — Benefit from battle-tested setups
3. **Versioning** — Pin to specific module versions
4. **Discovery** — Find configurations for new technologies

---

## Quick Start

### 1. List Available Modules

```bash
guidemd registry list
```

Output:
```
📦 Available Registry Modules
═══════════════════════════════════════

 typescript-strict      Strict TypeScript configuration
 nextjs-security        Next.js security best practices
 react-testing          React component testing setup
 node-api               Express/Fastify API patterns
 python-data-science    Data science Python stack
 rust-cli               Rust CLI application setup
```

### 2. Add a Module

```bash
guidemd add typescript-strict
```

This modifies your `GUIDE.md`:

```yaml
---
guide_version: "1.0.0"
project: my-app
language: typescript
# ... your config ...
extends: typescript-strict  # Added automatically
---
```

### 3. Search for Modules

```bash
# Search by keyword
guidemd registry search security

# Get detailed info
guidemd registry info nextjs-security
```

---

## Available Modules

### Core Modules

| Module | Description | Key Features |
|--------|-------------|--------------|
| `typescript-strict` | Strict TypeScript rules | `strict_typing: true`, `noImplicitAny` patterns |
| `javascript-modern` | Modern JavaScript (ES2022+) | `prefer_const`, arrow functions, async/await |
| `python-typed` | Type-hinted Python | `strict_typing: true`, mypy-compatible |

### Framework Modules

| Module | Description | Key Features |
|--------|-------------|--------------|
| `nextjs-security` | Next.js security best practices | CSP headers, middleware patterns, env protection |
| `react-testing` | React component testing | Testing Library, Jest/Vitest setup, mock patterns |
| `vue-composition` | Vue 3 Composition API | `setup()` patterns, composables structure |
| `sveltekit-full` | SvelteKit application | Routing, server handlers, form actions |
| `node-api` | Node.js API server | Express/Fastify patterns, middleware, error handling |
| `fastapi-async` | FastAPI async patterns | Dependency injection, background tasks |

### Stack Modules

| Module | Description | Key Features |
|--------|-------------|--------------|
| `react-testing` | React + Testing setup | Vitest + Testing Library + MSW |
| `fullstack-next` | Next.js full stack | App Router, API routes, Prisma |
| `python-data-science` | Data science stack | NumPy, Pandas, Jupyter patterns |
| `rust-cli` | Rust CLI tool | Clap, error handling, config files |
| `go-microservices` | Go microservices | gRPC, protobuf, service discovery |

### Guardrail Modules

| Module | Description | Key Features |
|--------|-------------|--------------|
| `security-baseline` | Basic security rules | No secrets, input validation, XSS prevention |
| `performance-conscious` | Performance guardrails | Lazy loading, bundle size awareness |
| `accessibility-required` | A11y requirements | WCAG 2.1 AA, semantic HTML, ARIA patterns |

### Organization Modules

| Module | Description | Use Case |
|--------|-------------|----------|
| `monorepo-turborepo` | Turborepo monorepo | Workspace configuration, task pipelines |
| `monorepo-nx` | Nx monorepo | Project graph, affected commands |
| `open-source-lib` | Open source library | Contributing guide, semantic versioning |

---

## Using Modules

### Basic Usage

Add a single module:

```bash
guidemd add typescript-strict
```

Your `GUIDE.md` becomes:

```yaml
---
guide_version: "1.0.0"
project: my-app
language: typescript
extends: typescript-strict
---
```

### Multiple Modules

Add multiple modules (order matters for precedence):

```bash
guidemd add typescript-strict
guidemd add nextjs-security
guidemd add react-testing
```

Your `GUIDE.md`:

```yaml
---
extends:
  - typescript-strict
  - nextjs-security
  - react-testing
---
```

### Array Syntax

Both formats are valid:

```yaml
# Single module (string)
extends: typescript-strict

# Multiple modules (array)
extends:
  - typescript-strict
  - nextjs-security

# Mixed with version constraints (planned)
extends:
  - name: typescript-strict
    version: "^1.0.0"
  - name: nextjs-security
    version: "~2.1.0"
```

### Force Overwrite

If a module conflicts with your existing configuration:

```bash
guidemd add typescript-strict --force
```

This overwrites conflicting fields with the module's values.

### Manual Editing

You can also edit `GUIDE.md` directly:

```yaml
---
guide_version: "1.0.0"
project: my-app
language: typescript  # Your local value
code_style:
  max_line_length: 120  # Overrides module default
  
extends:
  - typescript-strict
  - react-testing
---
```

---

## Creating Custom Modules

### Module File Format

Create a `.guide` file:

```yaml
---
name: mycompany-standards
description: Internal standards for ACME Corp projects
version: "1.0.0"
tags: ["internal", "acme", "standards"]
dependencies: []  # Other modules this depends on
---

# Module content (inherited as-is)
guide_version: "1.0.0"
language: typescript
strict_typing: true
error_protocol: verbose

code_style:
  max_line_length: 100
  indentation: "2 spaces"
  naming_convention: camelCase
  
guardrails:
  no_hallucination: true
  scope_creep_prevention: true
  
testing:
  required: true
  framework: vitest
  coverage_threshold: 80
```

### Module Schema

Required module metadata:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier (kebab-case) |
| `description` | string | Yes | Human-readable description |
| `version` | string | Yes | Semver version |
| `tags` | string[] | No | Searchable keywords |
| `dependencies` | string[] | No | Other modules to inherit first |

### Module Location

#### Local Modules

Store in your project:

```
my-project/
├── .guidemd/
│   └── modules/
│       └── mycompany-standards.guide
├── GUIDE.md
└── ...
```

Reference in `GUIDE.md`:

```yaml
---
extends: "./.guidemd/modules/mycompany-standards"
---
```

#### User Modules

Store in home directory (available to all projects):

```
~/.guidemd/modules/
├── mycompany-standards.guide
└── ...
```

#### Publishing to Registry

To share with the community:

1. Fork the `guidemd/registry` repository
2. Add your `.guide` file to the `modules/` directory
3. Submit a PR with description and use cases

---

## Inheritance & Merging

### Merge Behavior

When using `extends`, modules are merged with your local config:

```yaml
---
# Module: typescript-strict
language: typescript
strict_typing: true
code_style:
  max_line_length: 100
---

# Your GUIDE.md
---
extends: typescript-strict
project: my-app
language: typescript  # Same value, no conflict
code_style:
  max_line_length: 120  # Override: local wins
---

# Resolved result:
# - language: typescript (from both, same value)
# - strict_typing: true (from module)
# - code_style.max_line_length: 120 (local override)
```

### Precedence Rules

1. **Local values** always win over inherited values
2. **Later modules** win over earlier modules in `extends` array
3. **Deep merge** for nested objects (not shallow replacement)
4. **Array concatenation** with deduplication

### Conflict Detection

```bash
guidemd lint
```

Will report:
```
⚠ Conflict detected: code_style.max_line_length
  Module typescript-strict: 100
  Local value: 120
  → Using local value (120)
```

### Circular Dependencies

The resolver detects and prevents circular inheritance:

```yaml
# Module A
dependencies: ["module-b"]

# Module B  
dependencies: ["module-a"]  # Error: Circular dependency
```

Error:
```
✖ Circular dependency detected
  A → B → A
```

---

## Module Resolution

### Resolution Order

When resolving `extends: "module-name"`:

1. **Local path** — Check if it's a relative file path
2. **User cache** — `~/.guidemd/modules/module-name.guide`
3. **Built-in** — Check bundled modules
4. **GitHub registry** — Fetch from `guidemd/registry`

### Resolution Examples

```yaml
---
# Local file (relative to GUIDE.md)
extends: "./config/base.guide"

# User cache or registry
extends: "typescript-strict"

# Multiple with mixed sources
extends:
  - "./internal/standards"    # Local
  - "typescript-strict"         # Cache/Registry
  - "mycompany/security"        # Registry
---
```

### Caching

Downloaded modules are cached in:

```
~/.guidemd/cache/
├── typescript-strict@1.0.0.guide
├── nextjs-security@2.1.0.guide
└── ...
```

Cache invalidation:
- Manual: Delete `~/.guidemd/cache/`
- Automatic: Modules refresh after 7 days
- Force: `guidemd add <module> --refresh`

---

## Registry Sources

### Built-in Modules

Shipped with the linter package:

- `typescript-strict`
- `javascript-modern`
- `security-baseline`

### GitHub Registry

Default remote source:

```
https://github.com/guidemd/registry/tree/main/modules/
```

### Custom Registry (Planned)

Configure alternate registry in `~/.guidemd/config.json`:

```json
{
  "registry": {
    "url": "https://github.com/mycompany/guidemd-registry",
    "branch": "main",
    "path": "modules"
  }
}
```

### Private Registry

For internal modules:

1. Host on internal Git repository
2. Configure `~/.guidemd/config.json`
3. Use with `guidemd add internal-module`

---

## Best Practices

### 1. Start with a Base Module

```bash
guidemd add typescript-strict  # or language-appropriate base
guidemd add <framework>-<feature>
```

### 2. Layer Specificity

Order modules from general to specific:

```yaml
---
extends:
  - typescript-strict       # Language fundamentals
  - nextjs-security         # Framework patterns
  - react-testing           # Testing setup
  - mycompany-standards     # Org-specific rules
---
```

### 3. Local Overrides

Use local config for project-specific values:

```yaml
---
extends: typescript-strict

# Override for this project only
code_style:
  max_line_length: 120  # Wider than standard
  
guardrails:
  dry_run_on_destructive: false  # Team preference
---
```

### 4. Version Pinning (Planned)

Future versions will support semver constraints:

```yaml
---
extends:
  - name: typescript-strict
    version: "^1.0.0"      # Compatible with 1.x
  - name: nextjs-security
    version: "~2.1.0"      # Patch updates only
---
```

### 5. Module Organization

Keep custom modules in version control:

```bash
# Store in project
mkdir -p .guidemd/modules/
cp my-module.guide .guidemd/modules/

# Reference locally
echo 'extends: "./.guidemd/modules/my-module"' >> GUIDE.md
```

### 6. Review Inherited Config

See the resolved configuration:

```bash
# View merged result
guidemd lint --json | jq '.data'

# Check specific field
guidemd lint --json | jq '.data.guardrails'
```

### 7. Don't Over-Inherit

Avoid excessive module stacking:

```yaml
# Too many modules - hard to trace behavior
extends:
  - typescript-strict
  - javascript-modern      # Redundant with above
  - node-api
  - express-patterns         # Overlaps with node-api
  - security-baseline
  - owasp-top-10             # Overlaps with security-baseline
  - performance-conscious
  - accessibility-required
```

Prefer 2-4 focused modules over 10 overlapping ones.

---

## CLI Commands Reference

### `guidemd add <module>`

Add a module to your GUIDE.md.

```bash
guidemd add typescript-strict
guidemd add nextjs-security --force
guidemd add mycompany/standards
```

**Options:**
- `--force` — Overwrite conflicting fields
- `--refresh` — Bypass cache and fetch fresh
- `--dry-run` — Preview changes without writing

### `guidemd registry list`

List all available modules.

```bash
guidemd registry list
guidemd registry list --json
```

### `guidemd registry search <query>`

Search modules by keyword.

```bash
guidemd registry search security
guidemd registry search react
```

### `guidemd registry info <module>`

Get detailed information about a module.

```bash
guidemd registry info typescript-strict
```

Output:
```
📦 typescript-strict
═══════════════════════════════════════
Version:     1.0.0
Tags:        typescript, strict, types
Description: Strict TypeScript configuration

Content:
  strict_typing: true
  code_style:
    prefer_immutability: true
  guardrails:
    no_hallucination: true
```

---

## Programmatic API

### List Modules

```typescript
import { listModules } from "@guidemd/linter/registry";

const result = await listModules();
for (const module of result.modules) {
  console.log(`${module.name}: ${module.description}`);
}
```

### Search Modules

```typescript
import { searchModules } from "@guidemd/linter/registry";

const result = await searchModules("security");
```

### Get Module Info

```typescript
import { getModuleInfo } from "@guidemd/linter/registry";

const info = await getModuleInfo("typescript-strict");
console.log(info.content);  // Full module YAML
```

### Add Module

```typescript
import { addModule } from "@guidemd/linter/registry";

const result = await addModule(
  currentData,      // Your current frontmatter
  "typescript-strict",
  false             // Don't force overwrite
);

if (result.success) {
  console.log("Added:", result.addedFields);
  console.log("Conflicts:", result.conflicts);
}
```

### Fetch Module

```typescript
import { fetchModule } from "@guidemd/linter/registry/sources";

// From local cache
const local = await fetchModule("typescript-strict", "local");

// From GitHub
const remote = await fetchModule("typescript-strict", "github");
```

### Merge Manually

```typescript
import { mergeModule } from "@guidemd/linter/registry/merge";

const result = mergeModule(
  existingData,
  moduleData,
  true  // Force overwrite
);

console.log(result.data);       // Merged result
console.log(result.conflicts);  // Fields with conflicts
```

---

## Module Development

### Testing Your Module

1. Create test GUIDE.md:

```yaml
---
project: test-app
language: typescript
extends: ./my-module
---
```

2. Validate:

```bash
guidemd lint
```

3. Check resolved output:

```bash
guidemd lint --json | jq '.data'
```

### Module Checklist

Before publishing:

- [ ] Valid YAML syntax
- [ ] Required metadata fields
- [ ] Sensible defaults
- [ ] Override-friendly structure
- [ ] Documentation in description
- [ ] Appropriate tags
- [ ] No circular dependencies
- [ ] Tested with `guidemd lint`

---

*For the full programmatic API, see [API Reference](./API.md). For architecture details, see [Architecture](./ARCHITECTURE.md).*
