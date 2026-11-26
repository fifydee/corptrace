type Evidence = { heading: string; paragraph: number; excerpt: string };
type CompanySource = {
  title: string; url: string; domain: string; sourceType: "company" | "regulator" | "business_publication" | "other";
  retrievedAt: string; evidence: Evidence[];
};
type CompanyFact = {
  key: string; label: string; value: string; sourceTitle: string; sourceUrl: string;
  sourceType: CompanySource["sourceType"]; evidence: string; retrievedAt: string;
};
const normalise = (s: string) => s.toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]+/g, " ").trim();
const companyTerms = (name: string) => normalise(name)
  .replace(/\b(incorporated|inc|corporation|corp|limited|ltd|plc|company|co)\b/g, "")
  .split(/\s+/).filter(x => x.length > 2).slice(0, 4);
export function decode(value: string): string {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}
export function textOf(html: string): string {
  const withoutNonContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const withBoundaries = withoutNonContent.replace(
    /<\/(p|li|h[1-6]|tr|section|article|div)>/gi,
    String.fromCharCode(10)
  );
  const plain = withBoundaries.replace(/<[^>]+>/g, " ");
  return decode(plain)
    .replace(/[\t\r ]+/g, " ")
    .replace(new RegExp(String.fromCharCode(10) + "\\s+", "g"), String.fromCharCode(10))
    .replace(new RegExp(String.fromCharCode(10) + "{2,}", "g"), String.fromCharCode(10))
    .trim();
}
export function cleanUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "https:" || /\.(zip|exe|dmg|mp4|jpg|png)(\?|$)/i.test(u.pathname)) return null;
    if (u.hostname.includes("duckduckgo.com")) {
      const target = u.searchParams.get("uddg");
      if (target) return cleanUrl(decodeURIComponent(target), base);
    }
    return u.toString();
  } catch { return null; }
}
async function searchWeb(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const endpoint = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
  const response = await fetch(endpoint, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CorpTraceResearch/2.0)",
      "Accept": "text/html"
    }
  });
  if (!response.ok) return [];

  const html = await response.text();
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const matches = [...html.matchAll(/<div class="result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)];
  const source = matches.length ? matches.map(match => match[1]).join(String.fromCharCode(10)) : html;

  for (const match of source.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = cleanUrl(decode(match[1]), endpoint);
    if (!url || results.some(item => item.url === url)) continue;

    const offset = match.index ?? 0;
    const after = source.slice(offset, offset + 2400);
    const snippetMatch = after.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    results.push({
      title: textOf(match[2]).slice(0, 180),
      url,
      snippet: textOf(snippetMatch?.[1] ?? snippetMatch?.[2] ?? "").slice(0, 500)
    });
    if (results.length >= 10) break;
  }
  return results;
}

export function classify(url: string, companyName: string): CompanySource["sourceType"] {
  const host = new URL(url).hostname.toLowerCase();
  if (/(sec\.gov|companieshouse\.gov)/.test(host)) return "regulator";
  if (/(forbes\.com|businessinsider\.com|reuters\.com|bloomberg\.com|wsj\.com|ft\.com|cnbc\.com|apnews\.com|bbc\.com|theguardian\.com|fortune\.com|nytimes\.com)/.test(host)) return "business_publication";
  const labels = host.split(".");
  return companyTerms(companyName).some(term => labels.some(label => label === term)) ? "company" : "other";
}
export function extractBlocks(html: string): Evidence[] {
  const blocks=[...html.matchAll(/<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi)];
  let heading="Page content", paragraph=0; const out:Evidence[]=[];
  const include=/\b(founded|established|headquarters|headquartered|principal executive office|employees|workforce|team members|products|services|solutions|operates in|operates|across .* countries|more than [0-9,]+ countries|over [0-9,]+ countries|countries|offices|locations|facilities|manufacturing sites|people worldwide|business segments|what we do|designs|manufactures|sells|provides|serves customers|global technology|is a global|is an international|is a leading|is a provider|is a manufacturer|is a retailer|is a technology|speciali[sz]es in)\b/i;
  const exclude=/\b(stock[- ]based compensation|stock incentive plan|share[- ]based compensation|principal accountant fees|consolidated financial statements|revenue allocated|income taxes|deferred tax|pension plan|retirement plan|fair value|earnings per share|net income|accounts receivable|lease liabilities|debt maturity|interest rate|share repurchase|dividend|audit fees|related party|financial instruments|segment operating income|weighted average|unrecognized compensation|vesting period|tax provision|effective tax rate|share-based awards|stock options|restricted stock units|defined benefit|defined contribution|cash flows from|depreciation and amortization|impairment charge|goodwill|intangible assets|operating lease|finance lease)\b/i;
  for(const block of blocks){
    const tag=block[1].toLowerCase(), t=textOf(block[2]).replace(/\s+/g," ").trim(); if(!t) continue;
    if(tag.startsWith("h")){heading=t.slice(0,160);continue;}
    paragraph++;
    if(t.length<55 || t.length>1800 || !include.test(t) || exclude.test(heading+" "+t)) continue;
    if(/^the following table|^see (the )?table|^for additional information/i.test(t)) continue;
    const sentences=t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(sentence => include.test(sentence) && !exclude.test(sentence) && !/^the following table|^see (the )?table/i.test(sentence));
    if(!sentences.length) continue;
    const concise=sentences.slice(0,3).join(" ").slice(0,720);
    const cleaned=concise.charAt(0).toUpperCase()+concise.slice(1);
    out.push({heading,paragraph,excerpt:cleaned});
    if(out.length>=36) break;
  }
  return out;
}
export function extractFacts(sources: CompanySource[]): CompanyFact[] {
  const definitions: Array<{key:string;label:string;re:RegExp}>=[
    {key:"business",label:"Company overview",re:/\b((?:is|are)\s+(?:a|an)\s+[^.!?]{15,220}(?:company|provider|manufacturer|technology|retailer|platform|business|services|products)[^.!?]{0,180})[.!?]/i},
    {key:"founded",label:"Founded",re:/\b(?:founded|established|incorporated)\s+(?:in\s+)?(?:in\s+)?(?:the year\s+)?(\d{4})\b/i},
    {key:"headquarters",label:"Headquarters",re:/\b(?:headquartered\s+(?:in|at)|headquarters(?:\s+(?:are|is))?\s+(?:located\s+)?(?:in|at)|based\s+(?:in|at))\s+([^.;]{3,100})/i},
    {key:"employees",label:"Employees",re:/\b(?:approximately\s+|about\s+|more than\s+|over\s+)?([\d,]+(?:\.\d+)?\s*(?:million|thousand)?)\s+(?:employees|team members|people)\b/i},
    {key:"offices",label:"Offices / locations",re:/\b([\d,]+)\s+(?:offices|office locations|locations|sites)\b/i},
    {key:"countries",label:"Countries of operation",re:/\b(?:operates in|operate in|operates across|operating in|across|in)\s+(?:more than\s+|over\s+)?([\d,]+)\s+countries\b/i},
  ];
  const found = new Map<string,CompanyFact>();
  for(const s of sources) for(const e of s.evidence){
    for(const d of definitions){const m=e.excerpt.match(d.re); if(m && !found.has(d.key)) found.set(d.key,{key:d.key,label:d.label,value:m[1].trim(),sourceTitle:s.title,sourceUrl:s.url,sourceType:s.sourceType,evidence:e.excerpt,retrievedAt:s.retrievedAt});}
  }
  return [...found.values()];
}
export async function findOfficialCompanySources(companyName:string, selectedTopics:string[] = []):Promise<{
  sourceSearch:string;retrievedAt:string;notice:string;sources:CompanySource[];facts:CompanyFact[];
  overview:string|null;
}>{
  const terms=companyTerms(companyName), qName='"'+companyName+'"';
  if(!terms.length)return {sourceSearch:"not_run",retrievedAt:new Date().toISOString(),notice:"Company name unavailable.",sources:[],facts:[],overview:null};
  const topicText=selectedTopics.join(" ").toLowerCase();
  const wants=(...terms:string[])=>!selectedTopics.length || terms.some(term=>topicText.includes(term));
  const queries=[
    ...(wants("overview","history","company profile") ? [`${qName} official company overview history founded what does it do`,`${qName} investor relations about company business description`] : []),
    ...(wants("headquarters","operating regions","locations","countries","offices") ? [`${qName} official headquarters countries of operation offices locations facilities`,`${qName} annual report geographic locations offices facilities countries`] : []),
    ...(wants("products","services","business segments") ? [`${qName} official products services solutions business segments`,`${qName} annual report products services offerings`] : []),
    ...(wants("employee","workforce","gender","nationalities") ? [`${qName} latest annual report employee headcount workforce geography gender`,`${qName} official workforce employees by region diversity report`] : []),
    ...(wants("financial","revenue","profit","income") ? [`${qName} latest annual report financial results revenue profit investor relations`] : []),
  ];
  const resultSets=await Promise.all(queries.map(q=>searchWeb(q).catch(()=>[])));
  const candidates=resultSets.flat().filter((r,i,a)=>a.findIndex(x=>x.url===r.url)===i)
    .filter(r=>{const hay=normalise(r.title+" "+r.snippet+" "+r.url);return terms.some(t=>hay.includes(t));})
    .slice(0,18);
  const sources:CompanySource[]=[];
  for(const candidate of candidates){
    try{
      const response=await fetch(candidate.url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; CorpTraceResearch/2.0)","Accept":"text/html,application/xhtml+xml"},redirect:"follow"});
      if(!response.ok || !(response.headers.get("content-type")??"").includes("text/html"))continue;
      const url=response.url||candidate.url, html=(await response.text()).slice(0,2_000_000), pageText=textOf(html);
      const title=decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??candidate.title).replace(/<[^>]+>/g," ").trim().slice(0,180);
      const hay=normalise(title+" "+pageText.slice(0,12000)), matched=terms.filter(t=>hay.includes(t)).length;
      if(matched===0)continue;
      const evidence=extractBlocks(html);
      if(!evidence.length)continue;
      const domain=new URL(url).hostname.toLowerCase().replace(/^www\./,"");
      sources.push({title:title||candidate.title,url,domain,sourceType:classify(url, companyName),retrievedAt:new Date().toISOString(),evidence});
    }catch{/* Continue when an individual publisher blocks retrieval. */}
  }
  const ranked=sources.sort((a,b)=>({company:0,regulator:1,business_publication:2,other:3}[a.sourceType]-{company:0,regulator:1,business_publication:2,other:3}[b.sourceType])).slice(0,12);
  const facts=extractFacts(ranked);
  const fact=(key:string)=>facts.find(f=>f.key===key)?.value;
  const overviewParts=[
    fact("business")? fact("business"):null,
    fact("founded")? `Founded in ${fact("founded")}`:null,
    fact("headquarters")? `Headquartered in ${fact("headquarters")}`:null,
    fact("countries")? `Operates in ${fact("countries")} countries`:null,
    fact("employees")? `The latest retrieved source reports ${fact("employees")} employees`:null,
  ].filter(Boolean);
  const overview=overviewParts.length?overviewParts.join(". ")+".":null;
  return {
    sourceSearch:"multi_query_internet_search_company_and_reputable_business_sources",
    retrievedAt:new Date().toISOString(),
    notice:"Searches include company websites and reports, regulator-hosted material, and established business publications. Search coverage depends on publisher accessibility and indexing. Each fact is source-attributed; extracted text is not independently audited. If sources conflict, check the reporting date and source before comparing.",
    sources:ranked,facts,overview
  };
}
