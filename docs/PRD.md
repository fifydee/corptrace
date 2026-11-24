# CorpTrace — Product Requirements Document

**Version:** 1.0 | **Status:** Approved for implementation

## 1. Vision
Make corporate information understandable, comparable and accessible to everyone. CorpTrace transforms publicly available annual reports, 10-K/20-F filings and official disclosures into visual dashboards and concise plain-language research.

## 2. Origin
The project began with a personal question: who are the world's ten most profitable companies, what do they do, how much do they make, and what can their annual reports reveal about the businesses behind everyday products and services? The initial top-ten dashboard has evolved into a broader research platform. The featured dashboard remains the entry point, not the product's limit.

## 3. Users
Curious individuals; students and researchers; job seekers and professionals; entrepreneurs; business analysts and consultants; and investors exploring fundamentals as independent informational research. CorpTrace does not provide personalised investment advice.

## 4. Product areas
Home / Explore; Company Directory; Company Profiles; Company Research; Company Comparison; SWOT Analysis; News & Corporate Developments; Financial Normalisation; Research Reports.

## 5. Home / Explore
Feature ten public companies ranked initially by trailing-twelve-month net income. Clearly distinguish this ranking period from each company's latest completed financial year. Company cards should show name, business, headquarters, founding year, latest financial-year revenue and net income, employee count and reporting period where disclosed.

Retain the eight-section story: The Lineup; Why They're Profitable; Where the Money Comes From; Where in the World; A Day in Your Life; The AI Capital Race; Where They Reinvest; What Keeps Them Up at Night.

## 6. Company discovery
Search by company name or ticker (with exchange context where needed). Browse by country, industry and sub-industry. Prioritise listed public companies with accessible disclosures and distinguish public from private companies.

## 7. Company profiles
Include identity, ticker, country of incorporation, headquarters, founding year, industry, business description, products/services, revenue segments, operating regions, employee count and workforce geography where disclosed, financial performance, investments, strategy, risks and corporate developments.

## 8. Configurable research
Users select one company and one or more categories:
- Overview: history, headquarters, operations, products and services.
- Financial: financial summary, revenue, expenses, operating costs, profitability, margins, debt, financial position, dividends and buybacks.
- People: employee count, workforce geography, leadership and compensation.
- Strategy: R&D, AI investment, capital expenditure, acquisitions, mergers and industry positioning.
- Risk/developments: disclosed risks, regulation, legal proceedings, disputes, controversies and recent news.

## 9. Comparison
Support two- and three-company comparisons with selectable categories: profiles, financial summaries, revenue, profit, segments, margins, debt, products, employees, workforce distribution, geography, investment, acquisitions, risks and SWOT. Align reporting periods and disclose accounting, fiscal-year, currency and availability differences.

## 10. SWOT
Support single-company and comparative SWOT: strengths, weaknesses, opportunities and threats. Distinguish disclosed facts from analytical interpretation and support claims with sources where possible.

## 11. News and corporate developments
Cover recent news, proposed/announced/completed M&A, legal proceedings, regulatory investigations, fines, sanctions, controversies and announcements. Each item needs publication date, source, original URL, company, category and concise summary. Distinguish allegations, investigations, lawsuits, settlements, court decisions and regulatory findings.

## 12. Currency and financial normalisation
USD is the default comparison currency, but preserve original amount and currency. Use appropriate historical average rates for revenue, expenses and net income; reporting-date rates for assets and liabilities; preserve margins and headcounts. Display original value, USD value, rate, period, method and rate source. Do not apply today's rate indiscriminately to historical results.

## 13. Data quality and provenance
- **Verified:** directly supported by an identified reliable source.
- **Estimated:** defensible estimate where official data is unavailable; visibly label it, explain why, disclose methodology and limitations.
- **Unavailable:** no reliable value and no defensible estimate.
Never present estimates as official disclosures. Material claims should retain source organisation, report/filing title, reporting period, URL and retrieval date.

## 14. Sources
Prioritise company investor-relations websites and annual reports; SEC EDGAR 10-K/20-F filings and structured data; other national securities regulators; official announcements; transparent historical FX sources; reputable news, court and regulator publications. Review access terms, rate limits and reuse restrictions before integration.

## 15. UX and visual design
Visual-first, with concise structured prose. Use metric cards, line/bar/stacked/doughnut charts, maps where relevant, side-by-side comparisons, four-quadrant SWOT, timelines, news/risk cards and tables where precision matters. Explanations answer: what does it mean, why does it matter, what should a non-specialist understand? Minimise long paragraphs.

Retain warm cream, espresso, caramel, sage, clay and latte surfaces. Editorial, modern, restrained, spacious and approachable.

## 16. Technical direction
React + TypeScript frontend; server-side API services with isolated provider adapters; shared company, filing, metric, FX, news and provenance models. Cloudflare Pages for web, Workers for API, D1 as a database candidate, R2 optional for document/object storage. Keep secrets out of browser code and Git. Use caching, validation, error handling and freshness metadata.

## 17. Delivery roadmap
1. Foundation: repository, architecture, design system, data models.
2. Explore dashboard: landing, top-ten lineup and featured story.
3. Discovery: search, ticker lookup, country/industry browsing and profiles.
4. Research: category selection, single-company analysis, provenance and data states.
5. Comparison and SWOT: two/three-company comparison and single/comparative SWOT.
6. Developments: news, M&A, legal and regulatory reporting.
7. Normalisation: historical FX and comparable reporting periods.
8. Reports and launch: exports, testing, responsive QA and portfolio integration.

## 18. Initial release
Prioritise landing/dashboard, company search/directory, profiles, configurable research, single-company analysis, two-company comparison, basic SWOT and source/data-quality transparency. Add three-company comparisons, advanced trends, full news/legal monitoring, advanced FX, PDF exports, watchlists and expanded international coverage in later releases.

## 19. Success criteria
A non-specialist can understand CorpTrace, discover a company, view a profile, select research, compare companies, view SWOT, trace material claims, distinguish verified/estimated data and understand currency and period treatment.

## 20. Portfolio documentation
At the end, publish a personal Field Notes story about the curiosity that sparked the project, its evolution from top-ten dashboard to research platform, product and architecture decisions, data challenges, iterations, lessons and finished application.
