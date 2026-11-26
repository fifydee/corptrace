# First Live Deployment

CorpTrace uses two Cloudflare services:
- **Worker API:** `corptrace-api` from `apps/api/wrangler.toml`
- **Pages frontend:** project `corptrace-web`, built from `apps/web`

## GitHub Actions prerequisites

Add these repository secrets under **Settings → Secrets and variables → Actions → Secrets**:
- `CLOUDFLARE_API_TOKEN`: a scoped token with Workers Scripts edit and Cloudflare Pages edit permissions.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.

Create or use a Cloudflare Pages project named `corptrace-web` and enable a `workers.dev` subdomain for the account.

## Two-stage first deployment

The API must be deployed before the frontend because the frontend build needs the API's actual URL.

1. In GitHub, open **Actions → Deploy CorpTrace API → Run workflow**. This deploys only the Worker after running the API TypeScript check.
2. Open that workflow run's **Deploy Cloudflare Worker** log and copy the deployed Worker URL. It should look like `https://corptrace-api.<your-workers-subdomain>.workers.dev`. Use the exact URL printed by Wrangler, not this example.
3. In **Settings → Secrets and variables → Actions → Variables**, create `VITE_API_BASE_URL` with the Worker URL as its value, without a trailing slash.
4. Open **Actions → Deploy CorpTrace → Run workflow**. This deploys the Worker again and then builds and publishes the frontend to Pages.

Never put the API token or account ID in a repository variable, source file or chat message.

## Smoke checks

On the deployed Worker, open:
- `/health` — should return JSON with `status: "ok"`.
- `/sec/lookup?q=Microsoft` — should return SEC registrant matches.
- `/sec/company/{CIK}/submissions` — should return SEC filing history.
- `/sec/company/{CIK}/metrics` — should return source-traceable candidate financial facts.
- `/sec/company/{CIK}/research` — should return annual filing section extraction where supported.

Then open the Pages site, search for a company, select the correct SEC registrant and confirm that the research page displays filing dates, source links, metric status and annual-report extracts.

## Local frontend-to-Worker smoke test

The CI workflow starts the Worker locally with Wrangler on port 8787 and the Vite frontend on port 4173. Vite proxies `/health` and `/sec/*` requests to the local Worker when `VITE_API_BASE_URL` is unset, matching the frontend's same-origin API calls during local development.

Run the HTTP-level integration smoke test after starting both local servers:

```sh
npm run test:e2e --workspace @corptrace/api
```

The test checks the served React app shell and entry module, the frontend-to-Worker health proxy, SEC company lookup, Microsoft filing submissions and SEC XBRL metrics. It exercises live SEC requests through the local Worker and does not deploy or contact the production Worker. This is a controlled HTTP integration check, not a substitute for full interactive browser testing across desktop and mobile devices.

## Browser-level company research tests

The local E2E CI job also installs pinned Playwright 1.56.1 and Chromium, then runs `apps/api/scripts/browser-e2e.mjs` against the locally served frontend and Worker.

The Chromium suite covers company search and selection, topic selection, research submission, loading and error announcements, and source-linked findings. It also checks a 390px mobile viewport for horizontal overflow, verifies that the mobile navigation exposes and updates its expanded state, and exercises the skip-to-main-content link and visible keyboard focus. SEC lookup, submissions and metrics requests still go through the local Worker to live SEC endpoints. The narrative research response is deliberately stubbed in the browser test so UI behavior is deterministic and does not depend on third-party search-engine availability.

Run locally after installing Playwright and Chromium and starting the local Worker and Vite frontend:

```sh
node apps/api/scripts/browser-e2e.mjs
```

This is still a Chromium smoke suite, not a full WCAG audit or cross-browser certification. It does not test screen readers with assistive technology, exhaustive color-contrast criteria, every interactive route, or the deployed production Worker. Keep manual accessibility review and production validation on the launch checklist.

## External company-source discovery

Company profile discovery uses DuckDuckGo HTML search first, then Bing HTML/RSS and Google News RSS for publisher-diverse results. Search result URLs are normalized and validated as HTTPS before page retrieval; DuckDuckGo and Bing click-tracking redirects are unwrapped locally. Redirect destinations are revalidated before fetching. Individual page failures are logged and do not abort the rest of a company's source search.

The live company-source QA workflow exercises the actual search and page-retrieval code for Dell, Walmart and Pfizer. It records official company-domain coverage, established business-publication coverage and source-attributed external facts separately. The aggregate gate requires non-SEC external sources for at least two of the three companies and at least one established business-publication source across the sample. Official-company-page coverage and external profile-fact extraction are separately reported; gaps remain explicit coverage warnings rather than silently treated as success. The SEC filing fallback is deliberately excluded from external coverage counts so it cannot mask a failed external search. The JSON artifact records retrieved URLs, source classifications, evidence origin (retrieved page versus search snippet), extracted evidence and fact provenance.

