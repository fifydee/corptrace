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

## External company-source discovery

Company profile discovery uses DuckDuckGo HTML search first, then Bing HTML and Bing RSS fallback. Search result URLs are normalized and validated as HTTPS before page retrieval; DuckDuckGo and Bing click-tracking redirects are unwrapped locally. Redirect destinations are revalidated before fetching. Individual page failures are logged and do not abort the rest of a company's source search.

The live company-source QA workflow exercises the actual search and page-retrieval code for Dell, Walmart and Pfizer. It requires at least one official company-domain page, one established business-publication page, and source-attributed facts from external pages. The SEC filing fallback is deliberately excluded from those checks so it cannot mask a failed external search. The JSON artifact records retrieved URLs, source classifications, extracted evidence and fact provenance.

Search providers may return anti-bot or rate-limit responses in hosted environments. The QA job treats a run without external pages as a failure and retains the diagnostics and report artifact; a successful SEC fallback alone is not considered a pass.

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
