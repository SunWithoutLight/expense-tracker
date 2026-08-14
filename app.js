const STORAGE_KEY = "expenseTrackerData";
const BUDGET_KEY = "expenseTrackerBudgets";
const CATEGORIES = [
  "Food", "Transport", "Housing", "Utilities",
  "Entertainment", "Health", "Shopping", "Other"
];

const state = {
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(), // 0-indexed
  selectedDate: null, // "YYYY-MM-DD"
  data: loadData(),
  budgets: loadBudgets()
};

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function loadBudgets() {
  try {
    return JSON.parse(localStorage.getItem(BUDGET_KEY)) || {};
  } catch {
    return {};
  }
}

function saveBudgets() {
  localStorage.setItem(BUDGET_KEY, JSON.stringify(state.budgets));
}

function pad(n) { return String(n).padStart(2, "0"); }

function dateKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function formatMoney(n) {
  return "$" + n.toFixed(2);
}

function dayTotal(key) {
  const entries = state.data[key] || [];
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

// ---------- Calendar rendering ----------

const monthLabel = document.getElementById("monthLabel");
const calendarGrid = document.getElementById("calendarGrid");
const weekdayRow = document.getElementById("weekdayRow");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
WEEKDAYS.forEach(d => {
  const el = document.createElement("div");
  el.textContent = d;
  weekdayRow.appendChild(el);
});

function renderCalendar() {
  const { viewYear, viewMonth } = state;
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  monthLabel.textContent = `${monthNames[viewMonth]} ${viewYear}`;

  calendarGrid.innerHTML = "";

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth;

  for (let i = 0; i < firstDayOfWeek; i++) {
    const empty = document.createElement("div");
    empty.className = "day-cell empty";
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(viewYear, viewMonth, day);
    const total = dayTotal(key);

    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (total > 0) cell.classList.add("has-expenses");
    if (isCurrentMonth && today.getDate() === day) cell.classList.add("today");

    const num = document.createElement("div");
    num.className = "day-number";
    num.textContent = day;
    cell.appendChild(num);

    if (total > 0) {
      const amt = document.createElement("div");
      amt.className = "day-amount";
      amt.textContent = formatMoney(total);
      cell.appendChild(amt);
    }

    cell.addEventListener("click", () => openModal(key));
    calendarGrid.appendChild(cell);
  }

  renderSummary();
}

// ---------- Summary ----------

const summaryTotal = document.getElementById("summaryTotal");
const summaryBreakdown = document.getElementById("summaryBreakdown");

function renderSummary() {
  const { viewYear, viewMonth } = state;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const totals = {};
  let monthTotal = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(viewYear, viewMonth, day);
    const entries = state.data[key] || [];
    entries.forEach(e => {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
      monthTotal += e.amount;
    });
  }

  summaryTotal.textContent = formatMoney(monthTotal);
  summaryBreakdown.innerHTML = "";

  const allCategories = new Set([
    ...CATEGORIES,
    ...Object.keys(state.budgets),
    ...Object.keys(totals)
  ]);

  const orderedCategories = [
    ...CATEGORIES.filter(c => allCategories.has(c)),
    ...[...allCategories].filter(c => !CATEGORIES.includes(c)).sort()
  ];

  const today = new Date();
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const daysElapsed = isCurrentMonth ? today.getDate() : 0;

  orderedCategories.forEach(cat => {
    const spent = totals[cat] || 0;
    const budget = state.budgets[cat];
    const hasBudget = typeof budget === "number" && budget > 0;

    let statusClass = "";
    let remainingText = "No budget set";
    let pct = 0;
    let trendHtml = "";

    if (hasBudget) {
      const remaining = budget - spent;
      pct = Math.min((spent / budget) * 100, 100);
      if (remaining < 0) {
        statusClass = "status-over";
        remainingText = `Over by ${formatMoney(-remaining)}`;
      } else {
        statusClass = "status-under";
        remainingText = `Left: ${formatMoney(remaining)}`;
      }

      if (isCurrentMonth && daysElapsed > 0) {
        const dailyAvg = spent / daysElapsed;
        const projected = dailyAvg * daysInMonth;
        const diff = projected - budget;
        const trendClass = diff > 0 ? "trend-over" : "trend-under";
        const trendText = diff > 0
          ? `Trending ${formatMoney(diff)} over pace (projected ${formatMoney(projected)})`
          : `On track — ${formatMoney(-diff)} to spare (projected ${formatMoney(projected)})`;
        trendHtml = `<div class="trend-line ${trendClass}">${trendText}</div>`;
      }
    }

    const card = document.createElement("div");
    card.className = `category-card ${statusClass}`;
    card.innerHTML = `
      <div class="category-card-header">
        <span class="category-name">${escapeHtml(cat)}</span>
        <input type="number" class="budget-input" data-category="${escapeHtml(cat)}" min="0" step="0.01" placeholder="Budget" value="${hasBudget ? budget : ""}">
      </div>
      <div class="category-card-bar-track"><div class="category-card-bar-fill" style="width:${pct}%"></div></div>
      <div class="category-card-footer">
        <span class="spent-label">Spent: ${formatMoney(spent)}</span>
        <span class="remaining-label">${remainingText}</span>
      </div>
      ${trendHtml}
    `;
    summaryBreakdown.appendChild(card);
  });

  if (orderedCategories.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-summary";
    empty.textContent = "No expenses logged this month yet.";
    summaryBreakdown.appendChild(empty);
  }
}

