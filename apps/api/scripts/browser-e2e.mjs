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
    await page.getByRole("alert").getByText("Could not retrieve selected research.", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
    results.push("research failure state is announced accessibly");
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const menu = page.getByRole("button", { name: "Menu" });
    await menu.waitFor({ state: "visible" });
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
    await menu.click();
    const close = page.getByRole("button", { name: "Close menu" });
    assert.equal(await close.getAttribute("aria-expanded"), "true");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await nav.getByRole("button", { name: "Company directory" }).click();
    assert.equal(await page.getByRole("button", { name: "Menu" }).getAttribute("aria-expanded"), "false");
    await page.getByLabel("Search SEC registrants by company name or ticker").fill("Microsoft");
    await page.getByRole("heading", { name: "SEC registrant matches" }).waitFor({ state: "visible", timeout: 20000 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }));
    assert.ok(dimensions.content <= dimensions.viewport, `mobile viewport should not overflow horizontally: ${JSON.stringify(dimensions)}`);
    results.push("mobile menu exposes and updates expanded state", "mobile navigation closes after selection", "mobile search has an accessible label", "390px viewport has no horizontal overflow");
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.keyboard.press("Tab");
    const firstFocused = await page.evaluate(() => ({
      text: document.activeElement?.textContent?.trim(),
      className: document.activeElement?.className
    }));
    assert.match(String(firstFocused.className), /skip-link/, "first keyboard stop should be the skip link");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#main-content").count(), 1, "skip link target should exist");
    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
    });
    assert.equal(focusVisible, true, "keyboard focus should have a visible outline");
    results.push("skip-to-main-content works from keyboard", "keyboard focus indicator is visible");
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const audit = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea')];
      const unnamed = controls.filter(element => {
        const explicit = element.getAttribute("aria-label")?.trim();
        const labelledBy = element.getAttribute("aria-labelledby");
        const referenced = labelledBy && labelledBy.split(/\s+/).some(id => document.getElementById(id)?.textContent?.trim());
        const associated = element.labels && [...element.labels].some(label => label.textContent.trim());
        const content = ["BUTTON", "A"].includes(element.tagName) && element.textContent.trim();
        return !(explicit || referenced || associated || content);
      }).map(element => ({ tag: element.tagName, type: element.getAttribute("type"), html: element.outerHTML.slice(0, 180) }));
      const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
      const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
      return {
        mainLandmarks: document.querySelectorAll("main").length,
        primaryNavigation: document.querySelectorAll('nav[aria-label="Primary navigation"]').length,
        unnamedControls: unnamed,
        duplicateIds
      };
    });
    assert.equal(audit.mainLandmarks, 1, "each page view should expose one main landmark");
    assert.equal(audit.primaryNavigation, 1, "primary navigation should be named");
    assert.deepEqual(audit.unnamedControls, [], `interactive controls should have accessible names: ${JSON.stringify(audit.unnamedControls)}`);
    assert.deepEqual(audit.duplicateIds, [], `document IDs should be unique: ${JSON.stringify(audit.duplicateIds)}`);
    results.push("page exposes named primary navigation and one main landmark", "interactive controls have accessible names", "document IDs are unique");
    await page.close();
  }

  process.stdout.write(JSON.stringify({ result: "passed", browser: "Chromium", checks: results }) + "\n");
} finally {
  await browser.close();
}
