# Contributing to GUIDE.md Linter

Thank you for your interest in contributing to the GUIDE.md Linter! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all backgrounds and experience levels.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/linter.git
   cd linter
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Create a branch** for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites

- **Node.js**: >= 18.0.0 (see `package.json` engines field)
- **npm**: Latest stable version
- **Git**: For version control

### Build Commands

```bash
# Type-check without emitting files
npm run build:typecheck

# Build the CLI bundle
npm run build

# Run in development mode
npm run dev

# Lint the project's own GUIDE.md
npm run lint:self
```

### Running the CLI During Development

```bash
# Run CLI commands directly with tsx
npm run dev -- lint GUIDE.md
npm run dev -- init --force
npm run dev -- doctor GUIDE.md
```

## Project Structure

```
/workspace
├── src/                      # Source code
│   ├── cli/                  # CLI entry point and commands
│   ├── schema/               # Zod schemas for GUIDE.md validation
│   ├── linter/               # Core linting logic
│   ├── parser/               # YAML frontmatter parsing
│   ├── generator/            # README.md generation
│   ├── exporter/             # Export to other AI context formats
│   ├── importer/             # Import from other AI context formats
│   ├── optimizer/            # Token optimization suggestions
│   ├── verify/               # AI-readiness verification
│   ├── doctor/               # Deep static analysis
│   ├── profiler/             # Token density and entropy profiling
│   ├── guardian/             # Git hooks and sync protection
│   ├── watcher/              # Watch mode functionality
│   ├── dashboard/            # Health report generation
│   ├── diff/                 # Drift detection
│   ├── registry/             # Module registry system
│   ├── mcp/                  # Model Context Protocol integration
│   └── stats/                # Context density scoring
├── tests/                    # Test files
├── DOCS/                     # User documentation
├── fixtures/                 # Test fixtures
└── examples/                 # Example projects
```

## Making Changes

### Coding Standards

1. **TypeScript**: All code must be typed strictly
2. **ES Modules**: Use ES module syntax (`import`/`export`)
3. **Error Handling**: Use try-catch blocks with informative error messages
4. **Security**: Never log secrets; use masking for sensitive data
5. **Comments**: Add JSDoc comments for public functions and complex logic

### Example Function Documentation

```typescript
/**
 * Validates a GUIDE.md file against the schema.
 * @param filePath - Path to the GUIDE.md file
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 * 
 * @security Performs SSRF protection when resolving remote extends URLs
 * @security Masks any detected secrets in error messages
 */
export function validate(filePath: string, options?: ValidateOptions): ValidationResult {
  // Implementation
}
```

### Security Considerations

When making changes, ensure:
- **SSRF Protection**: Remote URL resolution must be validated
- **ReDoS Prevention**: Regex patterns must be safe from catastrophic backtracking
- **Prototype Pollution**: Object merging must use safe techniques
- **Secret Masking**: Never expose API keys or tokens in logs/errors

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

Tests are located in `/workspace/tests/` and use Vitest:

```typescript
import { describe, it, expect } from 'vitest';
import { validate } from '../src/linter/index.js';

describe('validate', () => {
  it('should pass valid GUIDE.md', () => {
    const result = validate('fixtures/valid-guide.md');
    expect(result.errors).toHaveLength(0);
  });
});
```

### Test Coverage Requirements

- New features must include tests
- Bug fixes should include regression tests
- Aim for >80% code coverage on critical paths

## Documentation

### Updating User Documentation

User-facing documentation is in `/workspace/DOCS/`:

- `DOCS/index.md` - Main documentation hub
- `DOCS/API.md` - API reference
- `DOCS/ARCHITECTURE.md` - System design
- `DOCS/MCP_INTEGRATION.md` - MCP server setup
- `DOCS/REGISTRY.md` - Module registry docs

### Updating README

The main `README.md` is the primary entry point. Keep it:
- Concise and scannable
- Updated with new features
- Including working examples

### Changelog

Update `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [0.2.5] - YYYY-MM-DD

### Added
- New feature description

### Fixed
- Bug fix description

### Changed
- Breaking change description (if any)
```

## Submitting Changes

### Pull Request Process

1. **Ensure tests pass**: `npm test`
2. **Type-check**: `npm run build:typecheck`
3. **Build successfully**: `npm run build`
4. **Update documentation** if adding/changing features
5. **Update CHANGELOG.md** with your changes
6. **Create PR** with clear title and description

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe testing performed

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Type-check passes
- [ ] Build succeeds
```

### Code Review

All PRs require review from maintainers. Expect feedback on:
- Code quality and style
- Test coverage
- Security implications
- Documentation completeness
- Performance impact

## Release Process

Releases follow [Semantic Versioning](https://semver.org/):

- **Patch** (0.0.X): Bug fixes, backwards compatible
- **Minor** (0.X.0): New features, backwards compatible
- **Major** (X.0.0): Breaking changes

### Release Steps (Maintainers Only)

1. Update version in `package.json`
2. Update `CHANGELOG.md` with release date
3. Create git tag: `git tag v0.2.5`
4. Push tag: `git push origin v0.2.5`
5. Publish to npm: `npm publish`

## Questions?

- Check existing [documentation](./DOCS/index.md)
- Review [GUIDE.md](./GUIDE.md) for project context
- Open an issue for questions or discussions

## Thank You!

Your contributions help make GUIDE.md better for everyone. We appreciate your time and effort! 🎉
