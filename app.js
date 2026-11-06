const CATEGORY_META = {
  Lebensmittel: { color: "#0d5c45", icon: "🛒" },
  Wohnen: { color: "#9aaf9e", icon: "⌂" },
  Mobilität: { color: "#e28b4a", icon: "↗" },
  Auto: { color: "#b45d47", icon: "🚗" },
  Freizeit: { color: "#6b96a7", icon: "✦" },
  Kleider: { color: "#b07a91", icon: "◇" },
  Ferien: { color: "#d59a3b", icon: "☀" },
  Versicherungen: { color: "#667d91", icon: "▣" },
  Gesundheit: { color: "#4e8b79", icon: "+" },
  Steuern: { color: "#7c6658", icon: "§" },
  Abonnement: { color: "#776a9b", icon: "↻" },
  Sonstiges: { color: "#9c86ad", icon: "•" },
  Lohn: { color: "#0d5c45", icon: "+" },
  Bonus: { color: "#58a07a", icon: "✦" },
  Zinsen: { color: "#6b96a7", icon: "%" },
  Geschenk: { color: "#9c86ad", icon: "◇" },
};

const EXPENSE_CATEGORIES = ["Lebensmittel", "Wohnen", "Mobilität", "Auto", "Kleider", "Ferien", "Versicherungen", "Gesundheit", "Steuern", "Abonnement", "Freizeit", "Sonstiges"];
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
const VAULT_KEY = "klar-vault";
const PROTECTED_STORAGE_KEYS = new Set(["klar-expenses", "klar-budget", "klar-yearly-goals", "klar-profile", "klar-custom-categories"]);
const existingVault = localStorage.getItem(VAULT_KEY);
let isVaultUnlocked = false;
let vaultPassword = null;
let vaultWriteChain = Promise.resolve();
const storage = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    if (isVaultUnlocked && PROTECTED_STORAGE_KEYS.has(key)) {
      queueVaultPersist();
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  },
};

let customCategories = existingVault ? [] : storage.get("klar-custom-categories", []);
if (!Array.isArray(customCategories)) customCategories = [];
customCategories.forEach((category) => {
  CATEGORY_META[category.name] = { color: category.color, icon: category.name.charAt(0).toUpperCase() };
});
let profile = existingVault ? { name: "Benutzer", initials: "B" } : storage.get("klar-profile", { name: "Lea", initials: "LM" });
if (!profile || typeof profile.name !== "string" || typeof profile.initials !== "string") profile = { name: "Lea", initials: "LM" };
profile.name = profile.name.trim().slice(0, 40) || "Lea";
profile.initials = profile.initials.trim().slice(0, 3).toUpperCase() || "LM";

