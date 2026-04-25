import fs from "node:fs";
import path from "node:path";

export interface EcosystemDetectionResult {
  language: string | null;
  framework: string | null;
  runtime: string | null;
  paradigm: "oop" | "functional" | "mixed" | "imperative" | "procedural" | null;
}

interface MarkerFile {
  file: string;
  language: string;
  frameworkDetectors?: Array<{
    read: (content: string) => string | null;
    framework: string;
  }>;
  runtimeDetector?: (content: string) => string | null;
}

const ECOSYSTEM_MARKERS: MarkerFile[] = [
  // Python
  {
    file: "pyproject.toml",
    language: "python",
    frameworkDetectors: [
      {
        read: (content) => /django|djangorestframework/i.test(content) ? "django" : null,
        framework: "django",
      },
      {
        read: (content) => /fastapi/i.test(content) ? "fastapi" : null,
        framework: "fastapi",
      },
      {
        read: (content) => /flask/i.test(content) ? "flask" : null,
        framework: "flask",
      },
      {
        read: (content) => /tornado/i.test(content) ? "tornado" : null,
        framework: "tornado",
      },
    ],
  },
  {
    file: "requirements.txt",
    language: "python",
    frameworkDetectors: [
      {
        read: (content) => /django|djangorestframework/i.test(content) ? "django" : null,
        framework: "django",
      },
      {
        read: (content) => /fastapi/i.test(content) ? "fastapi" : null,
        framework: "fastapi",
      },
      {
        read: (content) => /flask/i.test(content) ? "flask" : null,
        framework: "flask",
      },
      {
        read: (content) => /tornado/i.test(content) ? "tornado" : null,
        framework: "tornado",
      },
    ],
  },
  {
    file: "setup.py",
    language: "python",
  },
  {
    file: "Pipfile",
    language: "python",
  },
  {
    file: "poetry.lock",
    language: "python",
  },
  // Rust
  {
    file: "Cargo.toml",
    language: "rust",
    frameworkDetectors: [
      {
        read: (content) => /actix-web/i.test(content) ? "actix" : null,
        framework: "actix",
      },
      {
        read: (content) => /axum/i.test(content) ? "axum" : null,
        framework: "axum",
      },
      {
        read: (content) => /rocket/i.test(content) ? "rocket" : null,
        framework: "rocket",
      },
    ],
    runtimeDetector: (content) => /tokio/i.test(content) ? "async" : null,
  },
  // Go
  {
    file: "go.mod",
    language: "go",
    frameworkDetectors: [
      {
        read: (content) => /gin-gonic\/gin/i.test(content) ? "gin" : null,
        framework: "gin",
      },
      {
        read: (content) => /labstack\/echo/i.test(content) ? "echo" : null,
        framework: "echo",
      },
      {
        read: (content) => /gofiber\/fiber/i.test(content) ? "fiber" : null,
        framework: "fiber",
      },
      {
        read: (content) => /gorilla\/mux/i.test(content) ? "gorilla" : null,
        framework: "gorilla",
      },
    ],
  },
  // Java/Kotlin
  {
    file: "pom.xml",
    language: "java",
    frameworkDetectors: [
      {
        read: (content) => /spring-boot/i.test(content) ? "spring-boot" : null,
        framework: "spring-boot",
      },
      {
        read: (content) => /quarkus/i.test(content) ? "quarkus" : null,
        framework: "quarkus",
      },
      {
        read: (content) => /micronaut/i.test(content) ? "micronaut" : null,
        framework: "micronaut",
      },
    ],
  },
  {
    file: "build.gradle",
    language: "java",
    frameworkDetectors: [
      {
        read: (content) => /spring-boot/i.test(content) ? "spring-boot" : null,
        framework: "spring-boot",
      },
      {
        read: (content) => /quarkus/i.test(content) ? "quarkus" : null,
        framework: "quarkus",
      },
      {
        read: (content) => /micronaut/i.test(content) ? "micronaut" : null,
        framework: "micronaut",
      },
    ],
  },
  {
    file: "build.gradle.kts",
    language: "kotlin",
    frameworkDetectors: [
      {
        read: (content) => /spring-boot/i.test(content) ? "spring-boot" : null,
        framework: "spring-boot",
      },
      {
        read: (content) => /quarkus/i.test(content) ? "quarkus" : null,
        framework: "quarkus",
      },
      {
        read: (content) => /micronaut/i.test(content) ? "micronaut" : null,
        framework: "micronaut",
      },
    ],
  },
  // PHP
  {
    file: "composer.json",
    language: "php",
    frameworkDetectors: [
      {
        read: (content) => /laravel\/framework/i.test(content) ? "laravel" : null,
        framework: "laravel",
      },
      {
        read: (content) => /symfony\/symfony/i.test(content) ? "symfony" : null,
        framework: "symfony",
      },
      {
        read: (content) => /slim\/slim/i.test(content) ? "slim" : null,
        framework: "slim",
      },
    ],
  },
  // Ruby
  {
    file: "Gemfile",
    language: "ruby",
    frameworkDetectors: [
      {
        read: (content) => /rails/i.test(content) ? "rails" : null,
        framework: "rails",
      },
      {
        read: (content) => /sinatra/i.test(content) ? "sinatra" : null,
        framework: "sinatra",
      },
      {
        read: (content) => /hanami/i.test(content) ? "hanami" : null,
        framework: "hanami",
      },
    ],
  },
  // C/C++
  {
    file: "CMakeLists.txt",
    language: "cpp",
  },
  {
    file: "Makefile",
    language: "c",
  },
  {
    file: "meson.build",
    language: "cpp",
  },
  {
    file: "conanfile.txt",
    language: "cpp",
  },
  // Swift
  {
    file: "Package.swift",
    language: "swift",
    frameworkDetectors: [
      {
        read: (content) => /vapor/i.test(content) ? "vapor" : null,
        framework: "vapor",
      },
    ],
  },
  // Dart/Flutter
  {
    file: "pubspec.yaml",
    language: "dart",
    frameworkDetectors: [
      {
        read: (content) => /flutter:/i.test(content) ? "flutter" : null,
        framework: "flutter",
      },
    ],
  },
  // Elixir
  {
    file: "mix.exs",
    language: "elixir",
    frameworkDetectors: [
      {
        read: (content) => /phoenix/i.test(content) ? "phoenix" : null,
        framework: "phoenix",
      },
    ],
  },
];

