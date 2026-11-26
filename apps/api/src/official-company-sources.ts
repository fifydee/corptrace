type Evidence = { heading: string; paragraph: number; excerpt: string };
type CompanySource = {
  title: string; url: string; domain: string; sourceType: "company" | "regulator" | "business_publication" | "other";
  retrievedAt: string; evidence: Evidence[]; evidenceOrigin?: "retrieved_page" | "search_result_snippet";
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
    if (u.protocol !== "https:" || u.username || u.password || /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])$/i.test(u.hostname) || /\.(local|internal)$/i.test(u.hostname) || /\.(zip|exe|dmg|mp4|jpg|png)(\?|$)/i.test(u.pathname)) return null;
    if (u.hostname.includes("duckduckgo.com")) {
      const target = u.searchParams.get("uddg");
      if (target) return cleanUrl(target, base);
    }
    for (const key of [...u.searchParams.keys()]) if (/^(msockid|utm_.+|gclid|fbclid|cvid|ocid|ntb)$/i.test(key)) u.searchParams.delete(key);
    if (u.hostname === "www.bing.com" && u.pathname === "/ck/a") {
      const encoded = u.searchParams.get("u") ?? "";
      if (encoded.startsWith("a1")) {
        const base64 = encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
        const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
        const target = new TextDecoder().decode(bytes);
        return cleanUrl(target, "https://www.bing.com/");
      }
      return null;
    }
    return u.toString();
  } catch { return null; }
}
function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(['\"])(.*?)\\1", "i"));
  return match ? decode(match[2]) : "";
}
export function parseDuckDuckGoResults(html: string, endpoint: string): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const tag = match[0];
    if (!/\bresult__a\b/i.test(attribute(tag, "class"))) continue;
    const url = cleanUrl(attribute(tag, "href"), endpoint);
    const title = textOf(tag.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, "")).slice(0, 180);
    if (!url || !title || results.some(item => item.url === url)) continue;
    const offset = match.index ?? 0;
    const nearby = html.slice(Math.max(0, offset - 900), Math.min(html.length, offset + 2600));
    const snippetMatch = nearby.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    results.push({ title, url, snippet: textOf(snippetMatch?.[1] ?? "").slice(0, 500) });
    if (results.length >= 10) break;
  }
  return results;
}
export function parseBingResults(html: string): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const blocks = [...html.matchAll(/<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)];
  for (const block of blocks) {
    const content = block[1];
    const heading = content.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? "";
    const anchor = heading.match(/<a\b[^>]*>[\s\S]*?<\/a>/i)?.[0] ?? "";
    const url = cleanUrl(attribute(anchor, "href"), "https://www.bing.com/");
    const title = textOf(anchor.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, "")).slice(0, 180);
    if (!url || !title || results.some(item => item.url === url)) continue;
    const snippet = content.match(/<(?:p|div)\b[^>]*class=["'][^"']*(?:b_caption|b_snippet)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i)?.[1]
      ?? content.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]
      ?? "";
    results.push({ title, url, snippet: textOf(snippet).slice(0, 500) });
    if (results.length >= 10) break;
  }
  return results;
}
export function parseBingRssResults(xml: string): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  for (const item of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const title = textOf(item[1].match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 180);
    const rawUrl = decode(textOf(item[1].match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? ""));
    const url = cleanUrl(rawUrl, "https://www.bing.com/");
    const snippet = textOf(item[1].match(/<description\b[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? "").slice(0, 500);
    if (!title || !url || results.some(result => result.url === url)) continue;
    results.push({ title, url, snippet });
    if (results.length >= 10) break;
  }
  return results;
}
export function parseGoogleNewsRssResults(xml: string): Array<{ title: string; url: string; snippet: string; publisherUrl?: string }> {
  const results: Array<{ title: string; url: string; snippet: string; publisherUrl?: string }> = [];
  for (const item of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const title = textOf(item[1].match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 180);
    const url = cleanUrl(decode(textOf(item[1].match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? "")), "https://news.google.com/");
    const snippet = textOf(item[1].match(/<description\b[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? "").slice(0, 500);
    const sourceTag = item[1].match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);
    const publisherUrl = sourceTag ? cleanUrl(attribute(sourceTag[0], "url"), "https://news.google.com/") ?? undefined : undefined;
    if (!title || !url || results.some(result => result.url === url)) continue;
    results.push({ title, url, snippet, publisherUrl });
    if (results.length >= 10) break;
  }
  return results;
}
async function searchWeb(query: string): Promise<Array<{ title: string; url: string; snippet: string; publisherUrl?: string }>> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
  };
  const ddgEndpoint = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query) + "&kl=us-en";
  try {
    const response = await fetch(ddgEndpoint, { headers, signal: AbortSignal.timeout(10000) });
    const html = response.ok ? await response.text() : "";
    const results = parseDuckDuckGoResults(html, ddgEndpoint);
    if (results.length) return results;
    console.warn("CorpTrace DuckDuckGo search returned no parsed results", {
      status: response.status, htmlLength: html.length,
      resultMarkup: html.includes("result__a"),
      antiBotPage: /anomaly|unusual traffic|captcha|bot challenge/i.test(html),
      query: query.slice(0, 160)
    });
  } catch (error) {
    console.warn("CorpTrace DuckDuckGo search request failed", {
      error: error instanceof Error ? error.message : String(error), query: query.slice(0, 160)
    });
  }
  try {
    const endpoint = "https://www.bing.com/search?q=" + encodeURIComponent(query);
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10000) });
    const html = response.ok ? await response.text() : "";
    const results = parseBingResults(html);
    if (results.length) {
      const newsEndpoint = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=en-US&gl=US&ceid=US:en";
      try {
        const newsResponse = await fetch(newsEndpoint, {
          headers: { ...headers, "Accept": "application/rss+xml,application/xml;q=0.9,*/*;q=0.8" },
          signal: AbortSignal.timeout(10000)
        });
        const newsXml = newsResponse.ok ? await newsResponse.text() : "";
        const newsResults = parseGoogleNewsRssResults(newsXml);
        if(!newsResults.length) console.warn("CorpTrace Google News RSS returned no publisher results", {
          status: newsResponse.status, bodyLength: newsXml.length, itemMarkup: /<item\b/i.test(newsXml), query: query.slice(0,160)
        });
        else console.log("CorpTrace Google News RSS parsed publisher results", {
          count: newsResults.length, publishers: newsResults.slice(0,5).map(result=>result.publisherUrl), query: query.slice(0,160)
        });
        const merged = [...results, ...newsResults].filter((item,index,all)=>all.findIndex(other=>other.url===item.url)===index);
        return merged.slice(0,25);
      } catch (error) {
        console.warn("CorpTrace Google News RSS search request failed", {
          error: error instanceof Error ? error.message : String(error), query: query.slice(0, 160)
        });
        return results;
      }
    }
    console.warn("CorpTrace Bing HTML search returned no parsed results", {
      status: response.status, htmlLength: html.length,
      resultMarkup: html.includes("b_algo"), query: query.slice(0, 160)
    });
  } catch (error) {
    console.warn("CorpTrace Bing HTML search request failed", {
      error: error instanceof Error ? error.message : String(error), query: query.slice(0, 160)
    });
  }
  try {
    const endpoint = "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query);
    const response = await fetch(endpoint, {
      ...{ headers: { ...headers, "Accept": "application/rss+xml,application/xml;q=0.9,*/*;q=0.8" } },
      signal: AbortSignal.timeout(10000)
    });
    const xml = response.ok ? await response.text() : "";
    const results = parseBingRssResults(xml);
    if (results.length) return results;
    console.warn("CorpTrace Bing RSS search returned no parsed results", {
      status: response.status, bodyLength: xml.length,
      itemMarkup: /<item\b/i.test(xml), query: query.slice(0, 160)
    });
  } catch (error) {
    console.warn("CorpTrace Bing RSS search request failed", {
      error: error instanceof Error ? error.message : String(error), query: query.slice(0, 160)
    });
  }
  return [];
}

