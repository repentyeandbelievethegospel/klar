const CATEGORY_META = {
  Lebensmittel: { color: "#0d5c45", icon: "🛒" },
  Wohnen: { color: "#9aaf9e", icon: "⌂" },
  Mobilität: { color: "#e28b4a", icon: "↗" },
  Freizeit: { color: "#6b96a7", icon: "✦" },
  Sonstiges: { color: "#9c86ad", icon: "•" },
  Lohn: { color: "#0d5c45", icon: "+" },
  Bonus: { color: "#58a07a", icon: "✦" },
  Zinsen: { color: "#6b96a7", icon: "%" },
  Geschenk: { color: "#9c86ad", icon: "◇" },
};

const EXPENSE_CATEGORIES = ["Lebensmittel", "Wohnen", "Mobilität", "Freizeit", "Sonstiges"];
const INCOME_CATEGORIES = ["Lohn", "Bonus", "Zinsen", "Geschenk", "Sonstiges"];

const DEFAULT_EXPENSES = [
  { id: 1, description: "Coop", amount: 86.4, category: "Lebensmittel", type: "Ausgabe", period: "Einmalig", date: "2026-07-20" },
  { id: 2, description: "SBB Mobile", amount: 42.0, category: "Mobilität", type: "Ausgabe", period: "Monatlich", date: "2026-07-19" },
  { id: 3, description: "Miete", amount: 1480.0, category: "Wohnen", type: "Ausgabe", period: "Monatlich", date: "2026-07-01" },
  { id: 4, description: "Kino Houdini", amount: 38.0, category: "Freizeit", type: "Ausgabe", period: "Einmalig", date: "2026-07-17" },
  { id: 5, description: "Migros", amount: 64.85, category: "Lebensmittel", type: "Ausgabe", period: "Einmalig", date: "2026-07-16" },
  { id: 6, description: "Spotify", amount: 13.95, category: "Freizeit", type: "Ausgabe", period: "Monatlich", date: "2026-07-14" },
  { id: 7, description: "Hausratversicherung", amount: 186.0, category: "Sonstiges", type: "Ausgabe", period: "Jährlich", date: "2026-07-12" },
  { id: 8, description: "Lohn", amount: 5450.0, category: "Lohn", type: "Einnahme", period: "Monatlich", date: "2026-07-01" },
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const storage = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

let customCategories = storage.get("klar-custom-categories", []);
if (!Array.isArray(customCategories)) customCategories = [];
customCategories.forEach((category) => {
  CATEGORY_META[category.name] = { color: category.color, icon: category.name.charAt(0).toUpperCase() };
});
let profile = storage.get("klar-profile", { name: "Lea", initials: "LM" });
if (!profile || typeof profile.name !== "string" || typeof profile.initials !== "string") profile = { name: "Lea", initials: "LM" };
profile.name = profile.name.trim().slice(0, 40) || "Lea";
profile.initials = profile.initials.trim().slice(0, 3).toUpperCase() || "LM";

let expenses = storage.get("klar-expenses", DEFAULT_EXPENSES).map((expense) => ({ type: "Ausgabe", period: "Einmalig", ...expense }));
let budget = storage.get("klar-budget", 3000);
let activeCategory = "Alle";
let activePeriod = "Alle";
let activeEntryType = "Alle";
let transactionPeriod = `month-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
let reportYear = new Date().getFullYear();
let activeView = "overview";
let editingEntryId = null;
let toastTimer;

const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTHS_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function getCategories(type) {
  const builtIn = type === "Einnahme" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const custom = customCategories.filter((category) => category.type === type).map((category) => category.name);
  return [...new Set([...builtIn, ...custom])];
}

const formatCurrency = (value, digits = 2) => new Intl.NumberFormat("de-CH", {
  style: "currency", currency: "CHF", minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(value).replace("CHF", "CHF ");

const formatDate = (dateString) => {
  const date = new Date(`${dateString}T12:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Heute";
  if (date.toDateString() === yesterday.toDateString()) return "Gestern";
  return new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "short" }).format(date);
};

