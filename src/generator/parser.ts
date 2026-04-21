// ─── Simple Template Engine ──────────────────────────────────────────────────
// Lightweight {{variable}} parser — no external dependencies.
// Supports: {{field}}, {{#if field}}...{{/if}}, {{#each field}}...{{/each}}

function getValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

export function renderTemplate(template: string, data: Record<string, unknown>): string {
  let result = template;

  // ── Iteration: {{#each field}} ... {{/each}}
  result = result.replace(
    /\{\{#each\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, path: string, inner: string) => {
      const arr = getValue(data, path);
      if (!Array.isArray(arr)) return "";
      return arr
        .map((item) => {
          const itemData: Record<string, unknown> =
            typeof item === "object" && item !== null
              ? { ...data, ...item }
              : { ...data, this: item };
          return renderTemplate(inner, itemData);
        })
        .join("");
    }
  );

  // ── Conditionals: {{#if field}} ... {{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, path: string, inner: string) => {
      const value = getValue(data, path);
      return isTruthy(value) ? renderTemplate(inner, data) : "";
    }
  );

  // ── Negated conditionals: {{#unless field}} ... {{/unless}}
  result = result.replace(
    /\{\{#unless\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_match, path: string, inner: string) => {
      const value = getValue(data, path);
      return !isTruthy(value) ? renderTemplate(inner, data) : "";
    }
  );

  // ── Variable substitution: {{field}} or {{field.subfield}}
  result = result.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
    const value = getValue(data, path);
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return String(value);
    return "";
  });

  return result;
}