let expenses = (existingVault ? [] : storage.get("klar-expenses", DEFAULT_EXPENSES)).map((expense) => ({
  type: "Ausgabe",
  period: "Einmalig",
  ...expense,
  endDate: typeof expense.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expense.endDate) ? expense.endDate : null,
  revisions: Array.isArray(expense.revisions) ? expense.revisions : [],
  overrides: expense.overrides && typeof expense.overrides === "object" ? expense.overrides : {},
  excludedDates: Array.isArray(expense.excludedDates) ? expense.excludedDates : [],
}));
let budget = existingVault ? 3000 : storage.get("klar-budget", 3000);
let yearlyGoals = existingVault ? {} : storage.get("klar-yearly-goals", {});
if (!yearlyGoals || typeof yearlyGoals !== "object" || Array.isArray(yearlyGoals)) yearlyGoals = {};
let activeCategory = "Alle";
let activePeriod = "Alle";
let activeEntryType = "Alle";
let transactionPeriod = `month-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
let reportYear = new Date().getFullYear();
let comparisonMode = "month";
let comparisonMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
let activeView = "overview";
let editingEntryId = null;
let editingOccurrenceDate = null;
let pendingSeriesEdit = null;
let toastTimer;

const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTHS_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function getAppPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: expenses,
    budget,
    yearlyGoals,
    customCategories,
    profile,
  };
}

function removeLegacyPlaintextStorage() {
  PROTECTED_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
}

async function encryptPayload(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 250000;
  const key = await deriveBackupKey(password, salt, iterations, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    format: "klar-encrypted-backup",
    version: 1,
    encryption: { algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations },
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function decryptEnvelope(envelope, password) {
  if (envelope?.format !== "klar-encrypted-backup" || envelope.version !== 1 || envelope.encryption?.algorithm !== "AES-256-GCM" || envelope.encryption?.kdf !== "PBKDF2-SHA-256") throw new Error("invalid-format");
  const iterations = Number(envelope.encryption.iterations);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) throw new Error("invalid-kdf");
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error("invalid-parameters");
  const key = await deriveBackupKey(password, salt, iterations, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(envelope.data));
  return validateBackupPayload(JSON.parse(new TextDecoder().decode(decrypted)));
}

async function persistEncryptedVault() {
  if (!isVaultUnlocked || !vaultPassword) return;
  const envelope = await encryptPayload(getAppPayload(), vaultPassword);
  localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
  removeLegacyPlaintextStorage();
}

function queueVaultPersist() {
  if (!isVaultUnlocked || !vaultPassword) return;
  vaultWriteChain = vaultWriteChain.then(persistEncryptedVault).catch(() => {
    showToast("Die verschlüsselten Daten konnten nicht gespeichert werden.");
  });
}

function applyImportedState(imported) {
  expenses = imported.entries;
  budget = imported.budget;
  yearlyGoals = imported.yearlyGoals;
  profile = imported.profile;
  replaceCustomCategories(imported.categories);
}

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

function resolveEntryAtDate(entry, occurrenceDate) {
  const revisions = (entry.revisions || [])
    .filter((revision) => revision.effectiveDate <= occurrenceDate)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const revision = revisions.at(-1) || {};
  const override = entry.overrides?.[occurrenceDate] || {};
  return { ...entry, ...revision, ...override, date: occurrenceDate };
}

function createOccurrence(entry, occurrenceDate) {
  return {
    ...resolveEntryAtDate(entry, occurrenceDate),
    sourceId: entry.id,
    occurrenceId: `${entry.id}-${occurrenceDate}`,
  };
}

function isOccurrenceExcluded(entry, occurrenceDate) {
  return (entry.excludedDates || []).includes(occurrenceDate);
}

function getNextOccurrenceDate(entry, fromDate = new Date()) {
  const start = new Date(`${entry.date}T12:00:00`);
  const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 12);
  const isWithinSeries = (dateString) => !entry.endDate || dateString <= entry.endDate;
  if (start >= today) return isWithinSeries(entry.date) ? entry.date : null;
  if (entry.period === "Monatlich") {
    let candidate = dateAtNoon(today.getFullYear(), today.getMonth(), start.getDate());
    if (candidate < today) candidate = dateAtNoon(today.getFullYear(), today.getMonth() + 1, start.getDate());
    const candidateString = toDateString(candidate);
    return isWithinSeries(candidateString) ? candidateString : null;
  }
  if (entry.period === "Jährlich") {
    let candidate = dateAtNoon(today.getFullYear(), start.getMonth(), start.getDate());
    if (candidate < today) candidate = dateAtNoon(today.getFullYear() + 1, start.getMonth(), start.getDate());
    const candidateString = toDateString(candidate);
    return isWithinSeries(candidateString) ? candidateString : null;
  }
  return entry.date;
}

function expandEntriesThrough(endDate = new Date()) {
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59);
  const occurrences = [];

  expenses.forEach((entry) => {
    const start = new Date(`${entry.date}T12:00:00`);
    const seriesEnd = entry.endDate ? new Date(`${entry.endDate}T23:59:59`) : null;
    if (Number.isNaN(start.getTime()) || start > end) return;
    if (seriesEnd && start > seriesEnd) return;

    if (entry.period === "Einmalig") {
      if (!isOccurrenceExcluded(entry, entry.date)) occurrences.push(createOccurrence(entry, entry.date));
      return;
    }

    if (entry.period === "Monatlich") {
      let year = start.getFullYear();
      let month = start.getMonth();
      while (true) {
        const occurrenceDate = dateAtNoon(year, month, start.getDate());
        if (occurrenceDate > end || (seriesEnd && occurrenceDate > seriesEnd)) break;
        const occurrenceDateString = toDateString(occurrenceDate);
        if (!isOccurrenceExcluded(entry, occurrenceDateString)) occurrences.push(createOccurrence(entry, occurrenceDateString));
        month += 1;
        if (month > 11) { month = 0; year += 1; }
      }
      return;
    }

    if (entry.period === "Jährlich") {
      for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
        const occurrenceDate = dateAtNoon(year, start.getMonth(), start.getDate());
        if (occurrenceDate > end || (seriesEnd && occurrenceDate > seriesEnd)) break;
        const occurrenceDateString = toDateString(occurrenceDate);
        if (!isOccurrenceExcluded(entry, occurrenceDateString)) occurrences.push(createOccurrence(entry, occurrenceDateString));
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
  const entryYears = [
    ...expenses.map((expense) => new Date(`${expense.date}T12:00:00`).getFullYear()),
    ...Object.keys(yearlyGoals).map(Number).filter(Number.isFinite),
  ];
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
        <button class="edit-button" type="button" data-edit="${expense.sourceId}" data-occurrence-date="${expense.date}" aria-label="${escapeHtml(expense.description)}${expense.period === "Einmalig" ? "" : " als Serie"} bearbeiten">✎</button>
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
    : reportYear < currentYear
      ? new Date(reportYear, 11, 31, 23, 59, 59)
      : new Date(reportYear, 0, 0, 23, 59, 59);
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
  renderYearGoals(total, balance);

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
  renderRecurringInflation(reportYear, reportEnd, currentYear);
  renderCategoryComparison();
}

function resolveRecurringRateAtDate(entry, dateString) {
  const revision = (entry.revisions || [])
    .filter((item) => item.effectiveDate <= dateString)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
    .at(-1) || {};
  return { ...entry, ...revision };
}

function monthlyEquivalent(entry) {
  return entry.period === "Jährlich" ? Number(entry.amount) / 12 : Number(entry.amount);
}

function renderRecurringInflation(year, reportEnd, currentYear) {
  const analysisEnd = year > currentYear ? new Date(year, 11, 31, 12) : reportEnd;
  const endString = toDateString(analysisEnd);
  const recurringExpenses = expenses.filter((entry) => entry.type === "Ausgabe" && entry.period !== "Einmalig");
  const baselineEnd = new Date(year - 1, 11, 31, 23, 59, 59);
  const getLastOccurrences = (occurrences) => {
    const result = new Map();
    occurrences.filter((occurrence) => occurrence.type === "Ausgabe" && occurrence.period !== "Einmalig").forEach((occurrence) => {
      const previous = result.get(occurrence.sourceId);
      if (!previous || occurrence.date > previous.date) result.set(occurrence.sourceId, occurrence);
    });
    return result;
  };
  const baselineOccurrences = getLastOccurrences(expandEntriesThrough(baselineEnd));
  const endOccurrences = getLastOccurrences(expandEntriesThrough(analysisEnd));
  const yearStartString = `${year}-01-01`;
  const comparable = recurringExpenses.filter((entry) => baselineOccurrences.has(entry.id) && endOccurrences.get(entry.id)?.date >= yearStartString && (!entry.endDate || entry.endDate >= endString));
  const changes = comparable.map((entry) => {
    const startEntry = baselineOccurrences.get(entry.id);
    const endEntry = endOccurrences.get(entry.id);
    const startAmount = monthlyEquivalent(startEntry);
    const endAmount = monthlyEquivalent(endEntry);
    return { entry, startAmount, endAmount, difference: endAmount - startAmount };
  });
  const startTotal = changes.reduce((sum, item) => sum + item.startAmount, 0);
  const endTotal = changes.reduce((sum, item) => sum + item.endAmount, 0);
  const difference = endTotal - startTotal;
  const percentage = startTotal > 0 ? difference / startTotal * 100 : null;

  $("#recurringCostStart").textContent = formatCurrency(startTotal);
  $("#recurringCostEnd").textContent = formatCurrency(endTotal);
  $("#recurringCostEndLabel").textContent = year === currentYear ? "Aktuell" : "Zum Jahresende";
  $("#recurringInflationBadge").textContent = percentage === null ? "–" : `${percentage >= 0 ? "+" : ""}${percentage.toFixed(1)}%`;
  $("#recurringInflationBadge").className = `inflation-badge ${difference > 0 ? "up" : difference < 0 ? "down" : ""}`;

  const priceIncreases = changes.filter((item) => item.difference > .001).sort((a, b) => b.difference - a.difference);
  const rows = [
    ...priceIncreases.map((item) => `<div class="cost-change-row">
      <div><strong>${escapeHtml(item.entry.description)}</strong><span>${formatCurrency(item.startAmount)} → ${formatCurrency(item.endAmount)} pro Monat</span></div>
      <b class="cost-change-amount">+ ${formatCurrency(item.difference)}</b>
      <b class="cost-change-percent">+${(item.difference / item.startAmount * 100).toFixed(1)}%</b>
    </div>`),
  ];
  $("#recurringCostChanges").innerHTML = rows.length ? rows.join("") : `<p class="no-report-data">Keine teurer gewordenen Serien in diesem Jahr.</p>`;
}

function renderComparisonMonthOptions() {
  const now = new Date();
  const validDates = expenses.map((entry) => new Date(`${entry.date}T12:00:00`)).filter((date) => !Number.isNaN(date.getTime()));
  const firstDate = validDates.length ? new Date(Math.min(...validDates)) : now;
  const firstMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const options = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor >= firstMonth) {
    const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    options.push(`<option value="${value}">${MONTHS_LONG[cursor.getMonth()]} ${cursor.getFullYear()}</option>`);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  }
  $("#comparisonMonthSelect").innerHTML = options.join("");
  if (![...$("#comparisonMonthSelect").options].some((option) => option.value === comparisonMonth)) comparisonMonth = options.length ? $("#comparisonMonthSelect").options[0].value : comparisonMonth;
  $("#comparisonMonthSelect").value = comparisonMonth;
}

function expenseCategoriesForRange(startDate, endDate) {
  const start = toDateString(startDate);
  const end = toDateString(endDate);
  const totals = {};
  expandEntriesThrough(endDate)
    .filter((entry) => entry.type === "Ausgabe" && entry.date >= start && entry.date <= end)
    .forEach((entry) => { totals[entry.category] = (totals[entry.category] || 0) + Number(entry.amount); });
  return totals;
}

function renderCategoryComparison() {
  renderComparisonMonthOptions();
  $("#comparisonMonthSelect").hidden = comparisonMode !== "month";
  const now = new Date();
  let currentStart;
  let currentEnd;
  let previousStart;
  let previousEnd;
  let currentLabel;
  let previousLabel;

  if (comparisonMode === "month") {
    const [year, monthNumber] = comparisonMonth.split("-").map(Number);
    const month = monthNumber - 1;
    currentStart = new Date(year, month, 1, 12);
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    currentEnd = isCurrentMonth ? now : new Date(year, month + 1, 0, 12);
    previousStart = new Date(year, month - 1, 1, 12);
    previousEnd = isCurrentMonth
      ? dateAtNoon(previousStart.getFullYear(), previousStart.getMonth(), now.getDate())
      : new Date(year, month, 0, 12);
    currentLabel = `${MONTHS_SHORT[month]} ${year}`;
    previousLabel = `${MONTHS_SHORT[previousStart.getMonth()]} ${previousStart.getFullYear()}`;
    $("#comparisonSubtitle").textContent = `${MONTHS_LONG[month]} ${year} gegenüber ${MONTHS_LONG[previousStart.getMonth()]} ${previousStart.getFullYear()}${isCurrentMonth ? ", jeweils bis heute" : ""}`;
  } else {
    currentStart = new Date(reportYear, 0, 1, 12);
    currentEnd = reportYear === now.getFullYear() ? now : new Date(reportYear, 11, 31, 12);
    previousStart = new Date(reportYear - 1, 0, 1, 12);
    previousEnd = reportYear === now.getFullYear()
      ? dateAtNoon(reportYear - 1, now.getMonth(), now.getDate())
      : new Date(reportYear - 1, 11, 31, 12);
    currentLabel = String(reportYear);
    previousLabel = String(reportYear - 1);
    $("#comparisonSubtitle").textContent = reportYear === now.getFullYear() ? `${reportYear} gegenüber ${reportYear - 1}, jeweils bis heute` : `${reportYear} gegenüber ${reportYear - 1}`;
  }

  const currentTotals = expenseCategoriesForRange(currentStart, currentEnd);
  const previousTotals = expenseCategoriesForRange(previousStart, previousEnd);
  const categories = [...new Set([...Object.keys(currentTotals), ...Object.keys(previousTotals)])]
    .sort((a, b) => Math.abs((currentTotals[b] || 0) - (previousTotals[b] || 0)) - Math.abs((currentTotals[a] || 0) - (previousTotals[a] || 0)));
  const largestCategoryAmount = Math.max(1, ...categories.flatMap((category) => [currentTotals[category] || 0, previousTotals[category] || 0]));
  $("#categoryComparisonBody").innerHTML = categories.length ? categories.map((category) => {
    const current = currentTotals[category] || 0;
    const previous = previousTotals[category] || 0;
    const difference = current - previous;
    const percentage = previous > 0 ? difference / previous * 100 : null;
    const meta = CATEGORY_META[category] || CATEGORY_META.Sonstiges;
    return `<article class="comparison-category-row">
      <div class="comparison-category-name"><span class="legend-dot" style="background:${meta.color}"></span><strong>${escapeHtml(category)}</strong></div>
      <div class="comparison-bars">
        <div class="comparison-bar-row current"><span>${currentLabel}</span><div class="comparison-bar-track"><i style="width:${current / largestCategoryAmount * 100}%"></i></div><b>${formatCurrency(current)}</b></div>
        <div class="comparison-bar-row"><span>${previousLabel}</span><div class="comparison-bar-track"><i style="width:${previous / largestCategoryAmount * 100}%"></i></div><b>${formatCurrency(previous)}</b></div>
      </div>
      <div class="comparison-difference ${difference > 0 ? "up" : difference < 0 ? "down" : ""}"><b>${difference > 0 ? "+" : difference < 0 ? "−" : ""}${formatCurrency(Math.abs(difference))}</b><small>${percentage === null ? "neue Ausgabe" : `${percentage >= 0 ? "+" : ""}${percentage.toFixed(1)}%`}</small></div>
    </article>`;
  }).join("") : `<p class="no-report-data">Keine Ausgaben in diesen Zeiträumen.</p>`;
}

function renderYearGoals(totalExpenses, balance) {
  const goals = yearlyGoals[reportYear] || {};
  const hasExplicitAnnualBudget = Number(goals.annualBudget) > 0;
  const annualBudget = hasExplicitAnnualBudget ? Number(goals.annualBudget) : budget * 12;
  const savingsBudget = Number(goals.savingsBudget) || 0;
  const savedAmount = Math.max(balance, 0);

  $("#annualBudgetGoal").textContent = `${formatCurrency(annualBudget)}${hasExplicitAnnualBudget ? "" : " · automatisch"}`;
  const annualPercent = annualBudget ? totalExpenses / annualBudget * 100 : 0;
  $("#annualBudgetProgress").style.width = `${Math.min(annualPercent, 100)}%`;
  $("#annualBudgetProgress").classList.toggle("over", annualBudget > 0 && totalExpenses > annualBudget);
  $("#annualBudgetPercent").textContent = `${annualPercent.toFixed(1)}%`;
  $("#annualBudgetStatus").textContent = totalExpenses <= annualBudget
    ? `${formatCurrency(annualBudget - totalExpenses)} verfügbar`
    : `${formatCurrency(totalExpenses - annualBudget)} über Budget`;

  $("#savingsBudgetGoal").textContent = savingsBudget ? formatCurrency(savingsBudget) : "Nicht festgelegt";
  const savingsPercent = savingsBudget ? savedAmount / savingsBudget * 100 : 0;
  $("#savingsBudgetProgress").style.width = `${Math.min(savingsPercent, 100)}%`;
  $("#savingsBudgetPercent").textContent = savingsBudget ? `${savingsPercent.toFixed(1)}%` : "–";
  $("#savingsBudgetStatus").textContent = savingsBudget
    ? savedAmount >= savingsBudget
      ? `Ziel um ${formatCurrency(savedAmount - savingsBudget)} übertroffen`
      : `${formatCurrency(savingsBudget - savedAmount)} bis zum Ziel`
    : "Noch kein Sparziel vorhanden";
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
    `<div class="legend-row">
      <span class="legend-dot" style="background:${CATEGORY_META[category].color}"></span>
      <span>${escapeHtml(category)}</span>
      <span class="legend-value"><b>${total ? Math.round(amount / total * 100) : 0}%</b><small>${formatCurrency(amount)}</small></span>
    </div>`
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
  renderSeriesList();
}

function openModal(selector) {
  const modal = $(selector);
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => modal.querySelector("input")?.focus(), 50);
}

function closeModals() {
  $$(".modal-backdrop").forEach((modal) => { if (modal.id !== "securityModal") modal.hidden = true; });
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

function showSecurityGate(mode) {
  $("#setupSecurityPanel").hidden = mode !== "setup";
  $("#unlockSecurityPanel").hidden = mode !== "unlock";
  $("#resetSecurityPanel").hidden = true;
  $("#unlockError").hidden = true;
  $("#securityModal .security-modal").setAttribute("aria-labelledby", mode === "setup" ? "securityModalTitle" : "unlockSecurityTitle");
  $("#securityModal").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $(mode === "setup" ? '#setupSecurityForm [name="password"]' : '#unlockSecurityForm [name="password"]')?.focus(), 50);
}

function showSecurityReset() {
  $("#setupSecurityPanel").hidden = true;
  $("#unlockSecurityPanel").hidden = true;
  $("#resetSecurityPanel").hidden = false;
  $("#securityModal .security-modal").setAttribute("aria-labelledby", "resetSecurityTitle");
  $("#resetSecurityForm").reset();
  $("#resetSecurityConfirmButton").disabled = true;
  setTimeout(() => $('#resetSecurityForm [name="confirmation"]')?.focus(), 50);
}

$("#setupSecurityForm").addEventListener("submit", async (event) => {
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
  button.textContent = "Daten werden verschlüsselt …";
  try {
    vaultPassword = password;
    isVaultUnlocked = true;
    await persistEncryptedVault();
    form.reset();
    closeModal($("#securityModal"));
    showToast("Die lokalen Daten sind jetzt verschlüsselt.");
  } catch {
    isVaultUnlocked = false;
    vaultPassword = null;
    showToast("Die Verschlüsselung konnte nicht eingerichtet werden.");
  } finally {
    button.disabled = false;
    button.textContent = "Daten verschlüsseln";
  }
});

$("#unlockSecurityForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureWebCrypto()) return;
  const form = event.currentTarget;
  const password = new FormData(form).get("password");
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Wird entsperrt …";
  $("#unlockError").hidden = true;
  try {
    const envelope = JSON.parse(localStorage.getItem(VAULT_KEY));
    const imported = await decryptEnvelope(envelope, password);
    applyImportedState(imported);
    vaultPassword = password;
    isVaultUnlocked = true;
    removeLegacyPlaintextStorage();
    form.reset();
    setGreeting();
    updateEntryForm();
    render();
    showView(window.location.hash.slice(1) || "overview", false);
    closeModal($("#securityModal"));
  } catch {
    $("#unlockError").hidden = false;
    form.elements.password.select();
  } finally {
    button.disabled = false;
    button.textContent = "App entsperren";
  }
});

$("#showSecurityResetButton").addEventListener("click", showSecurityReset);
$("#cancelSecurityResetButton").addEventListener("click", () => showSecurityGate("unlock"));
$("#resetSecurityForm [name=confirmation]").addEventListener("input", (event) => {
  $("#resetSecurityConfirmButton").disabled = event.target.value.trim().toLocaleUpperCase("de-CH") !== "LÖSCHEN";
});
$("#resetSecurityForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const confirmation = new FormData(event.currentTarget).get("confirmation").trim().toLocaleUpperCase("de-CH");
  if (confirmation !== "LÖSCHEN") return;
  Object.keys(localStorage).filter((key) => key.startsWith("klar-")).forEach((key) => localStorage.removeItem(key));
  expenses = [];
  budget = 3000;
  yearlyGoals = {};
  profile = { name: "Benutzer", initials: "B" };
  replaceCustomCategories([]);
  vaultPassword = null;
  isVaultUnlocked = false;
  setGreeting();
  render();
  showSecurityGate("setup");
  showToast("Der alte Datenspeicher wurde gelöscht. Lege jetzt ein neues Passwort fest.");
});

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
  editingOccurrenceDate = null;
  $("#expenseForm").reset();
  $("#expenseForm [name=date]").value = new Date().toISOString().slice(0, 10);
  $("#expenseForm [name=date]").readOnly = false;
  $$('#expenseForm [name="period"]').forEach((input) => { input.disabled = false; });
  $("#expenseForm .cycle-fieldset").classList.remove("locked");
  $("#entryDateLabel").textContent = "Datum";
  $("#expenseModalEyebrow").textContent = "NEUER EINTRAG";
  $("#expenseModalTitle").textContent = "Eintrag hinzufügen";
  updateEntryForm();
  openModal("#expenseModal");
}

function prepareEditEntry(entry, occurrenceDate = entry.date) {
  editingEntryId = entry.id;
  editingOccurrenceDate = occurrenceDate;
  const isSeries = entry.period !== "Einmalig";
  const displayedEntry = entry.period === "Einmalig" ? entry : resolveEntryAtDate(entry, occurrenceDate);
  const form = $("#expenseForm");
  form.reset();
  form.querySelector(`[name="type"][value="${displayedEntry.type}"]`).checked = true;
  updateEntryForm();
  form.elements.description.value = displayedEntry.description;
  form.elements.amount.value = displayedEntry.amount;
  form.elements.date.value = isSeries ? entry.date : occurrenceDate;
  form.elements.endDate.value = entry.endDate || "";
  form.elements.category.value = displayedEntry.category;
  form.querySelector(`[name="period"][value="${entry.period}"]`).checked = true;
  updatePeriodFields();
  form.elements.date.readOnly = false;
  $$('#expenseForm [name="period"]').forEach((input) => { input.disabled = isSeries; });
  $("#expenseForm .cycle-fieldset").classList.toggle("locked", isSeries);
  $("#entryDateLabel").textContent = isSeries ? "Serienbeginn" : "Datum";
  $("#expenseModalEyebrow").textContent = isSeries ? "WIEDERKEHRENDER EINTRAG" : "BUCHUNG";
  $("#expenseModalTitle").textContent = isSeries ? "Serie bearbeiten" : "Eintrag bearbeiten";
  $("#entrySubmitButton").textContent = "Änderungen speichern";
  openModal("#expenseModal");
}

function renderSeriesList() {
  const series = expenses.filter((entry) => entry.period !== "Einmalig").sort((a, b) => a.description.localeCompare(b.description, "de"));
  $("#seriesList").innerHTML = series.length ? series.map((entry) => {
    const nextDate = getNextOccurrenceDate(entry);
    const referenceDate = nextDate || entry.endDate || entry.date;
    const current = resolveEntryAtDate(entry, referenceDate);
    const meta = CATEGORY_META[current.category] || CATEGORY_META.Sonstiges;
    return `<article class="series-item">
      <span class="series-item-icon" style="color:${meta.color};background:${meta.color}18">${escapeHtml(meta.icon)}</span>
      <div class="series-item-info">
        <strong class="${current.type === "Einnahme" ? "income-text" : "expense-text"}">${escapeHtml(current.description)} · ${current.type === "Einnahme" ? "+" : "−"} ${formatCurrency(current.amount)}</strong>
        <span>${entry.period} · Laufzeit ${new Intl.DateTimeFormat("de-CH").format(new Date(`${entry.date}T12:00:00`))} – ${entry.endDate ? new Intl.DateTimeFormat("de-CH").format(new Date(`${entry.endDate}T12:00:00`)) : "unbegrenzt"}</span>
        <span>${nextDate ? `Nächste Fälligkeit ${new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${nextDate}T12:00:00`))}` : `Beendet am ${new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${entry.endDate}T12:00:00`))}`}</span>
      </div>
      <div class="series-item-actions">
        <button type="button" data-edit-series="${entry.id}" data-occurrence-date="${referenceDate}">Bearbeiten</button>
        <button class="series-delete-button" type="button" data-delete-series="${entry.id}">Löschen</button>
      </div>
    </article>`;
  }).join("") : `<div class="empty-state"><span class="empty-icon">↻</span><h3>Noch keine Serien.</h3><p>Monatliche und jährliche Buchungen erscheinen hier.</p></div>`;
}

function prepareSeriesEditWizard(entry, occurrenceDate) {
  const effectiveDate = new Date(`${occurrenceDate}T12:00:00`);
  const dayBefore = new Date(effectiveDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const pastOccurrences = expandEntriesThrough(dayBefore)
    .filter((occurrence) => occurrence.sourceId === entry.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  $("#seriesFutureHint").textContent = `Ab ${new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "long", year: "numeric" }).format(effectiveDate)} und zukünftig`;
  $("#pastOccurrenceList").innerHTML = pastOccurrences.length ? pastOccurrences.map((occurrence) => `
    <label>
      <input type="checkbox" name="pastOccurrence" value="${occurrence.date}" />
      <span>${new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${occurrence.date}T12:00:00`))} · ${formatCurrency(occurrence.amount)}</span>
    </label>`).join("") : `<p class="past-occurrence-empty">Es gibt noch keine früheren Buchungen dieser Serie.</p>`;
  const startDateChanged = pendingSeriesEdit?.seriesStartDate !== entry.date;
  $("#seriesAllHint").textContent = startDateChanged ? "Ein geänderter Serienbeginn gilt immer für die gesamte Serie" : "Auch alle vergangenen Buchungen ändern";
  $("#futureScopeOption").hidden = startDateChanged;
  $('#seriesEditForm [name="scope"][value="future"]').checked = !startDateChanged;
  $('#seriesEditForm [name="scope"][value="all"]').checked = startDateChanged;
  $("#pastSelection").hidden = startDateChanged;
  $("#togglePastEntries").textContent = "Alle auswählen";
  openModal("#seriesEditModal");
}