function dateAtNoon(year, month, day) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay), 12, 0, 0);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function expandEntriesThrough(endDate = new Date()) {
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59);
  const occurrences = [];

  expenses.forEach((entry) => {
    const start = new Date(`${entry.date}T12:00:00`);
    if (Number.isNaN(start.getTime()) || start > end) return;

    if (entry.period === "Einmalig") {
      occurrences.push({ ...entry, sourceId: entry.id, occurrenceId: `${entry.id}-${entry.date}` });
      return;
    }

    if (entry.period === "Monatlich") {
      let year = start.getFullYear();
      let month = start.getMonth();
      while (true) {
        const occurrenceDate = dateAtNoon(year, month, start.getDate());
        if (occurrenceDate > end) break;
        occurrences.push({ ...entry, date: toDateString(occurrenceDate), sourceId: entry.id, occurrenceId: `${entry.id}-${toDateString(occurrenceDate)}` });
        month += 1;
        if (month > 11) { month = 0; year += 1; }
      }
      return;
    }

    if (entry.period === "Jährlich") {
      for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
        const occurrenceDate = dateAtNoon(year, start.getMonth(), start.getDate());
        if (occurrenceDate > end) break;
        occurrences.push({ ...entry, date: toDateString(occurrenceDate), sourceId: entry.id, occurrenceId: `${entry.id}-${toDateString(occurrenceDate)}` });
      }
    }
  });

  return occurrences;
}

function setGreeting() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 11 ? "Guten Morgen" : hour < 17 ? "Guten Tag" : "Guten Abend";
  $(".intro h1").textContent = `${greeting}, ${profile.name}.`;
  $("#profileButton").textContent = profile.initials;
  $("#profileButton").setAttribute("aria-label", `Profil von ${profile.name} öffnen`);
  $("#dateGreeting").textContent = new Intl.DateTimeFormat("de-CH", {
    weekday: "long", day: "numeric", month: "long",
  }).format(now).toUpperCase();
  $("#expenseForm [name=date]").value = now.toISOString().slice(0, 10);
}

