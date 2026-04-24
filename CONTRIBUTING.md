# Contributing to GUIDE.md Linter

Thank you for your interest in contributing to the GUIDE.md Linter! This document provides guidelines and instructions for setting up your development environment, understanding the codebase, and submitting contributions.

---

## Table of Contents

1. [Development Environment Setup](#development-environment-setup)
2. [Project Structure](#project-structure)
3. [Development Workflow](#development-workflow)
4. [Code Style Guidelines](#code-style-guidelines)
5. [Testing Requirements](#testing-requirements)
6. [Submitting Changes](#submitting-changes)
7. [Release Process](#release-process)

---

## Development Environment Setup

### Prerequisites

- **Node.js**: Version 18 or higher (we recommend using the latest LTS)
- **npm**: Comes with Node.js
- **Git**: For version control

### Installation

1. **Fork and clone the repository**:

```bash
git clone https://github.com/your-username/guide-md.git
cd guide-md
```

2. **Install dependencies**:

```bash
npm install
```

3. **Verify setup**:

```bash
npm run build:typecheck
npm test
```

### Recommended Tools

- **VS Code** with extensions:
  - TypeScript and JavaScript Language Features
  - ESLint
  - Prettier (optional but recommended)

---

## Project Structure

```
guide-md/
├── src/                     # Source code
│   ├── cli/                # Command-line interface
│   ├── dashboard/          # Health reporting
│   ├── diff/               # File comparison
│   ├── doctor/             # Static analysis
│   ├── exporter/           # Export adapters
│   ├── generator/          # README generation
│   ├── guardian/           # Git hooks
│   ├── importer/           # Import from other formats
│   ├── linter/             # Core validation
│   ├── mcp/                # MCP server
│   ├── optimizer/          # Performance optimization
│   ├── parser/             # YAML frontmatter parser
│   ├── profiler/           # Token analysis
│   ├── registry/           # Module registry
│   ├── schema/             # Zod schemas
│   ├── skills/             # Skill validation
│   ├── stats/              # Context density
│   ├── verify/             # Cold-start verification
│   └── watcher/            # File watching
├── tests/                   # Test files
├── DOCS/                    # Documentation
├── examples/                # Example projects
├── package.json
├── tsconfig.json
└── GUIDE.md                # Project's own GUIDE.md
```

### Key Modules

| Module | Purpose | Entry Point |
|--------|---------|-------------|
| `cli` | Command-line interface | `src/cli/index.ts` |
| `linter` | Core linting logic | `src/linter/index.ts` |
| `parser` | YAML frontmatter parsing | `src/parser/index.ts` |
| `schema` | Zod validation schemas | `src/schema/index.ts` |
| `mcp` | Model Context Protocol server | `src/mcp/server.ts` |

---

## Development Workflow

### Running Locally

Use the development script to run the CLI with TypeScript compilation:

```bash
npm run dev -- lint GUIDE.md
npm run dev -- init
npm run dev -- validate ./my-project
```

### Building

Build the project for production:

```bash
npm run build
```

This creates a bundled version in `dist/cli/index.cjs`.

### Self-Linting

Run the linter on the project's own GUIDE.md:

```bash
npm run lint:self
```

### Type Checking

Check TypeScript types without emitting:

```bash
npm run lint:check
```

---

## Code Style Guidelines

The project follows strict coding standards as defined in [GUIDE.md](./GUIDE.md):

### TypeScript Rules

- **Strict typing enabled**: No `any` types allowed
- **Explicit return types**: All functions must declare return types
- **No implicit returns**: All code paths must return

### Formatting

- **Indentation**: 2 spaces (no tabs)
- **Max line length**: 100 characters
- **Naming convention**: camelCase

### Code Organization

```typescript
// Use section headers for organization
// ─── Section Name ────────────────────────────────────────────────────────────

// Export types first
export interface MyInterface { }

// Export functions
export function myFunction(): void { }

// Internal helper functions last
function internalHelper(): void { }
```

### Security Considerations

All code must follow security best practices:

- **Validate file paths** using `isSafePath()` before file operations
- **Escape shell arguments** using `shellEscape()` for any shell interaction
- **Sanitize inputs** using `deepSanitize()` for JSON handling
- **Limit sizes** - Add checks for user-provided content size

See [SECURITY.md](./SECURITY.md) for detailed security guidelines.

---

## Testing Requirements

### Coverage Threshold

The project maintains **80% minimum test coverage**. All new code must:

1. Include unit tests in the `tests/` directory
2. Pass existing tests
3. Meet coverage requirements

### Running Tests

```bash
# Run tests once
npm test

# Watch mode for development
npm run test:watch

# With coverage report
npm run test:coverage
```

### Test Structure

Tests are organized by module:

```
tests/
├── linter.test.ts       # Linter tests
├── parser.test.ts       # Parser tests
├── schema.test.ts       # Schema tests
├── security.test.ts     # Security tests
├── exporter.test.ts     # Exporter tests
├── importer.test.ts     # Importer tests
├── sync.test.ts         # Sync engine tests
└── extends.test.ts      # Inheritance tests
```

### Writing Tests

Use **Vitest** with the following patterns:

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "../src/my-module/index.js";

describe("myModule", () => {
  describe("myFunction", () => {
    it("should handle valid input", () => {
      const result = myFunction("valid");
      expect(result).toBe(true);
    });

    it("should handle invalid input", () => {
      const result = myFunction("invalid");
      expect(result).toBe(false);
    });
  });
});
```

See [TESTING.md](./TESTING.md) for comprehensive testing guidelines.

---

## Submitting Changes

### Before Submitting

1. **Run all checks**:
```bash
npm run lint:check   # TypeScript type checking
npm test             # Unit tests
npm run lint:self    # Validate GUIDE.md
```

2. **Update documentation** if needed:
   - API changes → Update `DOCS/API.md`
   - New features → Update relevant docs in `DOCS/`
   - Breaking changes → Update `CHANGELOG.md`

3. **Add tests** for new functionality

### Pull Request Process

1. **Create a feature branch**:
```bash
git checkout -b feature/my-feature-name
```

2. **Make your changes** with clear, focused commits

3. **Push and create PR**:
   - Provide a clear description of changes
   - Reference any related issues
   - Ensure CI checks pass

### Commit Message Guidelines

Use clear, descriptive commit messages:

```
feat: add skill validation to lint command
fix: resolve path traversal in export adapter
docs: update API documentation for skills module
test: add tests for guardian hook installation
```

---

## Release Process

### Versioning

The project follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking API changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Preparing a Release

1. **Update version** in `package.json`
2. **Update `CHANGELOG.md`** with release notes
3. **Run full test suite**:
```bash
npm run prepublishOnly
```

4. **Create git tag**:
```bash
git tag -a v0.2.4 -m "Release version 0.2.4"
git push origin v0.2.4
```

---

## Questions?

- **Documentation**: Check `DOCS/` directory
- **Issues**: Open an issue on GitHub
- **Discussions**: Use GitHub Discussions for questions

Thank you for contributing to the GUIDE.md ecosystem!
