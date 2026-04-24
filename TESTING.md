# Testing Guide

This document describes the testing strategy, requirements, and best practices for the GUIDE.md Linter project.

---

## Table of Contents

1. [Overview](#overview)
2. [Testing Requirements](#testing-requirements)
3. [Test Structure](#test-structure)
4. [Running Tests](#running-tests)
5. [Writing Tests](#writing-tests)
6. [Coverage Requirements](#coverage-requirements)
7. [Security Testing](#security-testing)
8. [Integration Testing](#integration-testing)
9. [Test Fixtures](#test-fixtures)
10. [Debugging Tests](#debugging-tests)

---

## Overview

The GUIDE.md Linter uses **Vitest** as its testing framework with **@vitest/coverage-v8** for coverage reporting. Tests are written in TypeScript and located in the `tests/` directory.

### Testing Philosophy

- **Comprehensive coverage**: Aim for 80%+ coverage across all modules
- **Security-first**: Dedicated security tests for all attack vectors
- **Real-world scenarios**: Test with actual file system operations using temp directories
- **Fast execution**: Tests should complete quickly for rapid development feedback

---

## Testing Requirements

### Minimum Coverage Threshold

| Metric | Threshold |
|--------|-----------|
| Statements | 80% |
| Branches | 80% |
| Functions | 80% |
| Lines | 80% |

### Required Test Categories

1. **Unit tests** for all exported functions
2. **Security tests** for all security-sensitive code
3. **Integration tests** for CLI commands
4. **Error handling tests** for all failure paths

---

## Test Structure

```
tests/
├── fixtures/              # Test data files
│   └── ...
├── linter.test.ts        # Core linting logic
├── parser.test.ts        # YAML frontmatter parsing
├── schema.test.ts        # Zod schema validation
├── security.test.ts      # Security scanning
├── exporter.test.ts      # Export adapters
├── importer.test.ts      # Import functionality
├── sync.test.ts          # Drift detection
├── extends.test.ts       # Inheritance resolution
└── *.test.ts             # Module-specific tests
```

### Test File Naming

- Use `.test.ts` suffix for all test files
- Name should match the module being tested (e.g., `linter.test.ts` for `src/linter/`)

---

## Running Tests

### Basic Commands

```bash
# Run all tests once
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npx vitest run tests/linter.test.ts

# Run tests matching a pattern
npx vitest run -t "should validate"
```

### Coverage Report

After running `npm run test:coverage`, view the report:

```
coverage/
├── index.html           # Interactive HTML report
├── lcov-report/         # LCOV format
└── coverage-final.json  # JSON summary
```

Open `coverage/index.html` in a browser for detailed coverage analysis.

---

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { myFunction } from "../src/my-module/index.js";

describe("myModule", () => {
  describe("myFunction", () => {
    it("should handle valid input correctly", () => {
      // Arrange
      const input = "valid-input";
      
      // Act
      const result = myFunction(input);
      
      // Assert
      expect(result).toBe(true);
    });

    it("should handle invalid input gracefully", () => {
      const result = myFunction("invalid");
      expect(result).toBe(false);
    });
  });
});
```

### Testing with File System

Use temporary directories for file system tests:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("file operations", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guidemd-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should read and write files", () => {
    const filePath = path.join(tempDir, "test.txt");
    fs.writeFileSync(filePath, "Hello, World!", "utf-8");
    
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toBe("Hello, World!");
  });
});
```

### Testing Async Functions

```typescript
import { describe, it, expect } from "vitest";
import { asyncFunction } from "../src/my-module/index.js";

describe("async operations", () => {
  it("should resolve with correct data", async () => {
    const result = await asyncFunction("input");
    expect(result.success).toBe(true);
  });

  it("should handle errors", async () => {
    await expect(asyncFunction("bad-input")).rejects.toThrow("Error message");
  });
});
```

### Mocking

Use Vitest's built-in mocking:

```typescript
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";

describe("with mocks", () => {
  it("should handle file read errors", () => {
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("Permission denied");
    });

    // Test error handling...

    vi.restoreAllMocks();
  });
});
```

---

## Coverage Requirements

### Enforcing Coverage

Coverage is enforced in CI. The configuration in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    }
  }
});
```

### Excluding Files from Coverage

Some files are excluded from coverage requirements:

- CLI entry point (`src/cli/index.ts`) - Mainly I/O operations
- Test fixtures (`tests/fixtures/`)
- Type definitions (`.d.ts` files)

---

## Security Testing

Security tests are located in `tests/security.test.ts` and cover:

### Secret Scanning Tests

```typescript
describe("secret scanning", () => {
  it("should detect OpenAI API keys", async () => {
    const fakeKey = "sk-" + "a".repeat(48);
    const content = `---\nguide_version: "1.0.0"\n---\n\nAPI_KEY=${fakeKey}`;
    
    const result = await lintGuideFile(filePath);
    expect(result.diagnostics.some(d => d.source === "secret-scan")).toBe(true);
  });
});
```

### Path Traversal Tests

```typescript
describe("path security", () => {
  it("should reject dangerous paths", () => {
    const dangerous = "../../../etc/passwd";
    expect(isSafePath(dangerous)).toBe(false);
  });

  it("should accept safe paths", () => {
    const safe = "src/index.ts";
    expect(isSafePath(safe)).toBe(true);
  });
});
```

### Prototype Pollution Tests

```typescript
describe("prototype pollution protection", () => {
  it("should strip dangerous keys", () => {
    const input = '{"__proto__": {"polluted": true}}';
    const result = deepSanitize(JSON.parse(input));
    expect((result as Record<string, unknown>).__proto__).toBeUndefined();
  });
});
```

---

## Integration Testing

Integration tests verify end-to-end functionality:

### CLI Command Testing

```typescript
describe("CLI integration", () => {
  it("should lint a valid GUIDE.md", async () => {
    const guideContent = `---\nguide_version: "1.0.0"\nproject: test\nlanguage: typescript\nstrict_typing: true\nerror_protocol: verbose\n---\n`;
    
    fs.writeFileSync(guidePath, guideContent);
    const result = await lintGuideFile(guidePath);
    
    expect(result.valid).toBe(true);
  });
});
```

### MCP Server Testing

Test the MCP server's JSON-RPC handling:

```typescript
describe("MCP server", () => {
  it("should handle valid requests", () => {
    const server = new McpServer(data, content);
    const response = server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    });
    
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
  });
});
```

---

## Test Fixtures

Place reusable test data in `tests/fixtures/`:

```
tests/fixtures/
├── valid-guide.md       # Valid GUIDE.md example
├── invalid-guide.md    # Invalid GUIDE.md with errors
├── sample-project/     # Sample project structure
│   ├── GUIDE.md
│   └── src/
└── skills/             # Sample skills
    └── code-analyzer/
        └── SKILL.md
```

### Using Fixtures

```typescript
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures", "valid-guide.md");

// Use in tests
const result = parseGuideFile(fixturePath);
```

---

## Debugging Tests

### Debug Mode

Run tests with Node.js debugger:

```bash
npx vitest run --inspect-brk tests/linter.test.ts
```

Then attach your debugger (VS Code, Chrome DevTools, etc.).

### Verbose Output

```bash
npx vitest run --reporter=verbose
```

### Filtering Tests

```bash
# Run only tests matching pattern
npx vitest run -t "should validate"

# Run specific file
npx vitest run tests/linter.test.ts
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Tests timeout | Increase timeout: `it("test", async () => {}, 10000)` |
| File system conflicts | Use unique temp directory names |
| Coverage not updating | Delete `coverage/` directory and re-run |
| Import errors | Ensure `.js` extension in imports |

---

## Continuous Integration

Tests run automatically on:

- Pull requests to `main` branch
- Push to `main` branch
- Release tags

CI checks include:
- TypeScript compilation (`tsc --noEmit`)
- Unit tests with coverage (`vitest run --coverage`)
- Self-linting (`guidemd lint GUIDE.md`)

---

## Best Practices

1. **Test behavior, not implementation**: Test what the code does, not how it does it
2. **One assertion per test**: Keep tests focused and readable
3. **Use descriptive names**: Test names should describe the behavior being tested
4. **Clean up resources**: Always use `afterEach` to remove temp files
5. **Test edge cases**: Include tests for empty inputs, null values, and boundary conditions
6. **Don't test external libraries**: Focus on your code, trust dependencies
7. **Keep tests fast**: Avoid network calls, use mocks for external services

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Project Coverage Report](./coverage/index.html) (after running tests)

---

*For contributing guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).*