function getVisibleExpenses() {
  const query = $("#searchInput").value.trim().toLocaleLowerCase("de");
  const { endDate, year, month } = getSelectedTransactionPeriod();
  return expandEntriesThrough(endDate)
    .filter((expense) => {
      const date = new Date(`${expense.date}T12:00:00`);
      return date.getFullYear() === year && (month === null || date.getMonth() === month);
    })
    .filter((expense) => activeCategory === "Alle" || expense.category === activeCategory)
    .filter((expense) => activePeriod === "Alle" || expense.period === activePeriod)
    .filter((expense) => activeEntryType === "Alle" || expense.type === activeEntryType)
    .filter((expense) => !query || `${expense.description} ${expense.category} ${expense.type} ${expense.period}`.toLocaleLowerCase("de").includes(query))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function getSelectedTransactionPeriod() {
  const now = new Date();
  const parts = transactionPeriod.split("-");
  const isYear = parts[0] === "year";
  const year = Number(parts[1]) || now.getFullYear();
  const month = isYear ? null : Math.max(0, (Number(parts[2]) || now.getMonth() + 1) - 1);
  const naturalEnd = isYear
    ? new Date(year, 11, 31, 23, 59, 59)
    : new Date(year, month + 1, 0, 23, 59, 59);
  const endDate = year === now.getFullYear() && (isYear || month === now.getMonth()) && naturalEnd > now ? now : naturalEnd;
  return { endDate, year, month };
}

function renderTransactionPeriodSelect() {
  const now = new Date();
  const entryYears = expenses.map((expense) => new Date(`${expense.date}T12:00:00`).getFullYear());
  const firstYear = Math.min(now.getFullYear(), ...entryYears);
  const options = [];
  for (let year = now.getFullYear(); year >= firstYear; year -= 1) {
    options.push(`<option value="year-${year}">Ganzes Jahr ${year}</option>`);
    const lastMonth = year === now.getFullYear() ? now.getMonth() : 11;
    for (let month = lastMonth; month >= 0; month -= 1) {
      const value = `month-${year}-${String(month + 1).padStart(2, "0")}`;
      options.push(`<option value="${value}">${MONTHS_LONG[month]} ${year}</option>`);
    }
  }
  $("#transactionPeriodSelect").innerHTML = options.join("");
  if (![...$("#transactionPeriodSelect").options].some((option) => option.value === transactionPeriod)) {
    transactionPeriod = `month-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  $("#transactionPeriodSelect").value = transactionPeriod;
}

function renderFilters() {
  const availableCategories = activeEntryType === "Alle"
    ? [...new Set([...getCategories("Ausgabe"), ...getCategories("Einnahme")])]
    : getCategories(activeEntryType);
  const categories = ["Alle", ...availableCategories];
  if (!categories.includes(activeCategory)) activeCategory = "Alle";
  $("#filterChips").innerHTML = categories.map((category) =>
    `<button class="filter-chip ${category === activeCategory ? "active" : ""}" data-category="${escapeHtml(category)}" type="button">${escapeHtml(category)}</button>`
  ).join("");
}

function renderTransactions() {
  const filtered = getVisibleExpenses();
  const visible = filtered;
  $("#transactionList").innerHTML = visible.map((expense, index) => {
    const meta = CATEGORY_META[expense.category] || CATEGORY_META.Sonstiges;
    return `<article class="transaction-row" style="animation-delay:${index * 35}ms">
      <span class="transaction-icon" style="color:${meta.color};background:${meta.color}18">${escapeHtml(meta.icon)}</span>
      <div class="transaction-info"><strong>${escapeHtml(expense.description)}</strong><span>${formatDate(expense.date)}<span class="period-label">${expense.period}</span></span></div>
      <time class="transaction-date" datetime="${expense.date}">${new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${expense.date}T12:00:00`))}</time>
      <span class="category-pill">${escapeHtml(expense.category)}</span>
      <span class="transaction-amount ${expense.type === "Einnahme" ? "income" : ""}">${expense.type === "Einnahme" ? "+" : "−"} ${formatCurrency(expense.amount)}</span>
      <div class="transaction-actions">
        <button class="edit-button" type="button" data-edit="${expense.sourceId}" aria-label="${escapeHtml(expense.description)}${expense.period === "Einmalig" ? "" : " als Serie"} bearbeiten">✎</button>
        <button class="delete-button" type="button" data-delete="${expense.sourceId}" aria-label="${escapeHtml(expense.description)}${expense.period === "Einmalig" ? "" : " als Serie"} löschen">×</button>
      </div>
    </article>`;
  }).join("");
  $("#transactionList").hidden = visible.length === 0;
  $("#emptyState").hidden = visible.length !== 0;
}

function renderSummary() {
  const now = new Date();
  const allOccurrences = expandEntriesThrough(now);
  const currentMonth = allOccurrences.filter((expense) => {
    const date = new Date(`${expense.date}T12:00:00`);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const monthlyExpenses = currentMonth.filter((expense) => expense.type === "Ausgabe");
  const total = monthlyExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const income = currentMonth.filter((expense) => expense.type === "Einnahme").reduce((sum, expense) => sum + Number(expense.amount), 0);
  const balance = income - total;
  const monthlyRecurring = monthlyExpenses.filter((expense) => expense.period === "Monatlich").reduce((sum, expense) => sum + Number(expense.amount), 0);
  const yearlyRecurring = monthlyExpenses.filter((expense) => expense.period === "Jährlich").reduce((sum, expense) => sum + Number(expense.amount), 0);
  const oneTimeExpenses = monthlyExpenses.filter((expense) => expense.period === "Einmalig").reduce((sum, expense) => sum + Number(expense.amount), 0);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthTotal = allOccurrences.filter((expense) => {
    const date = new Date(`${expense.date}T12:00:00`);
    return expense.type === "Ausgabe" && date.getMonth() === previousMonthDate.getMonth() && date.getFullYear() === previousMonthDate.getFullYear();
  }).reduce((sum, expense) => sum + Number(expense.amount), 0);
  const monthDifference = total - previousMonthTotal;
  $("#totalAmount").textContent = formatCurrency(total);
  $("#budgetUsed").textContent = formatCurrency(total, 0);
  $("#budgetAmountButton").textContent = formatCurrency(budget, 0);
  $("#monthlyRecurring").textContent = formatCurrency(monthlyRecurring);
  $("#yearlyRecurring").textContent = formatCurrency(yearlyRecurring);
  $("#oneTimeExpenses").textContent = formatCurrency(oneTimeExpenses);
  $("#monthlyIncome").textContent = formatCurrency(income);
  $("#monthlyBalance").textContent = formatCurrency(balance);
  $("#monthlyBalance").className = balance >= 0 ? "positive" : "negative";
  $("#trendValue").textContent = formatCurrency(Math.abs(monthDifference));
  $("#trendComparisonText").textContent = monthDifference > 0
    ? "mehr Ausgaben als letzten Monat"
    : monthDifference < 0
      ? "weniger Ausgaben als letzten Monat"
      : "gleich viele Ausgaben wie letzten Monat";
  $("#trendBadge").classList.toggle("positive", monthDifference <= 0);
  $("#trendBadge svg").style.transform = monthDifference < 0 ? "scaleY(-1)" : "none";
  const percentage = Math.min((total / budget) * 100, 100);
  $("#budgetProgress").style.width = `${percentage}%`;
  $("#budgetProgress").classList.toggle("over", total > budget);
  $(".budget-track").setAttribute("aria-valuenow", Math.round(percentage));

  const sums = getCategories("Ausgabe").map((category) => ({
    category,
    amount: monthlyExpenses.filter((e) => e.category === category).reduce((sum, e) => sum + Number(e.amount), 0),
  })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  $("#topCategory").textContent = sums[0]?.category || "–";
  renderDonut(sums, total);
}

function renderAnalytics() {
  const currentYear = new Date().getFullYear();
  const entryYears = expenses.map((expense) => new Date(`${expense.date}T12:00:00`).getFullYear());
  const firstYear = Math.min(currentYear, ...entryYears);
  const lastYear = Math.max(currentYear, ...entryYears);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index);
  if (!years.includes(reportYear)) reportYear = years[0];
  $("#yearSelect").innerHTML = years.map((year) => `<option value="${year}" ${year === reportYear ? "selected" : ""}>${year}</option>`).join("");

  const now = new Date();
  const reportEnd = reportYear === currentYear
    ? now
    : new Date(reportYear, 11, 31, 23, 59, 59);
  const yearlyEntries = expandEntriesThrough(reportEnd).filter((expense) => new Date(`${expense.date}T12:00:00`).getFullYear() === reportYear);
  const yearlyExpenses = yearlyEntries.filter((expense) => expense.type === "Ausgabe");
  const yearlyIncome = yearlyEntries.filter((expense) => expense.type === "Einnahme");
  const monthlyTotals = Array.from({ length: 12 }, (_, month) => yearlyExpenses
    .filter((expense) => new Date(`${expense.date}T12:00:00`).getMonth() === month)
    .reduce((sum, expense) => sum + Number(expense.amount), 0));
  const monthlyIncomeTotals = Array.from({ length: 12 }, (_, month) => yearlyIncome
    .filter((expense) => new Date(`${expense.date}T12:00:00`).getMonth() === month)
    .reduce((sum, expense) => sum + Number(expense.amount), 0));
  const total = monthlyTotals.reduce((sum, amount) => sum + amount, 0);
  const incomeTotal = monthlyIncomeTotals.reduce((sum, amount) => sum + amount, 0);
  const balance = incomeTotal - total;
  const savingsRate = incomeTotal > 0 ? balance / incomeTotal * 100 : null;
  const monthsConsidered = reportYear === currentYear ? now.getMonth() + 1 : 12;
  const averageMonthlyExpenses = total / monthsConsidered;
  const maxValue = Math.max(...monthlyTotals, ...monthlyIncomeTotals, 0);

  $("#annualTotal").textContent = formatCurrency(total);
  $("#averageMonthlyExpenses").textContent = formatCurrency(averageMonthlyExpenses);
  $("#annualIncome").textContent = formatCurrency(incomeTotal);
  $("#annualBalance").textContent = formatCurrency(balance);
  $("#annualBalance").className = balance >= 0 ? "positive" : "negative";
  $("#savingsRate").textContent = savingsRate === null ? "–" : `${savingsRate.toFixed(1)}%`;
  $("#savingsRate").className = savingsRate === null ? "" : savingsRate >= 0 ? "positive" : "negative";

  const scaleMax = maxValue > 0 ? niceScaleMax(maxValue) : 1000;
  $("#chartScale").innerHTML = [scaleMax, scaleMax * .75, scaleMax * .5, scaleMax * .25, 0]
    .map((value) => `<span>${compactNumber(value)}</span>`).join("");
  $("#annualBarChart").innerHTML = monthlyTotals.map((amount, month) => {
    const incomeAmount = monthlyIncomeTotals[month];
    const expenseHeight = amount > 0 ? Math.max(amount / scaleMax * 100, 2) : 1;
    const incomeHeight = incomeAmount > 0 ? Math.max(incomeAmount / scaleMax * 100, 2) : 1;
    return `<div class="month-column">
      <div class="month-bar-space">
        <span class="month-bar expense" style="height:${expenseHeight}%" data-value="Ausgaben: ${formatCurrency(amount)}" aria-label="${MONTHS_LONG[month]}, Ausgaben: ${formatCurrency(amount)}"></span>
        <span class="month-bar income" style="height:${incomeHeight}%" data-value="Einnahmen: ${formatCurrency(incomeAmount)}" aria-label="${MONTHS_LONG[month]}, Einnahmen: ${formatCurrency(incomeAmount)}"></span>
      </div>
      <span class="month-label">${MONTHS_SHORT[month]}</span>
    </div>`;
  }).join("");

  const expenseCategorySums = getCategories("Ausgabe").map((category) => ({
    category,
    amount: yearlyExpenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + Number(expense.amount), 0),
  })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const incomeCategorySums = getCategories("Einnahme").map((category) => ({
    category,
    amount: yearlyIncome.filter((entry) => entry.category === category).reduce((sum, entry) => sum + Number(entry.amount), 0),
  })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  renderAnnualCategories(expenseCategorySums, total, {
    segments: "#annualExpenseDonutSegments",
    total: "#annualExpenseDonutTotal",
    breakdown: "#expenseCategoryBreakdown",
  }, "Ausgaben");
  renderAnnualCategories(incomeCategorySums, incomeTotal, {
    segments: "#annualIncomeDonutSegments",
    total: "#annualIncomeDonutTotal",
    breakdown: "#incomeCategoryBreakdown",
  }, "Einnahmen");
}

function niceScaleMax(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function compactNumber(value) {
  return new Intl.NumberFormat("de-CH", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function renderAnnualCategories(sums, total, targets, emptyLabel) {
  const circumference = 2 * Math.PI * 45;
  let offset = 0;
  $(targets.segments).innerHTML = sums.map(({ category, amount }) => {
    const length = total ? amount / total * circumference : 0;
    const segment = `<circle class="donut-segment" cx="60" cy="60" r="45" stroke="${CATEGORY_META[category].color}" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" />`;
    offset += length;
    return segment;
  }).join("");
  $(targets.total).textContent = compactNumber(total);
  $(targets.total).title = formatCurrency(total);
  $(targets.breakdown).innerHTML = sums.length ? sums.map(({ category, amount }) =>
    `<div class="category-breakdown-row">
      <span class="legend-dot" style="background:${CATEGORY_META[category].color}"></span>
      <span>${escapeHtml(category)} · ${Math.round(amount / total * 100)}%</span>
      <strong>${formatCurrency(amount)}</strong>
    </div>`
  ).join("") : `<p class="no-report-data">Noch keine ${emptyLabel} in diesem Jahr.</p>`;
}

function renderDonut(sums, total) {
  const circumference = 2 * Math.PI * 45;
  let offset = 0;
  $("#donutSegments").innerHTML = sums.map(({ category, amount }) => {
    const length = total ? (amount / total) * circumference : 0;
    const segment = `<circle class="donut-segment" cx="60" cy="60" r="45" stroke="${CATEGORY_META[category].color}" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" />`;
    offset += length;
    return segment;
  }).join("");
  $("#categoryLegend").innerHTML = sums.slice(0, 5).map(({ category, amount }) =>
    `<div class="legend-row"><span class="legend-dot" style="background:${CATEGORY_META[category].color}"></span><span>${escapeHtml(category)}</span><b>${total ? Math.round(amount / total * 100) : 0}%</b></div>`
  ).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function render() {
  renderTransactionPeriodSelect();
  renderFilters();
  renderTransactions();
  renderSummary();
  renderAnalytics();
  renderCustomCategories();
}

function openModal(selector) {
  const modal = $(selector);
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => modal.querySelector("input")?.focus(), 50);
}

function closeModals() {
  $$(".modal-backdrop").forEach((modal) => { modal.hidden = true; });
  document.body.style.overflow = "";
}

function closeModal(modal) {
  modal.hidden = true;
  if ($$(".modal-backdrop:not([hidden])").length === 0) document.body.style.overflow = "";
}

function showToast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}

function showView(view, updateHash = true) {
  const validViews = ["overview", "transactions", "analytics"];
  activeView = validViews.includes(view) ? view : "overview";
  $$("[data-view]").forEach((section) => {
    const isActive = section.dataset.view === activeView;
    section.hidden = !isActive;
    section.classList.toggle("active", isActive);
  });
  $$("[data-view-link]").forEach((link) => link.classList.toggle("active", link.dataset.viewLink === activeView));
  if (updateHash && window.location.hash !== `#${activeView}`) history.pushState(null, "", `#${activeView}`);
  const labels = { overview: "Übersicht", transactions: "Transaktionen", analytics: "Auswertungen" };
  document.title = `${labels[activeView]} – Klar`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$('[data-view-link]').forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  showView(link.dataset.viewLink);
}));

window.addEventListener("popstate", () => showView(window.location.hash.slice(1), false));

function prepareNewEntry() {
  editingEntryId = null;
  $("#expenseForm").reset();
  $("#expenseForm [name=date]").value = new Date().toISOString().slice(0, 10);
  $("#expenseModalEyebrow").textContent = "NEUER EINTRAG";
  $("#expenseModalTitle").textContent = "Eintrag hinzufügen";
  updateEntryForm();
  openModal("#expenseModal");
}

function prepareEditEntry(entry) {
  editingEntryId = entry.id;
  const form = $("#expenseForm");
  form.reset();
  form.querySelector(`[name="type"][value="${entry.type}"]`).checked = true;
  updateEntryForm();
  form.elements.description.value = entry.description;
  form.elements.amount.value = entry.amount;
  form.elements.date.value = entry.date;
  form.elements.category.value = entry.category;
  form.querySelector(`[name="period"][value="${entry.period}"]`).checked = true;
  const isSeries = entry.period !== "Einmalig";
  $("#expenseModalEyebrow").textContent = isSeries ? "WIEDERKEHRENDER EINTRAG" : "BUCHUNG";
  $("#expenseModalTitle").textContent = isSeries ? "Serie bearbeiten" : "Eintrag bearbeiten";
  $("#entrySubmitButton").textContent = "Änderungen speichern";
  openModal("#expenseModal");
}

[$("#desktopAddButton"), $("#mobileAddButton")].forEach((button) => button.addEventListener("click", prepareNewEntry));
$("#profileButton").addEventListener("click", () => {
  $("#profileForm [name=name]").value = profile.name;
  $("#profileForm [name=initials]").value = profile.initials;
  openModal("#profileModal");
});
[$("#manageCategoriesButton"), $("#formManageCategoriesButton")].forEach((button) => button.addEventListener("click", () => {
  const selectedType = $('#expenseForm input[name="type"]:checked')?.value || "Ausgabe";
  $("#categoryForm [name=type]").value = selectedType;
  openModal("#categoryModal");
}));
[$("#desktopBudgetButton"), $("#mobileBudgetButton"), $("#budgetAmountButton")].forEach((button) => button.addEventListener("click", () => {
  $("#budgetForm [name=budget]").value = budget;
  openModal("#budgetModal");
}));

$("#expenseForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const updatedEntry = {
    id: editingEntryId || Date.now(),
    description: data.get("description").trim(),
    amount: Number(data.get("amount")),
    date: data.get("date"),
    category: data.get("category"),
    type: data.get("type"),
    period: data.get("period"),
  };
  const wasEditing = editingEntryId !== null;
  if (wasEditing) {
    expenses = expenses.map((entry) => entry.id === editingEntryId ? updatedEntry : entry);
  } else {
    expenses.push(updatedEntry);
  }
  storage.set("klar-expenses", expenses);
  editingEntryId = null;
  event.currentTarget.reset();
  updateEntryForm();
  $("#expenseForm [name=date]").value = new Date().toISOString().slice(0, 10);
  closeModals();
  render();
  showToast(wasEditing ? "Änderungen wurden gespeichert." : `${data.get("type")} wurde hinzugefügt.`);
});

$("#budgetForm").addEventListener("submit", (event) => {
  event.preventDefault();
  budget = Number(new FormData(event.currentTarget).get("budget"));
  storage.set("klar-budget", budget);
  closeModals();
  renderSummary();
  showToast("Monatsbudget wurde aktualisiert.");
});

$("#profileForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = data.get("name").trim() || "Benutzer";
  const automaticInitials = name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase();
  profile = { name, initials: data.get("initials").trim().toUpperCase() || automaticInitials || "B" };
  storage.set("klar-profile", profile);
  setGreeting();
  showToast("Profil wurde aktualisiert.");
});

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveBackupKey(password, salt, iterations, usages) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function ensureWebCrypto() {
  if (!window.crypto?.subtle) {
    showToast("Verschlüsselung wird in diesem Browser-Kontext nicht unterstützt.");
    return false;
  }
  return true;
}

$("#exportForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureWebCrypto()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const password = data.get("password");
  if (password !== data.get("confirmation")) {
    showToast("Die Passwörter stimmen nicht überein.");
    return;
  }
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Backup wird verschlüsselt …";
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = 250000;
    const key = await deriveBackupKey(password, salt, iterations, ["encrypt"]);
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: expenses,
      budget,
      customCategories,
      profile,
    };
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    const envelope = {
      format: "klar-encrypted-backup",
      version: 1,
      encryption: { algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations },
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(encrypted)),
    };
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `klar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    form.reset();
    showToast("Verschlüsseltes Backup wurde erstellt.");
  } catch {
    showToast("Das Backup konnte nicht erstellt werden.");
  } finally {
    button.disabled = false;
    button.textContent = "Verschlüsselte JSON exportieren";
  }
});

function validateBackupPayload(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.entries) || !Array.isArray(payload.customCategories)) throw new Error("invalid-payload");
  const validTypes = ["Ausgabe", "Einnahme"];
  const validPeriods = ["Monatlich", "Jährlich", "Einmalig"];
  const entries = payload.entries.map((entry) => {
    const amount = Number(entry.amount);
    if (!entry || typeof entry.description !== "string" || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !validTypes.includes(entry.type) || !validPeriods.includes(entry.period) || typeof entry.category !== "string") throw new Error("invalid-entry");
    return { id: Number(entry.id) || Date.now() + Math.random(), description: entry.description.slice(0, 40), amount, category: entry.category.slice(0, 24), type: entry.type, period: entry.period, date: entry.date };
  });
  const builtInNames = new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((name) => name.toLocaleLowerCase("de")));
  const seenNames = new Set();
  const categories = payload.customCategories.filter((category) => {
    const normalized = typeof category?.name === "string" ? category.name.trim().toLocaleLowerCase("de") : "";
    const valid = normalized && normalized.length <= 24 && validTypes.includes(category.type) && /^#[0-9a-f]{6}$/i.test(category.color) && !builtInNames.has(normalized) && !seenNames.has(normalized);
    if (valid) seenNames.add(normalized);
    return valid;
  }).map((category) => ({ id: Number(category.id) || Date.now() + Math.random(), name: category.name.trim(), type: category.type, color: category.color }));
  const importedBudget = Number(payload.budget);
  if (!Number.isFinite(importedBudget) || importedBudget <= 0) throw new Error("invalid-budget");
  const importedProfile = payload.profile && typeof payload.profile.name === "string" && typeof payload.profile.initials === "string"
    ? { name: payload.profile.name.trim().slice(0, 40) || "Benutzer", initials: payload.profile.initials.trim().slice(0, 3).toUpperCase() || "B" }
    : { name: "Benutzer", initials: "B" };
  return { entries, categories, budget: importedBudget, profile: importedProfile };
}

function replaceCustomCategories(categories) {
  const builtInNames = new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]);
  customCategories.forEach((category) => { if (!builtInNames.has(category.name)) delete CATEGORY_META[category.name]; });
  customCategories = categories;
  customCategories.forEach((category) => {
    CATEGORY_META[category.name] = { color: category.color, icon: category.name.charAt(0).toUpperCase() };
  });
}

$("#importForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureWebCrypto()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const file = data.get("file");
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Backup wird entschlüsselt …";
  try {
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024) throw new Error("invalid-file-size");
    const envelope = JSON.parse(await file.text());
    if (envelope.format !== "klar-encrypted-backup" || envelope.version !== 1 || envelope.encryption?.algorithm !== "AES-256-GCM" || envelope.encryption?.kdf !== "PBKDF2-SHA-256") throw new Error("invalid-format");
    const iterations = Number(envelope.encryption.iterations);
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) throw new Error("invalid-kdf");
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error("invalid-parameters");
    const key = await deriveBackupKey(data.get("password"), salt, iterations, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(envelope.data));
    const imported = validateBackupPayload(JSON.parse(new TextDecoder().decode(decrypted)));
    if (!window.confirm("Beim Import werden alle aktuellen Daten ersetzt. Möchtest du fortfahren?")) return;

    expenses = imported.entries;
    budget = imported.budget;
    profile = imported.profile;
    replaceCustomCategories(imported.categories);
    storage.set("klar-expenses", expenses);
    storage.set("klar-budget", budget);
    storage.set("klar-profile", profile);
    storage.set("klar-custom-categories", customCategories);
    activeCategory = "Alle";
    activePeriod = "Alle";
    activeEntryType = "Alle";
    reportYear = new Date().getFullYear();
    transactionPeriod = `month-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    form.reset();
    setGreeting();
    updateEntryForm();
    render();
    closeModal($("#profileModal"));
    showToast("Backup wurde erfolgreich importiert.");
  } catch {
    showToast("Import fehlgeschlagen: Passwort oder Datei ist ungültig.");
  } finally {
    button.disabled = false;
    button.textContent = "JSON entschlüsseln & importieren";
  }
});

