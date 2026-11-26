import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./official-company-sources.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const mod = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("decodes HTML entities and preserves readable paragraph boundaries", () => {
  assert.equal(
    mod.textOf("<p>Dell &amp; Co. has &#57;7,000 employees.</p><p>Second paragraph.</p>"),
    ["Dell & Co. has 97,000 employees.", "Second paragraph."].join("\n")
  );
});

test("unwraps DuckDuckGo redirect links and rejects unsafe protocols", () => {
  const target = "https://www.dell.com/about";
  const redirect = "https://duckduckgo.com/l/?uddg=" + encodeURIComponent(target);
  assert.equal(mod.cleanUrl(redirect, "https://html.duckduckgo.com/html/"), target);
  assert.equal(mod.cleanUrl("http://example.com", "https://example.com"), null);
});

test("does not mistake a third-party domain containing a company token for the company itself", () => {
  assert.equal(mod.classify("https://dell-careers.example.org/jobs", "Dell Technologies"), "other");
  assert.equal(mod.classify("https://www.dell.com/about", "Dell Technologies"), "company");
  assert.equal(mod.classify("https://www.sec.gov/Archives/edgar/data/1/filing.htm", "Dell Technologies"), "regulator");
});

test("extracts source-attributed company facts without treating facility square footage as office count", () => {
  const html = [
    "<h2>Company Overview</h2>",
    "<p>Dell Technologies is a global technology company that designs and sells infrastructure solutions.</p>",
    "<p>As of January 30, 2026, Dell Technologies had approximately 97,000 employees.</p>",
    "<p>The company operates in over 170 countries.</p>",
    "<p>Its global headquarters are located at One Dell Way, Round Rock, Texas.</p>",
    "<h2>Properties</h2>",
    "<p>The company owns and leases 18.2 million square feet of office, manufacturing and warehouse space worldwide.</p>"
  ].join("");
  const evidence = mod.extractBlocks(html);
  const sources = [{
    title: "Dell Technologies FY2026 Form 10-K",
    url: "https://www.sec.gov/Archives/edgar/data/1/filing.htm",
    domain: "sec.gov",
    sourceType: "regulator",
    retrievedAt: "2026-11-26T00:00:00.000Z",
    evidence
  }];
  const facts = mod.extractFacts(sources);
  assert.equal(facts.find(x => x.key === "employees")?.value, "97,000");
  assert.equal(facts.find(x => x.key === "countries")?.value, "170");
  assert.match(facts.find(x => x.key === "headquarters")?.value ?? "", /One Dell Way/);
  assert.equal(facts.some(x => x.key === "offices"), false);
  assert.match(facts.find(x => x.key === "business")?.value ?? "", /global technology company/i);
});

test("filters irrelevant financial footnotes from company profile evidence and normalises sentence starts", () => {
  const html = [
    "<h2>Company Overview</h2>",
    "<p>dell technologies is a global technology company that designs, develops, manufactures and sells computers and infrastructure solutions to customers worldwide.</p>",
    "<h2>Headquarters and Locations</h2>",
    "<p>The company is headquartered in Round Rock, Texas and operates in more than 170 countries around the world.</p>",
    "<h2>Stock-Based Compensation</h2>",
    "<p>Dell Technologies Inc. Stock-Based Compensation Plan provides stock incentive awards to employees and other service providers of the Company.</p>",
    "<h2>Revenue by Geography</h2>",
    "<p>The following table presents net revenue allocated between the United States and foreign countries for the period indicated.</p>",
    "<h2>Products and Services</h2>",
    "<p>The company offers personal computers, servers, storage, networking equipment, software and technology support services to businesses and consumers.</p>"
  ].join("");
  const evidence = mod.extractBlocks(html);
  assert.equal(evidence.some(x => /Stock-Based Compensation|net revenue allocated/i.test(x.excerpt)), false);
  assert.ok(evidence.every(x => /^[A-Z]/.test(x.excerpt)));
  assert.ok(evidence.some(x => /global technology company/i.test(x.excerpt)));
  assert.ok(evidence.some(x => /personal computers, servers/i.test(x.excerpt)));
});

test("rejects stock-compensation paragraphs even when they mention employees and services", () => {
  const html = [
    "<h2>Stock-Based Compensation</h2>",
    "<p>The stock-based compensation plan provides stock incentive awards to employees and other service providers of the Company.</p>",
    "<h2>Business Overview</h2>",
    "<p>Acme is a global technology company that designs and sells cloud software to businesses worldwide.</p>"
  ].join("");
  const evidence = mod.extractBlocks(html);
  assert.equal(evidence.some(x => /stock-based compensation|stock incentive awards/i.test(x.excerpt)), false);
  assert.equal(evidence.some(x => /global technology company/i.test(x.excerpt)), true);
});


