import { GuideMdFrontmatter } from "../schema/index.js";

// Security: Maximum line length to prevent ReDoS attacks
const MAX_LINE_LENGTH = 10000;
// Security: Maximum section name length
const MAX_SECTION_NAME_LENGTH = 200;
// Security: Maximum content processing size
const MAX_CONTENT_SIZE = 5 * 1024 * 1024;

export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

// Define resources array (will be frozen before export)
const RESOURCES_DEFINITION: McpResource[] = [
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

// Export frozen copy to prevent runtime mutation
export const RESOURCES: readonly McpResource[] = Object.freeze([...RESOURCES_DEFINITION]);

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

/**
 * Validates that section extraction inputs are safe.
 */
function validateExtractionInputs(content: string, sectionName: string): string | null {
  // Check content size
  if (content.length > MAX_CONTENT_SIZE) {
    return "Content too large for section extraction";
  }
  
  // Check section name length
  if (sectionName.length > MAX_SECTION_NAME_LENGTH) {
    return `Section name too long (max ${MAX_SECTION_NAME_LENGTH} characters)`;
  }
  
  return null;
}

/**
 * Safely extracts a heading level from a line without using regex.
 */
function extractHeadingLevel(line: string): { level: number; text: string } | null {
  // Skip if line is too long (ReDoS protection)
  if (line.length > MAX_LINE_LENGTH) {
    return null;
  }
  
  // Count leading # characters manually
  let level = 0;
  for (let i = 0; i < line.length && i < 6; i++) {
    if (line[i] === "#") {
      level++;
    } else {
      break;
    }
  }
  
  // Must have at least one # and must be followed by whitespace
  if (level === 0 || level > 6) {
    return null;
  }
  
  // Check for whitespace after hashes
  const charAfterHashes = line[level];
  if (line.length <= level || !charAfterHashes || !/[\s]/.test(charAfterHashes)) {
    return null;
  }
  
  // Extract heading text
  const text = line.slice(level + 1).trim();
  
  return { level, text };
}

function extractSection(content: string, sectionName: string): string {
  // Validate inputs first
  const validationError = validateExtractionInputs(content, sectionName);
  if (validationError) {
    return `Error: ${validationError}`;
  }
  
  const lines = content.split("\n");
  let capturing = false;
  let result: string[] = [];
  let currentLevel = 0;

  for (const line of lines) {
    const heading = extractHeadingLevel(line);
    
    if (heading) {
      const { level, text } = heading;
      
      if (text === sectionName) {
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
