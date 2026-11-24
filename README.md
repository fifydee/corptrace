# CorpTrace

An approachable company intelligence and research platform. CorpTrace turns public company disclosures into structured, visual and understandable research.

## Product direction

- Explore a featured list of the world's most profitable public companies.
- Find companies by name, ticker, country or industry.
- Research one company using selectable information categories.
- Compare two or three companies.
- Produce single-company and comparative SWOT analyses.
- Explore corporate news, acquisitions, legal and regulatory developments.
- Show USD-normalised financial figures while retaining original reported amounts.
- Distinguish verified, estimated and unavailable information.

## Trust principles

1. Primary sources first: company annual reports, investor-relations disclosures and regulatory filings.
2. Every important metric should carry provenance: source URL, document, reporting period and retrieval date.
3. Estimates must be visibly labelled and accompanied by methodology and limitations.
4. Where no defensible estimate exists, show an explicit unavailable state.
5. Never imply an illustrative or estimated number is an officially reported figure.
6. Align financial reporting periods and disclose accounting or currency differences in comparisons.

## Architecture

This repository will be a modular monorepo: `apps/web` for React + TypeScript, `apps/api` for server-side services, `packages/ui` for reusable components, `packages/domain` for shared data contracts, and `docs` for product and build documentation.

The initial milestone is a working responsive frontend foundation with clearly marked demonstration data. Production data integrations will be added as independently testable modules.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

## Data integrity

The initial interface may contain demonstration records to show layout and interactions. These are not live financial research. Official filings and company disclosures will be integrated in subsequent milestones. API keys must never be committed to GitHub or exposed in browser code.


## Current live-preview scope

The web application now connects to the SEC-backed API for registrant lookup, company filing history and first-pass annual financial fact candidates. Configure `VITE_API_BASE_URL` to the deployed Worker origin when building the frontend. See [Deployment](docs/DEPLOYMENT.md).

Candidate values are not verified financial results. The current selector is a first-pass research aid and does not yet replace a filing review. The app does not yet provide a verified global top-ten profitability ranking, news monitoring, or live comparison analysis.
