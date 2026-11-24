# CorpTrace — Build Journal

This journal will inform the Field Notes article on Ifeoma's portfolio.

## Origin
The project began with Ifeoma's curiosity about the world's ten most profitable companies: what they do, how much they make, where they operate, how they earn money and what annual reports reveal about their business models.

## Milestones
1. **Curiosity to dashboard concept:** an initial exploration of what the ten most profitable companies reveal to an everyday person became a one-page narrative dashboard.
2. **Dashboard to product:** the idea expanded to a global public-company research tool with company discovery, selectable research, comparisons and SWOT.
3. **Initial prototype:** an interactive React dashboard was created on Replit with a warm cream, espresso, caramel, sage and clay palette.
4. **Product direction:** CorpTrace became a modular, visual-first company intelligence platform for non-specialists and professionals.
5. **PRD and architecture:** product requirements, architecture principles and data policy were documented.
6. **GitHub foundation:** a dedicated public repository was created for independent development.

## Ongoing log
Add dated entries after meaningful product decisions, integrations, design iterations, data challenges, tests and releases.

## Field Notes article plan
Tell the first-person story: the original question; first dashboard; product expansion; audience/accessibility choices; research/data challenges; design and architecture decisions; iterations and trade-offs; lessons; finished capabilities.


7. **API and shared data foundations (24 November 2026):** added a Cloudflare Worker API shell with a health endpoint, the first shared domain contracts for companies and sourced financial metrics, repository ignore rules and automated CI checks. This creates a server-side boundary for future data providers and keeps provenance/status fields in the core model from the beginning.
8. **First data-source decision (24 November 2026):** selected SEC EDGAR submissions and XBRL company-facts APIs as the first research integration candidate. The official SEC documentation confirms public JSON endpoints without API keys, and that data.sec.gov does not support browser CORS. The integration plan therefore keeps retrieval server-side and records the need for a real contact-bearing User-Agent, rate-limit compliance and filing-level validation. No financial data has been connected yet.

9. **SEC retrieval adapter (24 November 2026):** added server-side API routes for a company's SEC filing submissions history and XBRL company facts. CIK input is validated and zero-padded, SEC requests carry a configurable User-Agent, upstream errors are handled, and responses are explicitly marked as raw source responses rather than verified CorpTrace metrics. The integration remains inactive until a real contact-bearing User-Agent is configured; no company facts are yet normalised or published.

10. **SEC company discovery (24 November 2026):** extended the API with a ticker/company-name lookup against the SEC's public company-tickers file. Results include CIK, ticker and registrant name, capped at 20 matches and explicitly framed as registrant lookup rather than a guarantee of entity identity. This is the first step toward a company search flow backed by official identifiers.

11. **SEC contact configuration and first metric selector (24 November 2026):** configured the SEC request identification string with the project owner's approved contact address. Added a first-pass annual metric candidate selector for revenue, net income, operating income, total assets, total liabilities and operating cash flow. The selector filters annual filing forms and duration/instant fact shapes, and returns filing accession details and source links. Output is deliberately marked candidate/unverified; it is not yet suitable for rankings or public financial claims. The contact address is visible in the public repository configuration, as it is not a credential.

12. **First connected web research flow (24 November 2026):** replaced the static research placeholder with a live API-backed company workflow. The directory now searches SEC registrants; selecting a match requests SEC company facts and submission history in parallel; the research view displays candidate metrics with reporting dates, filing accession links and clear unverified status, plus recent filing links. Added CORS support for the separate Pages frontend and responsive result layouts.
13. **Deployment path prepared (24 November 2026):** added a manual GitHub Actions workflow to deploy the Worker and Pages frontend, plus a deployment guide listing the Cloudflare account prerequisites, scoped credentials and smoke checks. The project is not yet publicly deployed; Cloudflare account configuration and GitHub deployment secrets/variable remain external prerequisites.