$("#filterChips").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  renderFilters();
  renderTransactions();
});

$("#periodFilter").addEventListener("click", (event) => {
  const button = event.target.closest("[data-period]");
  if (!button) return;
  activePeriod = button.dataset.period;
  $$("#periodFilter button").forEach((item) => item.classList.toggle("active", item === button));
  renderTransactions();
});

$("#entryTypeFilter").addEventListener("click", (event) => {
  const button = event.target.closest("[data-entry-type]");
  if (!button) return;
  activeEntryType = button.dataset.entryType;
  $$("#entryTypeFilter button").forEach((item) => item.classList.toggle("active", item === button));
  renderFilters();
  renderTransactions();
});

$$('#expenseForm input[name="type"]').forEach((input) => input.addEventListener("change", updateEntryForm));

function updateEntryForm() {
  const type = $('#expenseForm input[name="type"]:checked').value;
  const categories = getCategories(type);
  $("#categorySelect").innerHTML = categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  $("#entrySubmitButton").textContent = editingEntryId !== null ? "Änderungen speichern" : type === "Einnahme" ? "Einnahme speichern" : "Ausgabe speichern";
}

function renderCustomCategories() {
  $("#customCategoryCount").textContent = customCategories.length;
  $("#customCategoryList").innerHTML = customCategories.length ? customCategories.map((category) => `
    <div class="custom-category-item">
      <span class="legend-dot" style="background:${category.color}"></span>
      <span class="custom-category-name">${escapeHtml(category.name)}</span>
      <span class="custom-category-type">${category.type}</span>
      <button type="button" data-delete-category="${category.id}" aria-label="Kategorie ${escapeHtml(category.name)} löschen">×</button>
    </div>`).join("") : `<p class="custom-category-empty">Noch keine eigenen Kategorien erstellt.</p>`;
}