test("extracts relevant business descriptions and product offerings across retail and healthcare industries", () => {
  const retailHtml = [
    "<h2>About the Company</h2>",
    "<p>Northstar Retail is a specialty retailer serving households through stores and digital channels.</p>",
    "<h2>Products and Services</h2>",
    "<p>The company offers home furnishings, appliances and delivery services to customers across the country.</p>",
    "<h2>Financial Statements</h2>",
    "<p>Net sales are presented by merchandise category and geographic region in the following table.</p>"
  ].join("");
  const healthcareHtml = [
    "<h2>Company Overview</h2>",
    "<p>MedNova is a biopharmaceutical company focused on developing medicines for patients with serious diseases.</p>",
    "<h2>Products and Services</h2>",
    "<p>The company develops and markets prescription medicines and provides patient support services.</p>",
    "<h2>Stock-Based Compensation</h2>",
    "<p>Restricted stock units are granted to eligible employees and vest over a four-year period.</p>"
  ].join("");

  const retailEvidence = mod.extractBlocks(retailHtml);
  const healthcareEvidence = mod.extractBlocks(healthcareHtml);
  assert.ok(retailEvidence.some(x => /specialty retailer/i.test(x.excerpt)));
  assert.ok(retailEvidence.some(x => /offers home furnishings/i.test(x.excerpt)));
  assert.ok(healthcareEvidence.some(x => /biopharmaceutical company/i.test(x.excerpt)));
  assert.ok(healthcareEvidence.some(x => /develops and markets prescription medicines/i.test(x.excerpt)));
  assert.equal(healthcareEvidence.some(x => /restricted stock units/i.test(x.excerpt)), false);
});

test("extracts Walmart-style associate counts as workforce facts", () => {
  // Based on Walmart FY2026 Form 10-K, Item 1A: https://www.sec.gov/Archives/edgar/data/104169/000010416926000055/wmt-20260131.htm
  const html = "<h2>Human Capital</h2><p>Approximately 2.1 million associates around the world, including approximately 1.6 million associates in the U.S.</p>";
  const evidence = mod.extractBlocks(html);
  const facts = mod.extractFacts([{
    title: "Walmart annual report",
    url: "https://www.sec.gov/Archives/edgar/data/104169/filing.htm",
    domain: "sec.gov",
    sourceType: "regulator",
    retrievedAt: "2026-11-26T00:00:00.000Z",
    evidence
  }]);
  assert.equal(facts.find(x => x.key === "employees")?.value, "2.1 million");
});

test("extracts Pfizer-style employee disclosures from an annual filing", () => {
  // Based on Pfizer 2025 Form 10-K, Our People: https://www.sec.gov/Archives/edgar/data/78003/000007800326000026/pfe-20251231.htm
  const html = "<h2>Our People</h2><p>As of December 31, 2025, we employed approximately 75,000 people worldwide.</p>";
  const evidence = mod.extractBlocks(html);
  const facts = mod.extractFacts([{
    title: "Pfizer 2025 Form 10-K",
    url: "https://www.sec.gov/Archives/edgar/data/78003/000007800326000026/pfe-20251231.htm",
    domain: "sec.gov",
    sourceType: "regulator",
    retrievedAt: "2026-11-26T00:00:00.000Z",
    evidence
  }]);
  assert.equal(facts.find(x => x.key === "employees")?.value, "75,000");
});

test("does not infer office counts from property descriptions across industries", () => {
  const html = [
    "<h2>Facilities</h2>",
    "<p>MedNova operates research laboratories and manufacturing facilities across several regions.</p>",
    "<p>The company leases 2.4 million square feet of laboratory, office and production space.</p>",
    "<h2>Business Overview</h2>",
    "<p>MedNova is a biopharmaceutical company developing innovative medicines for patients.</p>"
  ].join("");
  const evidence = mod.extractBlocks(html);
  const facts = mod.extractFacts([{
    title: "MedNova annual report",
    url: "https://www.sec.gov/Archives/edgar/data/2/filing.htm",
    domain: "sec.gov",
    sourceType: "regulator",
    retrievedAt: "2026-11-26T00:00:00.000Z",
    evidence
  }]);
  assert.equal(facts.some(x => x.key === "offices"), false);
  assert.ok(evidence.some(x => /research laboratories and manufacturing facilities/i.test(x.excerpt)));
});
