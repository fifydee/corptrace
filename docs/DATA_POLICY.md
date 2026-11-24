# CorpTrace — Data Quality and Research Policy

## Source hierarchy
1. Official company annual reports and investor-relations publications.
2. Official regulatory filings and securities regulators.
3. Official company announcements and regulator/court records.
4. Reputable news organisations for current developments.
5. Secondary sources only as supporting context, never silently substituted for primary disclosure.

## Data states
**Verified:** directly supported by an identified primary source, with the source document/URL, reporting period and retrieval date recorded. For SEC XBRL facts, CorpTrace may label a metric **Verified · SEC-reported** when it is tied to a specific 10-K, 20-F or 40-F accession and passes source-traceability checks: an approved standard concept mapping, a valid unit, the expected annual duration or instant shape, a reporting date, filing date and accession number. Link directly to the filing index. This means the value is verified as reported in that filing; it does not mean CorpTrace has independently audited the company, resolved every accounting-policy difference, or established comparability with another company. Keep those limitations visible. If any required source or mapping check is missing or ambiguous, retain **Candidate** or mark **Unavailable** rather than claiming verification.

**Estimated:** use only where reported information cannot be obtained and a defensible method exists. Show a visible estimate label, explain why an estimate was required, disclose method and limitations, and avoid false precision.

**Unavailable:** use when no reliable value or defensible estimate exists. Explain what could not be found where practical.

## Research rules
- Never fabricate a metric, filing, citation, event or legal status.
- Do not confuse revenue, net income, operating income, market capitalisation or cash flow.
- Do not conflate fiscal periods or reporting currencies.
- Identify consolidated vs segment values.
- Distinguish company headquarters, registered offices, operating locations, revenue geography, employee work locations and employee nationalities. Do not treat these as interchangeable.
- Report office/facility counts only when the company explicitly discloses a count and its scope/date.
- Report workforce nationalities only when explicitly disclosed; employee location does not establish nationality.
- Treat segment revenue/profit as segment-level performance. Do not label it product-level profitability unless the company discloses product-level profit or a defensible, transparent allocation is possible.
- When a requested item is absent from the filing, mark it unavailable in that source/report rather than estimating without a defensible method.
- Distinguish reported employee totals from estimated workforce geography.
- Separate company-disclosed risks from independent analysis.
- Distinguish allegations, investigations, filed proceedings, settlements and court/regulatory findings.
- News must show publication date and source link.
- Preserve original currency and expose conversion methodology.

## FX
Period-flow values (revenue, expenses, income): suitable historical average rate. Balance-sheet values: reporting-date rate. Percentages and headcounts are not converted. Keep original and USD-normalised values side by side.

## Access and reuse
Prefer official public documents and APIs. Review access terms, automated-access conditions, rate limits and permitted reuse before integration. Free-to-read does not automatically mean unrestricted automated extraction or republication.
