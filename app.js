"use strict";

/* ---------- Persistance ---------- */
const KEY = "agathe.v1";

const DEFAULTS = {
  baby: { name: "Agathe", birth: "2026-06-26" },
  settings: {
    startHour: 8, intervalH: 3, volume: 50, assignStart: "A",
    recal: true, reminder: false, sound: "berceuse", spotify: "", theme: "light"
  },
  contacts: { pedName: "", pedTel: "", sageName: "", sageTel: "" },
  feeds: {},        // { "YYYY-MM-DD": [ {time,who,maternel,gallia,tirage} ] }
  diapers: {},      // { "YYYY-MM-DD": {couche,pipi,caca} }
  measures: [],     // [ {date,poids,taille,pc} ]
  treatments: [
    { id: "vitd", name: "Vitamine D", dose: "3 gouttes", freq: "1×/jour", moment: "Matin", durationDays: null, untilMonths: 18 }
  ],
  treatmentLog: {}, // { "YYYY-MM-DD": { id:true } }
  events: {}        // { "YYYY-MM-DD": [ {label,type,time} ] }
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    const data = JSON.parse(raw);
    return deepMerge(clone(DEFAULTS), data);
  } catch (e) { return clone(DEFAULTS); }
}
function deepMerge(base, over) {
  for (const k in over) {
    if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) && typeof base[k] === "object" && !Array.isArray(base[k])) {
      deepMerge(base[k], over[k]);
    } else { base[k] = over[k]; }
  }
  return base;
}
let state = load();
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

/* ---------- Utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const pad = n => String(n).padStart(2, "0");
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
function dateKey(d = new Date()) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function nowHM() { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function toMin(hm) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }
function minToHM(t) { t = ((t % 1440) + 1440) % 1440; return pad(Math.floor(t / 60)) + ":" + pad(t % 60); }
const other = w => (w === "A" ? "C" : "A");
const FR_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function ageText() {
  const b = new Date(state.baby.birth + "T00:00:00");
  const now = new Date();
  const days = Math.max(0, Math.floor((now - b) / 86400000));
  let label;
  if (days <= 14) label = days + (days <= 1 ? " jour" : " jours");
  else if (days < 61) { const w = Math.floor(days / 7); label = w + " semaines"; }
  else {
    let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
    if (now.getDate() < b.getDate()) months--;
    label = months + " mois";
  }
  const bd = b.getDate() + " " + FR_MONTHS[b.getMonth()] + " " + b.getFullYear();
  return label + " · née le " + bd;
}

/* ---------- Navigation onglets ---------- */
$$(".tab").forEach(t => t.addEventListener("click", () => {
  $$(".tab").forEach(x => x.classList.remove("is-active"));
  $$(".page").forEach(p => p.classList.remove("is-active"));
  t.classList.add("is-active");
  $("#page-" + t.dataset.page).classList.add("is-active");
}));

/* ---------- Mode nuit ---------- */
function applyTheme() {
  document.body.classList.toggle("dark", state.settings.theme === "dark");
  $("#darkBtn").innerHTML = '<i class="ti ti-' + (state.settings.theme === "dark" ? "sun" : "moon") + '"></i>';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", state.settings.theme === "dark" ? "#241D17" : "#BE6E4F");
}
$("#darkBtn").addEventListener("click", () => {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  save(); applyTheme();
});

