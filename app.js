(() => {
  // -------------------------
  // Symptom model (grouped)
  // -------------------------
  const GROUPS = [
    {
      id: "vasomotor",
      title: "Vasomotor",
      sub: "Heat shifts and sweating patterns that can impact comfort.",
      items: [
        { key: "hotFlashes", label: "Hot flashes" },
        { key: "nightSweats", label: "Night sweats" }
      ]
    },
    {
      id: "sleepEnergy",
      title: "Sleep & energy",
      sub: "Rest, stamina, and mental clarity across the day.",
      items: [
        { key: "sleep", label: "Sleep quality" },
        { key: "fatigue", label: "Fatigue" },
        { key: "brainFog", label: "Brain fog" }
      ]
    },
    {
      id: "mood",
      title: "Mood",
      sub: "Emotional load and nervous system intensity.",
      items: [
        { key: "mood", label: "Mood / irritability" },
        { key: "anxiety", label: "Anxiety" }
      ]
    },
    {
      id: "body",
      title: "Body",
      sub: "Physical discomfort that can influence movement and recovery.",
      items: [
        { key: "jointAches", label: "Joint aches" }
      ]
    },
    {
      id: "intimacy",
      title: "Intimacy",
      sub: "Comfort and interest changes are common—and trackable.",
      items: [
        { key: "dryness", label: "Dryness / discomfort" },
        { key: "libido", label: "Libido changes" }
      ]
    }
  ];

  const SYMPTOMS = GROUPS.flatMap(g => g.items);

  // Values 0–3 with labels (therapist-friendly, still numeric internally)
  function levelLabel(v) {
    switch (Number(v)) {
      case 0: return "None";
      case 1: return "Mild";
      case 2: return "Moderate";
      case 3: return "Strong";
      default: return "—";
    }
  }

  // -------------------------
  // IndexedDB
  // -------------------------
  const DB_NAME = "peripath_db";
  const DB_VERSION = 2;
  const STORE = "daily_logs"; // keyPath: date (YYYY-MM-DD)

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

  // Calendar shade modes
  function shadeForScore(score) {
    if (score <= 2) return { bg: "var(--good)" };
    if (score <= 8) return { bg: "var(--mild)" };
    if (score <= 16) return { bg: "var(--mod)" };
    return { bg: "var(--high)" };
  }

  function shadeForSymptom(val) {
    const v = Number(val || 0);
    if (v <= 0) return { bg: "rgba(94,224,174,.10)" };
    if (v === 1) return { bg: "rgba(184,146,42,.12)" };
    if (v === 2) return { bg: "rgba(245,165,36,.12)" };
    return { bg: "rgba(193,18,31,.14)" };
  }

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
  const symptomGroups = document.getElementById("symptomGroups");
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

  // Settings
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const importBtn = document.getElementById("importBtn");
  const wipeBtn = document.getElementById("wipeBtn");
  const importFile = document.getElementById("importFile");
  const dataStatus = document.getElementById("dataStatus");

  // Modals
  const modalBackdrop = document.getElementById("modalBackdrop");
  const dayModal = document.getElementById("dayModal");
  const modalSub = document.getElementById("modalSub");
  const modalClose = document.getElementById("modalClose");
  const modalScore = document.getElementById("modalScore");
  const modalPeriod = document.getElementById("modalPeriod");
  const modalSymptomGroups = document.getElementById("modalSymptomGroups");
  const modalNotes = document.getElementById("modalNotes");
  const modalSave = document.getElementById("modalSave");
  const modalDelete = document.getElementById("modalDelete");
  const modalStatus = document.getElementById("modalStatus");

  const installModal = document.getElementById("installModal");
  const installClose = document.getElementById("installClose");

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
  // Build UI (grouped symptom cards)
  // -------------------------
  function symptomCardHTML(sym, prefix) {
    // prefix makes IDs unique across checkin vs modal (e.g. "c" vs "m")
    return `
      <div class="symptom">
        <div class="symptom-top">
          <div class="symptom-name">${sym.label}</div>
          <div class="levelPill" id="${prefix}-pill-${sym.key}">None</div>
        </div>

        <div class="scale">
          <input type="range" min="0" max="3" step="1" value="0" data-${prefix}sym="${sym.key}" aria-label="${sym.label}">
          <div class="scale-val" id="${prefix}-val-${sym.key}">0 · None</div>
        </div>
      </div>
    `;
  }

  function groupHTML(group, prefix) {
    const cards = group.items.map(s => symptomCardHTML(s, prefix)).join("");
    return `
      <div class="group">
        <div class="group-head">
          <div>
            <div class="group-title">${group.title}</div>
            <div class="group-sub">${group.sub}</div>
          </div>
        </div>
        <div class="grid">${cards}</div>
      </div>
    `;
  }

  function buildGroups(container, prefix) {
    container.innerHTML = GROUPS.map(g => groupHTML(g, prefix)).join("");
  }

  // -------------------------
  // State
  // -------------------------
  const checkinState = Object.fromEntries(SYMPTOMS.map(s => [s.key, 0]));
  const modalState = Object.fromEntries(SYMPTOMS.map(s => [s.key, 0]));

  // -------------------------
  // Check-in events / helpers
  // -------------------------
  function updateCheckinScore() {
    scoreValue.textContent = String(sumScore(checkinState));
  }

  function setCheckinUI(entry) {
    const symptoms = entry?.symptoms || {};
    SYMPTOMS.forEach(s => {
      const v = clamp(Number(symptoms[s.key] ?? 0), 0, 3);
      checkinState[s.key] = v;

      const input = symptomGroups.querySelector(`input[data-csym="${s.key}"]`);
      const pill = document.getElementById(`c-pill-${s.key}`);
      const valEl = document.getElementById(`c-val-${s.key}`);

      if (input) input.value = String(v);
      if (pill) pill.textContent = levelLabel(v);
      if (valEl) valEl.textContent = `${v} · ${levelLabel(v)}`;
    });

    periodToday.checked = !!entry?.period;
    notes.value = entry?.notes || "";
    updateCheckinScore();
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
    await refreshAllLogsCache();
    refreshCalendar();
    refreshInsights();
    refreshReport();
  }

  function resetCheckinUI() {
    SYMPTOMS.forEach(s => {
      checkinState[s.key] = 0;
      const input = symptomGroups.querySelector(`input[data-csym="${s.key}"]`);
      const pill = document.getElementById(`c-pill-${s.key}`);
      const valEl = document.getElementById(`c-val-${s.key}`);

      if (input) input.value = "0";
      if (pill) pill.textContent = "None";
      if (valEl) valEl.textContent = "0 · None";
    });

    periodToday.checked = false;
    notes.value = "";
    scoreValue.textContent = "0";
    saveStatus.textContent = "Reset (not saved).";
  }

  // Live slider updates (check-in)
  function wireCheckinSliders() {
    symptomGroups.addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.type !== "range") return;

      const key = t.dataset.csym;
      if (!key) return;

      const v = clamp(Number(t.value), 0, 3);
      checkinState[key] = v;

      const pill = document.getElementById(`c-pill-${key}`);
      const valEl = document.getElementById(`c-val-${key}`);

      if (pill) pill.textContent = levelLabel(v);
      if (valEl) valEl.textContent = `${v} · ${levelLabel(v)}`;

      updateCheckinScore();
    });
  }

  // -------------------------
  // Calendar + cache
  // -------------------------
  let calCursor = new Date();
  let allLogsCache = [];

  async function refreshAllLogsCache() {
    allLogsCache = await getAllLogs();
    allLogsCache.sort((a,b) => a.date.localeCompare(b.date));
  }

  function populateShadeModeSelect() {
    calShadeMode.innerHTML = `
      <option value="score">Symptom Load</option>
      ${SYMPTOMS.map(s => `<option value="${s.key}">${s.label}</option>`).join("")}
    `;
  }

  async function refreshCalendar() {
    await refreshAllLogsCache();
    const map = new Map(allLogsCache.map(l => [l.date, l]));

    const monthStart = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
    const monthEnd = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 0);
    monthLabel.textContent = monthStart.toLocaleString(undefined, { month:"long", year:"numeric" });

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

      let bg = "rgba(15,17,24,.45)";
      if (entry) {
        if (shadeMode === "score") {
          bg = shadeForScore(Number(entry.score ?? sumScore(entry.symptoms))).bg;
        } else {
          bg = shadeForSymptom(Number(entry.symptoms?.[shadeMode] || 0)).bg;
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
  let modalDateISO = null;

  function updateModalScore() {
    modalScore.textContent = String(sumScore(modalState));
  }

  function setModalUI(entry) {
    const symptoms = entry?.symptoms || {};
    SYMPTOMS.forEach(s => {
      const v = clamp(Number(symptoms[s.key] ?? 0), 0, 3);
      modalState[s.key] = v;

      const input = modalSymptomGroups.querySelector(`input[data-msym="${s.key}"]`);
      const pill = document.getElementById(`m-pill-${s.key}`);
      const valEl = document.getElementById(`m-val-${s.key}`);

      if (input) input.value = String(v);
      if (pill) pill.textContent = levelLabel(v);
      if (valEl) valEl.textContent = `${v} · ${levelLabel(v)}`;
    });

    modalPeriod.checked = !!entry?.period;
    modalNotes.value = entry?.notes || "";
    updateModalScore();
  }

  function showModal(showDayModal, showInstallModal) {
    const showAny = !!(showDayModal || showInstallModal);
    modalBackdrop.hidden = !showAny;

    dayModal.hidden = !showDayModal;
    installModal.hidden = !showInstallModal;

    if (!showDayModal) {
      modalStatus.textContent = "";
      modalDateISO = null;
    }
  }

  async function openDayModal(dateISO) {
    modalDateISO = dateISO;
    modalSub.textContent = dateISO;

    const entry = await getLog(dateISO);
    setModalUI(entry);

    modalStatus.textContent = entry ? "Loaded entry." : "No entry yet. Add one and save.";
    showModal(true, false);
  }

  function wireModalSliders() {
    modalSymptomGroups.addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.type !== "range") return;

      const key = t.dataset.msym;
      if (!key) return;

      const v = clamp(Number(t.value), 0, 3);
      modalState[key] = v;

      const pill = document.getElementById(`m-pill-${key}`);
      const valEl = document.getElementById(`m-val-${key}`);

      if (pill) pill.textContent = levelLabel(v);
      if (valEl) valEl.textContent = `${v} · ${levelLabel(v)}`;

      updateModalScore();
    });
  }

  modalClose.addEventListener("click", () => showModal(false, false));
  modalBackdrop.addEventListener("click", () => showModal(false, false));

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

    await refreshAllLogsCache();
    refreshCalendar();
    refreshInsights();
    refreshReport();

    if (logDate.value === modalDateISO) await loadIntoCheckin(modalDateISO);
  });

  modalDelete.addEventListener("click", async () => {
    if (!modalDateISO) return;
    const ok = confirm(`Delete entry for ${modalDateISO}?`);
    if (!ok) return;

    await deleteLog(modalDateISO);
    modalStatus.textContent = "Deleted entry.";

    await refreshAllLogsCache();
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
      trendChart.innerHTML = "";
      return;
    }

    const sums = Object.fromEntries(SYMPTOMS.map(s => [s.key, 0]));
    last30.forEach(l => {
      SYMPTOMS.forEach(s => sums[s.key] += Number(l.symptoms?.[s.key] || 0));
    });

    const avgs = SYMPTOMS
      .map(s => ({ label: s.label, avg: sums[s.key] / last30.length }))
      .sort((a,b) => b.avg - a.avg);

    const top = avgs.slice(0, 6).filter(x => x.avg > 0);
    topSymptomsEl.innerHTML = top.length
      ? top.map(x => `<div class="card"><div class="card-k">${x.label}</div><div class="card-v">${format(x.avg, 2)}</div></div>`).join("")
      : `<div class="muted">All logged values are zero in the last 30 days.</div>`;

    renderTrendChart(last30);
  }

  function renderTrendChart(entries) {
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
    const max = 30, min = 0;

    const xs = (i) => pad + (i * (w - pad*2) / (series.length - 1));
    const ys = (v) => {
      const t = (v - min) / (max - min);
      return (h - pad) - t * (h - pad*2);
    };

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

    const circles = series.map((p,i) => {
      if (p.val === null) return "";
      const x = xs(i), y = ys(p.val);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.6" fill="rgba(184,146,42,.90)"/>`;
    }).join("");

    const grid = [0,10,20,30].map(v => {
      const y = ys(v);
      return `<line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="rgba(185,189,208,.18)" stroke-width="1" />`;
    }).join("");

    trendChart.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="160" aria-hidden="true">
        ${grid}
        <path d="${path}" fill="none" stroke="rgba(193,18,31,.78)" stroke-width="2.2" stroke-linecap="round"/>
        ${circles}
        <text x="${pad}" y="${pad}" fill="rgba(185,189,208,.70)" font-size="12">0</text>
        <text x="${pad}" y="${ys(10) - 6}" fill="rgba(185,189,208,.70)" font-size="12">10</text>
        <text x="${pad}" y="${ys(20) - 6}" fill="rgba(185,189,208,.70)" font-size="12">20</text>
        <text x="${pad}" y="${ys(30) - 6}" fill="rgba(185,189,208,.70)" font-size="12">30</text>
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

    const avgs = SYMPTOMS
      .map(s => ({ label: s.label, avg: sums[s.key] / entries }))
      .sort((a,b) => b.avg - a.avg);

    const top = avgs.slice(0, 8).filter(x => x.avg > 0);
    rTopSymptoms.innerHTML = top.length
      ? top.map(x => `<div class="card"><div class="card-k">${x.label}</div><div class="card-v">${format(x.avg, 2)}</div></div>`).join("")
      : `<div class="muted">No symptoms logged (all zeros) in this range.</div>`;

    // Cycle intervals (period starts)
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

    // Notes
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

  // Simple HTML escape for notes
  function escapeHTML(str) {
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  // -------------------------
  // Export / Import
  // -------------------------
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
    const headers = ["date","score","period","notes", ...SYMPTOMS.map(s => s.key)];

    const rows = allLogsCache.map(l => {
      const score = String(Number(l.score ?? sumScore(l.symptoms)) || 0);
      const period = l.period ? "1" : "0";
      const notes = `"${String(l.notes || "").replaceAll('"','""')}"`;
      const symVals = SYMPTOMS.map(s => String(Number(l.symptoms?.[s.key] || 0)));
      return [l.date, score, period, notes, ...symVals].join(",");
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
  // Offline badge
  // -------------------------
  function updateOfflineBadge() {
    offlineBadge.hidden = navigator.onLine;
  }
  window.addEventListener("online", updateOfflineBadge);
  window.addEventListener("offline", updateOfflineBadge);

  // -------------------------
  // Install help modal
  // -------------------------
  function openInstallModal() { showModal(false, true); }
  function closeInstallModal() { showModal(false, false); }

  installHelpBtn.addEventListener("click", openInstallModal);
  installClose.addEventListener("click", closeInstallModal);

  // -------------------------
  // Today button
  // -------------------------
  todayBtn.addEventListener("click", async () => {
    const iso = toISO(new Date());
    logDate.value = iso;
    await loadIntoCheckin(iso);

    calCursor = new Date();
    await refreshCalendar();

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
  // Report handlers
  // -------------------------
  reportRange.addEventListener("change", refreshReport);
  printBtn.addEventListener("click", () => window.print());

  // -------------------------
  // Service worker
  // -------------------------
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // -------------------------
  // Init
  // -------------------------
  async function init() {
    updateOfflineBadge();
    registerSW();

    // Build grouped UIs
    buildGroups(symptomGroups, "c");
    buildGroups(modalSymptomGroups, "m");

    wireCheckinSliders();
    wireModalSliders();

    populateShadeModeSelect();

    const today = toISO(new Date());
    logDate.value = today;
    await loadIntoCheckin(today);

    await refreshAllLogsCache();
    await refreshCalendar();
    await refreshInsights();
    await refreshReport();
  }

  init();
})();