function saveSeriesChanges(scope, selectedPastDates) {
  if (!pendingSeriesEdit) return;
  expenses = expenses.map((entry) => {
    if (entry.id !== pendingSeriesEdit.sourceId) return entry;
    const { changes, occurrenceDate, seriesStartDate, seriesEndDate } = pendingSeriesEdit;
    if (scope === "all") {
      return { ...entry, ...changes, date: seriesStartDate, endDate: seriesEndDate, revisions: [], overrides: {}, excludedDates: seriesStartDate !== entry.date ? [] : entry.excludedDates };
    }
    const revisions = [...(entry.revisions || []).filter((revision) => revision.effectiveDate !== occurrenceDate), { effectiveDate: occurrenceDate, ...changes }]
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    const overrides = { ...(entry.overrides || {}) };
    selectedPastDates.forEach((date) => { overrides[date] = { ...changes }; });
    return { ...entry, endDate: seriesEndDate, revisions, overrides };
  });
  storage.set("klar-expenses", expenses);
  pendingSeriesEdit = null;
  editingEntryId = null;
  editingOccurrenceDate = null;
  closeModal($("#seriesEditModal"));
  render();
  showToast(scope === "all" ? "Die gesamte Serie wurde geändert." : "Die Serienänderung wurde gespeichert.");
}

