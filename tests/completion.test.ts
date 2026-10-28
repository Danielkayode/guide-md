import { describe, it, expect } from "vitest";
import { generateCompletion } from "../src/completion/index.js";

describe("shell completion", () => {
  it("generates a bash completion script", () => {
    const script = generateCompletion("bash");
    expect(script).toContain("_guidemd_completion");
    expect(script).toContain("complete -F _guidemd_completion guidemd");
    expect(script).toContain("lint");
    expect(script).toContain("init");
    expect(script).toContain("export");
    expect(script).toContain("check");
    expect(script).toContain("migrate");
    expect(script).toContain("completion");
  });

  it("generates a zsh completion script", () => {
    const script = generateCompletion("zsh");
    expect(script).toContain("#compdef guidemd");
    expect(script).toContain("_guidemd");
    expect(script).toContain("lint");
    expect(script).toContain("check");
    expect(script).toContain("migrate");
  });

  it("generates a fish completion script", () => {
    const script = generateCompletion("fish");
    expect(script).toContain("__guidemd_complete");
    expect(script).toContain("complete -c guidemd");
    expect(script).toContain("lint");
    expect(script).toContain("check");
  });

  it("generates a powershell completion script", () => {
    const script = generateCompletion("powershell");
    expect(script).toContain("Register-ArgumentCompleter");
    expect(script).toContain("guidemd");
    expect(script).toContain("lint");
    expect(script).toContain("check");
  });

  it("lists all commands in each script", () => {
    const commands = [
      "lint", "init", "export", "import", "doctor", "fix", "sync", "verify",
      "profile", "optimize", "info", "badge", "ci", "serve", "generate-readme",
      "add", "registry", "generate-docs", "diff", "watch", "install-hooks",
      "schema", "back-sync-readme", "check", "migrate", "completion",
    ];
    for (const shell of ["bash", "zsh", "fish", "powershell"] as const) {
      const script = generateCompletion(shell);
      for (const cmd of commands) {
        expect(script).toContain(cmd);
      }
    }
  });
});