$("#categoryForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = data.get("name").trim();
  const duplicate = Object.keys(CATEGORY_META).some((category) => category.toLocaleLowerCase("de") === name.toLocaleLowerCase("de"));
  if (duplicate) {
    showToast("Diese Kategorie existiert bereits.");
    return;
  }
  const category = { id: Date.now(), name, type: data.get("type"), color: data.get("color") };
  customCategories.push(category);
  CATEGORY_META[name] = { color: category.color, icon: name.charAt(0).toUpperCase() };
  storage.set("klar-custom-categories", customCategories);
  event.currentTarget.elements.name.value = "";
  render();
  updateEntryForm();
  if ($('#expenseForm input[name="type"]:checked').value === category.type) $("#categorySelect").value = name;
  showToast("Kategorie wurde hinzugefügt.");
});

$("#customCategoryList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-category]");
  if (!button) return;
  const category = customCategories.find((item) => item.id === Number(button.dataset.deleteCategory));
  if (!category) return;
  if (expenses.some((entry) => entry.category === category.name)) {
    showToast("Die Kategorie wird noch von Buchungen verwendet.");
    return;
  }
  customCategories = customCategories.filter((item) => item.id !== category.id);
  delete CATEGORY_META[category.name];
  storage.set("klar-custom-categories", customCategories);
  render();
  updateEntryForm();
  showToast("Kategorie wurde gelöscht.");
});

