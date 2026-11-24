export interface Env {
  APP_ENV?: string;
  SEC_USER_AGENT?: string;
}

type SecResource = "submissions" | "facts";

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

function normaliseCik(input: string): string | null {
  if (!/^\\d{1,10}$/.test(input)) return null;
  return input.padStart(10, "0");
}

async function fetchSecResource(
  cik: string,
  resource: SecResource,
  userAgent: string,
): Promise<Response> {
  const endpoint =
    resource === "submissions"
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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

    const secMatch = url.pathname.match(
      /^\\/sec\\/company\\/([^/]+)\\/(submissions|facts)$/,
    );

    if (secMatch) {
      const cik = normaliseCik(secMatch[1]);
      if (!cik) {
        return json(
          { error: "Invalid CIK. Supply between 1 and 10 digits." },
          400,
        );
      }

      if (!env.SEC_USER_AGENT || !/\\S+\\s+\\S+/.test(env.SEC_USER_AGENT)) {
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
          "/sec/company/{cik}/submissions",
          "/sec/company/{cik}/facts",
        ],
      },
      404,
    );
  },
};
