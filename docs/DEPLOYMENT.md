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

## Global top-20 research universe

The Explore page starts with a global top-20 profitability reference universe based on the Fortune Global 500 2026 edition (fiscal 2025). It is a discovery and research starting point, not a live TTM ranking. Company reporting periods, accounting definitions and currencies differ. CorpTrace must show only figures traceable to source filings, and must not fill missing ranking values with estimates or silently mix periods.

The current first-pass SEC data adapter is strongest for SEC registrants. Non-US companies may have SEC filings (for example, 20-F/40-F) or require their home-market regulator and annual-report source. A company absent from SEC search must not be treated as unavailable globally; it needs a non-US source adapter.

## Current limitations

- The XBRL metric selector covers a limited set of standard US-GAAP concepts. It does not yet fully resolve issuer-specific extensions, all accounting frameworks, amendments, restatements or consolidation context.
- Annual report section extraction is heuristic. Extracted passages are marked for review and are not a verified summary of every claim or table.
- The global ranking reference is not recomputed from CorpTrace-normalised source filings yet.

Check current Cloudflare plan limits and account settings before production use; this guide does not promise unlimited free usage.