/* ---------- Planning biberons ---------- */
function planForToday() {
  const d = dateKey();
  const s = state.settings;
  const feeds = (state.feeds[d] || []).slice().sort((a, b) => toMin(a.time) - toMin(b.time));
  const slots = [];
  feeds.forEach(f => slots.push({
    time: f.time, who: f.who, vol: num(f.maternel) + num(f.gallia), done: true, tirage: !!f.tirage
  }));

  let who, anchor;
  if (feeds.length && s.recal) {
    who = other(feeds[feeds.length - 1].who);
    anchor = toMin(feeds[feeds.length - 1].time) + s.intervalH * 60;
  } else if (feeds.length) {
    // grille fixe : prochain créneau de la grille après la dernière prise
    const grid = baseGrid();
    const last = toMin(feeds[feeds.length - 1].time);
    const nextIdx = grid.findIndex(g => g.min > last);
    if (nextIdx === -1) return slots;
    anchor = grid[nextIdx].min; who = grid[nextIdx].who;
  } else {
    who = s.assignStart; anchor = s.startHour * 60;
  }

  const end = s.startHour * 60 + 1440;
  let t = anchor, guard = 0;
  while (t < end && guard < 16) {
    slots.push({ time: minToHM(t), who, vol: s.volume, done: false });
    who = other(who); t += s.intervalH * 60; guard++;
  }
  return slots;
}
function baseGrid() {
  const s = state.settings, out = []; let who = s.assignStart, t = s.startHour * 60, g = 0;
  while (g < Math.ceil(24 / s.intervalH)) { out.push({ min: t, who }); who = other(who); t += s.intervalH * 60; g++; }
  return out;
}
function nextSlot() { return planForToday().find(s => !s.done) || null; }

function renderPlan() {
  const list = $("#planList"); list.innerHTML = "";
  const slots = planForToday();
  const nowM = toMin(nowHM());
  let markedNext = false;
  slots.forEach(s => {
    const div = document.createElement("div");
    div.className = "slot" + (s.done ? " done" : "");
    if (!s.done && !markedNext && toMin(s.time) >= nowM - 1) { div.classList.add("next"); markedNext = true; }
    div.innerHTML =
      '<span class="meta">' + (s.done ? '<i class="ti ti-check" style="color:var(--sage)"></i> ' : "") +
      s.time + ' · ' + Math.round(s.vol) + ' mL' + (s.tirage ? ' <i class="ti ti-droplet" title="tirage"></i>' : '') + '</span>' +
      '<span class="badge ' + s.who + '">' + s.who + '</span>';
    list.appendChild(div);
  });
  // pré-remplir "par qui" sur le prochain prévu
  const nx = nextSlot();
  if (nx) setWho(nx.who);
  renderFeedSummary();
}
function renderFeedSummary() {
  const feeds = state.feeds[dateKey()] || [];
  const total = feeds.reduce((a, f) => a + num(f.maternel) + num(f.gallia), 0);
  $("#feedSummary").textContent = feeds.length
    ? "Aujourd'hui : " + Math.round(total) + " mL · " + feeds.length + (feeds.length > 1 ? " prises" : " prise")
    : "Aucune prise enregistrée aujourd'hui";
}

/* who toggle */
function setWho(w) { $$("#whoTog button").forEach(b => b.classList.toggle("is-on", b.dataset.who === w)); }
$$("#whoTog button").forEach(b => b.addEventListener("click", () => setWho(b.dataset.who)));
function getWho() { return ($("#whoTog button.is-on") || {}).dataset?.who || "A"; }

/* tirage toggle */
$("#tirageBtn").addEventListener("click", () => $("#tirageBtn").classList.toggle("is-on"));

/* validation prise */
$("#validateFeed").addEventListener("click", () => {
  const d = dateKey();
  if (!state.feeds[d]) state.feeds[d] = [];
  state.feeds[d].push({
    time: nowHM(), who: getWho(),
    maternel: num($("#inMaternel").value), gallia: num($("#inGallia").value),
    tirage: $("#tirageBtn").classList.contains("is-on")
  });
  save();
  $("#inMaternel").value = ""; $("#inGallia").value = "";
  $("#tirageBtn").classList.remove("is-on");
  renderPlan(); scheduleReminder();
});

/* heure auto affichée + maj chaque minute */
function tickTime() { $("#feedTime").textContent = nowHM(); }

