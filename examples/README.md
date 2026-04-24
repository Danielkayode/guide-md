# Examples

This directory contains example projects and configurations demonstrating various aspects of the GUIDE.md ecosystem.

---

## Available Examples

### security-plugin

A conceptual example demonstrating how to build a security audit plugin for the GUIDE.md linter.

**Status**: Concept only - The plugin system is planned but not yet implemented.

**Demonstrates**:
- Plugin structure and interface
- Schema extensions
- Doctor signatures for security packages
- Hook implementations (beforeLint, afterSync, onGenerateReadme)
- README generation extensions

**See**: [security-plugin/README.md](./security-plugin/README.md)

---

## Using Examples

### Running Examples

Most examples can be run using the development build of the linter:

```bash
# Navigate to the linter project root
cd /path/to/guide-md

# Run the linter against an example
npm run dev -- lint examples/security-plugin/examples/test-guide.md
```

### Creating Your Own Example

To create a new example:

1. Create a directory under `examples/`
2. Add a `GUIDE.md` file with your example configuration
3. Create a `README.md` explaining the example
4. Link it from this file

---

## Future Examples

Planned examples for future releases:

- **skills-example**: Demonstrates SKILL.md creation and validation
- **registry-module-example**: Shows how to create custom registry modules
- **custom-exporter**: Example custom export adapter
- **mcp-client**: Example MCP client implementation

---

## Contributing Examples

Contributions of new examples are welcome! Please ensure:

1. The example is well-documented
2. Includes a working `GUIDE.md`
3. Has a clear `README.md` explaining the use case
4. Follows the project's code style guidelines

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details.
