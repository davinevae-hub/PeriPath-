(() => {
  // -------------------------
  // Data model + constants
  // -------------------------
  const SYMPTOMS = [
    { key: "hotFlashes", label: "Hot flashes" },
    { key: "nightSweats", label: "Night sweats" },
    { key: "sleep", label: "Sleep quality" },
    { key: "mood", label: "Mood / irritability" },
    { key: "anxiety", label: "Anxiety" },
    { key: "brainFog", label: "Brain fog" },
    { key: "fatigue", label: "Fatigue" },
    { key: "jointAches", label: "Joint aches" },
    { key: "dryness", label: "Dryness / discomfort" },
    { key: "libido", label: "Libido changes" }
  ];

  const DB_NAME = "peripath_db";
  const DB_VERSION = 2;
  const STORE = "daily_logs"; // keyPath: date (YYYY-MM-DD)

  // -------------------------
  // DOM
  // -------------------------
  const navBtns = Array.from(document.querySelectorAll(".nav"));
  const views = {
    checkin: document.getElementById("view-checkin"),
    calendar: document.getElementById("view-calendar"),
    insights: document.getElementById("view-insights"),
    report: document.getElementById("view-report"),
    settings: document.getElementById("view-settings")
  };

  const offlineBadge = document.getElementById("offlineBadge");
  const todayBtn = document.getElementById("todayBtn");
  const installHelpBtn = document.getElementById("installHelpBtn");

  // Check-in
  const symptomGrid = document.getElementById("symptomGrid");
  const logDate = document.getElementById("logDate");
  const periodToday = document.getElementById("periodToday");
  const notes = document.getElementById("notes");
  const scoreValue = document.getElementById("scoreValue");
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");
  const saveStatus = document.getElementById("saveStatus");

  // Calendar
  const prevMonth = document.getElementById("prevMonth");
  const nextMonth = document.getElementById("nextMonth");
  const monthLabel = document.getElementById("monthLabel");
  const calendarGrid = document.getElementById("calendarGrid");
  const calShadeMode = document.getElementById("calShadeMode");

  // Insights
  const avg7El = document.getElementById("avg7");
  const avgPrev7El = document.getElementById("avgPrev7");
  const trend7El = document.getElementById("trend7");
  const topSymptomsEl = document.getElementById("topSymptoms");
  const trendChart = document.getElementById("trendChart");

  // Report
  const reportRange = document.getElementById("reportRange");
  const printBtn = document.getElementById("printBtn");
  const reportMeta = document.getElementById("reportMeta");
  const rEntries = document.getElementById("rEntries");
  const rAvg = document.getElementById("rAvg");
  const rMax = document.getElementById("rMax");
  const rPeriodDays = document.getElementById("rPeriodDays");
  const rTopSymptoms = document.getElementById("rTopSymptoms");
  const rCycle = document.getElementById("rCycle");
  const rNotes = document.getElementById("rNotes");

  // Settings export/import
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const importBtn = document.getElementById("importBtn");
  const wipeBtn = document.getElementById("wipeBtn");
  const importFile = document.getElementById("importFile");
  const dataStatus = document.getElementById("dataStatus");

  // Day modal
  const modalBackdrop = document.getElementById("modalBackdrop");
  const dayModal = document.getElementById("dayModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalSub = document.getElementById("modalSub");
  const modalClose = document.getElementById("modalClose");
  const modalScore = document.getElementById("modalScore");
  const modalPeriod = document.getElementById("modalPeriod");
  const modalSymptomGrid = document.getElementById("modalSymptomGrid");
  const modalNotes = document.getElementById("modalNotes");
  const modalSave = document.getElementById("modalSave");
  const modalDelete = document.getElementById("modalDelete");
  const modalStatus = document.getElementById("modalStatus");

  // Install modal
  const installModal = document.getElementById("installModal");
  const installClose = document.getElementById("installClose");

  // -------------------------
  // IndexedDB
  // -------------------------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "date" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function txStore(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const out = fn(store);
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
  }

  function putLog(entry) {
    return txStore("readwrite", (s) => s.put(entry));
  }

  function getLog(date) {
    return txStore("readonly", (s) => new Promise((resolve, reject) => {
      const req = s.get(date);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    }));
  }

  function deleteLog(date) {
    return txStore("readwrite", (s) => s.delete(date));
  }

  function getAllLogs() {
    return txStore("readonly", (s) => new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }));
  }

  function clearAll() {
    return txStore("readwrite", (s) => s.clear());
  }

  // -------------------------
  // Utilities
  // -------------------------
  function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function escapeHTML(str) {
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function sumScore(symptomsObj) {
    return SYMPTOMS.reduce((acc, s) => acc + (Number(symptomsObj?.[s.key]) || 0), 0);
  }
  function format(n, digits=1) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return Number(n).toFixed(digits);
  }
  function daysBetween(aISO, bISO) {
    const a = parseISO(aISO).getTime();
    const b = parseISO(bISO).getTime();
    return Math.round((b - a) / (1000*60*60*24));
  }

  // Shade modes for calendar
  function shadeForScore(score) {
    // 0–30 buckets
    if (score <= 2) return { bg: "var(--good)" };
    if (score <= 8) return { bg: "var(--mild)" };
    if (score <= 16) return { bg: "var(--mod)" };
    return { bg: "var(--high)" };
  }
  function shadeForSymptom(val) {
    // 0–3 mapping
    if (val <= 0) return { bg: "rgba(94,224,174,.10)" };
    if (val === 1) return { bg: "rgba(212,175,55,.12)" };
    if (val === 2) return { bg: "rgba(245,165,36,.12)" };
    return { bg: "rgba(193,18,31,.14)" };
  }

  // -------------------------
  // Navigation
  // -------------------------
  function setView(key) {
    navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === key));
    Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === key));

    if (key === "calendar") refreshCalendar();
    if (key === "insights") refreshInsights();
    if (key === "report") refreshReport();
  }

  navBtns.forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));

  // -------------------------
  // Build symptom UI blocks
  // -------------------------
  function symptomBlockHTML(sym) {
    return `
      <div class="symptom">
        <div class="symptom-top">
          <div class="symptom-name">${sym.label}</div>
          <div class="symptom-cap">0–3</div>
        </div>
        <div class="scale">
          <input type="range" min="0" max="3" step="1" value="0" data-sym="${sym.key}" aria-label="${sym.label}">
          <div class="scale-val" id="val-${sym.key}">0</div>
        </div>
      </div>
    `;
  }

  const checkinState = Object.fromEntries(SYMPTOMS.map(s => [s.key, 0]));
  function buildCheckinGrid() {
    symptomGrid.innerHTML = SYMPTOMS.map(symptomBlockHTML).join("");

    symptomGrid.addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.type !== "range") return;
      const key = t.dataset.sym;
      if (!key) return;
      const v = clamp(Number(t.value), 0, 3);
      checkinState[key] = v;
      const valEl = document.getElementById(`val-${key}`);
      if (valEl) valEl.textContent = String(v);
      scoreValue.textContent = String(sumScore(checkinState));
    });
  }

  function setCheckinUI(entry) {
    const symptoms = entry?.symptoms || {};
    SYMPTOMS.forEach(s => {
      const v = clamp(Number(symptoms[s.key] ?? 0), 0, 3);
      checkinState[s.key] = v;
      const input = symptomGrid.querySelector(`input[data-sym="${s.key}"]`);
      const valEl = document.getElementById(`val-${s.key}`);
      if (input) input.value = String(v);
      if (valEl) valEl.textContent = String(v);
    });
    scoreValue.textContent = String(sumScore(checkinState));
    periodToday.checked = !!entry?.period;
    notes.value = entry?.notes || "";
  }

  async function loadIntoCheckin(dateISO) {
    const entry = await getLog(dateISO);
    setCheckinUI(entry);
    saveStatus.textContent = entry ? `Loaded saved entry for ${dateISO}.` : `No saved entry for ${dateISO}.`;
  }

  async function saveCheckin() {
    const dateISO = logDate.value;
    if (!dateISO) return;

    const symptoms = {};
    SYMPTOMS.forEach(s => symptoms[s.key] = clamp(Number(checkinState[s.key] || 0), 0, 3));
    const score = sumScore(symptoms);

    const entry = {
      date: dateISO,
      symptoms,
      score,
      period: !!periodToday.checked,
      notes: (notes.value || "").trim(),
      updatedAt: new Date().toISOString()
    };

    await putLog(entry);
    saveStatus.textContent = `Saved entry for ${dateISO}.`;
    refreshCalendar();
    refreshInsights();
    refreshReport();
  }

  function resetCheckinUI() {
    SYMPTOMS.forEach(s => {
      checkinState[s.key] = 0;
      const input = symptomGrid.querySelector(`input[data-sym="${s.key}"]`);
      const valEl = document.getElementById(`val-${s.key}`);
      if (input) input.value = "0";
      if (valEl) valEl.textContent = "0";
    });
    periodToday.checked = false;
    notes.value = "";
    scoreValue.textContent = "0";
    saveStatus.textContent = "Reset (not saved).";
  }

  // -------------------------
  // Calendar
  // -------------------------
  let calCursor = new Date();
  let allLogsCache = []; // refreshed by fetch

  function populateShadeModeSelect() {
    // Start with score + each symptom
    calShadeMode.innerHTML = `
      <option value="score">Symptom Load</option>
      ${SYMPTOMS.map(s => `<option value="${s.key}">${s.label}</option>`).join("")}
    `;
  }

  async function refreshAllLogsCache() {
    allLogsCache = await getAllLogs();
    allLogsCache.sort((a,b) => a.date.localeCompare(b.date));
  }

  async function refreshCalendar() {
    await refreshAllLogsCache();
    const map = new Map(allLogsCache.map(l => [l.date, l]));

    const monthStart = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
    const monthEnd = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 0);

    monthLabel.textContent = monthStart.toLocaleString(undefined, { month:"long", year:"numeric" });

    // grid range: Sunday start -> Saturday end
    const start = new Date(monthStart);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(monthEnd);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const shadeMode = calShadeMode.value || "score";

    calendarGrid.innerHTML = "";
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = toISO(d);
      const inMonth = d.getMonth() === monthStart.getMonth();
      const entry = map.get(iso) || null;

      const cell = document.createElement("div");
      cell.className = "day";
      if (!inMonth) cell.classList.add("dim");
      if (entry) cell.classList.add("hasData");
      if (entry?.period) cell.classList.add("period");

      let bg = "rgba(22,21,38,.45)";
      if (entry) {
        if (shadeMode === "score") {
          bg = shadeForScore(Number(entry.score ?? sumScore(entry.symptoms))).bg;
        } else {
          const v = Number(entry.symptoms?.[shadeMode] || 0);
          bg = shadeForSymptom(v).bg;
        }
      }

      cell.style.background = bg;
      cell.innerHTML = `<div class="day-num">${d.getDate()}</div><div class="day-dot"></div>`;
      cell.addEventListener("click", () => openDayModal(iso));

      calendarGrid.appendChild(cell);
    }
  }

  prevMonth.addEventListener("click", () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    refreshCalendar();
  });
  nextMonth.addEventListener("click", () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    refreshCalendar();
  });
  calShadeMode.addEventListener("change", refreshCalendar);

  // -------------------------
  // Day modal editor
  // -------------------------
  const modalState = Object.fromEntries(SYMPTOMS.map(s => [s.key, 0]));
  let modalDateISO = null;

  function buildModalSymptomGrid() {
    modalSymptomGrid.innerHTML = SYMPTOMS.map(s => `
      <div class="symptom">
        <div class="symptom-top">
          <div class="symptom-name">${s.label}</div>
          <div class="symptom-cap">0–3</div>
        </div>
        <div class="scale">
          <input type="range" min="0" max="3" step="1" value="0" data-msym="${s.key}" aria-label="${s.label}">
          <div class="scale-val" id="mval-${s.key}">0</div>
        </div>
      </div>
    `).join("");

    modalSymptomGrid.addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.type !== "range") return;
      const key = t.dataset.msym;
      if (!key) return;
      const v = clamp(Number(t.value), 0, 3);
      modalState[key] = v;
      const valEl = document.getElementById(`mval-${key}`);
      if (valEl) valEl.textContent = String(v);
      modalScore.textContent = String(sumScore(modalState));
    });
  }

  function showModal(show) {
    modalBackdrop.hidden = !show;
    dayModal.hidden = !show;
    if (!show) {
      modalStatus.textContent = "";
      modalDateISO = null;
    }
  }

  async function openDayModal(dateISO) {
    modalDateISO = dateISO;
    modalTitle.textContent = `Edit Day`;
    modalSub.textContent = dateISO;

    const entry = await getLog(dateISO);
    const symptoms = entry?.symptoms || {};
    SYMPTOMS.forEach(s => {
      const v = clamp(Number(symptoms[s.key] ?? 0), 0, 3);
      modalState[s.key] = v;
      const input = modalSymptomGrid.querySelector(`input[data-msym="${s.key}"]`);
      const valEl = document.getElementById(`mval-${s.key}`);
      if (input) input.value = String(v);
      if (valEl) valEl.textContent = String(v);
    });

    modalPeriod.checked = !!entry?.period;
    modalNotes.value = entry?.notes || "";
    modalScore.textContent = String(sumScore(modalState));
    modalStatus.textContent = entry ? "Loaded entry." : "No entry yet. Add one and save.";
    showModal(true);
  }

  modalClose.addEventListener("click", () => showModal(false));
  modalBackdrop.addEventListener("click", () => {
    // close whichever modal is open
    if (!dayModal.hidden) showModal(false);
    if (!installModal.hidden) toggleInstallModal(false);
  });

  modalSave.addEventListener("click", async () => {
    if (!modalDateISO) return;

    const symptoms = {};
    SYMPTOMS.forEach(s => symptoms[s.key] = clamp(Number(modalState[s.key] || 0), 0, 3));
    const score = sumScore(symptoms);

    const entry = {
      date: modalDateISO,
      symptoms,
      score,
      period: !!modalPeriod.checked,
      notes: (modalNotes.value || "").trim(),
      updatedAt: new Date().toISOString()
    };

    await putLog(entry);
    modalStatus.textContent = "Saved.";
    refreshCalendar();
    refreshInsights();
    refreshReport();

    // If the main check-in date matches, refresh that form too
    if (logDate.value === modalDateISO) await loadIntoCheckin(modalDateISO);
  });

  modalDelete.addEventListener("click", async () => {
    if (!modalDateISO) return;
    const ok = confirm(`Delete entry for ${modalDateISO}?`);
    if (!ok) return;

    await deleteLog(modalDateISO);
    modalStatus.textContent = "Deleted entry.";
    refreshCalendar();
    refreshInsights();
    refreshReport();
    if (logDate.value === modalDateISO) await loadIntoCheckin(modalDateISO);
  });

  // -------------------------
  // Insights
  // -------------------------
  async function refreshInsights() {
    await refreshAllLogsCache();
    const logs = allLogsCache;

    if (!logs.length) {
      avg7El.textContent = "—";
      avgPrev7El.textContent = "—";
      trend7El.textContent = "—";
      topSymptomsEl.textContent = "No data yet.";
      trendChart.innerHTML = "";
      return;
    }

    const now = new Date();
    const last7Start = new Date(now); last7Start.setDate(now.getDate() - 6);
    const prev7Start = new Date(now); prev7Start.setDate(now.getDate() - 13);
    const prev7End = new Date(now); prev7End.setDate(now.getDate() - 7);

    const last7 = logs.filter(l => {
      const d = parseISO(l.date);
      return d >= startOfDay(last7Start) && d <= endOfDay(now);
    });
    const prev7 = logs.filter(l => {
      const d = parseISO(l.date);
      return d >= startOfDay(prev7Start) && d <= endOfDay(prev7End);
    });

    const avg = (arr) => {
      if (!arr.length) return null;
      const s = arr.reduce((acc, l) => acc + (Number(l.score ?? sumScore(l.symptoms)) || 0), 0);
      return s / arr.length;
    };

    const a7 = avg(last7);
    const ap7 = avg(prev7);

    avg7El.textContent = a7 === null ? "—" : format(a7, 1);
    avgPrev7El.textContent = ap7 === null ? "—" : format(ap7, 1);

    if (a7 === null || ap7 === null) {
      trend7El.textContent = "—";
    } else {
      const delta = a7 - ap7;
      const arrow = delta > 0.2 ? "↑" : delta < -0.2 ? "↓" : "→";
      trend7El.textContent = `${arrow} ${format(delta, 1)}`;
    }

    // Top symptoms (last 30 days)
    const since = new Date(now); since.setDate(now.getDate() - 29);
    const last30 = logs.filter(l => {
      const d = parseISO(l.date);
      return d >= startOfDay(since) && d <= endOfDay(now);
    });

    if (!last30.length) {
      topSymptomsEl.textContent = "No data in the last 30 days.";
    } else {
      const sums = Object.fromEntries(SYMPTOMS.map(s => [s.key, 0]));
      last30.forEach(l => {
        SYMPTOMS.forEach(s => sums[s.key] += Number(l.symptoms?.[s.key] || 0));
      });

      const avgs = SYMPTOMS.map(s => ({
        label: s.label,
        avg: sums[s.key] / last30.length
      })).sort((a,b) => b.avg - a.avg);

      const top = avgs.slice(0, 6).filter(x => x.avg > 0);
      topSymptomsEl.innerHTML = top.length
        ? top.map(x => `<div class="card"><div class="card-k">${x.label}</div><div class="card-v">${format(x.avg, 2)}</div></div>`).join("")
        : `<div class="muted">All logged values are zero in the last 30 days.</div>`;
    }

    // Trend chart (last 30 days; sparse entries allowed)
    renderTrendChart(last30);
  }

  function renderTrendChart(entries) {
    // Build day series for last 30 days including blanks
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - 29);
    const map = new Map(entries.map(e => [e.date, Number(e.score ?? sumScore(e.symptoms)) || 0]));

    const series = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = toISO(d);
      series.push({ date: iso, val: map.has(iso) ? map.get(iso) : null });
    }

    const w = 860, h = 160, pad = 18;
    const max = 30;
    const min = 0;

    const xs = (i) => pad + (i * (w - pad*2) / (series.length - 1));
    const ys = (v) => {
      const t = (v - min) / (max - min);
      return (h - pad) - t * (h - pad*2);
    };

    // Path with gaps: start new segment when val is null
    let path = "";
    let started = false;
    series.forEach((p, i) => {
      if (p.val === null) { started = false; return; }
      const x = xs(i);
      const y = ys(p.val);
      if (!started) {
        path += `M ${x.toFixed(2)} ${y.toFixed(2)} `;
        started = true;
      } else {
        path += `L ${x.toFixed(2)} ${y.toFixed(2)} `;
      }
    });

    // Points
    const circles = series.map((p,i) => {
      if (p.val === null) return "";
      const x = xs(i), y = ys(p.val);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.6" fill="rgba(212,175,55,.85)"/>`;
    }).join("");

    // Grid lines at 0,10,20,30
    const grid = [0,10,20,30].map(v => {
      const y = ys(v);
      return `<line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="rgba(185,183,199,.18)" stroke-width="1" />`;
    }).join("");

    trendChart.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="160" aria-hidden="true">
        ${grid}
        <path d="${path}" fill="none" stroke="rgba(193,18,31,.75)" stroke-width="2.2" stroke-linecap="round"/>
        ${circles}
        <text x="${pad}" y="${pad}" fill="rgba(185,183,199,.7)" font-size="12">0</text>
        <text x="${pad}" y="${ys(10) - 6}" fill="rgba(185,183,199,.7)" font-size="12">10</text>
        <text x="${pad}" y="${ys(20) - 6}" fill="rgba(185,183,199,.7)" font-size="12">20</text>
        <text x="${pad}" y="${ys(30) - 6}" fill="rgba(185,183,199,.7)" font-size="12">30</text>
      </svg>
    `;
  }

  // -------------------------
  // Report
  // -------------------------
  async function refreshReport() {
    await refreshAllLogsCache();
    const logs = allLogsCache;

    const range = Number(reportRange.value || 30);
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - (range - 1));

    const filtered = logs.filter(l => {
      const d = parseISO(l.date);
      return d >= startOfDay(start) && d <= endOfDay(now);
    });

    reportMeta.textContent = `${toISO(start)} to ${toISO(now)} (last ${range} days)`;

    if (!filtered.length) {
      rEntries.textContent = "0";
      rAvg.textContent = "—";
      rMax.textContent = "—";
      rPeriodDays.textContent = "—";
      rTopSymptoms.innerHTML = "—";
      rCycle.innerHTML = "—";
      rNotes.innerHTML = "—";
      return;
    }

    const scores = filtered.map(l => Number(l.score ?? sumScore(l.symptoms)) || 0);
    const entries = filtered.length;
    const avgScore = scores.reduce((a,b)=>a+b,0) / entries;
    const maxScore = Math.max(...scores);

    const periodDays = filtered.filter(l => !!l.period).length;

    rEntries.textContent = String(entries);
    rAvg.textContent = format(avgScore, 1);
    rMax.textContent = `${maxScore} / 30`;
    rPeriodDays.textContent = String(periodDays);

    // Top symptoms
    const sums = Object.fromEntries(SYMPTOMS.map(s => [s.key, 0]));
    filtered.forEach(l => SYMPTOMS.forEach(s => sums[s.key] += Number(l.symptoms?.[s.key] || 0)));

    const avgs = SYMPTOMS.map(s => ({ label: s.label, avg: sums[s.key] / entries }))
      .sort((a,b) => b.avg - a.avg);

    const top = avgs.slice(0, 8).filter(x => x.avg > 0);
    rTopSymptoms.innerHTML = top.length
      ? top.map(x => `<div class="card"><div class="card-k">${x.label}</div><div class="card-v">${format(x.avg, 2)}</div></div>`).join("")
      : `<div class="muted">No symptoms logged (all zeros) in this range.</div>`;

    // Cycle intervals: detect period starts from consecutive period days
    const periodStarts = [];
    let prevWasPeriod = false;
    filtered
      .slice()
      .sort((a,b)=>a.date.localeCompare(b.date))
      .forEach(l => {
        const isP = !!l.period;
        if (isP && !prevWasPeriod) periodStarts.push(l.date);
        prevWasPeriod = isP;
      });

    if (periodStarts.length < 2) {
      rCycle.innerHTML = `<div class="muted">Not enough period start data in this range.</div>`;
    } else {
      const intervals = [];
      for (let i = 1; i < periodStarts.length; i++) intervals.push(daysBetween(periodStarts[i-1], periodStarts[i]));
      const avgInt = intervals.reduce((a,b)=>a+b,0) / intervals.length;

      rCycle.innerHTML = `
        <div class="card"><div class="card-k">Period starts logged</div><div class="card-v">${periodStarts.length}</div></div>
        <div class="card"><div class="card-k">Intervals (days)</div><div class="card-v">${intervals.join(", ")}</div></div>
        <div class="card"><div class="card-k">Average interval</div><div class="card-v">${format(avgInt, 1)} days</div></div>
      `;
    }

    // Notes (recent)
    const noted = filtered
      .filter(l => (l.notes || "").trim().length > 0)
      .slice(-8)
      .reverse();

    rNotes.innerHTML = noted.length
      ? noted.map(l => `
          <div class="card">
            <div class="card-k">${l.date}</div>
            <div class="card-v" style="font-size:14px; font-weight:800; line-height:1.35">${escapeHTML(l.notes)}</div>
          </div>
        `).join("")
      : `<div class="muted">No notes in this range.</div>`;
  }

  reportRange.addEventListener("change", refreshReport);
  printBtn.addEventListener("click", () => window.print());

  // -------------------------
  // Export / Import
  // -------------------------
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  exportJsonBtn.addEventListener("click", async () => {
    await refreshAllLogsCache();
    const payload = {
      app: "PeriPath",
      version: 2,
      exportedAt: new Date().toISOString(),
      logs: allLogsCache
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `peripath-export-${toISO(new Date())}.json`
    );
    dataStatus.textContent = "Exported JSON.";
  });

  exportCsvBtn.addEventListener("click", async () => {
    await refreshAllLogsCache();
    const headers = [
      "date","score","period","notes",
      ...SYMPTOMS.map(s => s.key)
    ];

    const rows = allLogsCache.map(l => {
      const base = [
        l.date,
        String(Number(l.score ?? sumScore(l.symptoms)) || 0),
        l.period ? "1" : "0",
        `"${String(l.notes || "").replaceAll('"','""')}"`
      ];
      const symVals = SYMPTOMS.map(s => String(Number(l.symptoms?.[s.key] || 0)));
      return [...base, ...symVals].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }),
      `peripath-export-${toISO(new Date())}.csv`
    );
    dataStatus.textContent = "Exported CSV.";
  });

  importBtn.addEventListener("click", () => {
    importFile.value = "";
    importFile.click();
  });

  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const logs = Array.isArray(parsed?.logs) ? parsed.logs : null;
      if (!logs) throw new Error("Invalid JSON format: missing logs[]");

      let imported = 0;
      for (const l of logs) {
        if (!l?.date || typeof l.date !== "string") continue;
        // Validate ISO-ish YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date)) continue;

        const symptoms = {};
        SYMPTOMS.forEach(s => symptoms[s.key] = clamp(Number(l.symptoms?.[s.key] || 0), 0, 3));
        const entry = {
          date: l.date,
          symptoms,
          score: sumScore(symptoms),
          period: !!l.period,
          notes: (l.notes || "").toString(),
          updatedAt: l.updatedAt || new Date().toISOString()
        };
        await putLog(entry);
        imported++;
      }

      dataStatus.textContent = `Imported ${imported} entries.`;
      await refreshAllLogsCache();
      refreshCalendar();
      refreshInsights();
      refreshReport();
      await loadIntoCheckin(logDate.value);
    } catch (e) {
      dataStatus.textContent = `Import failed: ${e.message}`;
    }
  });

  wipeBtn.addEventListener("click", async () => {
    const ok = confirm("Delete all PeriPath data on this device? This cannot be undone.");
    if (!ok) return;
    await clearAll();
    dataStatus.textContent = "All data deleted.";
    await refreshAllLogsCache();
    resetCheckinUI();
    refreshCalendar();
    refreshInsights();
    refreshReport();
  });

  // -------------------------
  // Offline/online badge
  // -------------------------
  function updateOfflineBadge() {
    const offline = !navigator.onLine;
    offlineBadge.hidden = !offline;
  }
  window.addEventListener("online", updateOfflineBadge);
  window.addEventListener("offline", updateOfflineBadge);

  // -------------------------
  // Install help modal
  // -------------------------
  function toggleInstallModal(show) {
    modalBackdrop.hidden = !show;
    installModal.hidden = !show;
  }
  installHelpBtn.addEventListener("click", () => toggleInstallModal(true));
  installClose.addEventListener("click", () => toggleInstallModal(false));

  // -------------------------
  // Misc buttons
  // -------------------------
  todayBtn.addEventListener("click", async () => {
    const iso = toISO(new Date());
    logDate.value = iso;
    await loadIntoCheckin(iso);
    // jump calendar to current month too
    calCursor = new Date();
    refreshCalendar();
    setView("checkin");
  });

  // -------------------------
  // Check-in handlers
  // -------------------------
  logDate.addEventListener("change", async () => {
    if (!logDate.value) return;
    await loadIntoCheckin(logDate.value);
  });

  saveBtn.addEventListener("click", async () => {
    try {
      saveBtn.disabled = true;
      await saveCheckin();
    } catch (e) {
      saveStatus.textContent = `Save failed: ${e.message}`;
    } finally {
      saveBtn.disabled = false;
    }
  });

  resetBtn.addEventListener("click", resetCheckinUI);

  // -------------------------
  // Service worker register
  // -------------------------
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // app still works online if SW fails
    });
  }

  // -------------------------
  // Init
  // -------------------------
  async function init() {
    updateOfflineBadge();
    registerSW();

    populateShadeModeSelect();
    buildCheckinGrid();
    buildModalSymptomGrid();

    // default today
    const today = toISO(new Date());
    logDate.value = today;
    await loadIntoCheckin(today);

    // prime caches + views
    await refreshAllLogsCache();
    refreshCalendar();
    refreshInsights();
    refreshReport();
  }

  init();
})();
