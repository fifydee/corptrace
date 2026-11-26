import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowUpRight, BarChart3, Building2, CheckCircle2, ChevronRight,
  CircleAlert, FileText, Globe2, LoaderCircle, Search, ShieldCheck, Sparkles,
} from "lucide-react";
import { companies, topProfitableCompanies, rankingSource } from "./data";

type Page = "Explore" | "Directory" | "Research" | "Compare" | "Developments";
type Company = { cik: string; ticker: string | null; companyName: string | null };
type Metric = {
  metric: string; label: string; value: number; unit: string; concept: string;
  periodStart: string | null; periodEnd: string; fiscalYear: number | null;
  fiscalPeriod: string | null; form: string; filedAt: string; accessionNumber: string;
  filingUrl: string; dataStatus: string; verificationLevel?: string;
  verificationBasis?: string; caveat: string;
} | null;
type ResearchPayload = {
  source: string; companyName: string | null; cik: string; sourceUrl: string;
  retrievedAt: string; reportingBasis: string; status: string; metrics: Metric[];
  notice: string;
};
type FilingPayload = {
  source: string; resource: string; cik: string; sourceUrl: string;
  retrievedAt: string; data: { name?: string; tickers?: string[]; exchanges?: string[]; filings?: {
    recent?: { form?: string[]; filingDate?: string[]; reportDate?: string[]; accessionNumber?: string[]; primaryDocument?: string[] };
  } };
};
type NarrativeResearch = {
  source: string;
  companyName?: string;
  officialSources?: { sourceSearch: string; retrievedAt: string; notice: string; overview: string | null; facts: { key: string; label: string; value: string; sourceTitle: string; sourceUrl: string; sourceType: string; evidence: string; retrievedAt: string }[]; sources: { title: string; url: string; domain: string; sourceType: string; retrievedAt: string; evidence: { heading: string; paragraph: number; excerpt: string }[] }[] }; form: string; filedAt: string; reportDate: string;
  documentUrl: string; retrievedAt: string; notice: string;
  sections: { key: string; title: string; content: string | null; dataStatus: string; note: string }[];
  topicCoverage?: { topic: string; status: string; evidenceSections: { key: string; title: string; dataStatus: string }[]; limitation: string }[];
  findings?: { topic: string; status: "disclosed_in_filing" | "not_found_in_filing" | "not_searched"; evidence: { section: string; excerpt: string; documentUrl: string }[]; explanation: string }[];
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;
const money = (value: number, unit: string) => {
  if (unit === "USD") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value) + " " + unit;
};

