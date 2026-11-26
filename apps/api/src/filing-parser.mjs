export export function cleanFilingText(html): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "\n")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "\n")
    .replace(/<!--[\s\S]*?-->/g, "\n")
    .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|header|footer|h[1-6]|li|tr|table|ul|ol|blockquote|pre)\s*>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>/gi, " | ")
    .replace(/<(?:p|div|section|article|header|footer|h[1-6]|li|tr|table|ul|ol|blockquote|pre)\b[^>]*>/gi, "\n")
    .replace(/<(?:td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCharCode(parseInt(code, 16)))
    .split(/\r?\n/)
    .map(line => line.replace(/[ \t\f\v]+/g, " ").replace(/\s+\|\s+/g, " | ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findSectionHeading(text: string, patterns) {
  const lines = text.split("\n");
  const candidates: SectionHeading[] = [];
  let offset = 0;
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber].trim();
    if (line.length <= 240 && patterns.some(pattern => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    })) candidates.push({ index: offset, line: lineNumber, heading: line });
    offset += lines[lineNumber].length + 1;
  }
  if (!candidates.length) return null;

  const itemLine = /^\s*ITEM\s+(?:1A|1B|1C|2|3|4|5|6|7A|7B|7|8|9A|9B|9C|9|10|11|12|13|14|15)\b/i;
  const scored = candidates.map(candidate => {
    const following = lines.slice(candidate.line + 1, candidate.line + 18);
    const nextItem = following.findIndex(line => itemLine.test(line));
    const bodyLines = (nextItem < 0 ? following : following.slice(0, nextItem))
      .filter(line => line.trim().length > 45);
    return { candidate, score: bodyLines.length + (candidate.heading.length < 180 ? 1 : 0) };
  });
  scored.sort((a, b) => b.score - a.score || a.candidate.index - b.candidate.index);
  const best = scored[0];
  return best && best.score >= 2 ? best.candidate : null;
}

export function extractItemSection(text: string, patterns: RegExp[]) {
  const heading = findSectionHeading(text, patterns);
  if (!heading) return null;
  const lines = text.split("\n");
  const itemLine = /^\s*ITEM\s+(?:1A|1B|1C|2|3|4|5|6|7A|7B|7|8|9A|9B|9C|9|10|11|12|13|14|15)\b/i;
  let endLine = lines.length;
  for (let i = heading.line + 1; i < lines.length; i++) {
    if (itemLine.test(lines[i]) && lines[i].trim().length < 180) {
      endLine = i;
      break;
    }
  }
  const section = lines.slice(heading.line, endLine).join("\n").trim();
  return section.slice(0, 14000) || null;
}