/* ---------- Couches ---------- */
function diapers() { const d = dateKey(); return state.diapers[d] || (state.diapers[d] = { couche: 0, pipi: 0, caca: 0 }); }
function renderDiapers() { const dd = diapers(); $$(".io").forEach(b => { $(".cnt", b).textContent = dd[b.dataset.diaper] || 0; }); }
$$(".io").forEach(btn => {
  let timer = null, longPress = false;
  const change = delta => {
    const dd = diapers(); const k = btn.dataset.diaper;
    dd[k] = Math.max(0, (dd[k] || 0) + delta); save(); renderDiapers();
  };
  btn.addEventListener("click", () => { if (!longPress) change(1); longPress = false; });
  const start = () => { longPress = false; timer = setTimeout(() => { longPress = true; change(-1); }, 550); };
  const cancel = () => clearTimeout(timer);
  btn.addEventListener("touchstart", start, { passive: true });
  btn.addEventListener("touchend", cancel);
  btn.addEventListener("mousedown", start);
  btn.addEventListener("mouseup", cancel);
  btn.addEventListener("mouseleave", cancel);
});

/* ---------- Physionomie + courbe ---------- */
const WHO_M = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WHO_P3 = [2.4, 3.2, 4.0, 4.5, 5.0, 5.4, 5.7, 6.0, 6.3, 6.5, 6.7, 6.9, 7.0];
const WHO_P50 = [3.2, 4.2, 5.1, 5.8, 6.4, 6.9, 7.3, 7.6, 7.9, 8.2, 8.5, 8.7, 8.9];
const WHO_P97 = [4.2, 5.5, 6.6, 7.5, 8.2, 8.8, 9.3, 9.8, 10.2, 10.5, 10.9, 11.2, 11.5];