function App() {
  const [page, setPage] = useState<Page>("Explore");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [lookup, setLookup] = useState<Company[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [metrics, setMetrics] = useState<ResearchPayload | null>(null);
  const [filings, setFilings] = useState<FilingPayload | null>(null);
  const [narrative, setNarrative] = useState<NarrativeResearch | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const demoMatches = useMemo(() => companies.filter(c => c.join(" ").toLowerCase().includes(query.toLowerCase())), [query]);

  useEffect(() => {
    if (query.trim().length < 2) { setLookup([]); setLookupError(""); return; }
    const timer = window.setTimeout(async () => {
      setLookupLoading(true); setLookupError("");
      try {
        const response = await fetch(apiUrl(`/sec/lookup?q=${encodeURIComponent(query.trim())}`));
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Company search failed.");
        setLookup(body.results ?? []);
      } catch (error) {
        setLookupError(error instanceof Error ? error.message : "Company search failed.");
      } finally { setLookupLoading(false); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function openCompany(item: Company) {
    setCompany(item); setPage("Research"); setMetrics(null); setFilings(null); setNarrative(null);
    setResearchError(""); setResearchLoading(true);
    try {
      const [metricResponse, filingResponse] = await Promise.all([
        fetch(apiUrl(`/sec/company/${item.cik}/metrics`)),
        fetch(apiUrl(`/sec/company/${item.cik}/submissions`)),
      ]);
      const metricBody = await metricResponse.json();
      const filingBody = await filingResponse.json();
      if (!metricResponse.ok) throw new Error(metricBody.error ?? "Could not retrieve company facts.");
      if (!filingResponse.ok) throw new Error(filingBody.error ?? "Could not retrieve filing history.");
      setMetrics(metricBody); setFilings(filingBody);
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : "Company information request failed.");
    } finally { setResearchLoading(false); }
  }

  const nav: Page[] = ["Explore", "Directory", "Research", "Compare", "Developments"];
  const categories = [
    { group: "Company profile", items: ["Company overview and history", "Headquarters and registered locations", "Operating regions and countries", "Offices and facilities", "Products and services", "Business segments and revenue mix"] },
    { group: "Financial performance", items: ["Financial summary", "Revenue and income sources", "Expenses and operating costs", "Profitability and margins", "Debt and financial position", "Dividends and share buybacks"] },
    { group: "People and leadership", items: ["Employee count and workforce", "Employee geography and nationalities", "Workforce by country or region", "Gender representation (where disclosed)", "Leadership changes and compensation"] },
    { group: "Products, strategy and investment", items: ["Product and service performance", "Most profitable products or services", "New products and development pipeline", "Investment, R&D and AI", "Acquisitions and mergers", "Expansion plans and new facilities", "SWOT analysis"] },
    { group: "Risk and developments", items: ["Risk factors", "Legal cases and disputes", "Regulatory matters and controversies", "Management changes", "Company announcements", "Recent company news"] },
  ];
  const toggleResearchItem = (item: string) => setPicked(current =>
    current.includes(item) ? current.filter(value => value !== item) : [...current, item]
  );

  async function refreshSelectedResearch() {
    if (!company) return;
    setResearchLoading(true); setResearchError("");
    try {
      if (picked.length === 0) { setResearchError("Select at least one research topic first."); return; }\n      const response = await fetch(apiUrl(`/sec/company/${company.cik}/research?topics=${encodeURIComponent(picked.join("|"))}`));
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update the selected research.");
      setNarrative(body);
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : "Research request failed.");
    } finally { setResearchLoading(false); }
  }

  const profileGroups = [
    { title: "Company overview", description: "What the company is, when it began and how its business has developed.", keys: ["business", "founded"], pattern: /company overview|founded|history|our company|who we are|about us/i, empty: "A reliable founding date or fuller company history was not identified in the sources reviewed." },
    { title: "Headquarters & operating regions", description: "Where the company is based and the markets in which it operates.", keys: ["headquarters", "countries"], pattern: /headquarters|headquartered|operates in|countries|global presence|regions|geographic/i, empty: "Headquarters or operating-region details were not available in the retrieved evidence." },
    { title: "Products & services", description: "The main products, services and business offerings.", keys: [], pattern: /products|services|solutions|client devices|infrastructure|business segments|what we do/i, empty: "Product and service details were not sufficiently extracted from the sources reviewed." },
    { title: "Employees & workforce", description: "Reported employee totals and any disclosed workforce breakdowns.", keys: ["employees"], pattern: /employees|workforce|team members|people worldwide|gender|female|male|workforce by/i, empty: "Employee totals and workforce breakdowns were not available in the retrieved evidence." },
  ];
  const selectedProfileGroups = profileGroups.filter(group => {
    const selection = picked.join(" ").toLowerCase();
    if (group.title === "Company overview") return /company overview|company profile|history/.test(selection);
    if (group.title === "Headquarters & operating regions") return /headquarters|registered locations|operating regions|countries|offices|facilities/.test(selection);
    if (group.title === "Products & services") return /products|services|business segments/.test(selection);
    if (group.title === "Employees & workforce") return /employee|workforce|gender|nationalities/.test(selection);
    return false;
  });
  const profileSources = narrative?.officialSources?.sources ?? [];
  const profileFacts = narrative?.officialSources?.facts ?? [];
  const getProfileFact = (key: string) => profileFacts.find(fact => fact.key === key);
  const getProfileEvidence = (pattern: RegExp) => profileSources.flatMap(source =>
    source.evidence.filter(item => pattern.test(item.heading + " " + item.excerpt))
      .slice(0, 2).map(item => ({ ...item, sourceTitle: source.title, sourceUrl: source.url }))
  ).slice(0, 3);

  return <div className="shell">
    <header>
      <button className="brand" onClick={() => setPage("Explore")}><b>C<span>.</span></b><span><strong>CorpTrace</strong><small>COMPANY INTELLIGENCE, MADE CLEAR</small></span></button>
      <nav className={mobile ? "show" : ""}>{nav.map(p => <button key={p} className={page === p ? "active" : ""} onClick={() => { setPage(p); setMobile(false); }}>{p === "Directory" ? "Company directory" : p === "Research" ? "Research a company" : p === "Compare" ? "Compare companies" : p === "Developments" ? "News & developments" : p}</button>)}</nav>
      <span className="preview">● RESEARCH PREVIEW</span>
      <button className="hamb" onClick={() => setMobile(v => !v)}>Menu</button>
    </header>

    {page === "Explore" && <>
      <section className="hero"><div><label>A CLEARER VIEW OF CORPORATE POWER</label><h1>Who profits<br/>from <em>your day?</em></h1><p>Explore the companies behind the products, platforms and services you use. See how they make money, where they invest and what shapes their future.</p><div className="actions"><button className="primary" onClick={() => setPage("Directory")}>Find a company ↘</button><button className="link" onClick={() => setPage("Research")}>Start company research →</button></div><small className="method">Live SEC registrant search and filing retrieval are available for supported US-listed registrants. Financial figures are labelled as reported by their official filing source; wider company research is being expanded.</small></div><div className="hero-art"><div className="orb"><small>THE BIG PICTURE</small><b>01</b><span>Follow the money trail</span></div><div className="stamp">Source<br/>first</div></div></section>
      <section className="section" id="lineup"><label>01 / EXPLORE</label><h2>The companies behind the numbers</h2><p>Start with a company you know. Search official SEC registrant records and open its filing research.</p><button className="primary" onClick={() => setPage("Directory")}>Search companies <ArrowUpRight size={14}/></button><div className="grid">{topProfitableCompanies.map(c=><article key={c.rank}><div className="cardtop"><small>#{c.rank} · {c.ticker}</small><b>{String(c.rank).padStart(2,"0")}</b><span>{c.sector}</span></div><h3>{c.name}</h3><p>{c.business}</p><footer><span><Globe2 size={13}/>{c.country}</span><strong>{`${c.profitUsdBillions.toFixed(1)}B net income`}</strong></footer><button className="company-search-link" onClick={() => { setQuery(c.name); setPage("Directory"); }}>Find filing <ArrowUpRight size={13}/></button></article>)}</div><p className="method">Reference snapshot: <a href={rankingSource.url} target="_blank" rel="noreferrer">Visual Capitalist / FinanceCharts</a>, TTM net income as of November 2025. Amounts are rounded and periods vary by company. This is a dated third-party reference, not a live ranking or a CorpTrace-verified comparison.</p></section>
      <section className="section pale"><label>02 / READ THE NUMBERS</label><h2>Revenue is not profit</h2><p>Revenue is the money a company brings in. Net income is what remains after expenses, taxes and other costs. CorpTrace keeps those measures distinct and links reported values directly to their official filing source.</p><div className="explain"><b>Revenue <em>≠</em> profit</b><div><span>Revenue</span><i style={{width:"94%"}}/><span>Operating costs</span><i style={{width:"61%"}}/><span>Net income</span><i style={{width:"28%"}}/><small>Illustrative explanation, not company figures.</small></div></div></section>
      <section className="section"><label>03 / RESEARCH WITH CONTEXT</label><h2>Every figure needs a trail.</h2><p>Review filing dates, reporting periods, accounting concepts and source documents before relying on a number. CorpTrace distinguishes raw source data from reviewed metrics.</p><div className="feature"><ShieldCheck size={42}/><h3>Source-backed research, explained in plain language.</h3></div></section>
    </>}

    {page === "Directory" && <main className="workspace"><label>DISCOVER PUBLIC COMPANIES</label><h1>Find a company.<br/><em>Follow the money.</em></h1><p>Search SEC registrant records by company name or ticker. The global top-20 reference includes companies from multiple markets; some require their home-market filings rather than SEC records.</p><div className="search"><Search/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Try Microsoft, Apple, Toyota or MSFT"/>{lookupLoading && <LoaderCircle className="spin"/>}</div>
      {lookupError && <div className="notice warning"><CircleAlert size={17}/>{lookupError}</div>}
      {lookup.length > 0 && <><h2>SEC registrant matches</h2><div className="directory">{lookup.map(item=><button key={item.cik} onClick={() => openCompany(item)}><b>{item.ticker ?? "SEC"}</b><span><strong>{item.companyName}</strong><small>CIK {item.cik} · SEC EDGAR</small></span><ChevronRight/></button>)}</div></>}
      {query.trim().length >= 2 && !lookupLoading && lookup.length === 0 && !lookupError && <div className="notice">No SEC registrants matched this search. Try a ticker symbol or legal company name.</div>}
      <h2 className="subhead">Global top-20 research universe</h2><div className="directory">{demoMatches.map(c=><button key={c[0]} onClick={() => {setQuery(c[1]);setPage("Directory");}}><b>{c[0]}</b><span><strong>{c[1]}</strong><small>{c[2]} · {c[3]} · Illustrative directory entry</small></span><ChevronRight/></button>)}</div><small>This list is a research starting point. Select a company above, then search its legal name in SEC records where applicable. Non-US companies may require home-market regulator adapters.</small></main>}

    {page === "Research" && <main className="workspace"><button className="back" onClick={() => setPage("Directory")}><ArrowLeft size={14}/> Company search</button><label>COMPANY RESEARCH</label><h1>{company ? company.companyName : "Look beyond"}<br/><em>{company ? "Filing research" : "the headline numbers."}</em></h1>
      {!company && <><p>Search the SEC directory to open a company research page.</p><button className="primary" onClick={() => setPage("Directory")}>Find a company</button></>}
      {company && <>
        <section className="research-picker">
          <div className="picker-heading"><div><label>BUILD YOUR COMPANY REPORT</label><h2>What would you like to know?</h2><p>Choose what you want to learn about this company. CorpTrace will search relevant company, investor, regulatory and credible business sources for those topics before building your report.</p></div><span>{picked.length} selected</span></div>
          <div className="picker-groups">{categories.map(category=><fieldset key={category.group}><legend>{category.group}</legend><div>{category.items.map(item=><label key={item} className="research-option"><input type="checkbox" checked={picked.includes(item)} onChange={()=>toggleResearchItem(item)}/><span>{item}</span></label>)}</div></fieldset>)}</div>
          <div className="picker-note"><ShieldCheck size={16}/><span>Figures and claims retain their filing or report source. Workforce geography, gender representation, office counts and product-level profitability are shown only when reliable sources disclose them; CorpTrace will not estimate missing breakdowns.</span></div><button className="primary" onClick={refreshSelectedResearch} disabled={researchLoading || picked.length === 0}>Research {picked.length} selected topic{picked.length === 1 ? "" : "s"} <ArrowUpRight size={14}/></button>
        </section>
        <div className="company-meta"><span>CIK {company.cik}</span><span>{company.ticker ?? "Ticker not supplied"}</span><span>SEC EDGAR</span></div>
        {researchLoading && <div className="notice"><LoaderCircle className="spin"/> Retrieving selected company research and official filing information…</div>}
        {researchError && <div className="notice warning"><CircleAlert/>{researchError}</div>}
        {metrics && picked.some(item => ["Financial summary","Revenue and income sources","Expenses and operating costs","Profitability and margins","Debt and financial position","Dividends and share buybacks"].includes(item)) && <><div className="source-banner"><CheckCircle2 size={18}/><span><b>Live SEC source response received</b><small>Retrieved {new Date(metrics.retrievedAt).toLocaleString()} · {metrics.reportingBasis}</small></span><a href={metrics.sourceUrl} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={13}/></a></div>
          <div className="notice"><ShieldCheck size={17}/>{metrics.notice}</div>
          <h2>SEC-reported financial metrics</h2><p>Each available figure below is traceable to an identified SEC filing and is verified as reported by the company. Comparability across companies and accounting treatments is assessed separately.</p>
          <div className="metric-grid">{metrics.metrics.map((m,i)=><article key={m?.metric ?? i} className="metric-card"><small>{m?.label ?? "Metric unavailable"}</small>{m ? <><strong>{money(m.value,m.unit)}</strong><span>{m.periodStart ? `${m.periodStart} to ${m.periodEnd}` : `As at ${m.periodEnd}`}</span><span>{m.form} · Filed {m.filedAt}</span><a href={m.filingUrl} target="_blank" rel="noreferrer">View official SEC filing <ArrowUpRight size={13}/></a><em className="verified-label"><ShieldCheck size={13}/> Verified · SEC-reported</em><small>{m.verificationBasis}</small></> : <><strong>Unavailable</strong><span>No matching standard US-GAAP annual fact found.</span></>}</article>)}</div>
        </>}
        {narrative?.officialSources && <section className="company-profile">
          <div className="profile-heading"><div><label>COMPANY PROFILE</label><h2>Get to know {company.companyName}</h2><p>A clear summary of the company, its markets, offerings and people. Each statement links to the source it came from.</p></div><span>Updated {new Date(narrative.officialSources.retrievedAt).toLocaleDateString()}</span></div>
          <div className="profile-grid">{selectedProfileGroups.map(group => {
            const facts = group.keys.map(getProfileFact).filter(Boolean);
            const evidence = getProfileEvidence(group.pattern).filter(item => !facts.some(fact => fact?.evidence === item.excerpt));
            return <article className="profile-card" key={group.title}><h3>{group.title}</h3><p className="profile-description">{group.description}</p>
              {facts.length > 0 || evidence.length > 0 ? <div className="profile-copy">
                {facts.map(fact => <div className="profile-fact" key={fact!.key}><strong>{fact!.key === "founded" ? `Founded ${fact!.value}` : fact!.value}</strong>{fact!.key !== "founded" && <p>{fact!.key === "business" ? fact!.value.charAt(0).toUpperCase() + fact!.value.slice(1) : fact!.label + ": " + fact!.value}</p>}<a href={fact!.sourceUrl} target="_blank" rel="noreferrer">Source: {fact!.sourceTitle} <ArrowUpRight size={12}/></a></div>)}
                {evidence.map((item,i) => <div className="profile-fact" key={item.sourceUrl+i}><p>{item.excerpt.charAt(0).toUpperCase() + item.excerpt.slice(1)}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer">Source: {item.sourceTitle} <ArrowUpRight size={12}/></a></div>)}
              </div> : <p className="profile-empty">{group.empty}</p>}
              {group.title === "Employees & workforce" && <p className="profile-caveat">Gender and regional/national workforce percentages are shown only when explicitly disclosed. No estimates are made.</p>}
            </article>;
          })}</div><p className="profile-method">Information is attributed to the linked company, regulator or publication source. If a detail is not disclosed or could not be confirmed, CorpTrace says so rather than estimating it.</p>
        </section>}
        {narrative && <section className="filing-research filing-reference"><div className="filing-research-head"><div><label>FILING REFERENCE</label><h2>Annual filing & research coverage</h2><p>{narrative.form} · Filed {narrative.filedAt} · Reporting date {narrative.reportDate || "not supplied"}</p></div><a href={narrative.documentUrl} target="_blank" rel="noreferrer">Open complete filing <ArrowUpRight size={13}/></a></div><p className="filing-reference-note">The original filing is available if you want to examine the company's full regulatory disclosure. CorpTrace presents the relevant company information above in a readable summary.</p></section>}
        {picked.some(item => !["Financial summary","Revenue and income sources","Expenses and operating costs","Profitability and margins","Debt and financial position","Dividends and share buybacks"].includes(item)) && !narrative && <section className="research-followup"><h2>Your selected company research</h2><p>These topics are part of the configurable report. The latest annual filing could not be extracted automatically. You can still open the official filing below; the extraction service will report unavailable rather than inventing company details.</p><div className="selected-topics">{picked.filter(item=>!["Financial summary","Revenue and income sources","Expenses and operating costs","Profitability and margins","Debt and financial position","Dividends and share buybacks"].includes(item)).map(item=><div key={item}><span>{item}</span><small>Selected · filing extraction to be connected</small></div>)}</div></section>}
        {filings && <><h2>Recent filing history</h2><p>Recent SEC submissions for {filings.data.name ?? company.companyName}.</p><div className="filing-list">{(filings.data.filings?.recent?.form ?? []).map((form,i)=>({form,date:filings.data.filings?.recent?.filingDate?.[i] ?? "",report:filings.data.filings?.recent?.reportDate?.[i] ?? "",accession:filings.data.filings?.recent?.accessionNumber?.[i] ?? "",doc:filings.data.filings?.recent?.primaryDocument?.[i] ?? ""})).filter(x=>["10-K","20-F","40-F","10-Q","8-K"].includes(x.form)).slice(0,12).map((f,i)=>{const cik=company.cik.replace(/^0+/,"");const accession=f.accession.replace(/-/g,"");const url=`https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${f.doc}`;return <a key={f.accession+i} href={url} target="_blank" rel="noreferrer"><FileText size={17}/><span><b>{f.form}</b><small>Filed {f.date} · Reporting date {f.report || "not supplied"}</small></span><ArrowUpRight size={14}/></a>})}</div></>}
      </>}
    </main>}

    {page === "Compare" && <main className="workspace"><label>SIDE-BY-SIDE ANALYSIS</label><h1>See what sets<br/><em>companies apart.</em></h1><p>Company comparison is part of the next release milestone. It will use aligned reporting periods and clearly explain differences in accounting and currency.</p><div className="notice"><Sparkles/>Comparison interface is planned; live comparisons are not enabled in this first preview.</div></main>}
    {page === "Developments" && <main className="workspace"><label>CORPORATE DEVELOPMENTS</label><h1>What's happening<br/><em>behind the scenes.</em></h1><p>News, acquisitions, legal proceedings and regulatory developments will be added with dates, original sources and clear distinctions between allegations and confirmed findings.</p><div className="notice"><ShieldCheck/>This module is planned and is not yet connected to live news sources.</div></main>}

    <section className="section pale"><label>RESEARCH METHOD</label><h2>How to read CorpTrace</h2><div className="status-legend"><span><i className="dot verified"/> Verified: traceable to an identified official filing with matching concept, unit and reporting period.</span><span><i className="dot candidate"/> Candidate: source retrieved, but filing trace or metric checks are incomplete.</span><span><i className="dot unavailable"/> Unavailable: no defensible figure identified.</span></div></section>
    <footer className="bottom"><b>CorpTrace</b><span>Company intelligence, made clear.</span><small>EARLY LIVE DATA PREVIEW · NOT INVESTMENT ADVICE</small></footer>
  </div>;
}

export default App;
