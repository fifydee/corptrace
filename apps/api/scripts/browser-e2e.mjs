import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = (process.env.CORPTRACE_WEB_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const results = [];

async function openMicrosoftResearch(page) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Find a company/i }).first().click();
  const search = page.getByPlaceholder(/Try Microsoft, Apple, Toyota or MSFT/i);
  await search.fill("Microsoft");
  await page.getByRole("button").filter({ hasText: /MICROSOFT CORP|Microsoft Corporation/i }).first().waitFor({ state: "visible", timeout: 20000 });
  await page.getByRole("button").filter({ hasText: /MICROSOFT CORP|Microsoft Corporation/i }).first().click();
  await page.getByRole("heading", { name: /MICROSOFT CORP|Microsoft Corporation/i }).first().waitFor({ state: "visible" });
  await page.getByLabel("Company overview and history").check();
}

try {
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    let researchRequested = false;
    await page.route("**/sec/company/*/research?*", async route => {
      researchRequested = true;
      await new Promise(resolve => setTimeout(resolve, 650));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "CorpTrace research",
          companyName: "MICROSOFT CORP",
          form: "10-K",
          filedAt: "2026-07-30",
          reportDate: "2026-06-30",
          documentUrl: "https://www.sec.gov/Archives/edgar/data/789019/example.htm",
          retrievedAt: "2026-11-26T00:00:00.000Z",
          notice: "Browser test fixture: source links and evidence are displayed for interface validation.",
          officialSources: {
            sourceSearch: "browser-test-fixture",
            retrievedAt: "2026-11-26T00:00:00.000Z",
            notice: "Browser test fixture.",
            overview: "Microsoft develops software and cloud services.",
            facts: [{
              key: "business",
              label: "Company overview",
              value: "develops software and cloud services",
              sourceTitle: "Microsoft company profile",
              sourceUrl: "https://www.microsoft.com/en-us/about",
              sourceType: "company",
              evidence: "Microsoft develops software and cloud services.",
              retrievedAt: "2026-11-26T00:00:00.000Z"
            }],
            sources: [{
              title: "Microsoft company profile",
              url: "https://www.microsoft.com/en-us/about",
              domain: "microsoft.com",
              sourceType: "company",
              retrievedAt: "2026-11-26T00:00:00.000Z",
              evidence: [{ heading: "Company overview", paragraph: 1, excerpt: "Microsoft develops software and cloud services." }]
            }]
          },
          findings: [{
            topic: "Company overview and history",
            status: "disclosed_in_filing",
            evidence: [{
              section: "Item 1 — Business",
              excerpt: "Microsoft develops software, services, devices and solutions.",
              documentUrl: "https://www.sec.gov/Archives/edgar/data/789019/example.htm"
            }],
            explanation: "The selected topic has source-linked evidence for this interface test."
          }],
          sections: []
        })
      });
    });

    await openMicrosoftResearch(page);
    const researchButton = page.getByRole("button", { name: /Research 1 selected topic/i });
    await researchButton.click();
    await page.getByText(/Retrieving selected company research/i).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Findings for your selected topics" }).waitFor({ state: "visible", timeout: 20000 });
    await page.getByText("Develops software and cloud services", { exact: true }).first().waitFor({ state: "visible" });
    assert.equal(researchRequested, true, "research action should call the research endpoint");
    assert.equal(pageErrors.length, 0, "browser should not emit uncaught page errors");
    results.push("company search and selection", "topic selection and research action", "loading state", "source-linked research findings render");
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route("**/sec/company/*/research?*", route => route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Could not retrieve selected research." })
    }));
    await openMicrosoftResearch(page);
    await page.getByRole("button", { name: /Research 1 selected topic/i }).click();
    await page.getByText("Could not retrieve selected research.", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
    results.push("research failure state is communicated to the user");
    await page.close();
  }

  process.stdout.write(JSON.stringify({ result: "passed", browser: "Chromium", checks: results }) + "\n");
} finally {
  await browser.close();
}
