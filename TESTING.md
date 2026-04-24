# Testing Guide

This document describes the testing strategy, test structure, and how to write effective tests for the GUIDE.md Linter.

## Table of Contents

- [Overview](#overview)
- [Test Framework](#test-framework)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Writing Tests](#writing-tests)
- [Test Fixtures](#test-fixtures)
- [Coverage](#coverage)
- [CI Integration](#ci-integration)
- [Best Practices](#best-practices)

## Overview

The GUIDE.md Linter uses **Vitest** as its testing framework. Tests are designed to be:

- **Fast**: Most tests complete in milliseconds
- **Isolated**: Each test runs independently
- **Deterministic**: Same inputs produce same outputs
- **Comprehensive**: Covering core functionality, edge cases, and security

## Test Framework

### Vitest Configuration

Tests are configured in `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

### Available Test Commands

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npx vitest run tests/linter.test.ts

# Run tests matching a pattern
npx vitest run -t "secret scanning"
```

## Running Tests

### Basic Test Execution

```bash
# Run all tests
npm test

# Run with verbose output
npx vitest run --reporter=verbose

# Run only failed tests
npx vitest run --failed
```

### Debugging Tests

```bash
# Run with Node.js inspector
node --inspect-brk node_modules/.bin/vitest run --no-threads

# Log during tests
console.log('Debug info:', variable);
```

## Test Structure

### Test File Organization

```
/tests
├── linter.test.ts          # Core linting logic tests
├── parser.test.ts          # YAML frontmatter parsing tests
├── schema.test.ts          # Zod schema validation tests
├── exporter.test.ts        # Export functionality tests
├── importer.test.ts        # Import functionality tests
├── security.test.ts        # Security feature tests
├── sync.test.ts            # Drift detection & sync tests
├── extends.test.ts         # Inheritance/extends tests
└── ...
```

### Test File Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validate } from '../src/linter/index.js';

describe('module name', () => {
  // Setup if needed
  beforeEach(() => {
    // Setup code
  });

  // Cleanup if needed
  afterEach(() => {
    // Cleanup code
  });

  describe('function or feature', () => {
    it('should do something specific', () => {
      // Arrange
      const input = '...';
      
      // Act
      const result = validate(input);
      
      // Assert
      expect(result.errors).toHaveLength(0);
    });

    it('should handle edge case', () => {
      // Test edge cases
    });

    it('should throw error for invalid input', () => {
      expect(() => validate(invalidInput)).toThrow();
    });
  });
});
```

## Writing Tests

### Unit Tests

Test individual functions in isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../src/parser/index.js';

describe('parseFrontmatter', () => {
  it('should parse valid YAML frontmatter', () => {
    const content = `---
title: Test
version: 1.0.0
---
Content here`;
    
    const result = parseFrontmatter(content);
    
    expect(result.title).toBe('Test');
    expect(result.version).toBe('1.0.0');
  });

  it('should return null for missing frontmatter', () => {
    const result = parseFrontmatter('No frontmatter here');
    expect(result).toBeNull();
  });
});
```

### Integration Tests

Test multiple components working together:

```typescript
import { describe, it, expect } from 'vitest';
import { validate } from '../src/linter/index.js';

describe('validate integration', () => {
  it('should validate complete GUIDE.md workflow', () => {
    // Test full validation pipeline
    const result = validate('fixtures/complete-guide.md');
    
    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
```

### Security Tests

Test security features explicitly:

```typescript
import { describe, it, expect } from 'vitest';
import { scanSecrets } from '../src/guardian/secrets.js';

describe('security scanning', () => {
  it('should detect OpenAI API keys', () => {
    const content = 'api_key: sk-proj-abc123xyz789';
    const result = scanSecrets(content);
    
    expect(result.found).toBe(true);
    expect(result.secrets).toContainEqual(
      expect.objectContaining({ type: 'openai_api_key' })
    );
  });

  it('should mask detected secrets in output', () => {
    const content = 'token: ghp_xxxxxxxxxxxx';
    const result = scanSecrets(content);
    
    expect(result.masked).toContain('ghp_****');
    expect(result.masked).not.toContain('ghp_xxxxxxxxxxxx');
  });

  it('should not flag placeholder values as secrets', () => {
    const content = 'api_key: YOUR_API_KEY_HERE';
    const result = scanSecrets(content);
    
    expect(result.found).toBe(false);
  });
});
```

### Snapshot Tests

Use snapshots for complex output structures:

```typescript
import { describe, it, expect } from 'vitest';
import { generateReport } from '../src/dashboard/index.js';

describe('generateReport', () => {
  it('should generate consistent health report', () => {
    const data = {/* test data */};
    const report = generateReport(data);
    
    expect(report).toMatchSnapshot();
  });
});
```

Update snapshots with: `npx vitest run -u`

## Test Fixtures

### Fixture Organization

```
/fixtures
├── valid-guide.md           # Valid GUIDE.md example
├── invalid-guide.md         # Invalid GUIDE.md example
├── minimal-guide.md         # Minimal valid GUIDE.md
├── complete-guide.md        # Fully featured GUIDE.md
├── drift-test/
│   └── GUIDE.md            # For drift detection tests
├── registry/                # Registry module fixtures
└── generate-readme/
    └── GUIDE.md            # For README generation tests
```

### Creating Fixtures

```markdown
---
title: Test Project
version: 1.0.0
language: typescript
---

# Test Guide

This is a test fixture for unit tests.
```

### Using Fixtures in Tests

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const validGuide = readFileSync(
  join(process.cwd(), 'fixtures', 'valid-guide.md'),
  'utf-8'
);

it('should validate fixture', () => {
  const result = validate(validGuide);
  expect(result.errors).toHaveLength(0);
});
```

## Coverage

### Running Coverage

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/index.html
```

### Coverage Goals

- **Overall**: >80% line coverage
- **Critical paths**: >95% (schema validation, security scanning)
- **Edge cases**: Test boundary conditions

### Coverage Report Types

- **Text**: Summary in terminal
- **HTML**: Interactive browser report
- **JSON**: Machine-readable for CI tools

## CI Integration

### GitHub Actions

Tests run automatically on:
- Pull requests
- Push to main branch
- Before releases

Example workflow (`.github/workflows/test.yml`):

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### Pre-commit Hooks

Install git hooks to run tests before commits:

```bash
guidemd install-hooks --manager husky
```

## Best Practices

### Test Naming

Use descriptive names that explain the expected behavior:

```typescript
// ✅ Good
it('should detect AWS access keys and mask them in output', () => {});

// ❌ Bad
it('test aws keys', () => {});
```

### Arrange-Act-Assert Pattern

Structure tests clearly:

```typescript
it('should validate GUIDE.md', () => {
  // Arrange
  const guide = loadFixture('valid-guide.md');
  
  // Act
  const result = validate(guide);
  
  // Assert
  expect(result.success).toBe(true);
});
```

### Test Independence

Each test should be isolated:

```typescript
// ✅ Good - Self-contained
it('should parse frontmatter', () => {
  const content = createTestContent();
  // ...
});

// ❌ Bad - Depends on previous test state
it('should use result from previous test', () => {
  // Uses global state from another test
});
```

### Edge Cases to Test

- Empty inputs
- Null/undefined values
- Maximum length strings
- Special characters
- Unicode content
- Malformed YAML
- Missing required fields
- Circular dependencies (for extends)
- Network failures (for remote URLs)

### Security Testing Checklist

- [ ] Secret detection works for all supported secret types
- [ ] Secrets are masked in all error messages
- [ ] SSRF protection prevents internal network access
- [ ] ReDoS-safe regex patterns
- [ ] No prototype pollution in object merging
- [ ] Path traversal prevention
- [ ] Safe file system operations

### Performance Testing

For performance-critical code:

```typescript
import { bench, describe } from 'vitest';

describe('performance', () => {
  bench('parse large GUIDE.md', () => {
    parseFrontmatter(largeContent);
  }, {
    iterations: 1000,
  });
});
```

## Troubleshooting

### Common Issues

**Tests failing randomly**
- Check for async issues (missing await)
- Ensure no shared mutable state
- Verify timers are mocked if used

**Slow tests**
- Avoid unnecessary file I/O
- Mock external services
- Use smaller test fixtures

**Flaky tests**
- Remove timing dependencies
- Mock network calls
- Use deterministic data

### Getting Help

- Check existing tests for examples
- Review Vitest documentation: https://vitest.dev
- Ask in project issues/discussions

## Resources

- [Vitest Documentation](https://vitest.dev)
- [Testing Library Best Practices](https://testing-library.com)
- [Node.js Testing Guidelines](https://nodejs.org/docs/latest/api/test.html)

---

*Last updated: 2026-04-24*
