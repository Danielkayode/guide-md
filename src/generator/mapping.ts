// ─── Smart Mapping: GUIDE.md H2 → README.md Section ─────────────────────────────
// Extracts content from specific H2 headers in the GUIDE.md markdown body
// and maps them to human-readable README sections.

export interface MappedSection {
  guideHeader: string;
  readmeHeader: string;
  content: string;
}

const HEADER_MAP: Record<string, string> = {
  "Project Overview": "About This Project",
  "Domain Vocabulary": "Terminology",
  "Non-Obvious Decisions": "Architecture Decisions",
  "What NOT to do": "Anti-Patterns",
};

/**
 * Extracts content under a specific H2 header from markdown text.
 * Captures everything until the next H2 of equal or higher level.
 */
export function extractSection(content: string, headerName: string): string {
  const lines = content.split("\n");
  let capturing = false;
  const result: string[] = [];
  let currentLevel = 0;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+/);

    if (headerMatch && headerMatch[1]) {
      const level = headerMatch[1].length;
      const headerText = line.replace(/^#{1,6}\s+/, "").trim();

      if (headerText === headerName) {
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

  return result.join("\n").trim();
}

/**
 * Applies the smart header mapping to extract all known sections.
 */
export function extractMappedSections(content: string): MappedSection[] {
  const sections: MappedSection[] = [];

  for (const [guideHeader, readmeHeader] of Object.entries(HEADER_MAP)) {
    const sectionContent = extractSection(content, guideHeader);
    if (sectionContent && sectionContent.length > 5) {
      sections.push({
        guideHeader,
        readmeHeader,
        content: sectionContent,
      });
    }
  }

  return sections;
}

/**
 * Renders mapped sections as a Markdown string for insertion into README.
 */
export function renderMappedSections(sections: MappedSection[]): string {
  if (sections.length === 0) return "";

  return sections
    .map(
      (s) =>
        `## ${s.readmeHeader}\n\n${s.content}\n`
    )
    .join("\n");
}
