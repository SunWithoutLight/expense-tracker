import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://agvismgwikfdfqqusufw.supabase.co";
const SUPABASE_KEY = "sb_publishable_065WQ02-mdoTiCGGHV72fg_sfKosqVz";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CATEGORIES = [
  "Food", "Transport", "Housing", "Utilities",
  "Entertainment", "Health", "Shopping", "Other"
];

const state = {
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(), // 0-indexed
  selectedDate: null, // "YYYY-MM-DD"
  data: {},
  budgets: {}
};

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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Supabase data access ----------

async function fetchExpenses() {
  const { data, error } = await supabase.from("expenses").select("*").order("entry_date");
  if (error) { console.error(error); return {}; }
  const grouped = {};
  data.forEach(row => {
    if (!grouped[row.entry_date]) grouped[row.entry_date] = [];
    grouped[row.entry_date].push({
      id: row.id,
      category: row.category,
      amount: Number(row.amount),
      note: row.note || ""
    });
  });
  return grouped;
}

async function fetchBudgets() {
  const { data, error } = await supabase.from("budgets").select("*");
  if (error) { console.error(error); return {}; }
  const map = {};
  data.forEach(row => { map[row.category] = Number(row.amount); });
  return map;
}

async function insertExpense(key, category, amount, note) {
  const { data, error } = await supabase
    .from("expenses")
    .insert({ entry_date: key, category, amount, note })
    .select()
    .single();
  if (error) {
    alert("Couldn't save that expense: " + error.message);
    return null;
  }
  return { id: data.id, category: data.category, amount: Number(data.amount), note: data.note || "" };
}

async function removeExpense(id) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) alert("Couldn't delete that expense: " + error.message);
}

async function upsertBudget(category, amount) {
  const { error } = await supabase
    .from("budgets")
    .upsert({ category, amount }, { onConflict: "user_id,category" });
  if (error) alert("Couldn't save that budget: " + error.message);
}

async function removeBudget(category) {
  const { error } = await supabase.from("budgets").delete().eq("category", category);
  if (error) alert("Couldn't remove that budget: " + error.message);
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

  orderedCategories.forEach(cat => {
    const spent = totals[cat] || 0;
    const budget = state.budgets[cat];
    const hasBudget = typeof budget === "number" && budget > 0;

    let statusClass = "";
    let remainingText = "No budget set";
    let pct = 0;

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

summaryBreakdown.addEventListener("change", async (e) => {
  if (!e.target.classList.contains("budget-input")) return;
  const cat = e.target.dataset.category;
  const value = parseFloat(e.target.value);
  if (!value || value <= 0) {
    delete state.budgets[cat];
    await removeBudget(cat);
  } else {
    state.budgets[cat] = value;
    await upsertBudget(cat, value);
  }
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
          <span class="entry-category">${escapeHtml(entry.category)}</span>
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

entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = state.selectedDate;
  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) return;

  let category = categorySelect.value;
  if (category === "Other") {
    const custom = customCategoryInput.value.trim();
    if (custom) category = custom;
  }

  const note = noteInput.value.trim();
  const submitBtn = entryForm.querySelector(".add-btn");
  submitBtn.disabled = true;
  const saved = await insertExpense(key, category, amount, note);
  submitBtn.disabled = false;
  if (!saved) return;

  if (!state.data[key]) state.data[key] = [];
  state.data[key].push(saved);

  amountInput.value = "";
  noteInput.value = "";
  customCategoryInput.value = "";
  customCategoryInput.classList.add("hidden");
  categorySelect.selectedIndex = 0;
  renderEntries();
  renderCalendar();
});

async function deleteEntry(key, id) {
  await removeExpense(id);
  state.data[key] = (state.data[key] || []).filter(e => e.id !== id);
  if (state.data[key].length === 0) delete state.data[key];
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

// ---------- Auth ----------

const appEl = document.getElementById("app");
const authScreen = document.getElementById("authScreen");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authError = document.getElementById("authError");
const authTitle = document.getElementById("authTitle");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authToggleBtn = document.getElementById("authToggleBtn");
const authToggleText = document.getElementById("authToggleText");
const userEmailLabel = document.getElementById("userEmailLabel");
const logoutBtn = document.getElementById("logoutBtn");

let authMode = "signin";

function updateAuthMode() {
  authError.textContent = "";
  if (authMode === "signin") {
    authTitle.textContent = "Sign in";
    authSubmitBtn.textContent = "Sign in";
    authToggleText.textContent = "Don't have an account?";
    authToggleBtn.textContent = "Sign up";
  } else {
    authTitle.textContent = "Create account";
    authSubmitBtn.textContent = "Sign up";
    authToggleText.textContent = "Already have an account?";
    authToggleBtn.textContent = "Sign in";
  }
}

authToggleBtn.addEventListener("click", () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  updateAuthMode();
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  authSubmitBtn.disabled = true;

  const email = authEmail.value.trim();
  const password = authPassword.value;

  try {
    if (authMode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        authMode = "signin";
        updateAuthMode();
        authError.style.color = "var(--success)";
        authError.textContent = "Account created — check your email to confirm, then sign in.";
      }
    }
  } catch (err) {
    authError.style.color = "var(--danger)";
    authError.textContent = err.message;
  } finally {
    authSubmitBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
});

async function showApp(user) {
  authScreen.classList.add("hidden");
  appEl.classList.remove("hidden");
  userEmailLabel.textContent = user.email;
  state.data = await fetchExpenses();
  state.budgets = await fetchBudgets();
  renderCalendar();
}

function showAuth() {
  appEl.classList.add("hidden");
  authScreen.classList.remove("hidden");
  authForm.reset();
  authMode = "signin";
  updateAuthMode();
}

supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    showApp(session.user);
  } else {
    showAuth();
  }
});

// ---------- Splash intro ----------

const splash = document.getElementById("splash");
if (splash) {
  setTimeout(() => {
    splash.style.transition = "opacity 0.6s ease";
    splash.style.opacity = "0";
    splash.addEventListener("transitionend", () => splash.remove(), { once: true });
  }, 3000);
}
