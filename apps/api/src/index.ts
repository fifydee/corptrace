import { findOfficialCompanySources, extractBlocks, extractFacts } from "./official-company-sources";
import { cleanFilingText, findSectionHeading, extractItemSection } from "./filing-parser.mjs";

export interface Env {
  APP_ENV?: string;
  SEC_USER_AGENT?: string;
  API_RATE_LIMITER: {
    limit(options: { key: string; delta?: number }): Promise<{ success: boolean }>;
  };
}

type SecResource = "lookup" | "submissions" | "facts";

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type",
    },
  });

function normaliseCik(input: string): string | null {
  if (!/^\d{1,10}$/.test(input)) return null;
  return input.padStart(10, "0");
}

async function fetchSecResource(
  cik: string,
  resource: SecResource,
  userAgent: string,
): Promise<Response> {
  const endpoint =
    resource === "lookup"
      ? "https://www.sec.gov/files/company_tickers.json"
      : resource === "submissions"
        ? `https://data.sec.gov/submissions/CIK${cik}.json`
        : `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return json(
      {
        error: "The SEC data service could not be reached.",
        sourceUrl: endpoint,
        retryable: true,
      },
      502,
    );
  }

  if (!upstream.ok) {
    return json(
      {
        error: "The SEC data service returned an unsuccessful response.",
        upstreamStatus: upstream.status,
        sourceUrl: endpoint,
        retryable: upstream.status >= 500 || upstream.status === 429,
      },
      upstream.status === 404 ? 404 : 502,
    );
  }

  const body: unknown = await upstream.json();
  return json({
    source: "SEC EDGAR",
    resource,
    cik,
    sourceUrl: endpoint,
    retrievedAt: new Date().toISOString(),
    status: "source_response",
    data: body,
    notice:
      "Raw SEC source data. CorpTrace has not yet validated or selected financial facts for display.",
  });
}


type SecFactUnit = {
  val: number;
  end: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  accn?: string;
  frame?: string;
  start?: string;
};

type SecCompanyFacts = {
  entityName?: string;
  cik?: number;
  facts?: Record<string, {
    [concept: string]: {
      label?: string;
      units?: Record<string, SecFactUnit[]>;
    };
  }>;
};

const metricConcepts = [
  {
    key: "revenue",
    label: "Revenue",
    concepts: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "SalesRevenueNet",
      "Revenues",
    ],
    duration: true,
  },
  {
    key: "netIncome",
    label: "Net income",
    concepts: ["NetIncomeLoss", "ProfitLoss"],
    duration: true,
  },
  {
    key: "operatingIncome",
    label: "Operating income",
    concepts: ["OperatingIncomeLoss"],
    duration: true,
  },
  { key: "totalAssets", label: "Total assets", concepts: ["Assets"], duration: false },
  {
    key: "totalLiabilities",
    label: "Total liabilities",
    concepts: ["Liabilities"],
    duration: false,
  },
  {
    key: "operatingCashFlow",
    label: "Operating cash flow",
    concepts: ["NetCashProvidedByUsedInOperatingActivities"],
    duration: true,
  },
] as const;

function selectAnnualCandidate(
  facts: SecCompanyFacts,
  metric: (typeof metricConcepts)[number],
) {
  const gaap = facts.facts?.["us-gaap"] ?? {};
  const candidates: Array<{ concept: string; unit: string; fact: SecFactUnit }> = [];

  for (const concept of metric.concepts) {
    const units = gaap[concept]?.units ?? {};
    for (const [unit, entries] of Object.entries(units)) {
      for (const fact of entries) {
        if (!["10-K", "20-F", "40-F"].includes(fact.form ?? "")) continue;
        if (!fact.end || !fact.filed || !fact.accn) continue;
        if (metric.duration) {
          if (!fact.start) continue;
          const durationDays =
            (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000;
          if (durationDays < 330 || durationDays > 380) continue;
        } else if (fact.start) {
          continue;
        }
        candidates.push({ concept, unit, fact });
      }
    }
  }

  candidates.sort((a, b) => {
    const byEnd = b.fact.end.localeCompare(a.fact.end);
    if (byEnd !== 0) return byEnd;
    return (b.fact.filed ?? "").localeCompare(a.fact.filed ?? "");
  });

  const selected = candidates[0];
  if (!selected?.fact.accn || !selected.fact.filed || !selected.fact.end) return null;

  const cik = String(facts.cik ?? "").replace(/^0+/, "");
  const accessionNumber = selected.fact.accn;
  const accession = accessionNumber.replace(/-/g, "");
  const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${accessionNumber}-index.htm`;

  return {
    metric: metric.key,
    label: metric.label,
    value: selected.fact.val,
    unit: selected.unit,
    concept: selected.concept,
    periodStart: selected.fact.start ?? null,
    periodEnd: selected.fact.end,
    fiscalYear: selected.fact.fy ?? null,
    fiscalPeriod: selected.fact.fp ?? null,
    form: selected.fact.form,
    filedAt: selected.fact.filed,
    accessionNumber,
    filingUrl,
    dataStatus: "source_traceable",
    verificationLevel: "source_traceable",
    verificationBasis:
      "This value is an SEC company-facts XBRL fact tied to the identified 10-K, 20-F or 40-F accession. The metric concept, unit, annual duration (where applicable), reporting date and filing metadata passed CorpTrace's source-traceability checks.",
    caveat:
      "Verified as reported in the linked SEC filing. This confirms the source fact and filing trace, not independent audit assurance or cross-company accounting comparability.",
  };
}