function renderDeletePeriodOptions() {
  const now = new Date();
  const validDates = expenses.map((entry) => new Date(`${entry.date}T12:00:00`)).filter((date) => !Number.isNaN(date.getTime()));
  const firstDate = validDates.length ? new Date(Math.min(...validDates)) : now;
  const firstYear = Math.min(firstDate.getFullYear(), now.getFullYear());
  $("#deleteYearSelect").innerHTML = Array.from({ length: now.getFullYear() - firstYear + 1 }, (_, index) => now.getFullYear() - index)
    .map((year) => `<option value="${year}">${year}</option>`).join("");
  const months = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  while (cursor >= firstMonth) {
    const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    months.push(`<option value="${value}">${MONTHS_LONG[cursor.getMonth()]} ${cursor.getFullYear()}</option>`);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  }
  $("#deleteMonthSelect").innerHTML = months.join("");
}

function updateDeleteScopeUI() {
  const scope = $('#deleteAllForm [name="deleteScope"]:checked').value;
  $("#deleteMonthField").hidden = scope !== "month";
  $("#deleteYearField").hidden = scope !== "year";
  const content = {
    all: {
      title: "Wirklich alles löschen?",
      description: "Alle Buchungen, wiederkehrenden Serien, Kategorien, Budgeteinstellungen und Profildaten werden dauerhaft von diesem Gerät entfernt. Ein vorhandenes verschlüsseltes Backup bleibt davon unberührt.",
      button: "Alle Daten endgültig löschen",
    },
    month: {
      title: "Monat dauerhaft löschen?",
      description: "Alle Buchungen des ausgewählten Monats werden entfernt. Wiederkehrende Serien, Profil, Budgets, Sparziele und Kategorien bleiben bestehen.",
      button: "Ausgewählten Monat löschen",
    },
    year: {
      title: "Jahr dauerhaft löschen?",
      description: "Alle Buchungen des ausgewählten Jahres werden entfernt. Wiederkehrende Serien, Profil, Budgets, Sparziele und Kategorien bleiben bestehen.",
      button: "Ausgewähltes Jahr löschen",
    },
  }[scope];
  $("#deleteAllModalTitle").textContent = content.title;
  $("#deleteAllDescription").textContent = content.description;
  $("#deleteAllConfirmButton").textContent = content.button;
}