The live external-source QA step is advisory in the GitHub Actions workflow: its coverage thresholds remain enforced by the script and its failure is retained in the job log/report, but the step uses `continue-on-error` because search-engine anti-bot controls and publisher availability are outside the application’s control. This prevents an upstream discovery outage from masking deterministic parser, build, SEC and browser integration checks. A green overall workflow must not be interpreted as a full external-source coverage sign-off; inspect the source-QA report and warnings separately.

Search providers may return anti-bot or rate-limit responses in hosted environments. Search results are canonicalized and click-tracking redirects are unwrapped before retrieval. Publisher-attributed Google News results are ranked ahead of generic search results when the publisher is a recognized business publication; official company-domain results remain next in priority. Publisher recognition includes major financial-news and business-information outlets (including MarketWatch, Yahoo Finance and Investopedia), while company-domain matching also supports concatenated corporate domains such as Dell Technologies' investor-relations host. When a publisher blocks page retrieval, a sufficiently descriptive search-index snippet can be retained as evidence and is explicitly labeled as a search-result snippet rather than a page extraction. Facts from unclassified third-party sites are excluded, source-specific fact conflicts are retained, and the latest SEC filing is prioritized for the primary profile summary. The QA job treats a run without external pages as a failure and retains diagnostics and the report artifact; a successful SEC fallback alone is not considered a pass.

External discovery keeps source-specific facts instead of collapsing conflicting values, excludes unclassified third-party pages from profile-fact extraction, and prioritizes the latest SEC filing when constructing the primary profile summary. Evidence provenance distinguishes a fetched page from a search-index snippet used when a publisher blocks retrieval.

## Automated live SEC research QA

Run the repeatable SEC integration check from the repository root:

```sh
npm run test:live --workspace @corptrace/api
```

The test invokes the actual Worker research handler in-process and retrieves current submissions metadata and annual filing HTML from SEC EDGAR for Dell, Walmart and Pfizer. It checks annual filing selection, Item 1 and Item 2 extraction, topic-level workforce findings, headquarters facts, normalized employee counts and Walmart's disclosed international country count. It writes `apps/api/live-sec-qa-report.json`.

The GitHub Actions CI workflow runs this job after the standard audit, unit tests, API type-check, Worker dry-run and web build. The JSON report is uploaded as the `live-sec-qa-report` workflow artifact.

Scope is intentionally limited: the live QA harness stubs external company-web discovery and the Cloudflare rate-limit binding. It does not test the deployed Worker, frontend browser behavior, production Cloudflare settings or the external search provider. It does exercise the SEC submissions and filing-document requests, filing parser, topic matcher and SEC-backed profile fact extraction. A SEC-identifying User-Agent with a contact address is required.

For research, the parser scans up to 250,000 characters of each selected filing section so disclosures later in long Item 1 sections are not missed. API section previews remain capped at 14,000 characters; topic findings and profile facts are extracted from the larger internal search window.

## Global top-20 research universe

The Explore page starts with a global top-20 profitability reference universe based on the Fortune Global 500 2026 edition (fiscal 2025). It is a discovery and research starting point, not a live TTM ranking. Company reporting periods, accounting definitions and currencies differ. CorpTrace must show only figures traceable to source filings, and must not fill missing ranking values with estimates or silently mix periods.

The current first-pass SEC data adapter is strongest for SEC registrants. Non-US companies may have SEC filings (for example, 20-F/40-F) or require their home-market regulator and annual-report source. A company absent from SEC search must not be treated as unavailable globally; it needs a non-US source adapter.

## Current limitations

- The XBRL metric selector covers a limited set of standard US-GAAP concepts. It does not yet fully resolve issuer-specific extensions, all accounting frameworks, amendments, restatements or consolidation context.
- Annual report section extraction is heuristic. Extracted passages are marked for review and are not a verified summary of every claim or table.
- The global ranking reference is not recomputed from CorpTrace-normalised source filings yet.

Check current Cloudflare plan limits and account settings before production use; this guide does not promise unlimited free usage.

## API abuse protection

The Worker config includes a Cloudflare Rate Limiting binding named `API_RATE_LIMITER`. It allows 30 weighted units per client IP per 60 seconds; ordinary SEC API requests cost one unit and annual-filing research requests cost five. The health endpoint is excluded. Requests over the limit receive HTTP 429.

The namespace ID in `apps/api/wrangler.toml` must be unique within the Cloudflare account. Change it if another Worker already uses that ID for a different rate-limit purpose. Cloudflare's Worker rate-limit counters are approximate and maintained separately in each Cloudflare location; they are a useful abuse-control layer, not a strict global quota. IP-based limits can also affect multiple people sharing a mobile carrier or corporate network. For a strict global quota or authenticated per-user limits, use a Durable Object-backed limiter or key requests by a verified user identity.

The research endpoint also applies request timeouts to SEC and external-source fetches so a slow upstream publisher cannot hold a request open indefinitely.
