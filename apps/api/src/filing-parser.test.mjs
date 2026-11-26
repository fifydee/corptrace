import test from "node:test";
import assert from "node:assert/strict";
import { cleanFilingText, findSectionHeading, extractItemSection } from "./filing-parser.mjs";

const business = [/ITEM\s+1[.\s]+BUSINESS/i];

test("preserves paragraph and table-cell boundaries while removing markup", () => {
  const text = cleanFilingText("<h2>Item 1. Business</h2><p>First paragraph with useful disclosure text.</p><table><tr><td>Revenue</td><td>$10</td></tr></table>");
  assert.match(text, /Item 1\. Business\nFirst paragraph/);
  assert.match(text, /Revenue \| \$10/);
});

test("decodes common and numeric entities", () => {
  assert.equal(cleanFilingText("<p>A &amp; B &#39;quoted&#39; &#x32;</p>"), "A & B 'quoted' 2");
});

test("prefers a substantive section heading over a table-of-contents entry", () => {
  const text = [
    "Table of Contents",
    "ITEM 1. BUSINESS",
    "ITEM 1A. RISK FACTORS",
    "A long risk disclosure line that is clearly substantive and contains enough words to qualify.",
    "ITEM 1. BUSINESS",
    "The company designs, manufactures and sells products to customers in multiple countries around the world.",
    "Its operations include research, manufacturing, distribution and customer support activities.",
    "ITEM 1A. RISK FACTORS",
    "Risks include competition, regulation and changes in customer demand."
  ].join("\n");
  const heading = findSectionHeading(text, business);
  assert.equal(heading?.line, 4);
});

test("recognises SEC Item headings separated by em dashes", () => {
  const text = [
    "ITEM 1 &mdash; BUSINESS",
    "The company designs and sells products in several markets and supports customers globally.",
    "Its operations include research, manufacturing, distribution and customer support activities.",
    "ITEM 1A &mdash; RISK FACTORS",
    "This risk disclosure must not be included in the business section."
  ].join("\n");
  const decoded = cleanFilingText(text);
  const patterns = [/ITEM\s+1[-.\s:—–]+BUSINESS/i];
  const heading = findSectionHeading(decoded, patterns);
  const section = extractItemSection(decoded, patterns);
  assert.equal(heading?.line, 0);
  assert.match(section ?? "", /designs and sells products/);
  assert.doesNotMatch(section ?? "", /risk disclosure/);
});

test("recognises SEC Item headings split across table cells", () => {
  const text = [
    "ITEM 1. | BUSINESS",
    "The company operates stores and digital channels and serves customers across multiple international markets.",
    "Its business includes retail, wholesale, eCommerce and a broad range of services.",
    "ITEM 1A. | RISK FACTORS",
    "This risk disclosure must not be included in the business section."
  ].join("\n");
  const patterns = [/ITEM\s+1[-.\s:|—–]+BUSINESS/i];
  const heading = findSectionHeading(text, patterns);
  const section = extractItemSection(text, patterns);
  assert.equal(heading?.line, 0);
  assert.match(section ?? "", /operates stores and digital channels/);
  assert.doesNotMatch(section ?? "", /risk disclosure/);
});

test("retains workforce disclosures appearing later in long annual filing sections", () => {
  const filler = Array.from({ length: 700 }, (_, index) =>
    `The company continues to describe its business operations, products, services and markets in detail for annual reporting purposes. Disclosure paragraph ${index + 1}.`
  );
  const text = [
    "ITEM 1. | BUSINESS",
    ...filler,
    "Human Capital Management",
    "As of January 30, 2026, the company had approximately 97,000 employees.",
    "ITEM 1A. | RISK FACTORS",
    "This later risk disclosure must not be included in the business section."
  ].join("\n");
  const section = extractItemSection(text, [/ITEM\s+1[-.\s:|—–]+BUSINESS/i]);
  assert.ok((section?.length ?? 0) > 80000);
  assert.match(section ?? "", /97,000 employees/);
  assert.doesNotMatch(section ?? "", /later risk disclosure/);
});

test("returns null when only an unsupported heading is present", () => {
  assert.equal(extractItemSection("ITEM 1. BUSINESS\nITEM 1A. RISK FACTORS", business), null);
});

test("stops a section at the next Item heading", () => {
  const text = [
    "ITEM 1. BUSINESS",
    "The company designs and sells products in several markets and supports customers globally.",
    "Its business also includes services, logistics, research and development activities.",
    "ITEM 1A. RISK FACTORS",
    "This risk disclosure must not be included in the business section."
  ].join("\n");
  const section = extractItemSection(text, business);
  assert.ok(section);
  assert.match(section, /designs and sells products/);
  assert.doesNotMatch(section, /risk disclosure/);
});
