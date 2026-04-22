import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

export type HookManager = "husky" | "raw" | "auto";

// ─── Security Utilities ───────────────────────────────────────────────────────
// Export for testing
export { isSafePath, shellEscape };

/**
 * Validates that a path doesn't contain shell metacharacters that could lead to command injection.
 */
function isSafePath(input: string): boolean {
  // Reject paths with shell metacharacters
  const dangerousChars = /[;&|`$(){}[\]\<>!#*?]/;
  if (dangerousChars.test(input)) {
    return false;
  }
  // Reject paths with newlines
  if (input.includes("\n") || input.includes("\r")) {
    return false;
  }
  return true;
}

/**
 * Escapes a string for safe use as a shell argument.
 * Wraps in single quotes and handles embedded single quotes safely.
 */
function shellEscape(arg: string): string {
  // If no special characters, return as-is
  if (/^[a-zA-Z0-9_/.-]+$/.test(arg)) {
    return arg;
  }
  // Wrap in single quotes and escape any embedded single quotes
  // by ending the quoted string, adding an escaped quote, and starting a new quoted string
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
}

export interface HookInstallResult {
  success: boolean;
  manager: "husky" | "raw";
  hookPath: string;
  message: string;
}

const PRE_COMMIT_CONTENT = `#!/bin/sh
# @guidemd/linter - AI Context Guardian
# This hook ensures GUIDE.md stays in sync with your codebase

echo "🛡️  Guardian: Checking GUIDE.md..."

npx guidemd lint GUIDE.md --sync
LINT_EXIT=$?

if [ $LINT_EXIT -ne 0 ]; then
  echo "❌ GUIDE.md validation failed. Commit blocked."
  echo ""
  echo "Fix the errors above, or run: npx guidemd lint GUIDE.md --fix"
  exit 1
fi

# Check if GUIDE.md was modified by --sync
if [ -n "$(git status --porcelain GUIDE.md)" ]; then
  echo "🔄 GUIDE.md was out of sync and has been auto-updated."
  git add GUIDE.md
  echo "✅ GUIDE.md changes staged automatically."
fi

echo "✅ Guardian: GUIDE.md is valid and in sync."
`;

const HUSKY_PRE_COMMIT = `#!/bin/sh
# @guidemd/linter - AI Context Guardian
. "\$(dirname -- "\$0")/_/husky.sh"

echo "🛡️  Guardian: Checking GUIDE.md..."

npx guidemd lint GUIDE.md --sync
LINT_EXIT=$?

if [ \$LINT_EXIT -ne 0 ]; then
  echo "❌ GUIDE.md validation failed. Commit blocked."
  echo ""
  echo "Fix the errors above, or run: npx guidemd lint GUIDE.md --fix"
  exit 1
fi

# Check if GUIDE.md was modified by --sync
if [ -n "\$(git status --porcelain GUIDE.md)" ]; then
  echo "🔄 GUIDE.md was out of sync and has been auto-updated."
  git add GUIDE.md
  echo "✅ GUIDE.md changes staged automatically."
fi

echo "✅ Guardian: GUIDE.md is valid and in sync."
`;

// ─── Windows Wrapper Scripts ─────────────────────────────────────────────────

const PRE_COMMIT_CMD = `@echo off
REM @guidemd/linter - AI Context Guardian
REM This hook ensures GUIDE.md stays in sync with your codebase

echo Guardian: Checking GUIDE.md...

call npx guidemd lint GUIDE.md --sync
if %ERRORLEVEL% neq 0 (
  echo GUIDE.md validation failed. Commit blocked.
  echo.
  echo Fix the errors above, or run: npx guidemd lint GUIDE.md --fix
  exit /b 1
)

REM Check if GUIDE.md was modified by --sync
git diff --quiet GUIDE.md
if %ERRORLEVEL% neq 0 (
  echo GUIDE.md was out of sync and has been auto-updated.
  git add GUIDE.md
  echo GUIDE.md changes staged automatically.
)

echo Guardian: GUIDE.md is valid and in sync.
`;

const PRE_COMMIT_PS1 = `# @guidemd/linter - AI Context Guardian
# This hook ensures GUIDE.md stays in sync with your codebase

Write-Host "🛡️ Guardian: Checking GUIDE.md..."

& npx guidemd lint GUIDE.md --sync
$LINT_EXIT = $LASTEXITCODE

if ($LINT_EXIT -ne 0) {
  Write-Host "❌ GUIDE.md validation failed. Commit blocked." -ForegroundColor Red
  Write-Host ""
  Write-Host "Fix the errors above, or run: npx guidemd lint GUIDE.md --fix"
  exit 1
}

# Check if GUIDE.md was modified by --sync
$status = git status --porcelain GUIDE.md
if ($status) {
  Write-Host "🔄 GUIDE.md was out of sync and has been auto-updated." -ForegroundColor Yellow
  git add GUIDE.md
  Write-Host "✅ GUIDE.md changes staged automatically." -ForegroundColor Green
}

Write-Host "✅ Guardian: GUIDE.md is valid and in sync." -ForegroundColor Green
`;

// ─── Platform Detection ────────────────────────────────────────────────────────

function isWindows(): boolean {
  return os.platform() === "win32";
}

function hasBash(): boolean {
  try {
    if (isWindows()) {
      // On Windows, try common bash locations
      const candidates = [
        "C:\\Program Files\\Git\\bin\\bash.exe",
        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        path.join(os.homedir(), "scoop", "shims", "bash.exe"),
        path.join(os.homedir(), "bin", "bash.exe"),
      ];
      for (const candidate of candidates) {
        // Validate path before checking existence
        if (isSafePath(candidate) && fs.existsSync(candidate)) return true;
      }
      // Try PATH lookup - use shellEscape for safety
      execSync("where bash", { stdio: "ignore" });
      return true;
    }
    execSync("which bash", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function detectHookManager(projectRoot: string = process.cwd()): "husky" | "raw" {
  // Check for .husky directory
  if (fs.existsSync(path.join(projectRoot, ".husky"))) {
    return "husky";
  }

  // Check for husky in package.json
  const packageJsonPath = path.join(projectRoot, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      if (pkg.devDependencies?.husky || pkg.dependencies?.husky) {
        return "husky";
      }
    } catch {
      // Ignore parse errors
    }
  }

  return "raw";
}

export function installHook(
  manager: HookManager = "auto",
  projectRoot: string = process.cwd()
): HookInstallResult {
  // 1. Try to inject into package.json first (Modern approach)
  const pkgPath = path.join(projectRoot, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      pkg.scripts = pkg.scripts || {};
      
      // Add or append to pre-commit script
      const lintCmd = "guidemd lint GUIDE.md --sync";
      if (!pkg.scripts.precommit) {
        pkg.scripts.precommit = lintCmd;
      } else if (!pkg.scripts.precommit.includes("guidemd")) {
        pkg.scripts.precommit = `${pkg.scripts.precommit} && ${lintCmd}`;
      }
      
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
    } catch (e) {}
  }

  // 2. Determine which manager to use for the actual Git link
  const actualManager = manager === "auto" ? detectHookManager(projectRoot) : manager;

  if (actualManager === "husky") {
    return installHuskyHook(projectRoot);
  } else {
    return installRawHook(projectRoot);
  }
}

function installHuskyHook(projectRoot: string): HookInstallResult {
  const huskyDir = path.join(projectRoot, ".husky");

  // Ensure .husky directory exists
  if (!fs.existsSync(huskyDir)) {
    fs.mkdirSync(huskyDir, { recursive: true });
  }

  const hookPath = path.join(huskyDir, "pre-commit");

  // Check if hook already exists
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf-8");
    if (existing.includes("@guidemd/linter")) {
      return {
        success: false,
        manager: "husky",
        hookPath,
        message: "Guardian hook already installed in .husky/pre-commit"
      };
    }
    // Append to existing hook
    fs.appendFileSync(hookPath, "\n\n" + HUSKY_PRE_COMMIT);
  } else {
    fs.writeFileSync(hookPath, HUSKY_PRE_COMMIT, { mode: 0o755 });
  }

  return {
    success: true,
    manager: "husky",
    hookPath,
    message: "Guardian hook installed in .husky/pre-commit"
  };
}

function installRawHook(projectRoot: string): HookInstallResult {
  const gitDir = path.join(projectRoot, ".git");

  if (!fs.existsSync(gitDir)) {
    return {
      success: false,
      manager: "raw",
      hookPath: "",
      message: "Not a git repository. Run 'git init' first."
    };
  }

  const hooksDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // ── Cross-Platform Shell Detection ────────────────────────────────────────
  const useWinWrapper = isWindows() && !hasBash();

  if (useWinWrapper) {
    // Write both .cmd (universal) and .ps1 (PowerShell) for maximum compatibility
    const cmdPath = path.join(hooksDir, "pre-commit.cmd");
    const ps1Path = path.join(hooksDir, "pre-commit.ps1");

    if (fs.existsSync(cmdPath)) {
      const existing = fs.readFileSync(cmdPath, "utf-8");
      if (existing.includes("@guidemd/linter")) {
        return {
          success: false,
          manager: "raw",
          hookPath: cmdPath,
          message: "Guardian hook already installed in .git/hooks/pre-commit.cmd"
        };
      }
      fs.appendFileSync(cmdPath, "\n\n" + PRE_COMMIT_CMD);
    } else {
      fs.writeFileSync(cmdPath, PRE_COMMIT_CMD);
    }

    if (fs.existsSync(ps1Path)) {
      const existing = fs.readFileSync(ps1Path, "utf-8");
      if (!existing.includes("@guidemd/linter")) {
        fs.appendFileSync(ps1Path, "\n\n" + PRE_COMMIT_PS1);
      }
    } else {
      fs.writeFileSync(ps1Path, PRE_COMMIT_PS1);
    }

    return {
      success: true,
      manager: "raw",
      hookPath: cmdPath,
      message: "Guardian hook installed in .git/hooks/pre-commit.cmd (Windows wrapper)"
    };
  }

  // ── Standard Unix/Git-Bash path ─────────────────────────────────────────
  const hookPath = path.join(hooksDir, "pre-commit");

  // Check if hook already exists
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf-8");
    if (existing.includes("@guidemd/linter")) {
      return {
        success: false,
        manager: "raw",
        hookPath,
        message: "Guardian hook already installed in .git/hooks/pre-commit"
      };
    }
    // Append to existing hook
    fs.appendFileSync(hookPath, "\n\n" + PRE_COMMIT_CONTENT);
  } else {
    fs.writeFileSync(hookPath, PRE_COMMIT_CONTENT, { mode: 0o755 });
  }

  return {
    success: true,
    manager: "raw",
    hookPath,
    message: "Guardian hook installed in .git/hooks/pre-commit"
  };
}

export function uninstallHook(
  manager: HookManager = "auto",
  projectRoot: string = process.cwd()
): HookInstallResult {
  const actualManager = manager === "auto" ? detectHookManager(projectRoot) : manager;

  if (actualManager === "husky") {
    const hookPath = path.join(projectRoot, ".husky", "pre-commit");
    if (fs.existsSync(hookPath)) {
      const content = fs.readFileSync(hookPath, "utf-8");
      if (content.includes("@guidemd/linter")) {
        // Remove only our section if it's a compound hook
        const lines = content.split("\n");
        const startIdx = lines.findIndex(l => l.includes("@guidemd/linter"));
        if (startIdx !== -1) {
          // Find the previous empty line or start
          let removeStart = startIdx;
          while (removeStart > 0 && lines[removeStart - 1]?.trim() === "") {
            removeStart--;
          }
          const newContent = [...lines.slice(0, removeStart), ...lines.slice(startIdx + 25)].join("\n");
          fs.writeFileSync(hookPath, newContent, { mode: 0o755 });
          return {
            success: true,
            manager: "husky",
            hookPath,
            message: "Guardian hook removed from .husky/pre-commit"
          };
        }
      }
    }
    return {
      success: false,
      manager: "husky",
      hookPath,
      message: "Guardian hook not found in .husky/pre-commit"
    };
  } else {
    // ── Check for Windows wrappers first ──────────────────────────────────
    const useWinWrapper = isWindows() && !hasBash();

    if (useWinWrapper) {
      const cmdPath = path.join(projectRoot, ".git", "hooks", "pre-commit.cmd");
      const ps1Path = path.join(projectRoot, ".git", "hooks", "pre-commit.ps1");
      let removedAny = false;

      for (const wrapperPath of [cmdPath, ps1Path]) {
        if (fs.existsSync(wrapperPath)) {
          const content = fs.readFileSync(wrapperPath, "utf-8");
          if (content.includes("@guidemd/linter")) {
            // Remove only our section if it's a compound hook
            const lines = content.split("\n");
            const startIdx = lines.findIndex(l => l.includes("@guidemd/linter"));
            if (startIdx !== -1) {
              let removeStart = startIdx;
              while (removeStart > 0 && lines[removeStart - 1]?.trim() === "") {
                removeStart--;
              }
              const newContent = [...lines.slice(0, removeStart), ...lines.slice(startIdx + 25)].join("\n");
              if (newContent.trim().length === 0) {
                fs.unlinkSync(wrapperPath);
              } else {
                fs.writeFileSync(wrapperPath, newContent);
              }
              removedAny = true;
            }
          }
        }
      }

      if (removedAny) {
        return {
          success: true,
          manager: "raw",
          hookPath: cmdPath,
          message: "Guardian hook removed from Windows wrapper (.cmd/.ps1)"
        };
      }
    }

    // ── Standard Unix path ────────────────────────────────────────────────
    const hookPath = path.join(projectRoot, ".git", "hooks", "pre-commit");
    if (fs.existsSync(hookPath)) {
      const content = fs.readFileSync(hookPath, "utf-8");
      if (content.includes("@guidemd/linter")) {
        // Remove only our section if it's a compound hook
        const lines = content.split("\n");
        const startIdx = lines.findIndex(l => l.includes("@guidemd/linter"));
        if (startIdx !== -1) {
          let removeStart = startIdx;
          while (removeStart > 0 && lines[removeStart - 1]?.trim() === "") {
            removeStart--;
          }
          const newContent = [...lines.slice(0, removeStart), ...lines.slice(startIdx + 25)].join("\n");
          fs.writeFileSync(hookPath, newContent, { mode: 0o755 });
          return {
            success: true,
            manager: "raw",
            hookPath,
            message: "Guardian hook removed from .git/hooks/pre-commit"
          };
        }
      }
    }
    return {
      success: false,
      manager: "raw",
      hookPath,
      message: "Guardian hook not found in .git/hooks/pre-commit"
    };
  }
}