function walkTopLevel(projectRoot: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(projectRoot, entry.name);
      if (entry.isFile()) {
        results.push(entry.name);
      } else if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        // One level deep
        try {
          const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
          for (const subEntry of subEntries) {
            if (subEntry.isFile()) {
              results.push(`${entry.name}/${subEntry.name}`);
            }
          }
        } catch {
          // Skip unreadable subdirectories
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return results;
}

function checkXcodeproj(projectRoot: string): boolean {
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    return entries.some(entry => entry.isDirectory() && entry.name.endsWith(".xcodeproj"));
  } catch {
    return false;
  }
}

function detectLanguageFromFiles(projectRoot: string): string | null {
  // Check for .kt files majority (Kotlin vs Java)
  let javaCount = 0;
  let kotlinCount = 0;
  
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        if (entry.name.endsWith(".java")) javaCount++;
        if (entry.name.endsWith(".kt") || entry.name.endsWith(".kts")) kotlinCount++;
      }
    }
  } catch {
    // Ignore errors
  }
  
  if (kotlinCount > javaCount) return "kotlin";
  if (javaCount > 0) return "java";
  return null;
}

export function detectEcosystem(projectRoot: string): EcosystemDetectionResult {
  const result: EcosystemDetectionResult = {
    language: null,
    framework: null,
    runtime: null,
    paradigm: null,
  };

  const files = walkTopLevel(projectRoot);
  const fileSet = new Set(files);

  // Check for Xcode projects (Swift)
  if (checkXcodeproj(projectRoot)) {
    result.language = "swift";
  }

  // Process markers in order of specificity
  for (const marker of ECOSYSTEM_MARKERS) {
    if (!fileSet.has(marker.file)) continue;

    const filePath = path.join(projectRoot, marker.file);
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    // Set language
    result.language = marker.language;

    // Detect framework
    if (marker.frameworkDetectors) {
      for (const detector of marker.frameworkDetectors) {
        const detected = detector.read(content);
        if (detected) {
          result.framework = detected;
          break;
        }
      }
    }

    // Detect runtime
    if (marker.runtimeDetector) {
      const runtime = marker.runtimeDetector(content);
      if (runtime) {
        result.runtime = runtime;
      }
    }

    // Java/Kotlin file-based detection override
    if (marker.language === "java" || marker.language === "kotlin") {
      const fileBasedLang = detectLanguageFromFiles(projectRoot);
      if (fileBasedLang) {
        result.language = fileBasedLang;
      }
    }

    // Dart/Flutter: paradigm is always OOP
    if (marker.language === "dart") {
      result.paradigm = "oop";
    }

    // Elixir: paradigm is always functional
    if (marker.language === "elixir") {
      result.paradigm = "functional";
    }

    // C/C++: paradigm is always imperative
    if (marker.language === "c" || marker.language === "cpp") {
      result.paradigm = "imperative";
    }

    // Go: paradigm is always procedural
    if (marker.language === "go") {
      result.paradigm = "procedural";
    }

    // Found a primary marker, stop searching
    break;
  }

  return result;
}
