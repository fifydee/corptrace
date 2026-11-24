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
        ],
      },
      404,
    );
  },
};
