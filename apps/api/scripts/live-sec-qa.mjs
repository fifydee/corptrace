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

const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
const transpile = (source) => ts.transpileModule(source, { compilerOptions }).outputText;
const officialHelpersEnd = officialSource.indexOf("export async function findOfficialCompanySources(");
assert.notEqual(officialHelpersEnd, -1, "official source discovery function must be identifiable");
const officialHelpersSource = officialSource.slice(0, officialHelpersEnd);
const stripExports = (source) => source.replace(/^export\s+/gm, "");
const indexWithoutImports = indexSource.replace(/^import\s+.*?;\s*$/gm, "");
assert.ok(!/^import\s/m.test(indexWithoutImports), "QA bundle must not retain unresolved imports");

const externalSearchStub = [
  "async function findOfficialCompanySources(companyName, selectedTopics = []) {",
  "  return {",
  "    sourceSearch: \"skipped_in_live_sec_qa\",",
  "    retrievedAt: new Date().toISOString(),",
  "    notice: \"External web discovery is intentionally disabled in this SEC-only integration test.\",",
  "    sources: [],",
  "    facts: [],",
  "    overview: null,",
  "  };",
  "}",
].join("\n");

const bundle = [
  stripExports(transpile(officialHelpersSource)),
  stripExports(parserSource),
  externalSearchStub,
  transpile(indexWithoutImports),
].join("\n");

const workerModule = await import("data:text/javascript;base64," + Buffer.from(bundle).toString("base64"));
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
    headquartersPattern: /Round Rock/i,
  },
  {
    id: "walmart",
    cik: "0000104169",
    expectedName: /Walmart/i,
    employeePattern: /2\.1\s+million\s+associates/i,
    employeeLabel: "approximately 2.1 million associates",
    headquartersPattern: /Bentonville/i,
  },
  {
    id: "pfizer",
    cik: "0000078003",
    expectedName: /Pfizer/i,
    employeePattern: /75,000\s+people/i,
    employeeLabel: "approximately 75,000 people",
    headquartersPattern: /New York City/i,
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  testScope: "Live SEC submissions and annual filing retrieval; actual CorpTrace Worker route, filing parser, topic extraction and source attribution. External web discovery intentionally stubbed.",
  userAgent,
  companies: [],
};
const outputPath = resolve(process.cwd(), "live-sec-qa-report.json");
const failures = [];