summaryBreakdown.addEventListener("change", (e) => {
  if (!e.target.classList.contains("budget-input")) return;
  const cat = e.target.dataset.category;
  const value = parseFloat(e.target.value);
  if (!value || value <= 0) {
    delete state.budgets[cat];
  } else {
    state.budgets[cat] = value;
  }
  saveBudgets();
  renderSummary();
});

// ---------- Modal ----------

const modalBackdrop = document.getElementById("modalBackdrop");
const modalDate = document.getElementById("modalDate");
const entryList = document.getElementById("entryList");
const dayTotalEl = document.getElementById("dayTotal");
const entryForm = document.getElementById("entryForm");
const categorySelect = document.getElementById("categorySelect");
const customCategoryInput = document.getElementById("customCategoryInput");
const amountInput = document.getElementById("amountInput");
const noteInput = document.getElementById("noteInput");
const closeModalBtn = document.getElementById("closeModal");

categorySelect.addEventListener("change", () => {
  const isOther = categorySelect.value === "Other";
  customCategoryInput.classList.toggle("hidden", !isOther);
  if (isOther) {
    customCategoryInput.focus();
  } else {
    customCategoryInput.value = "";
  }
});

CATEGORIES.forEach(c => {
  const opt = document.createElement("option");
  opt.value = c;
  opt.textContent = c;
  categorySelect.appendChild(opt);
});

function openModal(key) {
  state.selectedDate = key;
  const [y, m, d] = key.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  modalDate.textContent = dateObj.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  renderEntries();
  modalBackdrop.classList.add("open");
  amountInput.value = "";
  noteInput.value = "";
  categorySelect.selectedIndex = 0;
  customCategoryInput.value = "";
  customCategoryInput.classList.add("hidden");
}

function closeModal() {
  modalBackdrop.classList.remove("open");
  state.selectedDate = null;
}

closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalBackdrop.classList.contains("open")) closeModal();
});

function renderEntries() {
  const key = state.selectedDate;
  const entries = state.data[key] || [];
  entryList.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "no-entries";
    empty.textContent = "No expenses added yet.";
    entryList.appendChild(empty);
  } else {
    entries.forEach(entry => {
      const li = document.createElement("li");
      li.className = "entry-row";
      li.innerHTML = `
        <div class="entry-info">
          <span class="entry-category">${entry.category}</span>
          ${entry.note ? `<span class="entry-note">${escapeHtml(entry.note)}</span>` : ""}
        </div>
        <div class="entry-amount">${formatMoney(entry.amount)}</div>
        <button class="entry-delete" aria-label="Delete">&times;</button>
      `;
      li.querySelector(".entry-delete").addEventListener("click", () => {
        deleteEntry(key, entry.id);
      });
      entryList.appendChild(li);
    });
  }

  dayTotalEl.textContent = `Day total: ${formatMoney(dayTotal(key))}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

entryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const key = state.selectedDate;
  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) return;

  let category = categorySelect.value;
  if (category === "Other") {
    const custom = customCategoryInput.value.trim();
    if (custom) category = custom;
  }

  if (!state.data[key]) state.data[key] = [];
  state.data[key].push({
    id: Date.now() + Math.random().toString(36).slice(2),
    category,
    amount,
    note: noteInput.value.trim()
  });

  saveData();
  amountInput.value = "";
  noteInput.value = "";
  customCategoryInput.value = "";
  customCategoryInput.classList.add("hidden");
  categorySelect.selectedIndex = 0;
  renderEntries();
  renderCalendar();
});

function deleteEntry(key, id) {
  state.data[key] = (state.data[key] || []).filter(e => e.id !== id);
  if (state.data[key].length === 0) delete state.data[key];
  saveData();
  renderEntries();
  renderCalendar();
}

// ---------- Month navigation ----------

document.getElementById("prevMonth").addEventListener("click", () => {
  state.viewMonth--;
  if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear--; }
  renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {
  state.viewMonth++;
  if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear++; }
  renderCalendar();
});

renderCalendar();

// ---------- Splash intro ----------

const splash = document.getElementById("splash");
if (splash) {
  setTimeout(() => {
    splash.style.transition = "opacity 0.6s ease";
    splash.style.opacity = "0";
    splash.addEventListener("transitionend", () => splash.remove(), { once: true });
  }, 3000);
}