function deleteEntriesInRange(startDate, endDate) {
  const startString = toDateString(startDate);
  const endString = toDateString(endDate);
  const occurrences = expandEntriesThrough(endDate).filter((occurrence) => occurrence.date >= startString && occurrence.date <= endString);
  const datesBySource = new Map();
  occurrences.forEach((occurrence) => {
    if (!datesBySource.has(occurrence.sourceId)) datesBySource.set(occurrence.sourceId, []);
    datesBySource.get(occurrence.sourceId).push(occurrence.date);
  });
  expenses = expenses.flatMap((entry) => {
    const dates = datesBySource.get(entry.id) || [];
    if (entry.period === "Einmalig") return dates.length ? [] : [entry];
    if (!dates.length) return [entry];
    const excludedDates = [...new Set([...(entry.excludedDates || []), ...dates])].sort();
    const overrides = { ...(entry.overrides || {}) };
    dates.forEach((date) => { delete overrides[date]; });
    return [{ ...entry, excludedDates, overrides }];
  });
  storage.set("klar-expenses", expenses);
  return occurrences.length;
}

[$("#desktopAddButton"), $("#mobileAddButton")].forEach((button) => button.addEventListener("click", prepareNewEntry));
$("#seriesManagerButton").addEventListener("click", () => {
  renderSeriesList();
  openModal("#seriesModal");
});
$("#seriesList").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-series]");
  if (editButton) {
    const entry = expenses.find((item) => item.id === Number(editButton.dataset.editSeries));
    if (!entry) return;
    closeModal($("#seriesModal"));
    prepareEditEntry(entry, editButton.dataset.occurrenceDate);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-series]");
  if (!deleteButton) return;
  const entry = expenses.find((item) => item.id === Number(deleteButton.dataset.deleteSeries));
  if (!entry || !window.confirm(`Serie „${entry.description}“ vollständig löschen? Alle zugehörigen Buchungen werden entfernt.`)) return;
  expenses = expenses.filter((item) => item.id !== entry.id);
  storage.set("klar-expenses", expenses);
  render();
  showToast(`Serie „${entry.description}“ wurde vollständig gelöscht.`);
});
$("#profileButton").addEventListener("click", () => {
  $("#profileForm [name=name]").value = profile.name;
  $("#profileForm [name=initials]").value = profile.initials;
  openModal("#profileModal");
});
$("#openDeleteAllButton").addEventListener("click", () => {
  $("#deleteAllForm").reset();
  $("#deleteAllConfirmButton").disabled = true;
  renderDeletePeriodOptions();
  updateDeleteScopeUI();
  openModal("#deleteAllModal");
});
[$("#manageCategoriesButton"), $("#formManageCategoriesButton")].forEach((button) => button.addEventListener("click", () => {
  const selectedType = $('#expenseForm input[name="type"]:checked')?.value || "Ausgabe";
  $("#categoryForm [name=type]").value = selectedType;
  openModal("#categoryModal");
}));
function renderBudgetYearOptions(selectedYear = new Date().getFullYear()) {
  const currentYear = new Date().getFullYear();
  const years = [...new Set([
    currentYear + 1,
    currentYear,
    selectedYear,
    ...Object.keys(yearlyGoals).map(Number),
    ...expenses.map((entry) => new Date(`${entry.date}T12:00:00`).getFullYear()),
  ])].filter(Number.isFinite).sort((a, b) => b - a);
  $("#budgetYearSelect").innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");
  $("#budgetYearSelect").value = String(selectedYear);
  loadBudgetYearValues(selectedYear);
}

