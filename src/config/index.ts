import fs from "node:fs";
import path from "node:path";

export const CONFIG_FILENAMES = ["guidemd.config.json", "guidemd.config.jsonc"];

export interface GuideMdConfig {
  file?: string;
  lint?: {
    json?: boolean;
    fix?: boolean;
    sync?: boolean;
    stats?: boolean;
    skipSecretScan?: boolean;
  };
  info?: {
    minScore?: number;
  };
  export?: {
    target?: string;
    out?: string;
    manifest?: boolean;
  };
  doctor?: {
    fix?: boolean;
  };
}

const COMMENT_RE = /^\s*\/\/.*$/gm;
const TRAILING_COMMA_RE = /,\s*([\]}])/g;

/**
 * Loads guidemd.config.json from the project root (cwd), with JSONC
 * (comments + trailing commas) tolerance. Returns {} when no config exists.
 */
export function loadConfig(projectRoot: string = process.cwd()): GuideMdConfig {
  for (const name of CONFIG_FILENAMES) {
    const configPath = path.join(projectRoot, name);
    if (fs.existsSync(configPath)) {
      try {
        let raw = fs.readFileSync(configPath, "utf-8");
        // JSONC tolerance: strip // comments and trailing commas
        raw = raw.replace(COMMENT_RE, "").replace(TRAILING_COMMA_RE, "$1");
        return JSON.parse(raw) as GuideMdConfig;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        console.warn(
          chalkYellow(`Warning: Failed to load ${configPath} (${reason}). Using defaults.`),
        );
        return {};
      }
    }
  }
  return {};
}

function chalkYellow(text: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { chalk } = require("chalk");
    return chalk.yellow(text);
  } catch {
    return text;
  }
}
