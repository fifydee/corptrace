import assert from "node:assert/strict";
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const apiDir = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, apiDir), "utf8");
const [indexSource, officialSource, parserSource] = await Promise.all([
  read("src/index.ts"),
  read("src/official-company-sources.ts"),
  read("src/filing-parser.mjs"),
]);

const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
};
const transpile = (source) => ts.transpileModule(source, { compilerOptions }).outputText;
const stripExports = (source) => source.replace(/^export\s+/gm, "");

const indexWithoutImports = indexSource.replace(/^import\s+.*?;\s*$/gm, "");
assert.ok(!/^import\s/m.test(indexWithoutImports), "QA bundle must not retain unresolved imports");

const externalSearchStub = `
async function findOfficialCompanySources(companyName, selectedTopics = []) {
  return {
    sourceSearch: "skipped_in_live_sec_qa",
    retrievedAt: new Date().toISOString(),
    notice: "External web discovery is intentionally disabled in this SEC-only integration test.",
    sources: [],
    facts: [],
    overview: null,
  };
}
`;

const bundle = [
  stripExports(transpile(officialSource)),
  stripExports(parserSource),
  externalSearchStub,
  transpile(indexWithoutImports),
].join("\n");

const workerModule = await import(
  "data:text/javascript;base64," + Buffer.from(bundle).toString("base64")
);
const worker = workerModule.default;
assert.equal(typeof worker?.fetch, "function", "Worker fetch handler must be exported");

const userAgent = process.env.CORPTRACE_SEC_USER_AGENT
  || "CorpTrace live SEC QA/0.1 (corptrace@protonmail.com)";
assert.match(userAgent, /\S+\s+\S+/, "SEC requests require a descriptive User-Agent and contact");

const topics = [
  "Company overview and history",
  "Headquarters and registered locations",
  "Operating regions and countries",
  "Employee count and workforce",
  "Employee geography and nationalities",
  "Workforce by country or region",
];

const companies = [
  {
    id: "dell",
    cik: "0001571996",
    expectedName: /Dell Technologies/i,
    employeePattern: /97,000\s+employees/i,
    employeeLabel: "approximately 97,000 employees",
  },
  {
    id: "walmart",
    cik: "0000104169",
    expectedName: /Walmart/i,
    employeePattern: /2\.1\s+million\s+associates/i,
    employeeLabel: "approximately 2.1 million associates",
  },
  {
    id: "pfizer",
    cik: "0000078003",
    expectedName: /Pfizer/i,
    employeePattern: /75,000\s+people/i,
    employeeLabel: "approximately 75,000 people",
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  testScope: "Live SEC submissions and annual filing retrieval; actual CorpTrace Worker route, filing parser, topic extraction and source attribution. External web discovery intentionally stubbed.",
  userAgent,
  companies: [],
};

for (const company of companies) {
  const query = new URLSearchParams({ topics: topics.join("|") });
  const request = new Request(
    `https://corptrace-qa.invalid/sec/company/${company.cik}/research?${query}`,
    { headers: { "cf-connecting-ip": "198.51.100.10" } },
  );
  const response = await worker.fetch(request, {
    APP_ENV: "live-qa",
    SEC_USER_AGENT: userAgent,
    API_RATE_LIMITER: { limit: async () => ({ success: true }) },
  });

  const body = await response.json();
  assert.equal(response.status, 200, `${company.id}: research endpoint returned ${response.status}: ${JSON.stringify(body)}`);
  assert.match(body.companyName ?? "", company.expectedName, `${company.id}: SEC entity name mismatch`);
  assert.ok(["10-K", "20-F", "40-F"].includes(body.form), `${company.id}: expected an annual SEC filing`);
  assert.match(body.documentUrl ?? "", /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//, `${company.id}: filing URL must point to SEC EDGAR`);

  const businessSection = body.sections?.find((section) => section.key === "business");
  assert.ok(businessSection?.content, `${company.id}: Item 1 / Business section was not extracted`);
  assert.ok(businessSection.extraction?.headingMatched, `${company.id}: business heading was not matched`);

  const workforceFinding = body.findings?.find((finding) => finding.topic === "Employee count and workforce");
  assert.ok(workforceFinding, `${company.id}: workforce topic result missing`);
  assert.equal(
    workforceFinding.status,
    "disclosed_in_filing",
    `${company.id}: expected workforce disclosure in reviewed filing sections; got ${workforceFinding.status}. Excerpts: ${JSON.stringify(workforceFinding.evidence)}`,
  );

  const workforceEvidence = workforceFinding.evidence.map((item) => item.excerpt).join("\n");
  assert.match(
    workforceEvidence,
    company.employeePattern,
    `${company.id}: workforce finding did not contain ${company.employeeLabel}`,
  );

  const findings = Object.fromEntries((body.findings ?? []).map((finding) => [finding.topic, {
    status: finding.status,
    excerpts: finding.evidence.map((item) => item.excerpt),
  }]));
  const companyReport = {
    id: company.id,
    companyName: body.companyName,
    cik: body.cik,
    form: body.form,
    filedAt: body.filedAt,
    reportDate: body.reportDate,
    accessionNumber: body.accessionNumber,
    documentUrl: body.documentUrl,
    sectionHeading: businessSection.extraction.headingText,
    sectionCharacters: businessSection.content.length,
    workforceStatus: workforceFinding.status,
    workforceEvidence: workforceFinding.evidence.map((item) => item.excerpt),
    extractedProfileFacts: (body.officialSources?.facts ?? []).map((fact) => ({
      key: fact.key,
      value: fact.value,
      sourceUrl: fact.sourceUrl,
    })),
    topicFindings: findings,
  };
  report.companies.push(companyReport);
  process.stdout.write(JSON.stringify({
    company: companyReport.id,
    filing: companyReport.form,
    filedAt: companyReport.filedAt,
    workforce: companyReport.workforceEvidence,
  }) + "\n");
}

const outputPath = resolve(process.cwd(), "live-sec-qa-report.json");
await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    "## CorpTrace live SEC QA",
    "",
    "| Company | Filing | Filed | Workforce result |",
    "|---|---|---|---|",
    ...report.companies.map((company) =>
      `| ${company.companyName} | ${company.form} | ${company.filedAt} | ${company.workforceEvidence.join(" ")} |`
    ),
    "",
    "This run exercised the CorpTrace Worker research route against live SEC submissions and filing documents. External company-web discovery was intentionally stubbed; the SEC filing fallback, parsing, topic matching and source attribution were exercised.",
    "",
    "Full excerpts and topic results are available in the `live-sec-qa-report.json` workflow artifact.",
  ].join("\n");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}
process.stdout.write(`Live SEC QA passed for ${report.companies.length} companies. Report: ${outputPath}\n`);
