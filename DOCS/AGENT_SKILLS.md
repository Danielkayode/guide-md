# Agent Skills Specification

**Version:** 1.0.0  
**Last Updated:** 2026-04-24

---

## Overview

Agent Skills are directory-based capabilities defined by a `SKILL.md` file. Unlike traditional GUIDE.md which describes an entire project, an Agent Skill encapsulates a discrete, reusable capability that AI agents can invoke to perform specific tasks.

Skills enable:
- **Modular AI capabilities** - Break complex tasks into composable units
- **Semantic discovery** - AI agents find skills by matching intent to descriptions
- **Resource integrity** - Linked files are validated to exist within the skill directory
- **Security boundaries** - Skills are sandboxed and cannot access files outside their directory

---

## File Structure

```
my-project/
├── GUIDE.md              # Project-level context
├── skills/               # Skills directory (convention)
│   ├── code-analyzer/
│   │   ├── SKILL.md      # Skill manifest (required)
│   │   ├── utils.ts      # Supporting files
│   │   └── templates/
│   │       └── default.md
│   └── api-client/
│       ├── SKILL.md
│       └── client.py
└── src/
```

A valid skill requires:
1. A directory containing a `SKILL.md` file
2. YAML frontmatter with required fields
3. Markdown body with instructions
4. All referenced files must exist within the skill directory

---

## SKILL.md Format

### Frontmatter Schema

```yaml
---
name: code-analyzer           # Required: kebab-case identifier
description: Analyzes code...  # Required: third-person, 20-500 chars
version: "1.0.0"              # Required: Semantic Versioning
author: "optional@example.com" # Optional: author identifier
tags: ["analysis", "quality"] # Optional: discovery tags
ai_capabilities:              # Optional: required AI capabilities
  - tool_use
  - structured_output
entry_point: ./index.ts       # Optional: primary execution file
dependencies:                 # Optional: external requirements
  - typescript
  - @typescript-eslint/parser
---
```

### Field Reference

| Field | Required | Format | Description |
|-------|----------|--------|-------------|
| `name` | Yes | kebab-case | Unique identifier, lowercase with hyphens |
| `description` | Yes | Third-person | What the skill does (not "I do X") |
| `version` | Yes | SemVer | Semantic version (major.minor.patch) |
| `author` | No | string | Creator identifier |
| `tags` | No | string[] | Categorization for discovery |
| `ai_capabilities` | No | enum[] | Required AI model capabilities |
| `entry_point` | No | path | Primary file (relative to skill dir) |
| `dependencies` | No | string[] | External packages/tools required |

---

## Discovery Optimization

### The Description Field

The `description` is **critical** for semantic triggering. AI agents use this field to:
- Match user intent to available skills
- Rank skills by relevance
- Determine capability boundaries

**Best practices:**
- **Be specific:** "Analyzes TypeScript code for security vulnerabilities" not "Analyzes code"
- **Use action verbs:** "Generates", "Validates", "Transforms", "Optimizes"
- **Include scope:** "for React components", "in Python projects", "against OWASP Top 10"
- **Mention output:** "and produces SARIF reports", "with line-by-line annotations"

**Example descriptions:**

```yaml
# ✅ Good: Clear, specific, actionable
description: Analyzes TypeScript and JavaScript files for common security vulnerabilities including SQL injection, XSS, and unsafe eval usage. Produces detailed reports with line numbers and remediation suggestions.

# ❌ Bad: Vague, first-person, no scope
description: I help you find bugs in your code.
```

### Third-Person Requirement

The linter enforces **third-person descriptions**. This is critical because:

1. **Consistency:** Skills are described as capabilities, not personas
2. **Clarity:** Third-person eliminates ambiguity about who performs the action
3. **Discovery:** AI matching algorithms perform better with consistent voice

**Invalid (first-person indicators):**
- "I analyze code"
- "I'm a code analyzer"
- "We help you find bugs"
- "My purpose is..."
- "This helps us..."

