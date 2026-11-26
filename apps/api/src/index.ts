import { cleanFilingText, findSectionHeading, extractItemSection } from "./filing-parser.mjs";

export interface Env {
  APP_ENV?: string;
  SEC_USER_AGENT?: string;
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
    dataStatus: "verified",
    verificationLevel: "source_verified",
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
    status: "source_verified_data",
    metrics,
    notice:
      "Available figures are verified as reported SEC filing facts when a standard US-GAAP concept, unit, annual period (where applicable), filing form, accession number and filing date are present. This source verification does not establish cross-company comparability or independent audit assurance.",
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
  filings?: { recent?: FilingRecent };
};
const filingTopics = [
  { key: "business", title: "Business overview, products and operating footprint", patterns: [/ITEM\s+1[.\s]+BUSINESS/i, /ITEM\s+1[.\s]+DESCRIPTION OF BUSINESS/i] },
  { key: "risk", title: "Risk factors", patterns: [/ITEM\s+1A[.\s]+RISK FACTORS/i] },
  { key: "legal", title: "Legal proceedings", patterns: [/ITEM\s+3[.\s]+LEGAL PROCEEDINGS/i] },
  { key: "management", title: "Management discussion and financial performance", patterns: [/ITEM\s+7[.\s]+MANAGEMENT[’']?S?\s+DISCUSSION/i, /ITEM\s+7[.\s]+MANAGEMENT’S DISCUSSION/i] },
  { key: "controls", title: "Controls and procedures", patterns: [/ITEM\s+9A[.\s]+CONTROLS/i] },
];
const researchTopicSectionMap: Record<string, string[]> = {
  "Company overview and history": ["business"],
  "Headquarters and registered locations": ["business"],
  "Operating regions and countries": ["business"],
  "Offices and facilities": ["business"],
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
  "Leadership and compensation": ["management"],
  "Product and service performance": ["business", "management"],
  "Most profitable products or services": ["business", "management"],
  "Investment, R&D and AI": ["business", "management"],
  "Acquisitions and mergers": ["business", "legal"],
  "SWOT analysis": ["business", "risk", "management"],
  "Risk factors": ["risk"],
  "Legal cases and disputes": ["legal"],
  "Regulatory matters and controversies": ["risk", "legal"],
  "Recent company news": [],
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

async function getCompanyResearch(cik: string, userAgent: string, selectedTopics: string[] = []): Promise<Response> {
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  let submissionsResponse: Response;
  try {
    submissionsResponse = await fetch(submissionsUrl, { headers: { "User-Agent": userAgent, Accept: "application/json" } });
  } catch {
    return json({ error: "Could not retrieve SEC filing submissions.", sourceUrl: submissionsUrl }, 502);
  }
  if (!submissionsResponse.ok) return json({ error: "SEC filing submissions request failed.", upstreamStatus: submissionsResponse.status }, 502);
  const submissions = await submissionsResponse.json() as SubmissionPayload;
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
    documentResponse = await fetch(documentUrl, { headers: { "User-Agent": userAgent, Accept: "text/html" } });
  } catch {
    return json({ error: "Could not retrieve the annual filing document.", sourceUrl: documentUrl }, 502);
  }
  if (!documentResponse.ok) return json({ error: "The SEC annual filing document could not be retrieved.", upstreamStatus: documentResponse.status, sourceUrl: documentUrl }, 502);
  const html = await documentResponse.text();
  const text = cleanFilingText(html);
  const sections = filingTopics.map(topic => {
    const heading = findSectionHeading(text, topic.patterns);
    const content = heading ? extractItemSection(text, topic.patterns) : null;
    return {
      key: topic.key,
      title: topic.title,
      item: topic.key === "business" ? "1" : topic.key === "risk" ? "1A" : topic.key === "legal" ? "3" : topic.key === "management" ? "7" : "9A",
      content,
      source: { documentUrl, form, filedAt, reportDate, accessionNumber },
      extraction: { method: "line_preserving_heading_match", headingMatched: Boolean(heading), headingText: heading?.heading ?? null, confidence: content ? "candidate" : "unavailable" },
      dataStatus: content ? "candidate" : "unavailable",
      note: content
        ? "Candidate passage extracted from the identified annual filing. Heading matching is heuristic; verify the passage against the linked filing before relying on individual statements."
        : "No sufficiently supported section heading was detected. This does not establish that the filing lacks the information."
    };
  });
  return json({
    source: "SEC EDGAR annual filing",
    cik,
    form,
    filedAt,
    reportDate,
    accessionNumber,
    documentUrl,
    retrievedAt: new Date().toISOString(),
    status: "filing_sections_extracted",
    sections,
    notice: "Section extraction preserves paragraph and table-cell boundaries and uses heuristic heading selection to reduce table-of-contents matches. Extracted passages remain candidates: individual statements, tables, and product-level profitability are not independently verified."
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
