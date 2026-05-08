export function extractFirstTemplateByPrefix(wikitext: string, prefix: string) {
  const regex = new RegExp(`\\{\\{\\s*${escapeRegExp(prefix)}`, "i");
  const match = regex.exec(wikitext);
  if (!match) return null;
  return extractBalancedTemplate(wikitext, match.index);
}

export function extractTemplatesByNamePrefix(wikitext: string, prefix: string, limit = 300) {
  const regex = new RegExp(`\\{\\{\\s*${escapeRegExp(prefix)}`, "gi");
  const templates: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(wikitext)) && templates.length < limit) {
    const template = extractBalancedTemplate(wikitext, match.index);
    if (template) templates.push(template);
    regex.lastIndex = match.index + 2;
  }

  return templates;
}

export function parseTemplate(template: string) {
  const trimmed = template.trim();
  const inner = trimmed.startsWith("{{") && trimmed.endsWith("}}") ? trimmed.slice(2, -2) : trimmed;
  const parts = splitTopLevel(inner, "|");
  const name = parts.shift()?.trim() ?? "";
  const params: Record<string, string> = {};
  const positional: string[] = [];

  for (const part of parts) {
    const eqIndex = findTopLevelChar(part, "=");
    if (eqIndex > 0) {
      const key = part.slice(0, eqIndex).trim().toLowerCase();
      const value = part.slice(eqIndex + 1).trim();
      params[key] = value;
    } else {
      positional.push(part.trim());
    }
  }

  return { name, params, positional };
}

export function extractSection(wikitext: string, names: string[]) {
  const escaped = names.map(escapeRegExp).join("|");
  const regex = new RegExp(`^={2,5}\\s*(?:${escaped})\\s*={2,5}\\s*$`, "gim");
  const match = regex.exec(wikitext);
  if (!match) return null;

  const start = match.index + match[0].length;
  const nextHeadingRegex = /^={2,5}\s*[^=]+\s*={2,5}\s*$/gim;
  nextHeadingRegex.lastIndex = start;
  const next = nextHeadingRegex.exec(wikitext);
  const end = next ? next.index : wikitext.length;

  return wikitext.slice(start, end).trim();
}

export function cleanWikiValue(value?: string | null) {
  if (!value) return null;
  let output = value;

  output = output.replace(/<!--.*?-->/gs, "");
  output = output.replace(/<ref[^>]*>.*?<\/ref>/gis, "");
  output = output.replace(/<ref[^/>]*\/>/gis, "");
  output = output.replace(/<br\s*\/?\s*>/gi, ", ");

  // Replace simple templates with their first useful positional value.
  let previous = "";
  while (previous !== output) {
    previous = output;
    output = output.replace(/\{\{([^{}]+)\}\}/g, (_match, inner: string) => {
      const parts = inner.split("|").map((part) => part.trim()).filter(Boolean);
      const positional = parts.slice(1).find((part) => !part.includes("="));
      const named = parts.slice(1).find((part) => part.includes("=") && part.split("=")[1]?.trim());
      if (positional) return positional;
      if (named) return named.split("=").slice(1).join("=").trim();
      return "";
    });
  }

  output = output.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  output = output.replace(/\[\[([^\]]+)\]\]/g, "$1");
  output = output.replace(/'''/g, "").replace(/''/g, "");
  output = output.replace(/<[^>]+>/g, "");
  output = output.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'");
  output = output.replace(/\s+/g, " ").trim();

  return output.length > 0 ? output : null;
}

export function parseWikiDate(value?: string | null) {
  const cleaned = cleanWikiValue(value);
  if (!cleaned) return null;

  const isoWithTime = cleaned.match(/(20\d{2}|19\d{2})[-/]([01]?\d)[-/]([0-3]?\d)[ T]([0-2]?\d):([0-5]\d)(?::([0-5]\d))?/);
  if (isoWithTime) {
    const [, year, month, day, hour, min, sec] = isoWithTime;
    // ТАК КАК МЫ РАБОТАЕМ С МСК (UTC+3), мы создаем дату и вычитаем 3 часа, чтобы в UTC она была верной
    const date = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${min.padStart(2, "0")}:${(sec || "00").padStart(2, "0")}Z`);
    date.setUTCHours(date.getUTCHours() + 3); // Forced MSK shift
    return date;
  }

  const iso = cleaned.match(/(20\d{2}|19\d{2})[-/]([01]?\d)[-/]([0-3]?\d)/);
  if (iso) {
    const [, year, month, day] = iso;
    return new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`);
  }

  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

export function parseInteger(value?: string | null) {
  const cleaned = cleanWikiValue(value);
  if (!cleaned) return null;
  const match = cleaned.match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function extractBalancedTemplate(wikitext: string, startIndex: number) {
  let depth = 0;

  for (let index = startIndex; index < wikitext.length - 1; index++) {
    const pair = wikitext.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      index += 1;
      continue;
    }
    if (pair === "}}") {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        return wikitext.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function splitTopLevel(input: string, delimiter: string) {
  const parts: string[] = [];
  let current = "";
  let curlyDepth = 0;
  let squareDepth = 0;

  for (let index = 0; index < input.length; index++) {
    const pair = input.slice(index, index + 2);

    if (pair === "{{") {
      curlyDepth += 1;
      current += pair;
      index += 1;
      continue;
    }

    if (pair === "}}") {
      curlyDepth = Math.max(0, curlyDepth - 1);
      current += pair;
      index += 1;
      continue;
    }

    if (pair === "[[") {
      squareDepth += 1;
      current += pair;
      index += 1;
      continue;
    }

    if (pair === "]]") {
      squareDepth = Math.max(0, squareDepth - 1);
      current += pair;
      index += 1;
      continue;
    }

    const char = input[index];
    if (char === delimiter && curlyDepth === 0 && squareDepth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  parts.push(current);
  return parts;
}

function findTopLevelChar(input: string, charToFind: string) {
  let curlyDepth = 0;
  let squareDepth = 0;

  for (let index = 0; index < input.length; index++) {
    const pair = input.slice(index, index + 2);
    if (pair === "{{") {
      curlyDepth += 1;
      index += 1;
      continue;
    }
    if (pair === "}}") {
      curlyDepth = Math.max(0, curlyDepth - 1);
      index += 1;
      continue;
    }
    if (pair === "[[") {
      squareDepth += 1;
      index += 1;
      continue;
    }
    if (pair === "]]") {
      squareDepth = Math.max(0, squareDepth - 1);
      index += 1;
      continue;
    }
    if (input[index] === charToFind && curlyDepth === 0 && squareDepth === 0) {
      return index;
    }
  }

  return -1;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
