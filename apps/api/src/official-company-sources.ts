type OfficialSource = {
  title: string;
  url: string;
  domain: string;
  pageType: string;
  identityCheck: "matched_company_name" | "not_confirmed";
  retrievedAt: string;
  evidence: Array<{ heading: string; paragraph: number; excerpt: string }>;
};

const entityTerms = (name: string) => name.toLowerCase()
  .replace(/,?\s+(incorporated|inc|corporation|corp|limited|ltd|plc|company|co)\.?$/i, "")
  .split(/[^a-z0-9]+/).filter(word => word.length > 2)
  .slice(0, 3);

function decodeHtml(value: string): string {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function plainText(html: string): string {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|li|h[1-6]|tr|section|article|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/[\t\r ]+/g, " ")
    .replace(/\n\s+/g, "\n").replace(/\n{2,}/g, "\n").trim());
}

function absoluteUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "https:" || !["http:", "https:"].includes(url.protocol)) return null;
    if (/\.(zip|exe|dmg|mp4|jpg|png)(\?|$)/i.test(url.pathname)) return null;
    return url.toString();
  } catch { return null; }
}

async function searchOfficialPages(query: string, terms: string[]): Promise<Array<{ title: string; url: string }>> {
  const endpoint = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
  const response = await fetch(endpoint, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CorpTraceResearch/1.0)", Accept: "text/html" } });
  if (!response.ok) return [];
  const html = await response.text();
  const results: Array<{ title: string; url: string }> = [];
  const blocks = html.match(/<div class="result[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi) ?? [];
  const source = blocks.length ? blocks.join("\n") : html;
  const links = [...source.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of links) {
    let href = decodeHtml(match[1]);
    try { const parsed = new URL(href, endpoint); href = parsed.searchParams.get("uddg") ?? href; } catch {}
    const url = absoluteUrl(href, endpoint);
    if (!url) continue;
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    // Only retain domains containing a distinctive company-name token.
    if (!terms.some(term => host.split(".").some(label => label === term || label.startsWith(term)))) continue;
    const title = plainText(link[0].replace(/<\\/a>$/i, "").replace(/^<a\\b[^>]*>/i, "")).slice(0, 180);
    if (!results.some(item => item.url === url)) results.push({ title: title || host, url });
    if (results.length >= 8) break;
  }
  return results;
}

function extractEvidence(html: string): Array<{ heading: string; paragraph: number; excerpt: string }> {
  const blocks = [...html.matchAll(/<(h[1-6]|p|li|td)[^>]*>([\s\S]*?)<\/\1>/gi)];
  let heading = "Page content";
  let paragraph = 0;
  const evidence: Array<{ heading: string; paragraph: number; excerpt: string }> = [];
  const patterns = [
    /\b(?:employees|workforce|team members|people worldwide|full.time employees)\b/i,
    /\b(?:headquarters|headquartered|principal executive office|based in)\b/i,
    /\b(?:offices|locations|facilities|campuses|countries|markets worldwide)\b/i,
    /\b(?:annual report|form 10-k|fiscal year 20\d\d|reporting year)\b/i,
  ];
  for (const block of blocks) {
    const tag = block[1].toLowerCase();
    const text = plainText(block[2]);
    if (!text) continue;
    if (tag.startsWith("h")) { heading = text.slice(0, 180); continue; }
    paragraph += 1;
    if (patterns.some(pattern => pattern.test(text))) {
      evidence.push({ heading, paragraph, excerpt: text.slice(0, 900) });
      if (evidence.length >= 18) break;
    }
  }
  return evidence;
}

export async function findOfficialCompanySources(companyName: string): Promise<{
  sourceSearch: string;
  retrievedAt: string;
  sources: OfficialSource[];
  notice: string;
}> {
  const terms = entityTerms(companyName);
  if (!terms.length) return { sourceSearch: "not_run", retrievedAt: new Date().toISOString(), sources: [], notice: "A distinctive company name was not available for official-source discovery." };
  const queries = [
    `"${companyName}" latest annual report investor relations`,
    `"${companyName}" employees headquarters official company website`,
  ];
  const results = (await Promise.all(queries.map(query => searchOfficialPages(query, terms)))).flat();
  const unique = results.filter((item, index) => results.findIndex(other => other.url === item.url) === index).slice(0, 8);
  const sources: OfficialSource[] = [];
  for (const result of unique) {
    try {
      const response = await fetch(result.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CorpTraceResearch/1.0)", Accept: "text/html,application/xhtml+xml" }, redirect: "follow" });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) continue;
      const finalUrl = response.url || result.url;
      const finalHost = new URL(finalUrl).hostname.toLowerCase().replace(/^www\./, "");
      if (!terms.some(term => finalHost.split(".").some(label => label === term || label.startsWith(term)))) continue;
      const html = (await response.text()).slice(0, 1_500_000);
      const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? result.title).replace(/<[^>]+>/g, " ").trim().slice(0, 180);
      const pageText = plainText(html);
      const companyIdentity = companyName.replace(/,?\\s+(incorporated|inc|corporation|corp|limited|ltd|plc|company|co)\\.?$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const identityCheck = title.toLowerCase().includes(companyIdentity) || pageText.toLowerCase().includes(companyIdentity)
        ? "matched_company_name" as const : "not_confirmed" as const;
      if (identityCheck !== "matched_company_name") continue;
      const evidence = extractEvidence(html);
      if (!evidence.length && !/annual report|investor|sec filing|10-k/i.test(title + " " + finalUrl)) continue;
      sources.push({
        title: title || result.title,
        url: finalUrl,
        domain: finalHost,
        pageType: /annual report|10-k/i.test(title + " " + finalUrl) ? "Annual report / filing page" : /investor|financial/i.test(title + " " + finalUrl) ? "Investor relations page" : "Company website page",
        identityCheck,
        retrievedAt: new Date().toISOString(),
        evidence,
      });
    } catch { /* A single unreachable official page must not stop the research run. */ }
  }
  return {
    sourceSearch: "internet_search_restricted_to_company_domain_candidates",
    retrievedAt: new Date().toISOString(),
    sources,
    notice: "Pages are retained only when the HTTPS host matches a distinctive company-name token and the page title or body contains the company name. This is an automated identity check, not independent proof of domain ownership. Paragraph numbers refer to extracted HTML text-block order, not printed PDF page numbers.",
  };
}
