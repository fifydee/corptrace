import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const start = source.indexOf("const filingTopics");
const end = source.indexOf("async function getCompanyResearch", start);
assert.notEqual(start, -1, "research topic map must exist");
assert.notEqual(end, -1, "research findings helpers must exist");

let isolated = source.slice(start, end);
isolated = isolated.replace("function buildResearchFindings(", "export function buildResearchFindings(");
isolated += "\nexport { filingTopics, researchTopicSectionMap, topicEvidencePatterns };\n";
const compiled = ts.transpileModule(isolated, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const mod = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("matches real SEC filing heading punctuation used by issuers", () => {
  const business = mod.filingTopics.find(topic => topic.key === "business");
  assert.ok(business?.patterns.some(pattern => pattern.test("ITEM 1 — BUSINESS")));
  assert.ok(business?.patterns.some(pattern => pattern.test("ITEM 1. | BUSINESS")));
});

test("does not report a disclosure as absent when its filing section was unavailable", () => {
  const findings = mod.buildResearchFindings(
    ["Employee count and workforce"],
    [{ key: "business", title: "Business", content: null }],
    "https://www.sec.gov/Archives/edgar/data/104169/000010416926000055/wmt-20260131.htm"
  );
  assert.equal(findings[0].status, "not_searched");
  assert.match(findings[0].explanation, /not searched/i);
});

test("does not mistake national population figures for employee counts or workforce geography", () => {
  const content = [
    "Approximately 314 million people in the U.S.",
    "As of December 31, 2025, we employed approximately 75,000 people worldwide."
  ].join(" ");
  const workforce = mod.buildResearchFindings(
    ["Employee count and workforce"],
    [{ key: "business", title: "Business", content }],
    "https://www.sec.gov/Archives/edgar/data/78003/000007800326000026/pfe-20251231.htm"
  );
  assert.equal(workforce[0].status, "disclosed_in_filing");
  assert.equal(workforce[0].evidence.length, 1);
  assert.match(workforce[0].evidence[0].excerpt, /75,000 people/);
  assert.doesNotMatch(workforce[0].evidence[0].excerpt, /314 million/);

  const geography = mod.buildResearchFindings(
    ["Employee geography and nationalities"],
    [{ key: "business", title: "Business", content: "Approximately 314 million people in the U.S." }],
    "https://www.sec.gov/Archives/edgar/data/78003/000007800326000026/pfe-20251231.htm"
  );
  assert.equal(geography[0].status, "not_found_in_filing");
});

test("recognises Walmart's scaled associate count in workforce findings", () => {
  const findings = mod.buildResearchFindings(
    ["Employee count and workforce"],
    [{ key: "business", title: "Business", content: "Approximately 2.1 million associates around the world." }],
    "https://www.sec.gov/Archives/edgar/data/104169/000010416926000055/wmt-20260131.htm"
  );
  assert.equal(findings[0].status, "disclosed_in_filing");
  assert.match(findings[0].evidence[0].excerpt, /2.1 million associates/);
});

test("recognises workforce geography when a scaled associate count names a region", () => {
  const findings = mod.buildResearchFindings(
    ["Workforce by country or region"],
    [{ key: "business", title: "Business", content: "Approximately 1.6 million associates in the U.S." }],
    "https://www.sec.gov/Archives/edgar/data/104169/000010416926000055/wmt-20260131.htm"
  );
  assert.equal(findings[0].status, "disclosed_in_filing");
});

test("recognises company operation disclosures phrased as conducting business in countries", () => {
  const findings = mod.buildResearchFindings(
    ["Operating regions and countries"],
    [{ key: "business", title: "Business", content: "Walmart International conducted business in 18 countries." }],
    "https://www.sec.gov/Archives/edgar/data/104169/000010416926000055/wmt-20260131.htm"
  );
  assert.equal(findings[0].status, "disclosed_in_filing");
  assert.match(findings[0].evidence[0].excerpt, /18 countries/);
});
