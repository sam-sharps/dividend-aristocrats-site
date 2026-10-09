const $ = (id) => document.getElementById(id);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const precise = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
let dataset;
let selectedPeriod = "fiveYear";
let sortKey = "ticker";
let sortDirection = 1;
let expandedTicker = null;
let evidencePeriod = "fiveYear";
const figure = (value, revenue = false, exact = false) => finite(value) ? (exact ? precise : number).format(revenue ? value / 1e9 : value) : "—";
const growth = (value) => finite(value) ? percent.format(value) : "—";
const fiscalYears = (period) => `${period.revenue?.baseYear ?? "?"} → ${period.revenue?.endYear ?? "?"}`;
function presentationText(value) {
  return String(value)
    .replace("A pass requires BOTH ending revenue and ending diluted continuing-operations EPS to exceed their starting values.", "‘Both increased’ means ending revenue and ending diluted continuing-operations EPS both exceed their starting values.")
    .replace("They never count as full five- or twenty-year passes.", "They are not full five- or twenty-year comparisons.")
    .replace("The revenue decline and main fail result are sensitive to changed excise-tax and gross buy/sell presentation.", "The reported revenue decline is sensitive to changed excise-tax and gross buy/sell presentation.");
}
function el(tag, text, className) { const item = document.createElement(tag); if (text != null) item.textContent = presentationText(text); if (className) item.className = className; return item; }
function metricDirection(metric) { return finite(metric?.base) && finite(metric?.end) ? Math.sign(metric.end - metric.base) : null; }
function growthReason(period, includeShort = true) {
  if (includeShort && period.status === "short-history") return "Shorter history";
  const revenue = metricDirection(period.revenue), eps = metricDirection(period.eps);
  if (revenue == null || eps == null) return "Insufficient data";
  if (revenue > 0 && eps > 0) return "Both increased";
  if (revenue < 0 && eps < 0) return "Both fell";
  if (revenue <= 0 && eps <= 0) return "Neither grew";
  if (revenue <= 0) return revenue < 0 ? "Revenue fell" : "Revenue did not grow";
  return eps < 0 ? "EPS fell" : "EPS did not grow";
}
function safeLink(source) {
  try {
    const url = new URL(source.url);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const link = el("a", source.label || url.hostname);
    link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer";
    return link;
  } catch { return null; }
}
function sourceList(sources) {
  const list = el("ul", null, "source-list");
  const seen = new Set();
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!source?.url) continue;
    const key = `${source.url}|${source.periodEnd || ""}`;
    if (seen.has(key)) continue;
    const link = safeLink(source); if (!link) continue;
    seen.add(key);
    const item = el("li"); item.append(link);
    const details = [source.periodEnd && `Period ended ${source.periodEnd}`, source.filingDate && `filed ${source.filingDate}`, source.accession && `accession ${source.accession}`].filter(Boolean);
    if (details.length) item.append(el("small", details.join(" · ")));
    if (source.locator) item.append(el("small", source.locator));
    list.append(item);
  }
  return list;
}
function conditionMatches(period, condition) {
  if (condition === "short-history") return period.status === "short-history";
  const revenue = metricDirection(period.revenue), eps = metricDirection(period.eps);
  if (condition === "both") return revenue > 0 && eps > 0;
  if (condition === "revenue") return revenue != null && revenue <= 0;
  if (condition === "eps") return eps != null && eps <= 0;
  return true;
}
function sortValue(company) {
  const p = company.periods[selectedPeriod];
  if (sortKey === "ticker" || sortKey === "name") return company[sortKey];
  if (sortKey === "years") return p.revenue?.baseYear;
  if (sortKey === "reason") return growthReason(p);
  const match = /^(revenue|eps)(Base|End|Growth)$/.exec(sortKey);
  return match ? p[match[1]]?.[match[2].toLowerCase()] : null;
}
function visibleCompanies() {
  const term = $("search").value.trim().toLocaleLowerCase();
  const sector = $("sector").value;
  const condition = $("condition").value;
  return dataset.companies.filter((c) => (!term || `${c.ticker} ${c.name}`.toLocaleLowerCase().includes(term)) && (sector === "all" || c.sector === sector) && conditionMatches(c.periods[selectedPeriod], condition)).sort((a, b) => {
    const av = sortValue(a), bv = sortValue(b);
    const aMissing = av == null || (typeof av === "number" && !finite(av));
    const bMissing = bv == null || (typeof bv === "number" && !finite(bv));
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    const difference = aMissing ? 0 : typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
    return difference * sortDirection || a.ticker.localeCompare(b.ticker);
  });
}
function sortHeaders() {
  for (const button of document.querySelectorAll("[data-sort]")) {
    const active = button.dataset.sort === sortKey;
    button.parentElement.setAttribute("aria-sort", active ? (sortDirection === 1 ? "ascending" : "descending") : "none");
    button.querySelector(".sort-mark").textContent = active ? (sortDirection === 1 ? " ↑" : " ↓") : " ↕";
  }
}
function toggleCompany(company) {
  expandedTicker = expandedTicker === company.ticker ? null : company.ticker;
  evidencePeriod = selectedPeriod;
  renderTable();
  $(`company-${company.ticker}`)?.focus({ preventScroll: true });
}
function renderTable() {
  const visible = visibleCompanies();
  const body = $("companies"); body.replaceChildren();
  for (const company of visible) {
    const period = company.periods[selectedPeriod];
    const open = expandedTicker === company.ticker;
    const row = el("tr", null, `company-row${open ? " expanded" : ""}`); row.dataset.ticker = company.ticker;
    const ticker = el("td");
    const button = el("button", company.ticker, "company-button"); button.type = "button"; button.id = `company-${company.ticker}`;
    button.setAttribute("aria-expanded", String(open)); button.setAttribute("aria-controls", `details-${company.ticker}`);
    button.setAttribute("aria-label", `${open ? "Hide" : "Show"} ${company.name} figures and sources`);
    button.addEventListener("click", () => toggleCompany(company)); ticker.append(button); row.append(ticker);
    const name = el("td", null, "company-name"); name.append(el("span", company.name)); name.title = company.name;
    if (period.comparabilityWarning) { const flag = el("span", "Note", "basis-flag"); flag.title = presentationText(period.comparabilityWarning); flag.setAttribute("aria-label", presentationText(period.comparabilityWarning)); name.append(flag); }
    row.append(name, el("td", fiscalYears(period), "years"));
    for (const key of ["revenue", "eps"]) {
      const m = period[key] || {};
      row.append(el("td", figure(m.base, key === "revenue"), "numeric"), el("td", figure(m.end, key === "revenue"), "numeric"));
      row.append(el("td", growth(m.growth), `numeric ${finite(m.growth) ? (m.growth > 0 ? "positive" : m.growth < 0 ? "negative" : "") : "muted"}`));
    }
    const reason = el("td", growthReason(period), "growth-result");
    if (period.status === "short-history") reason.title = `${fiscalYears(period)}: ${growthReason(period, false)}. Not a full-period comparison.`;
    row.append(reason);
    row.addEventListener("click", (event) => { if (!event.target.closest("button,a")) toggleCompany(company); });
    body.append(row);
    if (open) {
      const detailRow = el("tr", null, "detail-row"); const cell = el("td"); cell.colSpan = 10;
      const content = el("section", null, "company-detail"); content.id = `details-${company.ticker}`; content.setAttribute("aria-label", `${company.ticker} figures and sources`);
      renderDetails(company, content); cell.append(content); detailRow.append(cell); body.append(detailRow);
    }
  }
  $("result-count").textContent = `${visible.length} of ${dataset.companies.length} companies`;
  $("empty").hidden = visible.length !== 0;
  const definition = dataset.metadata.periods.find((p) => p.key === selectedPeriod);
  $("comparison-note").textContent = `FY${definition.baseYear} → FY${definition.endYear} · Revenue in $ billions · Diluted EPS in $ per share`;
  sortHeaders();
}
function comparisonTable(company) {
  const table = el("table", null, "comparison-table");
  const head = el("thead"), header = el("tr");
  for (const label of ["Comparison", "Fiscal years", "Rev start ($B)", "Rev end ($B)", "Rev change", "EPS start ($)", "EPS end ($)", "EPS change", "Growth result"]) { const th = el("th", label); th.scope = "col"; header.append(th); }
  head.append(header); table.append(head); const body = el("tbody");
  for (const definition of dataset.metadata.periods) {
    const p = company.periods[definition.key]; const row = el("tr");
    row.append(el("td", definition.key === "fiveYear" ? "5 years" : "20 years"), el("td", fiscalYears(p)));
    for (const key of ["revenue", "eps"]) { const m = p[key] || {}; row.append(el("td", figure(m.base, key === "revenue", true), "numeric"), el("td", figure(m.end, key === "revenue", true), "numeric"), el("td", growth(m.growth), "numeric")); }
    row.append(el("td", p.status === "short-history" ? `Shorter history · ${growthReason(p, false).toLowerCase()}` : growthReason(p))); body.append(row);
  }
  table.append(body); return table;
}
function metricEvidence(title, metric, revenue = false) {
  const section = el("section", null, "metric-evidence"); section.append(el("h3", title));
  const units = revenue ? "USD" : "USD per share";
  const description = `FY${metric.baseYear}: ${figure(metric.base, false, true)} → FY${metric.endYear}: ${figure(metric.end, false, true)} ${units}.`;
  section.append(el("p", description, "source-figures"));
  if (metric.basePeriodEnd || metric.endPeriodEnd) section.append(el("p", `Period ends: ${metric.basePeriodEnd || "unavailable"} → ${metric.endPeriodEnd || "unavailable"}.`, "muted"));
  if (!revenue && finite(metric.baseReported) && metric.baseReported !== metric.base) section.append(el("p", `Original reported starting EPS: $${figure(metric.baseReported, false, true)}. The comparison above uses the verified split-adjusted share basis.`));
  if (finite(metric.base) && metric.base <= 0) section.append(el("p", "A percentage is not meaningful from a zero or negative starting value; the dollar endpoints show the change.", "notice"));
  for (const note of metric.notes || []) section.append(el("p", note));
  section.append(sourceList(metric.sources)); return section;
}
function renderDetails(company, content) {
  content.replaceChildren();
  const header = el("div", null, "detail-header"); const title = el("h2", `${company.ticker} · ${company.name}`);
  const close = el("button", "Close details", "close-detail"); close.type = "button"; close.addEventListener("click", () => toggleCompany(company));
  const comparison = el("div", null, "detail-comparison-scroll"); comparison.setAttribute("role", "region"); comparison.setAttribute("aria-label", "Both comparison periods"); comparison.tabIndex = 0; comparison.append(comparisonTable(company));
  header.append(title, el("span", company.sector || "", "muted"), close); content.append(header, comparison);
  const tabs = el("div", null, "evidence-tabs"); tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "Source comparison period");
  for (const definition of dataset.metadata.periods) {
    const button = el("button", definition.key === "fiveYear" ? "5-year figures & sources" : "20-year figures & sources"); button.type = "button"; button.dataset.evidencePeriod = definition.key;
    button.setAttribute("aria-pressed", String(evidencePeriod === definition.key));
    button.addEventListener("click", () => { evidencePeriod = definition.key; renderDetails(company, content); content.querySelector(`[data-evidence-period="${definition.key}"]`).focus({ preventScroll: true }); }); tabs.append(button);
  }
  content.append(tabs);
  const period = company.periods[evidencePeriod];
  if (period.status === "short-history") content.append(el("p", `Shorter history: FY${period.revenue.baseYear} → FY${period.revenue.endYear}. ${growthReason(period, false)} over this available span; this is not a full ${evidencePeriod === "fiveYear" ? "five" : "twenty"}-year comparison.`, "notice"));
  if (period.comparabilityWarning) {
    const warning = el("div", null, "comparability-warning"); warning.append(el("strong", "Reporting basis affects this comparison"), el("p", period.comparabilityWarning)); content.append(warning);
  }
  const metrics = el("div", null, "evidence-grid"); metrics.append(metricEvidence("Revenue · as reported", period.revenue || {}, true), metricEvidence("Diluted EPS · continuing operations", period.eps || {})); content.append(metrics);
  if (period.supplementalRevenue) {
    const a = period.supplementalRevenue; const supplemental = el("section", null, "supplemental");
    supplemental.append(el("h3", "Separate accounting comparison"), el("p", `Revenue: $${figure(a.base, true, true)}B → $${figure(a.end, true, true)}B (${growth(a.growth)}). The main table retains the reported figures.`, "source-figures"), el("p", a.note), sourceList(a.sources)); content.append(supplemental);
  }
  const notes = [...new Set([...(company.notes || []), ...(period.notes || [])])];
  if (notes.length) { const context = el("div", null, "company-notes"); context.append(el("h3", "Context")); const list = el("ul"); notes.forEach((note) => list.append(el("li", note))); context.append(list); content.append(context); }
}
function setPeriod(key) {
  selectedPeriod = key; evidencePeriod = key;
  for (const button of $("periods").children) button.setAttribute("aria-pressed", String(button.dataset.period === key));
  renderTable();
}
async function start() {
  try {
    const response = await fetch("data.json", { credentials: "same-origin", cache: "no-cache" });
    if (!response.ok) throw new Error("The analysis could not be loaded.");
    dataset = await response.json();
    if (!dataset.metadata?.asOf || !Array.isArray(dataset.metadata.periods) || !Array.isArray(dataset.companies) || !dataset.companies.length) throw new Error("The analysis file is incomplete.");
    selectedPeriod = dataset.metadata.periods.some((p) => p.key === "fiveYear") ? "fiveYear" : dataset.metadata.periods[0].key;
    $("as-of").textContent = `As of ${dataset.metadata.asOf} · Common FY2025 endpoint`;
    for (const period of dataset.metadata.periods) {
      const button = el("button", period.key === "fiveYear" ? "5 years" : "20 years"); button.type = "button"; button.dataset.period = period.key;
      button.setAttribute("aria-pressed", String(period.key === selectedPeriod)); button.addEventListener("click", () => setPeriod(period.key)); $("periods").append(button);
    }
    const sectors = [...new Set(dataset.companies.map((c) => c.sector).filter(Boolean))].sort();
    sectors.forEach((sector) => { const option = el("option", sector); option.value = sector; $("sector").append(option); });
    $("sector").closest("label").hidden = !sectors.length;
    for (const note of dataset.metadata.methodology || []) $("methodology").append(el("li", note));
    $("sources").append(sourceList(dataset.metadata.sources));
    ["search", "sector", "condition"].forEach((id) => $(id).addEventListener(id === "search" ? "input" : "change", renderTable));
    $("reset").addEventListener("click", () => { $("search").value = ""; $("sector").value = "all"; $("condition").value = "all"; renderTable(); });
    for (const button of document.querySelectorAll("[data-sort]")) button.addEventListener("click", () => { const key = button.dataset.sort; sortDirection = sortKey === key ? -sortDirection : ["ticker", "name", "years", "reason"].includes(key) ? 1 : -1; sortKey = key; renderTable(); });
    $("analysis").hidden = false; renderTable();
  } catch (error) {
    $("as-of").textContent = "Analysis unavailable";
    $("error").hidden = false; $("error").textContent = `${error.message} Reload this page or use the PDF or CSV above.`;
  }
}
start();