function loadBudgetYearValues(year) {
  const goals = yearlyGoals[year] || {};
  $("#budgetForm [name=annualBudget]").value = goals.annualBudget || "";
  $("#budgetForm [name=savingsBudget]").value = goals.savingsBudget || "";
}

function openBudgetModal(year = new Date().getFullYear()) {
  $("#budgetForm [name=budget]").value = budget;
  renderBudgetYearOptions(year);
  openModal("#budgetModal");
}

[$("#desktopBudgetButton"), $("#mobileBudgetButton"), $("#budgetAmountButton")].forEach((button) => button.addEventListener("click", () => openBudgetModal()));
$$('[data-open-budget]').forEach((button) => button.addEventListener("click", () => openBudgetModal(reportYear)));
$("#budgetYearSelect").addEventListener("change", (event) => loadBudgetYearValues(Number(event.target.value)));

$("#expenseForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const sourceEntry = editingEntryId === null ? null : expenses.find((entry) => entry.id === editingEntryId);
  const period = data.get("period") || sourceEntry?.period;
  const endDate = period !== "Einmalig" && data.get("endDate") ? data.get("endDate") : null;
  if (endDate && endDate < data.get("date")) {
    showToast("Das Serienende darf nicht vor dem Startdatum liegen.");
    return;
  }
  const updatedEntry = {
    id: editingEntryId || Date.now(),
    description: data.get("description").trim(),
    amount: Number(data.get("amount")),
    date: data.get("date"),
    category: data.get("category"),
    type: data.get("type"),
    period,
    endDate,
    revisions: sourceEntry?.revisions || [],
    overrides: sourceEntry?.overrides || {},
    excludedDates: sourceEntry?.excludedDates || [],
  };
  const wasEditing = editingEntryId !== null;
  if (wasEditing && sourceEntry?.period !== "Einmalig") {
    pendingSeriesEdit = {
      sourceId: sourceEntry.id,
      occurrenceDate: editingOccurrenceDate,
      seriesStartDate: updatedEntry.date,
      seriesEndDate: endDate,
      changes: {
        description: updatedEntry.description,
        amount: updatedEntry.amount,
        category: updatedEntry.category,
        type: updatedEntry.type,
      },
    };
    closeModal($("#expenseModal"));
    prepareSeriesEditWizard(sourceEntry, editingOccurrenceDate);
    return;
  }
  if (wasEditing) {
    expenses = expenses.map((entry) => entry.id === editingEntryId ? updatedEntry : entry);
  } else {
    expenses.push(updatedEntry);
  }
  storage.set("klar-expenses", expenses);
  editingEntryId = null;
  editingOccurrenceDate = null;
  event.currentTarget.reset();
  updateEntryForm();
  $("#expenseForm [name=date]").value = new Date().toISOString().slice(0, 10);
  closeModals();
  render();
  showToast(wasEditing ? "Änderungen wurden gespeichert." : `${data.get("type")} wurde hinzugefügt.`);
});

