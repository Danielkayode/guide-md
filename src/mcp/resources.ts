import { GuideMdFrontmatter } from "../schema/index.js";

export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export const RESOURCES: McpResource[] = [
  {
    uri: "guidemd://frontmatter",
    name: "GUIDE.md Frontmatter",
    description: "Complete frontmatter configuration as structured JSON",
    mimeType: "application/json"
  },
  {
    uri: "guidemd://overview",
    name: "Project Overview",
    description: "AI Instructions / Project Overview section content",
    mimeType: "text/markdown"
  },
  {
    uri: "guidemd://domain",
    name: "Domain Vocabulary",
    description: "Domain-specific terms and definitions for consistent naming",
    mimeType: "text/markdown"
  },
  {
    uri: "guidemd://decisions",
    name: "Non-Obvious Decisions",
    description: "Architectural decisions that might seem unusual",
    mimeType: "text/markdown"
  },
  {
    uri: "guidemd://antipatterns",
    name: "What NOT to do",
    description: "Anti-patterns specific to this codebase",
    mimeType: "text/markdown"
  }
];

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export function readResource(uri: string, data: GuideMdFrontmatter, fullContent: string): ResourceContent | null {
  switch (uri) {
    case "guidemd://frontmatter":
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2)
      };

    case "guidemd://overview":
      return {
        uri,
        mimeType: "text/markdown",
        text: extractSection(fullContent, "Project Overview")
      };

    case "guidemd://domain":
      return {
        uri,
        mimeType: "text/markdown",
        text: extractSection(fullContent, "Domain Vocabulary")
      };

    case "guidemd://decisions":
      return {
        uri,
        mimeType: "text/markdown",
        text: extractSection(fullContent, "Non-Obvious Decisions")
      };

    case "guidemd://antipatterns":
      return {
        uri,
        mimeType: "text/markdown",
        text: extractSection(fullContent, "What NOT to do")
      };

    default:
      return null;
  }
}

function extractSection(content: string, sectionName: string): string {
  const lines = content.split("\n");
  let capturing = false;
  let result: string[] = [];
  let currentLevel = 0;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+/);
    
    if (headerMatch && headerMatch[1]) {
      const level = headerMatch[1].length;
      const headerText = line.replace(/^#{1,6}\s+/, "").trim();
      
      if (headerText === sectionName) {
        capturing = true;
        currentLevel = level;
        continue;
      }
      
      if (capturing && level <= currentLevel) {
        break;
      }
    }
    
    if (capturing) {
      result.push(line);
    }
  }

  return result.join("\n").trim() || `Section "${sectionName}" not found in GUIDE.md`;
}
