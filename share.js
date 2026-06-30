"use strict";
/* =======================================================================
   PARTAGE ENTRE APPAREILS — façon SARIC, via GitHub (sans Firebase)
   - Écrit l'état dans un fichier JSON du dépôt (API GitHub + jeton PAT)
   - Le relit à chaque ouverture + rafraîchissement automatique
   - Fusionne les données (aucune prise/couche perdue si saisie simultanée)
   Le jeton n'est JAMAIS écrit dans le dépôt : il reste sur l'appareil.
   ======================================================================= */
(function () {
  const C = window.AGATHE_CONFIG || {};
  const OWNER = C.GITHUB_OWNER, REPO = C.GITHUB_REPO;
  const BRANCH = C.GITHUB_BRANCH || "main";
  const PATH = C.GITHUB_PATH || "agathe.json";
  const configured = !!(OWNER && REPO && OWNER !== "VOTRE_PSEUDO" && REPO !== "VOTRE_DEPOT");
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(PATH)}`;
  const TOKKEY = "agathe.ghtoken";

  const Share = { ready: false, token: null, sha: null, localTs: 0, pushing: false, pulling: false };
  window.Share = Share;
  window.Sync = { onLocalSave: onLocalSave };

  const $ = id => document.getElementById(id);
  function setStatus(t) { const e = $("syncStatus"); if (e) e.textContent = t; }
  function hm() { const d = new Date(); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function deviceId() { let d = localStorage.getItem("agathe.device"); if (!d) { d = Math.random().toString(36).slice(2, 8); localStorage.setItem("agathe.device", d); } return d; }

  function strToB64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64ToStr(b) { return decodeURIComponent(escape(atob((b || "").replace(/\s/g, "")))); }
  function ghHeaders(json) {
    const h = { "Authorization": "token " + Share.token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  async function apiGet() {
    const res = await fetch(API + "?ref=" + encodeURIComponent(BRANCH) + "&ts=" + Date.now(), { headers: ghHeaders(), cache: "no-store" });
    if (res.status === 404) return { sha: null, data: null };
    if (!res.ok) throw new Error("GET " + res.status);
    const j = await res.json();
    let parsed = null;
    try { parsed = JSON.parse(b64ToStr(j.content)); } catch (_) { parsed = null; }
    return { sha: j.sha, data: parsed };
  }

  async function apiPut(stateObj, sha) {
    const payload = { data: stateObj, updated_at: new Date().toISOString(), device: deviceId() };
    const body = { message: "Agathe — màj " + new Date().toISOString(), content: strToB64(JSON.stringify(payload, null, 2)), branch: BRANCH };
    if (sha) body.sha = sha;
    const res = await fetch(API, { method: "PUT", headers: ghHeaders(true), body: JSON.stringify(body) });
    if (res.status === 409 || res.status === 422) { const err = new Error("conflict"); err.conflict = true; throw err; }
    if (!res.ok) throw new Error("PUT " + res.status + " " + (await res.text()));
    const j = await res.json();
    Share.sha = j.content && j.content.sha;
  }

  /* ---------- Fusion des états (aucune perte de données) ---------- */
  function mergeArray(a, b, keyFn) {
    const map = new Map();
    (a || []).forEach(x => map.set(keyFn(x), x));
    (b || []).forEach(x => { const k = keyFn(x); if (!map.has(k)) map.set(k, x); });
    return Array.from(map.values());
  }
  function mergeByDate(a, b, sigFn) {
    const out = {}; const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach(d => { out[d] = mergeArray((a || {})[d], (b || {})[d], sigFn); });
    return out;
  }
  function mergeDiapers(a, b) {
    const out = {}; const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach(d => {
      const x = (a || {})[d] || {}, y = (b || {})[d] || {};
      out[d] = { couche: Math.max(x.couche || 0, y.couche || 0), pipi: Math.max(x.pipi || 0, y.pipi || 0), caca: Math.max(x.caca || 0, y.caca || 0) };
    });
    return out;
  }
  function mergeLog(a, b) {
    const out = {}; const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach(d => { out[d] = Object.assign({}, (a || {})[d], (b || {})[d]); });
    return out;
  }
  function mergeData(L, R, lt, rt) {
    const newerLocal = (lt || 0) >= (rt || 0);
    const base = JSON.parse(JSON.stringify(newerLocal ? L : R)); // scalaires (prénom, réglages, contacts) du plus récent
    base.feeds = mergeByDate(L.feeds, R.feeds, f => `${f.time}|${f.who}|${f.maternel}|${f.gallia}|${f.tirage ? 1 : 0}`);
    base.events = mergeByDate(L.events, R.events, e => `${e.time}|${e.type}|${e.label}`);
    base.measures = mergeArray(L.measures, R.measures, m => `${m.date}|${m.poids}|${m.taille}|${m.pc}`);
    base.treatments = mergeArray(L.treatments, R.treatments, t => t.id);
    base.diapers = mergeDiapers(L.diapers, R.diapers);
    base.treatmentLog = mergeLog(L.treatmentLog, R.treatmentLog);
    return base;
  }

  /* ---------- Cycle lecture / écriture ---------- */
  let pushTimer = null;
  function onLocalSave() {
    if (!Share.ready) return;
    Share.localTs = Date.now();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => syncPush(0), 1200);
  }

  async function syncPush(tries) {
    if (!Share.ready) return;
    if (Share.pushing || Share.pulling) { clearTimeout(pushTimer); pushTimer = setTimeout(() => syncPush(0), 800); return; }
    Share.pushing = true;
    try {
      const got = await apiGet();
      const local = window.AgatheApp.getState();
      const remoteData = got.data && got.data.data;
      const remoteTs = got.data ? (Date.parse(got.data.updated_at || 0) || 0) : 0;
      const merged = remoteData ? mergeData(local, remoteData, Share.localTs, remoteTs) : local;
      await apiPut(merged, got.sha);
      window.AgatheApp.applyRemoteState(merged);
      setStatus("Partagé ✓ " + hm());
    } catch (e) {
      if (e && e.conflict && (tries || 0) < 3) { Share.pushing = false; return syncPush((tries || 0) + 1); }
      console.warn(e); setStatus("Échec d'enregistrement partagé — vérifiez le jeton (réglages).");
    } finally { Share.pushing = false; }
  }

  async function syncPull() {
    if (!Share.ready || Share.pushing || Share.pulling) return;
    Share.pulling = true;
    try {
      const got = await apiGet();
      Share.sha = got.sha;
      if (got.data && got.data.data) {
        const local = window.AgatheApp.getState();
        const remoteTs = Date.parse(got.data.updated_at || 0) || 0;
        const merged = mergeData(local, got.data.data, Share.localTs, remoteTs);
        if (JSON.stringify(merged) !== JSON.stringify(local)) {
          window.AgatheApp.applyRemoteState(merged);
          setStatus("À jour ✓ " + hm());
        } else {
          setStatus("Partage actif ✓ " + hm());
        }
      }
    } catch (e) { console.warn(e); }
    finally { Share.pulling = false; }
  }

  let pollTimer = null;
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(syncPull, 20000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) syncPull(); });
  }

  async function enableShare(token) {
    if (!configured) { setStatus("Configurez GITHUB_OWNER / GITHUB_REPO dans config.js (voir README)."); return; }
    if (token) localStorage.setItem(TOKKEY, token.trim());
    Share.token = localStorage.getItem(TOKKEY);
    if (!Share.token) { setStatus("Collez votre jeton GitHub puis « Activer le partage »."); return; }
    Share.ready = true;
    setStatus("Connexion à GitHub…");
    await syncPull();
    if (!Share.sha) await syncPush(0); // crée le fichier s'il n'existe pas encore
    startPolling();
  }
  Share.enableShare = enableShare;
  Share.pull = syncPull;

  function wireUI() {
    const tok = $("ghToken"); if (tok) tok.value = localStorage.getItem(TOKKEY) || "";
    const b1 = $("btnShare"); if (b1) b1.addEventListener("click", () => enableShare((($("ghToken").value) || "").trim()));
    const b2 = $("btnPull"); if (b2) b2.addEventListener("click", syncPull);
    if (!configured) { setStatus("Partage : à configurer (config.js + README)."); return; }
    if (localStorage.getItem(TOKKEY)) enableShare(); // ouverture : charge automatiquement les données partagées
    else setStatus("Collez votre jeton GitHub puis « Activer le partage ».");
  }
  if (document.readyState !== "loading") wireUI();
  else document.addEventListener("DOMContentLoaded", wireUI);
})();