**Valid (third-person):**
- "Analyzes code for security issues"
- "Generates TypeScript type definitions from JSON schemas"
- "Transforms SQL queries into optimized prepared statements"

---

## The 500-Line Rule

Research shows that concise files perform better with AI agents. The linter issues a warning when `SKILL.md` exceeds 500 lines.

**Why limit size?**
- **Token efficiency:** Larger files consume more of the context window
- **Focus:** Concise skills have clearer boundaries
- **Composability:** Small skills can be chained; large skills are monolithic

**Strategies to stay lean:**

1. **Move implementation out** - Keep `SKILL.md` as the manifest/interface; put code in separate files
2. **Use templates** - Reference external template files instead of inline content
3. **Link documentation** - Use markdown links to reference extended documentation
4. **Split complex skills** - One skill per discrete capability

**Example structure:**

```
skills/
└── code-reviewer/
    ├── SKILL.md              # ~50 lines: Interface & instructions
    ├── prompt.txt            # ~100 lines: LLM prompt template
    ├── rubric.md             # ~200 lines: Review criteria
    └── utils/
        ├── github.ts         # GitHub API integration
        └── formatter.ts      # Output formatting
```

---

## Resource Integrity

All markdown links in `SKILL.md` must reference files that exist within the skill directory.

**Valid links:**
```markdown
See [the rubric](./rubric.md) for evaluation criteria.
Use [this template](./templates/default.md) as a starting point.
Read [utils documentation](./docs/utils.md) for API reference.
```

**Invalid links (will fail validation):**
```markdown
See [project readme](../../README.md)  # Escapes skill directory
Use [global config](/etc/config.yml)   # Absolute path
Fetch [external docs](https://example.com/docs)  # External URL
```

The linter validates:
- Relative paths starting with `./` or `../` (within bounds)
- File existence at the resolved path
- Path traversal attempts (e.g., `../../../etc/passwd`)

---

## Security Heuristics

The linter scans `SKILL.md` content for security risks:

### High-Risk Commands

These patterns trigger validation errors:

| Pattern | Risk |
|---------|------|
| `rm -rf /` | Destructive deletion |
| `sudo` | Privilege escalation |
| `curl \| sh` | Remote code execution |
| `eval()` | Arbitrary code execution |
| `child_process` | Process spawning |
| `os.system()` | Shell command execution |
| `chmod 777` | Overly permissive permissions |
| `mkfs.*` | Filesystem formatting |
| `dd if=` | Low-level disk writes |
| `fork bomb` | Resource exhaustion |

### Path Traversal

These patterns indicate potential directory escape:

| Pattern | Risk |
|---------|------|
| `../` | Relative parent traversal |
| `..\\` | Windows path traversal |
| `%2e%2e%2f` | URL-encoded traversal |
| `/etc/passwd` | Sensitive file access |
| `~/.ssh` | SSH key access |
| `/proc/self` | Process enumeration |
| `C:\\` | Absolute Windows path |

Skills should not:
- Access files outside their directory
- Execute arbitrary system commands
- Modify global system state
- Access sensitive system paths

---

## Example Template

### Valid, Agent-Optimized SKILL.md

