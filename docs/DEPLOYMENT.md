# First Live Deployment

CorpTrace uses two Cloudflare services:
- **Worker API:** `corptrace-api` from `apps/api/wrangler.toml`
- **Pages frontend:** project `corptrace-web`, built from `apps/web`

## GitHub Actions deployment

The repository contains a manual workflow at **Actions → Deploy CorpTrace → Run workflow**. Before running it, configure the repository:

### Secrets
- `CLOUDFLARE_API_TOKEN`: an API token with Workers Scripts edit and Cloudflare Pages edit permissions for the intended account.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.

### Repository variable
- `VITE_API_BASE_URL`: the full HTTPS origin of the deployed Worker, for example `https://corptrace-api.<your-workers-subdomain>.workers.dev`. Do not include a trailing slash.

## One-time Cloudflare setup

1. Create or use a Cloudflare account and enable the Workers & Pages product.
2. Create the Pages project named `corptrace-web` with production branch `main` (the workflow deploys the built static files).
3. Confirm the account has a `workers.dev` subdomain enabled.
4. Create a scoped API token with permission to deploy Workers and Pages.
5. Add the two GitHub Actions secrets and the API-origin repository variable above.
6. Run the Deploy CorpTrace workflow.

The Worker is deployed first. The frontend is then built with the API origin and uploaded to Pages. The expected frontend address is `https://corptrace-web.pages.dev`, subject to Cloudflare's project availability and account configuration.

## SEC contact

The Worker configuration identifies CorpTrace with the contact address approved by the project owner. It is public application metadata, not a credential.

## Smoke checks after deployment

Open these endpoints on the deployed Worker:
- `/health` — should return JSON with `status: "ok"`.
- `/sec/lookup?q=Microsoft` — should return SEC registrant matches.
- `/sec/company/{CIK}/submissions` — should return SEC filing history.
- `/sec/company/{CIK}/metrics` — should return candidate financial facts and filing links.

Then open the Pages site, search for Microsoft, select the SEC registrant match and confirm that the company research page displays source response metadata, candidate financial values and recent filings.

## Current limitation

The candidate selector is a first-pass XBRL filter, not a filing-review system. Its outputs must remain visibly marked as unverified candidates. Do not use them to publish a global profitability ranking until the concepts, periods, filing amendments and consolidated reporting context are reviewed.

## Cost and operational note

Check current Cloudflare plan limits and account settings before production use. This project is designed to start lean, but this guide does not promise unlimited free usage.


The deployment workflow intentionally stops if `VITE_API_BASE_URL` is not configured, so the published frontend cannot silently ship with API calls pointed at the Pages origin.