$("#budgetForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  budget = Number(data.get("budget"));
  const year = Number(data.get("year"));
  const annualBudget = Number(data.get("annualBudget")) || 0;
  const savingsBudget = Number(data.get("savingsBudget")) || 0;
  if (annualBudget || savingsBudget) yearlyGoals[year] = { annualBudget, savingsBudget };
  else delete yearlyGoals[year];
  storage.set("klar-budget", budget);
  storage.set("klar-yearly-goals", yearlyGoals);
  closeModals();
  render();
  showToast("Ausgabenbudgets und Sparziel wurden aktualisiert.");
});

$$('#seriesEditForm [name="scope"]').forEach((input) => input.addEventListener("change", () => {
  $("#pastSelection").hidden = $('#seriesEditForm [name="scope"]:checked').value === "all";
}));

$("#togglePastEntries").addEventListener("click", () => {
  const checkboxes = $$('#pastOccurrenceList input[type="checkbox"]');
  const shouldCheck = checkboxes.some((checkbox) => !checkbox.checked);
  checkboxes.forEach((checkbox) => { checkbox.checked = shouldCheck; });
  $("#togglePastEntries").textContent = shouldCheck ? "Auswahl aufheben" : "Alle auswählen";
});

$("#seriesEditForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const scope = $('#seriesEditForm [name="scope"]:checked').value;
  const selectedPastDates = scope === "future"
    ? $$('#pastOccurrenceList input[type="checkbox"]:checked').map((input) => input.value)
    : [];
  saveSeriesChanges(scope, selectedPastDates);
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

$("#deleteAllForm [name=confirmation]").addEventListener("input", (event) => {
  $("#deleteAllConfirmButton").disabled = event.target.value.trim().toLocaleUpperCase("de-CH") !== "LÖSCHEN";
});

$$('#deleteAllForm [name="deleteScope"]').forEach((input) => input.addEventListener("change", updateDeleteScopeUI));

$("#deleteAllForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const confirmation = formData.get("confirmation").trim().toLocaleUpperCase("de-CH");
  if (confirmation !== "LÖSCHEN") return;
  const deleteScope = formData.get("deleteScope");

  if (deleteScope === "month" || deleteScope === "year") {
    let startDate;
    let endDate;
    let label;
    if (deleteScope === "month") {
      const [year, month] = formData.get("month").split("-").map(Number);
      startDate = new Date(year, month - 1, 1, 12);
      endDate = new Date(year, month, 0, 12);
      label = `${MONTHS_LONG[month - 1]} ${year}`;
    } else {
      const year = Number(formData.get("year"));
      startDate = new Date(year, 0, 1, 12);
      endDate = new Date(year, 11, 31, 12);
      label = String(year);
    }
    const deletedCount = deleteEntriesInRange(startDate, endDate);
    render();
    closeModals();
    showToast(deletedCount ? `${deletedCount} Buchungen aus ${label} wurden gelöscht.` : `Für ${label} wurden keine Buchungen gefunden.`);
    return;
  }

  await vaultWriteChain;
  expenses = [];
  budget = 3000;
  yearlyGoals = {};
  profile = { name: "Benutzer", initials: "B" };
  replaceCustomCategories([]);
  activeCategory = "Alle";
  activePeriod = "Alle";
  activeEntryType = "Alle";
  editingEntryId = null;
  editingOccurrenceDate = null;
  pendingSeriesEdit = null;
  reportYear = new Date().getFullYear();
  transactionPeriod = `month-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  Object.keys(localStorage).filter((key) => key.startsWith("klar-")).forEach((key) => localStorage.removeItem(key));
  await persistEncryptedVault();

  $("#searchInput").value = "";
  $("#expenseForm").reset();
  updateEntryForm();
  setGreeting();
  render();
  closeModals();
  showView("overview");
  showToast("Alle persönlichen Daten wurden gelöscht.");
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
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Backup wird verschlüsselt …";
  try {
    await persistEncryptedVault();
    const envelope = JSON.parse(localStorage.getItem(VAULT_KEY));
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `klar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    const sanitizeChange = (change) => {
      const changeAmount = Number(change?.amount);
      if (!change || typeof change.description !== "string" || !Number.isFinite(changeAmount) || changeAmount <= 0 || typeof change.category !== "string" || !validTypes.includes(change.type)) throw new Error("invalid-series-change");
      return { description: change.description.slice(0, 40), amount: changeAmount, category: change.category.slice(0, 24), type: change.type };
    };
    const revisions = Array.isArray(entry.revisions) ? entry.revisions.map((revision) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(revision?.effectiveDate)) throw new Error("invalid-revision-date");
      return { effectiveDate: revision.effectiveDate, ...sanitizeChange(revision) };
    }) : [];
    const overrides = {};
    if (entry.overrides && typeof entry.overrides === "object" && !Array.isArray(entry.overrides)) {
      Object.entries(entry.overrides).forEach(([date, change]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid-override-date");
        overrides[date] = sanitizeChange(change);
      });
    }
    const excludedDates = Array.isArray(entry.excludedDates)
      ? [...new Set(entry.excludedDates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))]
      : [];
    const endDate = typeof entry.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.endDate) ? entry.endDate : null;
    if (endDate && endDate < entry.date) throw new Error("invalid-series-end");
    return { id: Number(entry.id) || Date.now() + Math.random(), description: entry.description.slice(0, 40), amount, category: entry.category.slice(0, 24), type: entry.type, period: entry.period, date: entry.date, endDate, revisions, overrides, excludedDates };
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
  const importedYearlyGoals = {};
  if (payload.yearlyGoals && typeof payload.yearlyGoals === "object" && !Array.isArray(payload.yearlyGoals)) {
    Object.entries(payload.yearlyGoals).forEach(([year, goals]) => {
      const annualBudget = Number(goals?.annualBudget) || 0;
      const savingsBudget = Number(goals?.savingsBudget) || 0;
      if (!/^\d{4}$/.test(year) || annualBudget < 0 || savingsBudget < 0 || !Number.isFinite(annualBudget) || !Number.isFinite(savingsBudget)) throw new Error("invalid-yearly-goals");
      if (annualBudget || savingsBudget) importedYearlyGoals[year] = { annualBudget, savingsBudget };
    });
  }
  const importedProfile = payload.profile && typeof payload.profile.name === "string" && typeof payload.profile.initials === "string"
    ? { name: payload.profile.name.trim().slice(0, 40) || "Benutzer", initials: payload.profile.initials.trim().slice(0, 3).toUpperCase() || "B" }
    : { name: "Benutzer", initials: "B" };
  return { entries, categories, budget: importedBudget, yearlyGoals: importedYearlyGoals, profile: importedProfile };
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
    const importPassword = data.get("password");
    const imported = await decryptEnvelope(envelope, importPassword);
    if (!window.confirm("Beim Import werden alle aktuellen Daten ersetzt. Möchtest du fortfahren?")) return;

    await vaultWriteChain;
    applyImportedState(imported);
    vaultPassword = importPassword;
    isVaultUnlocked = true;
    await persistEncryptedVault();
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
$$('#expenseForm input[name="period"]').forEach((input) => input.addEventListener("change", updatePeriodFields));
$("#expenseForm [name=date]").addEventListener("change", updatePeriodFields);