```markdown
---
name: typescript-security-audit
description: Analyzes TypeScript and JavaScript files for security vulnerabilities including SQL injection, XSS, unsafe eval, and prototype pollution. Produces detailed findings with severity levels, affected lines, and remediation code snippets.
version: "1.2.0"
author: "security-team@example.com"
tags: ["security", "typescript", "audit", "owasp"]
ai_capabilities:
  - tool_use
  - structured_output
  - long_context
entry_point: ./src/analyzer.ts
dependencies:
  - typescript
  - @typescript-eslint/parser
  - semgrep
---

# TypeScript Security Audit

## Purpose

Performs static analysis on TypeScript/JavaScript code to identify security vulnerabilities aligned with OWASP Top 10 and CWE standards.

## Capabilities

- **SQL Injection Detection**: Identifies unsanitized query construction
- **XSS Prevention**: Finds unescaped output in templates
- **Eval Safety**: Flags dangerous use of eval, new Function, setTimeout with strings
- **Prototype Pollution**: Detects risky object property assignments

## Usage

The AI agent should:
1. Read the target file(s) specified by the user
2. Apply the [analysis rubric](./docs/rubric.md) to identify issues
3. Use the [severity guidelines](./docs/severity.md) to classify findings
4. Format output using the [report template](./templates/sarif.md)

## Output Format

Produces structured findings with:
- `ruleId`: CWE or OWASP identifier
- `severity`: critical, high, medium, low
- `location`: File path, line, column
- `message`: Human-readable description
- `suggestion`: Remediation code snippet

## Limitations

- Does not perform dynamic/runtime analysis
- May produce false positives on intentionally dynamic code
- Requires TypeScript 4.5+ for best results
```

### Why This Is Agent-Optimized

| Aspect | Implementation | Benefit |
|--------|---------------|---------|
| **Discovery** | Specific description with keywords | AI finds this when users ask for "security audit", "XSS detection", "TypeScript vulnerabilities" |
| **Third-person** | "Analyzes", "Produces", "Performs" | Consistent capability description |
| **Resource Integrity** | Links to `./docs/`, `./templates/` | All referenced files exist within skill directory |
| **Security** | No high-risk commands | Safe to execute in sandboxed environments |
| **Token Efficiency** | Concise at ~200 lines | Leaves room for code context in LLM windows |
| **Composability** | Clear boundaries and limitations | Can be chained with other skills (e.g., fix-generator) |

---

## CLI Integration

The linter automatically detects and validates all `SKILL.md` files when running:

```bash
guidemd lint
```

Skills are validated for:
1. **Schema compliance** - Required fields, kebab-case, SemVer
2. **Style rules** - Third-person description
3. **Resource integrity** - All linked files exist
4. **Security heuristics** - No high-risk commands or path traversal

### Output Format

```
╔════════════════════════════════════════════════╗
║     🎯  Agent Skills Validation                ║
╚════════════════════════════════════════════════╝

  ✔ typescript-security-audit  ./skills/security-audit/SKILL.md

  ✖ code-optimizer            ./skills/optimizer/SKILL.md

  Errors (2)
  ────────────────────────────────────────
    ✖ [style] description
      → Description must be in third-person (e.g., 'Analyzes code' not 'I analyze code').
        First-person indicators like 'I', 'my', 'we', 'our' are not allowed.
      received: "I optimize your code for performance"

    ✖ [resource] content
      → Broken markdown link: "rubric" references missing file "./docs/rubric.md"

──────────────────────────────────────────────────
  ✖ 1/2 skill(s) failed validation · 2 error(s) total
──────────────────────────────────────────────────
```

---

## Best Practices

### Do:
- Use descriptive, keyword-rich names
- Write detailed, third-person descriptions
- Keep `SKILL.md` under 500 lines
- Link to external files instead of inlining large content
- Define clear entry points for execution
- Specify required AI capabilities
- Version skills using SemVer
- Include usage examples in the body

### Don't:
- Use first-person language ("I", "my", "we")
- Reference files outside the skill directory
- Include high-risk commands (eval, rm -rf, sudo)
- Create monolithic skills that do everything
- Hardcode absolute paths or system-specific references
- Assume specific AI model versions (use `ai_capabilities` instead)

---

## Migration from GUIDE.md

Projects using GUIDE.md can incrementally adopt Agent Skills:

1. **Identify capabilities** - What discrete tasks does your AI agent perform?
2. **Extract to skills** - Move each capability to its own skill directory
3. **Reference from GUIDE.md** - Add `context.entry_points` pointing to skill directories
4. **Validate together** - Run `guidemd lint` to validate both GUIDE.md and all skills

---

*For implementation details, see `src/skills/` in the linter repository.*