export function classify(url: string, companyName: string): CompanySource["sourceType"] {
  const host = new URL(url).hostname.toLowerCase();
  if (/(sec\.gov|companieshouse\.gov)/.test(host)) return "regulator";
  if (/(^|\.)(forbes\.com|businessinsider\.com|reuters\.com|bloomberg\.com|wsj\.com|ft\.com|cnbc\.com|apnews\.com|bbc\.com|theguardian\.com|fortune\.com|nytimes\.com|marketwatch\.com|finance\.yahoo\.com|investopedia\.com)$/.test(host)) return "business_publication";
  const labels = host.split(".");
  const terms = companyTerms(companyName);
  const compactName = terms.join("");
  return labels.some(label => label === compactName || terms.includes(label)) ? "company" : "other";
}
export function extractBlocks(html: string): Evidence[] {
  const blocks=[...html.matchAll(/<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi)];
  let heading="Page content", paragraph=0; const out:Evidence[]=[];
  const include=/\b(founded|established|headquarters|headquartered|principal executive office|employees|associates|workforce|team members|products|services|solutions|operates in|operates|across .* countries|more than [0-9,]+ countries|over [0-9,]+ countries|countries|offices|locations|facilities|manufacturing sites|people worldwide|business segments|what we do|retailer|retailers|biopharmaceutical|pharmaceutical|designs|develops|manufactures|sells|offers|distributes|supplies|delivers|markets|provides|serves customers|global technology|is a [a-z -]{2,60} company|is a global|is an international|is a leading|is a provider|is a manufacturer|is a retailer|is a technology|speciali[sz]es in)\b/i;
  const exclude=/\b(stock[- ]based compensation|stock incentive plan|share[- ]based compensation|principal accountant fees|consolidated financial statements|revenue allocated|income taxes|deferred tax|pension plan|retirement plan|fair value|earnings per share|net income|accounts receivable|lease liabilities|debt maturity|interest rate|share repurchase|dividend|audit fees|related party|financial instruments|segment operating income|weighted average|unrecognized compensation|vesting period|tax provision|effective tax rate|share-based awards|stock options|restricted stock units|defined benefit|defined contribution|cash flows from|depreciation and amortization|impairment charge|goodwill|intangible assets|operating lease|finance lease)\b/i;
  for(const block of blocks){
    const tag=block[1].toLowerCase(), t=textOf(block[2]).replace(/\s+/g," ").trim(); if(!t) continue;
    if(tag.startsWith("h")){heading=t.slice(0,160);continue;}
    paragraph++;
    if(t.length<30 || t.length>1800 || !include.test(t) || exclude.test(heading+" "+t)) continue;
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
    {key:"business",label:"Company overview",re:/\b((?:(?:is|are)\s+(?:a|an)\s+[^.!?]{15,220}(?:company|provider|manufacturer|technology|retailer|platform|business|services|products)[^.!?]{0,180})|(?:(?:provides|manufactures|designs|develops|sells|offers|produces|distributes)\s+[^.!?]{15,220}))[.!?]/i},
    {key:"founded",label:"Founded",re:/\b(?:founded|established|incorporated)\s+(?:in\s+)?(?:in\s+)?(?:the year\s+)?(\d{4})\b/i},
    {key:"headquarters",label:"Headquarters",re:/\b(?:headquartered\s+(?:in|at)|headquarters(?:\s+(?:are|is))?\s+(?:located\s+)?(?:in|at)|principal executive offices(?:\s+(?:are|is))?(?:\s+(?:located\s+)?(?:in|at))?|principal offices\s+(?:are\s+)?(?:located\s+)?(?:in|at)|based\s+(?:in|at))\s+([^.;]{3,100})/i},
    {key:"employees",label:"Employees",re:/\b(?:approximately\s+|about\s+|more than\s+|over\s+)?([0-9][\d,]*(?:\.\d+)?\s*(?:million|thousand)?)\s+(?:employees|associates|team members|people)\b/i},
    {key:"offices",label:"Offices / locations",re:/\b([0-9][\d,]*)\s+(?:offices|office locations|locations|sites)\b/i},
    {key:"countries",label:"Countries of operation",re:/\b(?:conducted business in|conduct business in|operates in|operate in|operates across|operating in|across|in)\s+(?:(?:more than|over)\s+)?([0-9][\d,]*)\s+countries\b/i},
  ];
  const found = new Map<string,CompanyFact>();
  for(const s of sources) if(s.sourceType !== "other") for(const e of s.evidence){
    for(const d of definitions){const m=e.excerpt.match(d.re); const factId=d.key+"|"+s.url; if(m && !found.has(factId)) found.set(factId,{key:d.key,label:d.label,value:m[1].trim(),sourceTitle:s.title,sourceUrl:s.url,sourceType:s.sourceType,evidence:e.excerpt,retrievedAt:s.retrievedAt});}
  }
  return [...found.values()];
}
export async function findOfficialCompanySources(companyName:string, selectedTopics:string[] = []):Promise<{
  sourceSearch:string;retrievedAt:string;notice:string;sources:CompanySource[];facts:CompanyFact[];
  overview:string|null;
}>{
  const terms=companyTerms(companyName), qSimple=terms.join(" "), qQuoted='"'+companyName+'"';
  if(!terms.length)return {sourceSearch:"not_run",retrievedAt:new Date().toISOString(),notice:"Company name unavailable.",sources:[],facts:[],overview:null};
  const topicText=selectedTopics.join(" ").toLowerCase();
  const wants=(...terms:string[])=>!selectedTopics.length || terms.some(term=>topicText.includes(term));
  const queries=[
    ...(wants("overview","history","company profile") ? [qQuoted+" company overview official",qSimple+" official corporate about us",qQuoted+" Reuters company profile",qQuoted+" Bloomberg company profile"] : []),
    ...(wants("headquarters","operating regions","locations","countries","offices") ? [qSimple+" official headquarters address locations countries of operation",qQuoted+" corporate headquarters principal office annual report"] : []),
    ...(wants("products","services","business segments") ? [qSimple+" official products services solutions business segments"] : []),
    ...(wants("employee","workforce","gender","nationalities") ? [qSimple+" employees workforce headcount latest annual report",qSimple+" employees associates workforce by region official"] : []),
    ...(wants("financial","revenue","profit","income") ? [qSimple+" latest annual report financial results revenue profit investor relations"] : []),
  ];
  const resultSets=await Promise.all(queries.map(q=>searchWeb(q).catch(()=>[])));
  const rawCandidates=resultSets.flat().map(result=>({...result,url:cleanUrl(result.url,"https://www.bing.com/")??result.url})).filter((r,i,a)=>a.findIndex(x=>x.url===r.url)===i);
  const relevantCandidates=rawCandidates
    .filter(r=>{const hay=normalise(r.title+" "+r.snippet+" "+r.url);return terms.some(t=>hay.includes(t));})
    .filter(result=>classify(result.publisherUrl??result.url,companyName)!=="other");
  const candidates=[
    ...relevantCandidates.filter(result=>classify(result.publisherUrl??result.url,companyName)==="business_publication"),
    ...relevantCandidates.filter(result=>classify(result.publisherUrl??result.url,companyName)==="company"),
    ...relevantCandidates.filter(result=>classify(result.publisherUrl??result.url,companyName)==="regulator"),
  ].slice(0,18);
  if(!candidates.length) console.warn("CorpTrace search produced no company-matched candidates", {companyName, queryResultCounts:resultSets.map(set=>set.length), rawCandidateCount:rawCandidates.length, sampleResults:rawCandidates.slice(0,5).map(result=>({title:result.title,url:result.url}))});
  const sources:CompanySource[]=[];
  for(const candidate of candidates){
    const sourceUrl=cleanUrl(candidate.url,candidate.url);
    if(!sourceUrl) continue;
    const publisherUrl=candidate.publisherUrl?cleanUrl(candidate.publisherUrl,candidate.publisherUrl):null;
    const sourceType=classify(publisherUrl??sourceUrl,companyName);
    if(sourceType==="other") continue;
    const domain=new URL(publisherUrl??sourceUrl).hostname.toLowerCase().replace(/^www\./,"");
    const snippetEvidence=()=>candidate.snippet.length>=50
      ? [{heading:"Search result snippet (page fetch unavailable)",paragraph:1,excerpt:candidate.snippet.slice(0,720)}]
      : [];
    try{
      const response=await fetch(sourceUrl,{headers:{"User-Agent":"Mozilla/5.0 (compatible; CorpTraceResearch/2.0)","Accept":"text/html,application/xhtml+xml"},redirect:"follow",signal:AbortSignal.timeout(10000)});
      if(!response.ok || !(response.headers.get("content-type")??"").includes("text/html")){
        console.warn("CorpTrace external page fetch was not usable",{url:sourceUrl,status:response.status,contentType:response.headers.get("content-type")});
        const evidence=snippetEvidence();
        if(evidence.length) sources.push({title:candidate.title,url:sourceUrl,domain,sourceType,retrievedAt:new Date().toISOString(),evidence,evidenceOrigin:"search_result_snippet"});
        continue;
      }
      const finalUrl=cleanUrl(response.url||sourceUrl,sourceUrl); if(!finalUrl)continue;
      const finalType=classify(finalUrl,companyName);
      const effectiveType=finalType==="other"?sourceType:finalType;
      const effectiveUrl=finalType==="other"&&publisherUrl?sourceUrl:finalUrl;
      const html=(await response.text()).slice(0,2_000_000), pageText=textOf(html);
      const title=decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??candidate.title).replace(/<[^>]+>/g," ").trim().slice(0,180);
      const hay=normalise(title+" "+pageText.slice(0,12000)), matched=terms.filter(t=>hay.includes(t)).length;
      if(matched===0)continue;
      const evidence=extractBlocks(html);
      const finalDomain=new URL(effectiveUrl).hostname.toLowerCase().replace(/^www\./,"");
      if(!evidence.length){
        console.warn("CorpTrace external page yielded no evidence blocks",{url:effectiveUrl,title,contentLength:html.length,textLength:pageText.length});
        const fallback=snippetEvidence();
        if(fallback.length) sources.push({title:title||candidate.title,url:effectiveUrl,domain:finalDomain,sourceType:effectiveType,retrievedAt:new Date().toISOString(),evidence:fallback,evidenceOrigin:"search_result_snippet"});
        continue;
      }
      sources.push({title:title||candidate.title,url:effectiveUrl,domain:finalDomain,sourceType:effectiveType,retrievedAt:new Date().toISOString(),evidence,evidenceOrigin:"retrieved_page"});
    }catch(error){
      console.warn("CorpTrace external page retrieval failed",{url:sourceUrl,error:error instanceof Error?error.message:String(error)});
      const evidence=snippetEvidence();
      if(evidence.length) sources.push({title:candidate.title,url:sourceUrl,domain,sourceType,retrievedAt:new Date().toISOString(),evidence,evidenceOrigin:"search_result_snippet"});
    }
  }
  const ranked=[
    ...sources.filter(source=>source.sourceType==="company").slice(0,5),
    ...sources.filter(source=>source.sourceType==="business_publication").slice(0,4),
    ...sources.filter(source=>source.sourceType==="regulator").slice(0,3),
  ].slice(0,12);
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