function updateEntryForm() {
  const type = $('#expenseForm input[name="type"]:checked').value;
  const categories = getCategories(type);
  $("#categorySelect").innerHTML = categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  $("#entrySubmitButton").textContent = editingEntryId !== null ? "Änderungen speichern" : type === "Einnahme" ? "Einnahme speichern" : "Ausgabe speichern";
  updatePeriodFields();
}

function updatePeriodFields() {
  const period = $('#expenseForm input[name="period"]:checked')?.value || "Einmalig";
  const isSeries = period !== "Einmalig";
  $("#seriesEndDateField").hidden = !isSeries;
  $("#entryDateLabel").textContent = isSeries ? (editingEntryId !== null ? "Serienbeginn" : "Startdatum") : "Datum";
  $("#expenseForm [name=endDate]").min = $("#expenseForm [name=date]").value || "";
  if (!isSeries) $("#expenseForm [name=endDate]").value = "";
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
    if (entry) prepareEditEntry(entry, editButton.dataset.occurrenceDate);
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
$("#comparisonModeToggle").addEventListener("click", (event) => {
  const button = event.target.closest("[data-comparison-mode]");
  if (!button) return;
  comparisonMode = button.dataset.comparisonMode;
  $$("#comparisonModeToggle button").forEach((item) => item.classList.toggle("active", item === button));
  renderCategoryComparison();
});
$("#comparisonMonthSelect").addEventListener("change", (event) => {
  comparisonMonth = event.target.value;
  renderCategoryComparison();
});
$("#printAnalyticsButton").addEventListener("click", () => window.print());
$$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop"))));
$$('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener("click", (event) => {
  if (event.target === backdrop && backdrop.id !== "securityModal") closeModal(backdrop);
}));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#securityModal").hidden) closeModals();
});

setGreeting();
render();
showView(window.location.hash.slice(1) || "overview", false);
showSecurityGate(existingVault ? "unlock" : "setup");
