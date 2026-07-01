"use strict";
/* =======================================================================
   ENREGISTREMENT EN LIGNE — façon SARIC (Google Apps Script, sans jeton)
   - Ouverture : lit le fichier en ligne (version unique pour tous)
   - Modification : POST qui ÉCRASE la version précédente
   Pas d'activation, pas de partage à gérer : c'est automatique.
   ======================================================================= */
(function () {
  const C = window.AGATHE_CONFIG || {};
  const URL_ = (C.SAVE_URL || "").trim();
  const configured = URL_.indexOf("script.google.com") !== -1;

  const Store = { saving: false, pulling: false };
  window.Store = Store;
  window.Sync = { onLocalSave: onLocalSave };   // accroche appelée par app.js -> save()

  const $ = id => document.getElementById(id);
  function setStatus(t) { const e = $("saveStatus"); if (e) e.textContent = t; }
  function hm() { const d = new Date(); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  let lastLocal = 0, pushTimer = null;

  function onLocalSave(state) {
    if (!configured) return;
    lastLocal = Date.now();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push(state), 800);   // regroupe les saisies rapprochées
  }

  async function push(state) {
    if (!configured) return;
    Store.saving = true; setStatus("Enregistrement en ligne…");
    try {
      const body = new URLSearchParams();
      body.set("payload", JSON.stringify(state));       // form-urlencoded => pas de preflight CORS
      const res = await fetch(URL_, { method: "POST", body });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setStatus("Enregistré en ligne ✓ " + hm());
    } catch (e) {
      console.warn("Enregistrement en ligne impossible :", e);
      setStatus("Hors-ligne — gardé sur l'appareil ✓ " + hm());
    } finally { Store.saving = false; }
  }

  async function pull(apply) {
    if (!configured) return;
    Store.pulling = true;
    try {
      const res = await fetch(URL_ + "?ts=" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      if (apply && data && typeof data === "object" && Object.keys(data).length) {
        // on n'écrase pas une saisie locale de moins de 3 s
        if (Date.now() - lastLocal > 3000) {
          window.AgatheApp.applyRemoteState(data);
          setStatus("Chargé en ligne ✓ " + hm());
        }
      }
    } catch (e) { console.warn("Lecture en ligne impossible :", e); }
    finally { Store.pulling = false; }
  }

  function start() {
    if (!configured) { setStatus("Enregistrement en ligne non configuré (voir config.js)."); return; }
    pull(true);                                                   // à l'ouverture : version unique
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(true); });
    setInterval(() => { if (!document.hidden && !Store.saving) pull(true); }, 25000); // rafraîchissement léger
  }
  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