for (const company of companies) {
  const errors = [];
  let body = {};
  let responseStatus = null;
  try {
    const query = new URLSearchParams({ topics: topics.join("|") });
    const requestUrl = "https://corptrace-qa.invalid/sec/company/" + company.cik + "/research?" + query;
    const request = new Request(requestUrl, {
      headers: { "cf-connecting-ip": "198.51.100.10" },
    });
    const response = await worker.fetch(request, {
      APP_ENV: "live-qa",
      SEC_USER_AGENT: userAgent,
      API_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    responseStatus = response.status;
    body = await response.json();
    if (response.status !== 200) {
      errors.push("Research endpoint returned HTTP " + response.status + ": " + JSON.stringify(body));
    } else {
      if (!company.expectedName.test(body.companyName ?? "")) errors.push("SEC entity name mismatch: " + body.companyName);
      if (!["10-K", "20-F", "40-F"].includes(body.form)) errors.push("No supported annual filing form was selected: " + body.form);
      if (!/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//.test(body.documentUrl ?? "")) errors.push("Filing URL does not point to SEC EDGAR");

      const businessSection = body.sections?.find((section) => section.key === "business");
      if (!businessSection?.content) errors.push("Item 1 / Business section was not extracted");
      if (!businessSection?.extraction?.headingMatched) errors.push("Business section heading was not matched");

      const profileFacts = body.officialSources?.facts ?? [];
      const employeeFact = profileFacts.find((fact) => fact.key === "employees");
      if (!employeeFact || !company.employeePattern.test(employeeFact.value)) {
        errors.push("SEC fallback profile facts did not extract " + company.employeeLabel + "; received: " + (employeeFact?.value ?? "no employee fact"));
      }
      const headquartersFact = profileFacts.find((fact) => fact.key === "headquarters");
      if (!headquartersFact || !company.headquartersPattern.test(headquartersFact.value)) {
        errors.push("SEC fallback profile facts did not extract the expected headquarters; received: " + (headquartersFact?.value ?? "no headquarters fact"));
      }
      if (company.id === "walmart") {
        const countriesFact = profileFacts.find((fact) => fact.key === "countries");
        if (!countriesFact || countriesFact.value !== "18") {
          errors.push("Expected Walmart international operations country count of 18; received: " + (countriesFact?.value ?? "no country count"));
        }
      }

      const headquartersFinding = body.findings?.find((finding) => finding.topic === "Headquarters and registered locations");
      if (!headquartersFinding || headquartersFinding.status !== "disclosed_in_filing") {
        errors.push("Headquarters topic was not disclosed in the selected annual filing sections");
      }
      const propertiesSection = body.sections?.find((section) => section.key === "properties");
      if (!propertiesSection?.content) errors.push("Item 2 / Properties section was not extracted");
      const workforceFinding = body.findings?.find((finding) => finding.topic === "Employee count and workforce");
      if (!workforceFinding) {
        errors.push("Workforce topic result is missing");
      } else {
        if (workforceFinding.status !== "disclosed_in_filing") {
          errors.push("Expected workforce disclosure in reviewed filing sections; got " + workforceFinding.status);
        }
        const excerpts = workforceFinding.evidence.map((item) => item.excerpt).join("\n");
        if (!company.employeePattern.test(excerpts)) {
          errors.push("Expected " + company.employeeLabel + " in workforce evidence; received: " + excerpts);
        }
      }
    }

    const workforceFinding = body.findings?.find((finding) => finding.topic === "Employee count and workforce");
    const findings = Object.fromEntries((body.findings ?? []).map((finding) => [finding.topic, {
      status: finding.status,
      excerpts: finding.evidence.map((item) => item.excerpt),
    }]));
    report.companies.push({
      id: company.id,
      httpStatus: responseStatus,
      companyName: body.companyName ?? null,
      cik: body.cik ?? company.cik,
      form: body.form ?? null,
      filedAt: body.filedAt ?? null,
      reportDate: body.reportDate ?? null,
      accessionNumber: body.accessionNumber ?? null,
      documentUrl: body.documentUrl ?? null,
      sectionHeading: body.sections?.find((section) => section.key === "business")?.extraction?.headingText ?? null,
      sectionCharactersReturned: body.sections?.find((section) => section.key === "business")?.content?.length ?? 0,
      workforceStatus: workforceFinding?.status ?? "missing",
      workforceEvidence: workforceFinding?.evidence?.map((item) => item.excerpt) ?? [],
      extractedProfileFacts: (body.officialSources?.facts ?? []).map((fact) => ({
        key: fact.key,
        value: fact.value,
        sourceUrl: fact.sourceUrl,
      })),
      topicFindings: findings,
      errors,
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    report.companies.push({
      id: company.id,
      httpStatus: responseStatus,
      companyName: body.companyName ?? null,
      form: body.form ?? null,
      documentUrl: body.documentUrl ?? null,
      errors,
    });
  }

  failures.push(...errors.map((error) => company.id + ": " + error));
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    company: company.id,
    httpStatus: responseStatus,
    filing: body.form ?? null,
    filedAt: body.filedAt ?? null,
    workforceStatus: body.findings?.find((finding) => finding.topic === "Employee count and workforce")?.status ?? "missing",
    errors,
  }) + "\n");
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    "## CorpTrace live SEC QA",
    "",
    "| Company | Filing | Filed | Workforce result | QA status |",
    "|---|---|---|---|---|",
    ...report.companies.map((company) =>
      "| " + (company.companyName ?? company.id) + " | " + (company.form ?? "—") + " | " + (company.filedAt ?? "—") + " | " + (company.workforceEvidence ?? []).join(" ") + " | " + (company.errors?.length ? "Needs attention" : "Passed") + " |"
    ),
    "",
    "This run exercised the CorpTrace Worker research route against live SEC submissions and filing documents. External company-web discovery was intentionally stubbed; SEC retrieval, filing parsing, topic matching and source attribution were exercised.",
    "",
    "Full excerpts and topic results are available in the live-sec-qa-report.json workflow artifact.",
    "",
    failures.length ? "### Findings requiring attention\n\n" + failures.map((failure) => "- " + failure).join("\n") : "All live SEC checks passed.",
  ].join("\n");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}

if (failures.length) {
  process.stderr.write("Live SEC QA found " + failures.length + " issue(s). See " + outputPath + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write("Live SEC QA passed for " + report.companies.length + " companies. Report: " + outputPath + "\n");
}