function ageMonthsAt(dateStr) {
  const b = new Date(state.baby.birth + "T00:00:00");
  const d = new Date(dateStr + "T00:00:00");
  return Math.max(0, (d - b) / (86400000 * 30.4375));
}
function renderGrowth() {
  const W = 320, H = 170, padL = 28, padR = 12, padT = 8, padB = 22;
  const xMin = 0, xMax = 12, yMin = 2, yMax = 12;
  const X = m => padL + (Math.min(Math.max(m, xMin), xMax) - xMin) / (xMax - xMin) * (W - padL - padR);
  const Y = k => H - padB - (Math.min(Math.max(k, yMin), yMax) - yMin) / (yMax - yMin) * (H - padT - padB);
  const path = arr => arr.map((v, i) => (i ? "L" : "M") + X(WHO_M[i]).toFixed(1) + "," + Y(v).toFixed(1)).join(" ");
  const pts = state.measures.filter(m => m.poids != null && num(m.poids) > 0)
    .map(m => ({ x: X(ageMonthsAt(m.date)), y: Y(num(m.poids)) }));
  let dots = pts.map(p => '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.4" fill="var(--terra)"/>').join("");
  let line = pts.length > 1 ? '<polyline points="' + pts.map(p => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ") + '" fill="none" stroke="var(--terra)" stroke-width="1.4"/>' : "";
  $("#growthChart").innerHTML =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%" role="img" aria-label="Courbe de poids">' +
    '<rect x="' + padL + '" y="' + padT + '" width="' + (W - padL - padR) + '" height="' + (H - padT - padB) + '" fill="var(--field)" stroke="var(--line)"/>' +
    '<path d="' + path(WHO_P3) + '" fill="none" stroke="#D8C3AE" stroke-width="1.2"/>' +
    '<path d="' + path(WHO_P50) + '" fill="none" stroke="var(--terra)" stroke-width="1.6" stroke-dasharray="1 0"/>' +
    '<path d="' + path(WHO_P97) + '" fill="none" stroke="#D8C3AE" stroke-width="1.2"/>' +
    line + dots +
    '<text x="' + (W - padR) + '" y="' + (Y(WHO_P3[12]) + 3) + '" font-size="9" text-anchor="end" style="fill:var(--ink2)">P3</text>' +
    '<text x="' + (W - padR) + '" y="' + (Y(WHO_P50[12]) - 2) + '" font-size="9" text-anchor="end" style="fill:var(--terraD)">P50</text>' +
    '<text x="' + (W - padR) + '" y="' + (Y(WHO_P97[12]) - 2) + '" font-size="9" text-anchor="end" style="fill:var(--ink2)">P97</text>' +
    '<text x="' + padL + '" y="' + (H - 6) + '" font-size="9" style="fill:var(--ink2)">0 mois</text>' +
    '<text x="' + (W - padR) + '" y="' + (H - 6) + '" font-size="9" text-anchor="end" style="fill:var(--ink2)">12 mois</text>' +
    '</svg>';
}
function renderMeasures() {
  const el = $("#measureList");
  if (!state.measures.length) { el.innerHTML = '<div class="empty">Aucune mesure.</div>'; return; }
  el.innerHTML = state.measures.slice().sort((a, b) => b.date.localeCompare(a.date)).map((m, i) => {
    const real = state.measures.indexOf(m);
    return '<div class="li"><span>' + frDate(m.date) + ' · ' +
      (m.poids ? num(m.poids).toFixed(2) + " kg " : "") + (m.taille ? "· " + m.taille + " cm " : "") + (m.pc ? "· PC " + m.pc : "") +
      '</span><button class="x" data-mi="' + real + '" aria-label="Supprimer"><i class="ti ti-trash"></i></button></div>';
  }).join("");
  $$("#measureList .x").forEach(b => b.addEventListener("click", () => {
    state.measures.splice(+b.dataset.mi, 1); save(); renderMeasures(); renderGrowth();
  }));
}
function frDate(s) { const d = new Date(s + "T00:00:00"); return d.getDate() + " " + FR_MONTHS[d.getMonth()].slice(0, 4) + "."; }
$("#addMeasure").addEventListener("click", () => {
  const poids = $("#inPoids").value, taille = $("#inTaille").value, pc = $("#inPC").value;
  if (!poids && !taille && !pc) return;
  state.measures.push({ date: dateKey(), poids: poids ? num(poids) : null, taille: taille || null, pc: pc || null });
  save(); $("#inPoids").value = $("#inTaille").value = $("#inPC").value = "";
  renderMeasures(); renderGrowth();
});

/* ---------- Traitements ---------- */
function renderTreatments() {
  const log = state.treatmentLog[dateKey()] || {};
  $("#treatList").innerHTML = state.treatments.map(tr => {
    let dur = tr.untilMonths ? "jusqu'à " + tr.untilMonths + " mois" : (tr.durationDays ? "pendant " + tr.durationDays + " j" : "illimité");
    const given = !!log[tr.id];
    return '<div class="tr' + (given ? " given" : "") + '">' +
      '<div class="between"><span class="t"><i class="ti ti-pill"></i> ' + esc(tr.name) + '</span>' +
      '<button class="link" data-del="' + tr.id + '"><i class="ti ti-trash"></i></button></div>' +
      '<div class="sub" style="margin-top:3px">' + esc(tr.dose) + ' · ' + esc(tr.freq) + ' · ' + esc(tr.moment) + ' · ' + dur + '</div>' +
      '<button class="btn ghost full" data-give="' + tr.id + '" style="margin-top:8px"><i class="ti ti-' + (given ? "circle-check" : "circle") + '"></i> ' + (given ? "Donné aujourd'hui" : "Marquer comme donné") + '</button>' +
      '</div>';
  }).join("");
  $$("#treatList [data-give]").forEach(b => b.addEventListener("click", () => {
    const d = dateKey(); if (!state.treatmentLog[d]) state.treatmentLog[d] = {};
    state.treatmentLog[d][b.dataset.give] = !state.treatmentLog[d][b.dataset.give];
    save(); renderTreatments();
  }));
  $$("#treatList [data-del]").forEach(b => b.addEventListener("click", () => {
    state.treatments = state.treatments.filter(t => t.id !== b.dataset.del); save(); renderTreatments();
  }));
}
$$("#trDurTog button").forEach(b => b.addEventListener("click", () => {
  $$("#trDurTog button").forEach(x => x.classList.remove("is-on"));
  b.classList.add("is-on");
  $("#trDays").classList.toggle("hide", b.dataset.dur !== "days");
}));
$("#addTreatment").addEventListener("click", () => {
  const name = $("#trName").value.trim(); if (!name) return;
  const days = $("#trDurTog .is-on").dataset.dur === "days" ? (parseInt($("#trDays").value, 10) || null) : null;
  state.treatments.push({
    id: "t" + Date.now(), name, dose: $("#trDose").value.trim() || "—",
    freq: $("#trFreq").value, moment: $("#trMoment").value, durationDays: days, untilMonths: null
  });
  save();
  $("#trName").value = ""; $("#trDose").value = ""; $("#trDays").value = "";
  renderTreatments();
});

/* ---------- Planning / calendrier ---------- */
let calRef = new Date();
const EVT_COLOR = { rdv: "var(--rose)", sage: "var(--sage)", vaccin: "var(--blue)", autre: "var(--brown)" };
const EVT_ICON = { rdv: "ti-stethoscope", sage: "ti-mother", vaccin: "ti-vaccine", autre: "ti-calendar-event" };

function renderCalendar() {
  const y = calRef.getFullYear(), m = calRef.getMonth();
  $("#calTitle").textContent = FR_MONTHS[m].charAt(0).toUpperCase() + FR_MONTHS[m].slice(1) + " " + y;
  const grid = $("#calGrid"); grid.innerHTML = "";
  ["L", "M", "M", "J", "V", "S", "D"].forEach(h => grid.insertAdjacentHTML("beforeend", '<div class="c head">' + h + '</div>'));
  const first = new Date(y, m, 1);
  let lead = (first.getDay() + 6) % 7; // lundi=0
  for (let i = 0; i < lead; i++) grid.insertAdjacentHTML("beforeend", '<div class="c empty"></div>');
  const days = new Date(y, m + 1, 0).getDate();
  const todayK = dateKey();
  for (let d = 1; d <= days; d++) {
    const key = y + "-" + pad(m + 1) + "-" + pad(d);
    const evs = state.events[key] || [];
    const dots = evs.slice(0, 3).map(e => '<i style="background:' + (EVT_COLOR[e.type] || EVT_COLOR.autre) + '"></i>').join("");
    const cls = "c" + (key === todayK ? " today" : "") + (key === selectedDay ? " sel" : "");
    grid.insertAdjacentHTML("beforeend",
      '<div class="' + cls + '" data-day="' + key + '">' + d + (dots ? '<span class="ev">' + dots + '</span>' : '') + '</div>');
  }
  $$("#calGrid .c[data-day]").forEach(c => c.addEventListener("click", () => {
    selectedDay = c.dataset.day; $("#evtDate").value = selectedDay; renderCalendar();
  }));
}
let selectedDay = null;
$("#calPrev").addEventListener("click", () => { calRef.setMonth(calRef.getMonth() - 1); renderCalendar(); });
$("#calNext").addEventListener("click", () => { calRef.setMonth(calRef.getMonth() + 1); renderCalendar(); });

function renderTodayEvents() {
  const evs = (state.events[dateKey()] || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const el = $("#todayEvents");
  if (!evs.length) { el.innerHTML = '<div class="empty">Rien de prévu aujourd\'hui.</div>'; return; }
  el.innerHTML = evs.map((e, i) =>
    '<div class="li"><span><span class="dot" style="background:' + (EVT_COLOR[e.type] || EVT_COLOR.autre) + '"><i class="ti ' + (EVT_ICON[e.type] || EVT_ICON.autre) + '" style="font-size:12px"></i></span> ' +
    (e.time ? e.time + " · " : "") + esc(e.label) + '</span>' +
    '<button class="x" data-et="' + i + '"><i class="ti ti-trash"></i></button></div>'
  ).join("");
  $$("#todayEvents .x").forEach(b => b.addEventListener("click", () => {
    state.events[dateKey()].splice(+b.dataset.et, 1); save(); renderTodayEvents(); renderCalendar();
  }));
}
$("#addEvent").addEventListener("click", () => {
  const date = $("#evtDate").value || dateKey();
  const label = $("#evtLabel").value.trim(); if (!label) return;
  if (!state.events[date]) state.events[date] = [];
  state.events[date].push({ label, type: $("#evtType").value, time: $("#evtTime").value || "" });
  save();
  $("#evtLabel").value = ""; $("#evtTime").value = "";
  renderCalendar(); renderTodayEvents();
});

/* ---------- Contacts / urgence ---------- */
function renderContacts() {
  const c = state.contacts;
  $("#cPedName").value = c.pedName; $("#cPedTel").value = c.pedTel;
  $("#cSageName").value = c.sageName; $("#cSageTel").value = c.sageTel;
  $("#pedName").textContent = c.pedName || "Pédiatre";
  $("#pedTel").textContent = c.pedTel || "à renseigner dans les réglages";
  $("#telPediatre").setAttribute("href", c.pedTel ? "tel:" + c.pedTel.replace(/\s/g, "") : "#");
  $("#sageName").textContent = c.sageName || "Sage-femme";
  $("#sageTel").textContent = c.sageTel || "à renseigner dans les réglages";
  $("#telSage").setAttribute("href", c.sageTel ? "tel:" + c.sageTel.replace(/\s/g, "") : "#");
}
$("#saveContacts").addEventListener("click", () => {
  state.contacts = {
    pedName: $("#cPedName").value.trim(), pedTel: $("#cPedTel").value.trim(),
    sageName: $("#cSageName").value.trim(), sageTel: $("#cSageTel").value.trim()
  };
  save(); renderContacts();
});

/* ---------- Réglages ---------- */
$("#openSettings").addEventListener("click", () => $("#settingsPanel").classList.toggle("hide"));
function fillSettings() {
  const s = state.settings;
  $("#setName").value = state.baby.name; $("#setBirth").value = state.baby.birth;
  $("#setStart").value = s.startHour; $("#setInterval").value = s.intervalH;
  $("#setVolume").value = s.volume; $("#setAssign").value = s.assignStart;
  $("#setRecal").checked = s.recal; $("#setReminder").checked = s.reminder;
  $("#setSound").value = s.sound; $("#setSpotify").value = s.spotify;
}
$("#saveSettings").addEventListener("click", () => {
  state.baby.name = $("#setName").value.trim() || "Bébé";
  state.baby.birth = $("#setBirth").value || state.baby.birth;
  const s = state.settings;
  s.startHour = Math.min(23, Math.max(0, parseInt($("#setStart").value, 10) || 8));
  s.intervalH = Math.max(0.5, num($("#setInterval").value) || 3);
  s.volume = Math.max(0, parseInt($("#setVolume").value, 10) || 0);
  s.assignStart = $("#setAssign").value;
  s.recal = $("#setRecal").checked; s.reminder = $("#setReminder").checked;
  s.sound = $("#setSound").value; s.spotify = $("#setSpotify").value.trim();
  save();
  $("#babyName").textContent = state.baby.name;
  $("#babyAge").textContent = ageText();
  $("#settingsPanel").classList.add("hide");
  renderPlan(); scheduleReminder();
  if (s.reminder) requestNotif();
});

/* ---------- Rappel + berceuse ---------- */
let audioCtx = null;
function lullaby() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const notes = [523.25, 587.33, 659.25, 587.33, 523.25, 659.25, 783.99, 659.25, 587.33, 523.25];
    const t0 = audioCtx.currentTime;
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
      const st = t0 + i * 0.42;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.16, st + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0008, st + 0.4);
      o.start(st); o.stop(st + 0.42);
    });
  } catch (e) { }
}
$("#testSound").addEventListener("click", () => {
  if (state.settings.sound === "spotify" && state.settings.spotify) window.open(state.settings.spotify, "_blank");
  else lullaby();
});
function requestNotif() {
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
}
let reminderTimer = null;
function scheduleReminder() {
  if (reminderTimer) clearTimeout(reminderTimer);
  if (!state.settings.reminder) return;
  const nx = nextSlot(); if (!nx) return;
  const now = new Date();
  const target = new Date(); const [h, m] = nx.time.split(":").map(Number);
  target.setHours(h, m, 0, 0);
  if (target <= now) return;
  const ms = target - now;
  if (ms > 2 ** 31 - 1) return;
  reminderTimer = setTimeout(() => {
    fireReminder(nx);
    scheduleReminder();
  }, ms);
}
function fireReminder(slot) {
  const who = slot.who === "A" ? "Antoine" : "Célia";
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification("Biberon d'" + state.baby.name, { body: slot.time + " · " + Math.round(slot.vol) + " mL · " + who, icon: "icons/icon-192.png" }); } catch (e) { }
  }
  if (state.settings.sound === "spotify" && state.settings.spotify) { try { window.open(state.settings.spotify, "_blank"); } catch (e) { lullaby(); } }
  else lullaby();
}

