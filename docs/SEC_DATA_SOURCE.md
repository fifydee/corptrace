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