async function getCandidateMetrics(cik: string, userAgent: string): Promise<Response> {
  const endpoint = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return json({ error: "The SEC data service could not be reached.", sourceUrl: endpoint }, 502);
  }
  if (!upstream.ok) {
    return json(
      { error: "The SEC data service returned an unsuccessful response.", upstreamStatus: upstream.status, sourceUrl: endpoint },
      upstream.status === 404 ? 404 : 502,
    );
  }

  const facts = (await upstream.json()) as SecCompanyFacts;
  const metrics = metricConcepts.map((metric) => selectAnnualCandidate(facts, metric));
  return json({
    source: "SEC EDGAR company facts",
    companyName: facts.entityName ?? null,
    cik,
    sourceUrl: endpoint,
    retrievedAt: new Date().toISOString(),
    reportingBasis: "Latest traceable annual SEC filing facts; 10-K, 20-F and 40-F forms",
    status: "source_traceable_data",
    metrics,
    notice:
      "Available figures are source-traceable SEC XBRL facts when a standard US-GAAP concept, unit, annual period (where applicable), filing form, accession number and filing date are present. These checks establish a trace to reported data; they do not independently validate metric selection, issuer-specific accounting context, restatements, cross-company comparability or audit assurance.",
  });
}


type FilingRecent = {
  form?: string[];
  filingDate?: string[];
  reportDate?: string[];
  accessionNumber?: string[];
  primaryDocument?: string[];
};
type SubmissionPayload = {
  name?: string;
  filings?: { recent?: FilingRecent };
};
const filingTopics = [
  { key: "business", title: "Business overview, products and operating footprint", patterns: [/^\s*ITEM\s+1[-.\s:|—–]+BUSINESS/i, /^\s*ITEM\s+1[-.\s:|—–]+DESCRIPTION OF BUSINESS/i] },
  { key: "properties", title: "Properties and principal locations", patterns: [/^\s*ITEM\s+2[-.\s:|—–]+PROPERTIES/i] },
  { key: "risk", title: "Risk factors", patterns: [/^\s*ITEM\s+1A[-.\s:|—–]+RISK FACTORS/i] },
  { key: "legal", title: "Legal proceedings", patterns: [/^\s*ITEM\s+3[-.\s:|—–]+LEGAL PROCEEDINGS/i] },
  { key: "management", title: "Management discussion and financial performance", patterns: [/^\s*ITEM\s+7[-.\s:|—–]+MANAGEMENT[’']?S?\s+DISCUSSION/i, /^\s*ITEM\s+7[-.\s:|—–]+MANAGEMENT’S DISCUSSION/i] },
  { key: "controls", title: "Controls and procedures", patterns: [/^\s*ITEM\s+9A[-.\s:|—–]+CONTROLS/i] },
];
const researchTopicSectionMap: Record<string, string[]> = {
  "Company overview and history": ["business"],
  "Headquarters and registered locations": ["business", "properties"],
  "Operating regions and countries": ["business"],
  "Offices and facilities": ["business", "properties"],
  "Products and services": ["business"],
  "Business segments and revenue mix": ["business", "management"],
  "Financial summary": ["management"],
  "Revenue and income sources": ["management"],
  "Expenses and operating costs": ["management"],
  "Profitability and margins": ["management"],
  "Debt and financial position": ["management"],
  "Dividends and share buybacks": ["management"],
  "Employee count and workforce": ["business", "management"],
  "Employee geography and nationalities": ["business"],
  "Workforce by country or region": ["business"],
  "Gender representation (where disclosed)": ["business"],
  "Leadership changes and compensation": ["management"],
  "Product and service performance": ["business", "management"],
  "Most profitable products or services": ["business", "management"],
  "New products and development pipeline": ["business"],
  "Investment, R&D and AI": ["business", "management"],
  "Acquisitions and mergers": ["business", "legal"],
  "Expansion plans and new facilities": ["business"],
  "SWOT analysis": ["business", "risk", "management"],
  "Risk factors": ["risk"],
  "Legal cases and disputes": ["legal"],
  "Regulatory matters and controversies": ["risk", "legal"],
  "Recent company news": [],
  "Management changes": ["management"],
  "Company announcements": ["business"],
};

function buildTopicCoverage(selectedTopics: string[], sections: Array<{ key: string; title: string; dataStatus: string }>) {
  return selectedTopics.map(topic => {
    const relevantKeys = researchTopicSectionMap[topic] ?? [];
    const evidenceSections = sections
      .filter(section => relevantKeys.includes(section.key))
      .map(section => ({ key: section.key, title: section.title, dataStatus: section.dataStatus }));
    const hasCandidate = evidenceSections.some(section => section.dataStatus === "candidate");
    return {
      topic,
      status: hasCandidate ? "candidate" : "unavailable",
      evidenceSections,
      limitation: relevantKeys.length === 0
        ? "This topic requires a separate current-news or external-source integration; the annual filing extractor does not cover it."
        : "These are broad annual-filing sections that may contain relevant evidence. They are not a topic-specific answer, and absence from these sections does not prove the company has not disclosed the information elsewhere.",
    };
  });
}

type ResearchFinding = {
  topic: string;
  status: "disclosed_in_filing" | "not_found_in_filing" | "not_searched";
  evidence: Array<{ section: string; excerpt: string; documentUrl: string }>;
  explanation: string;
};

const topicEvidencePatterns: Record<string, RegExp[]> = {
  "Company overview and history": [/\b(?:founded|incorporated|established)\b|\b(?:is|are)\s+(?:a|an)\s+[^.!?]{5,140}\b(?:company|provider|manufacturer|retailer|biopharmaceutical|pharmaceutical|technology)\b|\bwe\s+(?:design|develop|manufacture|sell|provide|offer|distribute)\b/i],
  "Headquarters and registered locations": [/headquartered|headquarters|principal executive offices|principal offices|registered office/i],
  "Operating regions and countries": [/\b(?:conduct(?:s|ed) business in|operate[s]? in|operate[s]? across|across)\s+(?:(?:more than|over|approximately)\s+)?[0-9,]+\s+countries\b|\b(?:our|the company’s|company’s)\s+(?:operations|business)\s+(?:are\s+)?(?:in|across)\s+(?:the\s+)?(?:U\.S\.|United States|Canada|Europe|Asia|Africa|Americas|EMEA|APAC|Latin America|Middle East)\b/i],
  "Offices and facilities": [/offices|facilities|manufacturing sites|distribution centers|data ?centers|stores|locations/i],
  "Products and services": [/products and services|our products|our services|product portfolio|service offerings/i],
  "Business segments and revenue mix": [/reportable segments|operating segments|net sales|revenue[s]? by segment|segment revenue/i],
  "Employee count and workforce": [/\b[0-9][0-9,.]*\s*(?:(?:million|thousand)\s+)?(?:employees|associates)\b|\bemployed\s+(?:approximately\s+|about\s+|over\s+|more than\s+)?[0-9][0-9,.]*\s*(?:(?:million|thousand)\s+)?people\b|number of persons employed|full.time employees/i],
  "Employee geography and nationalities": [/\b[0-9][0-9,.]*\s*(?:(?:million|thousand)\s+)?(?:employees|associates)\b.{0,100}\b(?:U\.S\.|United States|international|Europe|Asia|Africa|Americas|country|region)(?=\W|$)|(?:employees?|associates) (?:in|located in)|workforce .* (?:country|region)|international employees|employees outside/i],
  "Workforce by country or region": [/\b[0-9][0-9,.]*\s*(?:(?:million|thousand)\s+)?(?:employees|associates)\b.{0,100}\b(?:U\.S\.|United States|international|Europe|Asia|Africa|Americas|country|region)(?=\W|$)|(?:employees?|associates) (?:in|located in)|workforce .* (?:country|region)|international employees|employees outside/i],
  "Gender representation (where disclosed)": [/\b[0-9]+(?:\.[0-9]+)?%\s+(?:of\s+)?(?:employees|workforce|women|men)\b|women represent|female employees|gender representation|men and women/i],
  "Leadership changes and compensation": [/appointed|resigned|retired|chief executive officer|executive compensation/i],
  "Product and service performance": [/product revenue|service revenue|net sales|segment results|product line/i],
  "Most profitable products or services": [/segment operating income|product profitability|gross profit by|operating profit by segment/i],
  "New products and development pipeline": [/new product|product launch|in development|pipeline|research and development|introduced .* product/i],
  "Investment, R&D and AI": [/research and development|artificial intelligence|\bAI\b|capital expenditures|investments? in/i],
  "Acquisitions and mergers": [/acquisition|acquired|merger|business combination/i],
  "Expansion plans and new facilities": [/expand|expansion|new facility|new facilities|new office|new offices|enter .* market|market expansion/i],
  "Risk factors": [/risk factors|material risks/i],
  "Legal cases and disputes": [/legal proceedings|litigation|lawsuit|claims and disputes/i],
  "Regulatory matters and controversies": [/regulatory|investigation|enforcement|consent decree|controvers/i],
  "Recent company news": [],
  "Management changes": [/appointed|resigned|retired|departure|succeeded by|named .* chief/i],
  "Company announcements": [/announced|announcement|press release|we intend|we plan to/i],
};

function buildResearchFindings(
  selectedTopics: string[],
  sections: Array<{ key: string; title: string; content: string | null }>,
  documentUrl: string,
): ResearchFinding[] {
  return selectedTopics.map(topic => {
    const keys = researchTopicSectionMap[topic] ?? [];
    if (!keys.length) {
      return {
        topic,
        status: "not_searched",
        evidence: [],
        explanation: "This topic is not covered by the annual filing search alone. A separate current-news or external-source search is required.",
      };
    }

    const patterns = topicEvidencePatterns[topic] ?? [];
    if (!patterns.length) {
      return {
        topic,
        status: "not_searched",
        evidence: [],
        explanation: "No topic-specific evidence rule is configured yet. CorpTrace will not treat a broad filing section as an answer to this question.",
      };
    }

    const mappedSections = sections.filter(section => keys.includes(section.key));
    if (!mappedSections.some(section => section.content)) {
      return {
        topic,
        status: "not_searched",
        evidence: [],
        explanation: "The relevant annual-filing section could not be reliably located or extracted, so this topic was not searched. This is not evidence that the disclosure is absent.",
      };
    }

    const evidence: ResearchFinding["evidence"] = [];
    const relevantSections = mappedSections.filter(section => section.content);
    for (const section of relevantSections) {
      const content = section.content ?? "";
      const lines = content
        .split(/(?<=[.!?])\s+|\n+/)
        .map(line => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (!patterns.some(pattern => pattern.test(line))) continue;
        const excerpt = line.slice(0, 700);
        if (!evidence.some(item => item.excerpt === excerpt)) {
          evidence.push({ section: section.title, excerpt, documentUrl });
        }
        if (evidence.length >= 4) break;
      }
      if (evidence.length >= 4) break;
    }

    return {
      topic,
      status: evidence.length ? "disclosed_in_filing" : "not_found_in_filing",
      evidence,
      explanation: evidence.length
        ? "Evidence excerpts were found in the identified filing. Read the surrounding filing context before drawing conclusions."
        : "No matching disclosure was found in the sections of the latest annual filing reviewed. This does not prove the company has never disclosed it elsewhere.",
    };
  });
}

function extractFilingProfileEvidence(
  sections: Array<{ title: string; content: string | null }>,
): Array<{ heading: string; paragraph: number; excerpt: string }> {
  const include = /\b(?:founded|established|headquarters|headquartered|principal executive offices|principal offices|employees|associates|team members|people worldwide|conducted business in|operates? in|operates? across|offices|facilities|manufacturing plants|products and services|we develop|we manufacture|we provide|we offer|we sell|we distribute)\b/i;
  const exclude = /\b(?:stock[- ]based compensation|share[- ]based compensation|principal accountant fees|income taxes|deferred tax|pension plan|retirement plan|audit fees|tax provision|effective tax rate|related party|earnings per share|fair value|debt maturity|accounts receivable|cash flows from|goodwill|intangible assets)\b/i;
  const evidence: Array<{ heading: string; paragraph: number; excerpt: string }> = [];
  for (const section of sections) {
    const sentences = (section.content ?? "")
      .split(/(?<=[.!?])\s+|\n+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length >= 30 && sentence.length <= 1800);
    for (const sentence of sentences) {
      if (!include.test(sentence) || exclude.test(sentence)) continue;
      evidence.push({
        heading: section.title,
        paragraph: evidence.length + 1,
        excerpt: sentence.slice(0, 720),
      });
      if (evidence.length >= 36) return evidence;
    }
  }
  return evidence;
}

async function getCompanyResearch(cik: string, userAgent: string, selectedTopics: string[] = []): Promise<Response> {
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  let submissionsResponse: Response;
  try {
    submissionsResponse = await fetch(submissionsUrl, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  } catch {
    return json({ error: "Could not retrieve SEC filing submissions.", sourceUrl: submissionsUrl }, 502);
  }
  if (!submissionsResponse.ok) return json({ error: "SEC filing submissions request failed.", upstreamStatus: submissionsResponse.status }, 502);
  const submissions = await submissionsResponse.json() as SubmissionPayload;
  const companyName = submissions.name ?? "Unknown company";
  const profileTopics = selectedTopics.filter(topic => ["Company overview and history","Headquarters and registered locations","Operating regions and countries","Offices and facilities","Products and services","Employee count and workforce","Employee geography and nationalities","Workforce by country or region","Gender representation (where disclosed)"].includes(topic));
  const officialSourcesPromise = profileTopics.length ? findOfficialCompanySources(companyName, profileTopics).catch(() => ({
    sourceSearch: "unavailable", retrievedAt: new Date().toISOString(), sources: [], facts: [], overview: null,
    notice: "External company website discovery could not be completed; the SEC filing will still be searched as a profile source.",
  })) : Promise.resolve({ sourceSearch: "not_requested", retrievedAt: new Date().toISOString(), sources: [], facts: [], overview: null, notice: "No company-profile topics were selected; profile source discovery was not run." });
  const recent = submissions.filings?.recent;
  const forms = recent?.form ?? [];
  const index = forms.findIndex(form => ["10-K", "20-F", "40-F"].includes(form));
  if (index < 0) return json({ error: "No recent annual filing was found for this SEC registrant.", status: "unavailable", sourceUrl: submissionsUrl }, 404);
  const form = forms[index];
  const filedAt = recent?.filingDate?.[index] ?? "";
  const reportDate = recent?.reportDate?.[index] ?? "";
  const accessionNumber = recent?.accessionNumber?.[index] ?? "";
  const primaryDocument = recent?.primaryDocument?.[index] ?? "";
  if (!accessionNumber || !primaryDocument) return json({ error: "The annual filing record is missing its document locator.", status: "unavailable" }, 422);
  const accession = accessionNumber.replace(/-/g, "");
  const cikPath = String(Number(cik));
  const documentUrl = `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accession}/${primaryDocument}`;
  let documentResponse: Response;
  try {
    documentResponse = await fetch(documentUrl, { headers: { "User-Agent": userAgent, Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
  } catch {
    return json({ error: "Could not retrieve the annual filing document.", sourceUrl: documentUrl }, 502);
  }
  if (!documentResponse.ok) return json({ error: "The SEC annual filing document could not be retrieved.", upstreamStatus: documentResponse.status, sourceUrl: documentUrl }, 502);
  const html = await documentResponse.text();
  const text = cleanFilingText(html);
  const requiredKeys = new Set(selectedTopics.flatMap(topic => researchTopicSectionMap[topic] ?? []));
  const sections = filingTopics.filter(topic => requiredKeys.has(topic.key)).map(topic => {
    const heading = findSectionHeading(text, topic.patterns);
    const content = heading ? extractItemSection(text, topic.patterns) : null;
    return {
      key: topic.key,
      title: topic.title,
      item: topic.key === "business" ? "1" : topic.key === "properties" ? "2" : topic.key === "risk" ? "1A" : topic.key === "legal" ? "3" : topic.key === "management" ? "7" : "9A",
      content,
      source: { documentUrl, form, filedAt, reportDate, accessionNumber },
      extraction: { method: "line_preserving_heading_match", headingMatched: Boolean(heading), headingText: heading?.heading ?? null, confidence: content ? "candidate" : "unavailable" },
      dataStatus: content ? "candidate" : "unavailable",
      note: content
        ? "Candidate passage extracted from the identified annual filing. Heading matching is heuristic; verify the passage against the linked filing before relying on individual statements."
        : "No sufficiently supported section heading was detected. This does not establish that the filing lacks the information."
    };
  });
  const officialSources = await officialSourcesPromise;
  // Always use the identified SEC annual filing as a profile evidence source too.
  // This provides a reliable fallback when external search engines or publishers block retrieval.
  const filingEvidence = profileTopics.length ? [...extractFilingProfileEvidence(sections), ...extractBlocks(html)] : [];
  const filingSource = {
    title: `${companyName} ${form} filed ${filedAt}`,
    url: documentUrl,
    domain: "sec.gov",
    sourceType: "regulator" as const,
    retrievedAt: new Date().toISOString(),
    evidence: filingEvidence,
  };
  const combinedSources = [...(officialSources.sources ?? []), ...(filingEvidence.length ? [filingSource] : [])];
  const combinedFacts = extractFacts(combinedSources);
  const profileFact = (key: string) => combinedFacts.find(fact => fact.key === key)?.value;
  const profileOverview = [
    profileFact("business"),
    profileFact("founded") ? `Founded in ${profileFact("founded")}` : null,
    profileFact("headquarters") ? `Headquartered in ${profileFact("headquarters")}` : null,
    profileFact("countries") ? `Operates in ${profileFact("countries")} countries` : null,
    profileFact("employees") ? `Reports ${profileFact("employees")} employees` : null,
  ].filter(Boolean).join(". ");
  const publicSections = sections.map(section => ({
    ...section,
    content: section.content?.slice(0, 14000) ?? null,
  }));
  const enrichedOfficialSources = {
    ...officialSources,
    sources: combinedSources.slice(0, 16),
    facts: combinedFacts,
    overview: profileOverview ? `${profileOverview.replace(/[.]?$/, ".")}` : officialSources.overview,
    notice: `${officialSources.notice} The identified SEC annual filing is also searched directly as a regulator-hosted fallback source.`,
  };
  return json({
    source: "SEC EDGAR annual filing and official company website search",
    companyName,
    officialSources: enrichedOfficialSources,
    cik,
    form,
    filedAt,
    reportDate,
    accessionNumber,
    documentUrl,
    retrievedAt: new Date().toISOString(),
    status: "filing_sections_extracted",
    sections,
    topicCoverage: buildTopicCoverage(selectedTopics, sections),
    findings: buildResearchFindings(selectedTopics, sections, documentUrl),
    notice: "The report searches selected topics within the latest identified annual filing. Evidence excerpts are source-attributed, not independently audited. A not-found result means no matching disclosure was found in the sections reviewed, not that the information does not exist elsewhere."
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "access-control-max-age": "86400",
      }});
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/health") {
      return json({
        service: "CorpTrace API",
        status: "ok",
        environment: env.APP_ENV ?? "development",
        version: "0.1.0",
      });
    }

    if (url.pathname.startsWith("/sec/")) {
      const clientKey = request.headers.get("cf-connecting-ip") ?? "unknown";
      const delta = url.pathname.endsWith("/research") ? 5 : 1;
      const { success } = await env.API_RATE_LIMITER.limit({ key: clientKey, delta });
      if (!success) {
        return json({
          error: "API rate limit exceeded. Please wait before trying again.",
          retryAfterSeconds: 60,
        }, 429);
      }
    }

    if (url.pathname === "/sec/lookup") {
      const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      if (query.length < 1 || query.length > 80) {
        return json({ error: "Supply a search query between 1 and 80 characters." }, 400);
      }
      if (!env.SEC_USER_AGENT || !/\S+\s+\S+/.test(env.SEC_USER_AGENT)) {
        return json({
          error: "SEC_USER_AGENT is not configured.",
          guidance: "Set a descriptive application name and a real contact address before using SEC routes.",
        }, 503);
      }
      const response = await fetchSecResource("", "lookup", env.SEC_USER_AGENT);
      if (!response.ok) return response;
      const payload = (await response.json()) as {
        data?: Record<string, { cik_str?: number; ticker?: string; title?: string }>;
        sourceUrl?: string;
        retrievedAt?: string;
      };
      const matches = Object.values(payload.data ?? {})
        .filter((item) =>
          (item.ticker ?? "").toLowerCase() === query ||
          (item.title ?? "").toLowerCase().includes(query)
        )
        .slice(0, 20)
        .map((item) => ({
          cik: String(item.cik_str ?? "").padStart(10, "0"),
          ticker: item.ticker ?? null,
          companyName: item.title ?? null,
        }));
      return json({
        source: "SEC EDGAR",
        sourceUrl: payload.sourceUrl,
        retrievedAt: payload.retrievedAt,
        query,
        results: matches,
        notice: "SEC registrant lookup results; confirm the legal entity before researching it.",
      });
    }


    const researchMatch = url.pathname.match(/^\/sec\/company\/([^/]+)\/research$/);
    if (researchMatch) {
      const cik = normaliseCik(researchMatch[1]);
      if (!cik) return json({ error: "Invalid CIK. Supply between 1 and 10 digits." }, 400);
      if (!env.SEC_USER_AGENT || !/\S+\s+\S+/.test(env.SEC_USER_AGENT)) return json({ error: "SEC_USER_AGENT is not configured." }, 503);
      const selectedTopics = (url.searchParams.get("topics") ?? "").split("|").map(topic => topic.trim()).filter(Boolean).slice(0, 30);
      return getCompanyResearch(cik, env.SEC_USER_AGENT, selectedTopics);
    }

    const metricsMatch = url.pathname.match(
      /^\/sec\/company\/([^/]+)\/metrics$/,
    );
    if (metricsMatch) {
      const cik = normaliseCik(metricsMatch[1]);
      if (!cik) {
        return json({ error: "Invalid CIK. Supply between 1 and 10 digits." }, 400);
      }
      if (!env.SEC_USER_AGENT || !/\S+\s+\S+/.test(env.SEC_USER_AGENT)) {
        return json({ error: "SEC_USER_AGENT is not configured." }, 503);
      }
      return getCandidateMetrics(cik, env.SEC_USER_AGENT);
    }

    const secMatch = url.pathname.match(
      /^\/sec\/company\/([^/]+)\/(submissions|facts)$/,
    );

    if (secMatch) {
      const cik = normaliseCik(secMatch[1]);
      if (!cik) {
        return json(
          { error: "Invalid CIK. Supply between 1 and 10 digits." },
          400,
        );
      }

      if (!env.SEC_USER_AGENT || !/\S+\s+\S+/.test(env.SEC_USER_AGENT)) {
        return json(
          {
            error: "SEC_USER_AGENT is not configured.",
            guidance:
              "Set a descriptive application name and a real contact address as a Worker secret or variable before using SEC routes.",
          },
          503,
        );
      }

      return fetchSecResource(cik, secMatch[2] as SecResource, env.SEC_USER_AGENT);
    }

    return json(
      {
        error: "Not found",
        availableRoutes: [
          "/health",
          "/sec/lookup?q={ticker-or-company-name}",
          "/sec/company/{cik}/submissions",
          "/sec/company/{cik}/facts",
          "/sec/company/{cik}/metrics",
          "/sec/company/{cik}/research",
        ],
      },
      404,
    );
  },
};