/* ---------- Export PDF ---------- */
$$("#exportTog button").forEach(b => b.addEventListener("click", () => {
  $$("#exportTog button").forEach(x => x.classList.remove("is-on")); b.classList.add("is-on");
}));
$("#exportPdf").addEventListener("click", () => {
  const range = $("#exportTog .is-on").dataset.range;
  buildPrint(range); window.print();
});
function dateRange(range) {
  const end = new Date(); const start = new Date();
  if (range === "week") start.setDate(end.getDate() - 6);
  else start.setDate(1);
  const out = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(dateKey(new Date(d)));
  return out;
}
function buildPrint(range) {
  const days = dateRange(range);
  let rows = days.map(k => {
    const f = state.feeds[k] || []; const total = f.reduce((a, x) => a + num(x.maternel) + num(x.gallia), 0);
    const dd = state.diapers[k] || { couche: 0, pipi: 0, caca: 0 };
    return "<tr><td>" + frDateFull(k) + "</td><td>" + f.length + "</td><td>" + Math.round(total) + " mL</td><td>" +
      (dd.couche || 0) + " / " + (dd.pipi || 0) + " / " + (dd.caca || 0) + "</td></tr>";
  }).join("");
  const meas = state.measures.filter(m => days.includes(m.date))
    .map(m => "<tr><td>" + frDateFull(m.date) + "</td><td>" + (m.poids ? num(m.poids).toFixed(2) + " kg" : "—") + "</td><td>" + (m.taille || "—") + "</td><td>" + (m.pc || "—") + "</td></tr>").join("");
  const evs = days.flatMap(k => (state.events[k] || []).map(e => "<tr><td>" + frDateFull(k) + "</td><td>" + (e.time || "") + "</td><td>" + esc(e.label) + "</td></tr>")).join("");
  $("#printArea").innerHTML =
    "<h2>" + esc(state.baby.name) + " — récapitulatif (" + (range === "week" ? "semaine" : "mois") + ")</h2>" +
    "<div>" + frDateFull(days[0]) + " → " + frDateFull(days[days.length - 1]) + "</div>" +
    "<h3>Biberons & couches (couche / pipi / selle)</h3>" +
    "<table><tr><th>Jour</th><th>Prises</th><th>Volume</th><th>Couches</th></tr>" + rows + "</table>" +
    "<h3>Mesures</h3>" + (meas ? "<table><tr><th>Jour</th><th>Poids</th><th>Taille</th><th>P. crânien</th></tr>" + meas + "</table>" : "<div>—</div>") +
    "<h3>Rendez-vous</h3>" + (evs ? "<table><tr><th>Jour</th><th>Heure</th><th>Intitulé</th></tr>" + evs + "</table>" : "<div>—</div>");
}
function frDateFull(s) { const d = new Date(s + "T00:00:00"); return d.getDate() + " " + FR_MONTHS[d.getMonth()] + " " + d.getFullYear(); }

/* ---------- divers ---------- */
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ---------- init ---------- */
function init() {
  applyTheme();
  $("#babyName").textContent = state.baby.name;
  $("#babyAge").textContent = ageText();
  $("#evtDate").value = dateKey();
  $("#evtTime").value = "";
  fillSettings();
  renderPlan();
  renderDiapers();
  renderGrowth();
  renderMeasures();
  renderTreatments();
  renderCalendar();
  renderTodayEvents();
  renderContacts();
  tickTime();
  setInterval(() => { tickTime(); }, 30000);
  scheduleReminder();
  if (state.settings.reminder) requestNotif();
}
init();

/* ---------- Service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { }));
}
