# SEC EDGAR Data Source — Initial Integration Plan

## Why start here

The SEC provides public JSON APIs for filer submissions history and company XBRL facts. The company submissions endpoint includes identifiers and filing history. The company-facts endpoint returns standard-taxonomy facts for a company, including facts reported in 10-K, 10-Q, 8-K, 20-F and related filings.

Official documentation:
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- https://www.sec.gov/about/developer-resources
- https://www.sec.gov/about/webmaster-frequently-asked-questions

## Important implementation constraints

- SEC data APIs are public and do not require API keys.
- SEC states that data.sec.gov does not support browser CORS. Requests must be made from the server-side API, not directly from the browser.
- Requests must identify the application with a descriptive User-Agent. The contact information must be real and approved before production requests are enabled.
- Respect SEC fair-access limits, caching guidance and current access policies.
- Company XBRL facts are not a complete substitute for reading the filing. Company-specific extensions, narrative disclosures, segment detail and presentation context may require inspecting the actual filing.
- A returned XBRL fact is not automatically comparable across companies. Validate taxonomy tag, unit, period, duration, dimensions, filing accession and amendment context before using it.

## Planned adapter sequence

1. Resolve company identity to a CIK using official submissions/company ticker data.
2. Retrieve filing history and select the latest relevant annual filing.
3. Retrieve company facts and identify candidate facts for revenue, net income, assets, liabilities, cash flow and employee counts where disclosed.
4. Validate each fact against the filing accession and reporting period.
5. Store the original reported value, unit, period, source URL, accession number and retrieval timestamp.
6. Only then calculate derived values or currency conversions.

## Data integrity rule

Do not populate the public top-ten ranking from unvalidated tags or calendar-year frames. The ranking requires a defined period basis and comparable net-income values. Each company needs a fact-selection audit trail and a visible reporting period.

## Current status

This is a source and integration plan, not a live data integration. No SEC requests or financial facts are currently wired into the application.

## API routes now scaffolded

The Worker exposes these GET routes:
- `/health`
- `/sec/company/{cik}/submissions`
- `/sec/company/{cik}/facts`

Both SEC routes require the `SEC_USER_AGENT` environment value. It must identify CorpTrace and include a real contact address approved by the project owner. For local development, place it in `apps/api/.dev.vars` (this file is git-ignored):

```text
SEC_USER_AGENT="CorpTrace research contact: approved-email@example.com"
```

Replace the example with a real address before making requests. For deployment, configure the equivalent Worker secret through Wrangler. Never commit the contact value or any credentials.

These routes return raw SEC JSON with source URL and retrieval timestamp. They are deliberately not a financial-fact selection engine. The next layer must interpret filing accessions, taxonomy concepts, units, durations and dimensions before a metric can be labelled verified.

## Company identifier lookup

The API also exposes `GET /sec/lookup?q={ticker-or-company-name}`. It searches the SEC company-tickers JSON file and returns up to 20 matching CIK/ticker/registrant-name records. Treat this as candidate discovery only: users and later research workflows must confirm the correct legal entity, especially for similar company names and multiple share classes.

## Annual metric candidate endpoint

The Worker exposes `GET /sec/company/{cik}/metrics`. It currently searches the SEC company-facts `us-gaap` namespace for candidate values for:
- Revenue
- Net income
- Operating income
- Total assets
- Total liabilities
- Operating cash flow

The initial selector considers 10-K, 20-F and 40-F filing facts, applies a duration window to flow metrics and instant facts to balance-sheet metrics, then selects the most recent period end. It returns the concept, unit, dates, filing form, accession number and filing-index URL.

**This is a candidate selector, not a verification engine.** It does not yet inspect company-specific taxonomy extensions, filing presentation/linkbases, segment dimensions, amendments in full context, restatements, accounting policy differences or whether the selected concept is the best company-specific representation. Its output is explicitly marked `candidate_unverified`. Do not use it to publish rankings or label metrics verified without a filing review and reconciliation step.

## SEC request identification

The Worker config currently identifies the application as `CorpTrace/0.1 (corptrace@protonmail.com)`. This contact value was supplied by the project owner. It is an application identification header, not an API key or secret. Because the repository is public, the contact address is visible in its configuration.
