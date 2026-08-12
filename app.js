const STORAGE_KEY = "expenseTrackerData";
const CATEGORIES = [
  "Food", "Transport", "Housing", "Utilities",
  "Entertainment", "Health", "Shopping", "Other"
];

const state = {
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(), // 0-indexed
  selectedDate: null, // "YYYY-MM-DD"
  data: loadData()
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
  CATEGORIES.forEach(c => totals[c] = 0);
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

  if (monthTotal === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-summary";
    empty.textContent = "No expenses logged this month yet.";
    summaryBreakdown.appendChild(empty);
    return;
  }

  CATEGORIES
    .filter(c => totals[c] > 0)
    .sort((a, b) => totals[b] - totals[a])
    .forEach(cat => {
      const pct = (totals[cat] / monthTotal) * 100;
      const row = document.createElement("div");
      row.className = "breakdown-row";
      row.innerHTML = `
        <div class="breakdown-label">${cat}</div>
        <div class="breakdown-bar-track"><div class="breakdown-bar-fill" style="width:${pct}%"></div></div>
        <div class="breakdown-amount">${formatMoney(totals[cat])}</div>
      `;
      summaryBreakdown.appendChild(row);
    });
}

// ---------- Modal ----------

const modalBackdrop = document.getElementById("modalBackdrop");
const modalDate = document.getElementById("modalDate");
const entryList = document.getElementById("entryList");
const dayTotalEl = document.getElementById("dayTotal");
const entryForm = document.getElementById("entryForm");
const categorySelect = document.getElementById("categorySelect");
const amountInput = document.getElementById("amountInput");
const noteInput = document.getElementById("noteInput");
const closeModalBtn = document.getElementById("closeModal");

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

  if (!state.data[key]) state.data[key] = [];
  state.data[key].push({
    id: Date.now() + Math.random().toString(36).slice(2),
    category: categorySelect.value,
    amount,
    note: noteInput.value.trim()
  });

  saveData();
  amountInput.value = "";
  noteInput.value = "";
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
