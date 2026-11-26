import assert from "node:assert/strict";

const base = (process.env.CORPTRACE_WEB_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const timeout = { signal: AbortSignal.timeout(30000) };
async function get(path) {
  const response = await fetch(base + path, timeout);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!response.ok) throw new Error(path + " returned HTTP " + response.status + ": " + text.slice(0, 500));
  return { response, text, body };
}

const page = await get("/");
assert.match(page.response.headers.get("content-type") ?? "", /text\/html/i);
assert.match(page.text, /<div[^>]+id=["']root["']/i);
const entryPath = page.text.match(/src=["']([^"']*main\.[jt]sx?)["']/i)?.[1];
assert.ok(entryPath, "Vite app entry module must be present");
const entry = await get(entryPath);
assert.match(entry.response.headers.get("content-type") ?? "", /javascript/i);
assert.match(entry.text, /App/);

const health = await get("/health");
assert.equal(health.body?.status, "ok");
assert.equal(health.body?.service, "CorpTrace API");

const lookup = await get("/sec/lookup?q=Microsoft");
assert.equal(lookup.body?.source, "SEC EDGAR");
assert.ok(lookup.body?.results?.some(result => String(result.cik).replace(/^0+/, "") === "789019"));

const submissions = await get("/sec/company/0000789019/submissions");
assert.equal(submissions.body?.source, "SEC EDGAR");
assert.ok(submissions.body?.data?.filings?.recent?.form?.length);
assert.match(submissions.body?.data?.name ?? "", /Microsoft/i);

const metrics = await get("/sec/company/0000789019/metrics");
assert.equal(metrics.body?.source, "SEC XBRL");
assert.ok(Array.isArray(metrics.body?.metrics));

process.stdout.write(JSON.stringify({
  result: "passed",
  checks: ["Vite app shell and entry module", "Frontend-to-Worker health proxy", "Company lookup through frontend proxy", "SEC submissions retrieval", "SEC XBRL metrics retrieval"],
  company: "Microsoft Corporation",
  cik: "0000789019",
  metricCount: metrics.body.metrics.length
}) + "\n");