$("#transactionList").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    const entry = expenses.find((item) => item.id === Number(editButton.dataset.edit));
    if (entry) prepareEditEntry(entry);
    return;
  }
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  const removedEntry = expenses.find((expense) => expense.id === Number(button.dataset.delete));
  expenses = expenses.filter((expense) => expense.id !== Number(button.dataset.delete));
  storage.set("klar-expenses", expenses);
  render();
  showToast(removedEntry?.period === "Einmalig" ? `${removedEntry.type} wurde gelöscht.` : `${removedEntry?.type || "Eintrag"}-Serie wurde gelöscht.`);
});

$("#searchToggle").addEventListener("click", () => {
  const changedView = activeView !== "transactions";
  if (changedView) showView("transactions");
  $("#searchPanel").classList.toggle("open", changedView ? true : !$("#searchPanel").classList.contains("open"));
  if ($("#searchPanel").classList.contains("open")) $("#searchInput").focus();
});
$("#clearSearch").addEventListener("click", () => {
  $("#searchInput").value = "";
  $("#searchPanel").classList.remove("open");
  renderTransactions();
});
$("#searchInput").addEventListener("input", renderTransactions);
$("#transactionPeriodSelect").addEventListener("change", (event) => {
  transactionPeriod = event.target.value;
  renderTransactions();
});
$("#yearSelect").addEventListener("change", (event) => {
  reportYear = Number(event.target.value);
  renderAnalytics();
});
$("#printAnalyticsButton").addEventListener("click", () => window.print());
$$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop"))));
$$('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener("click", (event) => {
  if (event.target === backdrop) closeModal(backdrop);
}));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModals(); });

setGreeting();
render();
showView(window.location.hash.slice(1) || "overview", false);
