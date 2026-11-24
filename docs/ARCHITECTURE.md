# CorpTrace — Initial Technical Architecture

## Goals
Modular feature development; separation of UI, domain logic, providers and persistence; source provenance as a first-class concept; safe credentials; gradual transition from demo UI to live research.

## Proposed monorepo
```
apps/
  web/                 React + TypeScript client
  api/                 Cloudflare Worker API
packages/
  ui/                  reusable accessible components
  domain/              shared company, metric and provenance models
  charts/              reusable visualisations
docs/
  PRD.md
  ARCHITECTURE.md
  DATA_POLICY.md
  BUILD_JOURNAL.md
```

Feature modules live under `apps/web/src/features`; server capabilities under `apps/api/src/modules`. Shared contracts live in `packages/domain`.

## Request flow
1. Browser requests a page or research action.
2. Web app calls CorpTrace API.
3. API validates input and orchestrates provider adapters.
4. Adapters retrieve official filings, company IR disclosures, regulators, FX or news.
5. Normalisation services attach periods, currencies, units, source provenance and retrieval metadata.
6. Validated results return to UI and may be cached/persisted.
7. UI renders charts, explanations and explicit data-quality states.

Never expose provider credentials in browser code.

## Provider adapters
Each provider is isolated behind a stable adapter interface. Product modules consume normalised domain objects rather than provider-specific response formats.

## Provenance model
A metric should record company ID, metric name/value, unit/original currency, period start/end/type, source title/URL, source page/section if available, retrieval timestamp, status (verified/estimated/unavailable), and estimation method/caveat where applicable.

## Currency
Retain original value/currency and USD normalised value, rate, rate date/period, provider and method. Period-flow metrics use appropriate period rates; balance-sheet values use period-end rates.

## Persistence and hosting
D1 is the initial relational database candidate, subject to checking current plan limits. R2 is optional if storing source files or exports is justified. Web deploys to Cloudflare Pages; API deploys independently to Workers. Use environment secrets and preview deployments.

## Testing
Unit tests for calculations, period alignment and FX; contract tests for provider adapters using fixtures; component tests for data-state rendering; integration and end-to-end tests for key journeys.
