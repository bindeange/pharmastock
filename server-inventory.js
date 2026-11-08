// Inventaire synchronise avec le serveur PharmaStock local.
// Ce module reste isole pour conserver l'architecture PWA existante.
(function () {
  const DEFAULT_SERVER_URL = "http://192.168.2.100:3780";
  const SERVER_CANDIDATES = [
    DEFAULT_SERVER_URL,
    "http://pharmastock.local:3780",
    "http://pharmastock:3780",
    "http://192.168.2.102:3780",
    "http://192.168.2.125:3780",
    "http://192.168.1.125:3780"
  ];
  const state = {
    serverUrl: storageGet("pharmaServerUrl") || DEFAULT_SERVER_URL,
    holder: storageGet("pharmaDeviceHolder") || "",
    inventories: [],
    blInvoices: [],
    inventoryId: null,
    blId: null,
    mode: "inventory",
    lines: [],
    family: "",
    fiche: "",
    search: "",
    pendingCode: null,
    refreshTimer: null
  };

  const $ = (id) => document.getElementById(id);
  function storageGet(key) { try { return window.localStorage?.getItem(key) || ""; } catch { return ""; } }
  function storageSet(key, value) { try { window.localStorage?.setItem(key, value); } catch {} }
  function normalizeServerUrl(value) { return String(value || "").trim().replace(/\/$/, ""); }
  function candidateServerUrls() {
    const urls = [
      storageGet("pharmaServerUrl"),
      state.serverUrl,
      location.origin && location.origin.startsWith("http") ? location.origin : "",
      ...SERVER_CANDIDATES
    ].map(normalizeServerUrl).filter(Boolean);
    return Array.from(new Set(urls));
  }
  async function probeServer(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    try {
      const response = await fetch(`${url}/api/pwa-sync/status`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal
      });
      return response.ok && (await response.json()).ok === true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  async function resolveServerUrl() {
    for (const url of candidateServerUrls()) {
      if (await probeServer(url)) {
        state.serverUrl = url;
        storageSet("pharmaServerUrl", url);
        const input = $("sync-server-url");
        if (input) input.value = url;
        return url;
      }
    }
    return state.serverUrl;
  }
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const COUNT_UNITS = [
    ["BOITE", "boite"],
    ["AMPOULE", "ampoule"],
    ["COMPRIME", "comprime"],
    ["PLAQUETTE", "plaquette"],
    ["UNITE", "unit&eacute;"],
    ["CARTON", "carton"],
    ["KIT", "kit"],
    ["FLACON", "flacon"]
  ];

  function normalizeUnit(value) {
    const key = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
    return COUNT_UNITS.some(([unit]) => unit === key) ? key : "UNITE";
  }

  function unitOptions(current) {
    const selected = normalizeUnit(current);
    return COUNT_UNITS.map(([value, label]) =>
      `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`
    ).join("");
  }

  async function api(path, options = {}) {
    let serverUrl = normalizeServerUrl(state.serverUrl);
    let response;
    try {
      response = await fetch(`${serverUrl}${path}`, {
        ...options,
        headers: { "content-type": "application/json", ...(options.headers || {}) }
      });
    } catch (error) {
      serverUrl = await resolveServerUrl();
      response = await fetch(`${serverUrl}${path}`, {
        ...options,
        headers: { "content-type": "application/json", ...(options.headers || {}) }
      });
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(data.error || data.message || text || `HTTP ${response.status}`);
    return data;
  }

  function toast(message) {
    if (typeof app !== 'undefined' && app.toast) app.toast(message);
    else alert(message);
  }

  function showLoader(value) {
    if (typeof app !== 'undefined' && app.showLoader) app.showLoader(value);
  }

  function ensureHolder() {
    if (!state.holder) {
      state.holder = prompt("Nom du detenteur de ce telephone")?.trim() || "";
      if (!state.holder) throw new Error("Le nom du detenteur est obligatoire.");
      storageSet("pharmaDeviceHolder", state.holder);
    }
    $("sync-holder").value = state.holder;
  }

  function saveSettings() {
    const serverUrl = normalizeServerUrl($("sync-server-url").value);
    const holder = $("sync-holder").value.trim();
    if (!serverUrl || !holder) {
      alert("Renseignez l'adresse du serveur et le detenteur du telephone.");
      return false;
    }
    state.serverUrl = serverUrl;
    state.holder = holder;
    storageSet("pharmaServerUrl", serverUrl);
    storageSet("pharmaDeviceHolder", holder);
    return true;
  }

  function setServerUrl(url) {
    const serverUrl = normalizeServerUrl(url);
    if (!serverUrl) return false;
    state.serverUrl = serverUrl;
    storageSet("pharmaServerUrl", serverUrl);
    const input = $("sync-server-url");
    if (input) input.value = serverUrl;
    return true;
  }

  function families() {
    const names = new Set();
    filteredByFiche().forEach((line) => names.add(line.famille || line.programme || "Sans famille"));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }

  function fiches() {
    const map = new Map();
    state.lines.forEach((line) => {
      const name = line.source_import || "Saisie directe";
      const item = map.get(name) || { name, total: 0, done: 0, left: 0 };
      item.total += 1;
      if (line.quantite_physique !== null && line.quantite_physique !== undefined) item.done += 1;
      else item.left += 1;
      map.set(name, item);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function filteredByFiche() {
    if (!state.fiche) return state.lines;
    return state.lines.filter((line) => (line.source_import || "Saisie directe") === state.fiche);
  }

  function normalizeLots(line) {
    if (Array.isArray(line.lots_proposes)) return line.lots_proposes;
    if (!line.lots_proposes) return [];
    try { return JSON.parse(line.lots_proposes); } catch { return []; }
  }


  function showSetup() {
    if (state.refreshTimer) clearTimeout(state.refreshTimer);
    $("sync-step-setup")?.classList.remove("hidden");
    $("sync-step-work")?.classList.add("hidden");
  }

  function showWork() {
    $("sync-step-setup")?.classList.add("hidden");
    $("sync-step-work")?.classList.remove("hidden");
  }

  function lineDone(line) {
    return line.quantite_physique !== null && line.quantite_physique !== undefined;
  }

  function lineDoneBySelf(line) {
    return lineDone(line) && (!line.poste_saisie || line.poste_saisie === state.holder);
  }
  function lineSeenByOther(line) {
    return line.quantite_physique !== null && line.quantite_physique !== undefined && line.poste_saisie && line.poste_saisie !== state.holder;
  }

  function renderInventories() {
    const target = $("sync-inventory-list");
    if (!target) return;
    if (state.mode === "bl") {
      if (!state.blInvoices.length) {
        target.innerHTML = '<p class="sync-empty">Aucun BL disponible sur le serveur.</p>';
        return;
      }
      target.innerHTML = state.blInvoices.map((invoice) => `
        <button class="sync-inv-card${Number(invoice.id) === Number(state.blId) ? " active" : ""}" onclick="serverInventory.selectBlInvoice(${Number(invoice.id)})">
          <span>${esc(invoice.numero_facture || ("BL " + invoice.id))}</span>
          <small>${esc(invoice.fournisseur || "-")} - ${esc(invoice.date_facture || invoice.date_reception || "")} - ${Number(invoice.lignes || 0)} ligne(s)</small>
        </button>
      `).join("");
      return;
    }
    if (!state.inventories.length) {
      target.innerHTML = '<p class="sync-empty">Aucun inventaire disponible sur le serveur.</p>';
      return;
    }
    target.innerHTML = state.inventories.map((inv) => `
      <button class="sync-inv-card${Number(inv.id) === Number(state.inventoryId) ? " active" : ""}" onclick="serverInventory.selectInventory(${Number(inv.id)})">
        <span>${esc(inv.mois || inv.date_inventaire || ("Inventaire " + inv.id))}</span>
        <small>${esc(inv.statut || "ouvert")} - ${esc(inv.date_inventaire || "")}</small>
      </button>
    `).join("");
  }

  function renderFiches() {
    const selector = $("sync-fiche");
    if (!selector) return;
    const current = state.fiche;
    selector.innerHTML = '<option value="">Toutes les fiches</option>' + fiches().map((item) =>
      `<option value="${esc(item.name)}"${item.name === current ? " selected" : ""}>${esc(shortName(item.name))} (${item.done}/${item.total})</option>`
    ).join("");
  }

  function renderFamilies() {
    const selector = $("sync-family");
    const current = state.family;
    selector.innerHTML = '<option value="">Toutes les familles</option>' + families().map((name) =>
      `<option value="${esc(name)}"${name === current ? " selected" : ""}>${esc(name)}</option>`
    ).join("");
  }

  function shortName(value) {
    return String(value || "").split(/[\\/]/).pop();
  }

  function renderLines() {
    renderFiches();
    renderFamilies();
    const q = state.search.toLowerCase();
    const holder = state.holder || "";
    const base = filteredByFiche();
    if (state.mode === "bl") {
      const list = base.filter((line) => {
        const haystack = `${line.code_cip || ""} ${line.dci || ""} ${line.lot || ""} ${line.numero_facture || ""} ${line.codes_barres || ""}`.toLowerCase();
        return !q || haystack.includes(q);
      });
      const invoice = state.blInvoices.find((item) => Number(item.id) === Number(state.blId));
      $("sync-summary").textContent = state.blId
        ? `${list.length}/${base.length} produit(s) du BL ${invoice?.numero_facture || state.blId} - Telephone: ${holder || "non identifie"}`
        : `Chargez un BL pour rappeler ses produits - Telephone: ${holder || "non identifie"}`;
      $("sync-lines").innerHTML = list.map((line) => `
        <article class="sync-line">
          <div class="sync-line-head">
            <div>
              <h4>${esc(line.dci || "DCI non renseignee")}</h4>
              <div class="meta">BL ${esc(line.numero_facture || "-")} - ${esc(line.fournisseur || "-")}</div>
              <div class="meta">CIP ${esc(line.code_cip || "-")} - Lot ${esc(line.lot || "-")} - Peremption ${esc(line.date_peremption || "-")}</div>
              <div class="meta">Quantite ${Number(line.quantite || 0)} - Prix ${Number(line.prix_achat || 0)} - Codes: ${esc(line.codes_barres || "aucun")}</div>
            </div>
            <span class="sync-status">BL</span>
          </div>
          <div class="sync-actions">
            <button class="code-btn" onclick="serverInventory.addCode(${Number(line.id)}, 'dci')">Ajouter code DCI</button>
            <button class="lot-btn" onclick="serverInventory.addCode(${Number(line.id)}, 'lot')">Ajouter code lot</button>
          </div>
        </article>
      `).join("") || '<p class="sync-empty">Aucun produit pour ce BL.</p>';
      return;
    }
    const list = base.filter((line) => {
      const fam = line.famille || line.programme || "Sans famille";
      if (state.family && fam !== state.family) return false;
      const haystack = `${line.code_cip || ""} ${line.dci || ""} ${line.lot || ""} ${line.unite || ""}`.toLowerCase();
      return !q || haystack.includes(q);
    });
    const counted = base.filter((line) => line.quantite_physique !== null && line.quantite_physique !== undefined).length;
    $("sync-summary").textContent = state.inventoryId
      ? `${counted}/${base.length} lignes affichees - ${state.fiche ? "Fiche: " + shortName(state.fiche) + " - " : ""}Telephone: ${holder || "non identifie"} - actualisation auto 12s`
      : `Cliquez sur Charger serveur pour recuperer l inventaire - Telephone: ${holder || "non identifie"}`;
    $("sync-lines").innerHTML = list.map((line) => {
      const seen = lineSeenByOther(line);
      const doneSelf = lineDoneBySelf(line);
      const lots = normalizeLots(line);
      const status = seen ? "saisi autre" : doneSelf ? "saisi" : (line.statut_identification || "a saisir");
      return `
        <article class="sync-line ${seen ? "seen-other" : doneSelf ? "done-self" : ""}">
          <div class="sync-line-head">
            <div>
              <h4>${esc(line.dci || "DCI non renseignee")}</h4>
              <div class="meta">${esc(line.famille || line.programme || "")} - CIP ${esc(line.code_cip || "-")} - Unite ${esc(line.unite || "-")}</div>
              <div class="meta">Lot ${esc(line.lot || "-")} - Peremption ${esc(line.date_peremption || "-")} - Theo ${Number(line.quantite_theorique || 0)}</div>
            </div>
            <span class="sync-status ${seen ? "other" : doneSelf ? "done" : ""}">${esc(status)}</span>
          </div>
          ${seen ? `<div class="sync-alert">Deja vu par ${esc(line.poste_saisie)}</div>` : ""}
          <div class="sync-row sync-price-row">
            <input type="number" min="0" inputmode="numeric" id="sync-qty-${line.id}" value="${line.quantite_physique ?? ""}" placeholder="Quantite">
            <input type="number" min="0" step="0.01" inputmode="decimal" id="sync-price-${line.id}" value="${Number(line.prix_vente || line.prix_achat || 0) || ""}" placeholder="Prix">
            <select id="sync-unit-${line.id}" title="Unite de comptage">${unitOptions(line.unite)}</select>
            <button onclick="serverInventory.saveQuantity(${line.id})">Enregistrer</button>
          </div>
          ${lots.length ? `
            <div class="sync-lots">
              ${lots.slice(0, 5).map((lot) => `
                <button onclick="serverInventory.confirmLot(${line.id}, ${lot.id})">
                  ${esc(lot.numero_lot)} | ${esc(lot.date_peremption || "-")} | stock ${Number(lot.quantite_actuelle || 0)}
                </button>
              `).join("")}
            </div>
          ` : ""}
          <div class="sync-actions">
            <button onclick="serverInventory.identify(${line.id})">Reconnaitre</button>
            <button class="code-btn" onclick="serverInventory.addCode(${line.id}, 'dci')">Ajouter code DCI</button>
            <button class="lot-btn" onclick="serverInventory.addCode(${line.id}, 'lot')">Ajouter code lot</button>
            <button onclick="serverInventory.createLot(${line.id})">Creer lot</button>
          </div>
        </article>
      `;
    }).join("") || '<p class="sync-empty">Aucune ligne pour ce filtre.</p>';
  }

  async function loadInventories() {
    if (!saveSettings()) return;
    state.mode = "inventory";
    state.blId = null;
    showLoader(true);
    try {
      state.inventories = await api("/api/inventaires");
      renderInventories();
      if (state.inventories.length) {
        const first = state.inventories[0];
        toast("Inventaire charge : ouverture de " + (first.mois || first.date_inventaire || first.id));
        await selectInventory(first.id);
        showWork();
      } else {
        state.lines = [];
        renderLines();
        showWork();
        toast("Aucun inventaire disponible sur le serveur");
      }
    } catch (error) {
      alert("Connexion serveur impossible: " + error.message);
    } finally {
      showLoader(false);
    }
  }

  async function loadBlInvoices() {
    if (!saveSettings()) return;
    state.mode = "bl";
    state.inventoryId = null;
    showLoader(true);
    try {
      state.blInvoices = await api("/api/bl-fournisseurs");
      renderInventories();
      state.lines = [];
      renderLines();
      showSetup();
      if (state.blInvoices.length) toast("BL charges : choisissez le BL a coder.");
      else toast("Aucun BL trouve sur le serveur.");
    } catch (error) {
      alert("Chargement des BL impossible: " + error.message);
    } finally {
      showLoader(false);
    }
  }

  async function selectBlInvoice(id) {
    state.mode = "bl";
    state.blId = id;
    state.inventoryId = null;
    showLoader(true);
    try {
      showWork();
      state.lines = await api(`/api/bl-fournisseurs/${id}/lignes`);
      renderInventories();
      renderLines();
    } catch (error) {
      alert("Chargement du BL impossible: " + error.message);
    } finally {
      showLoader(false);
    }
  }

  async function selectInventory(id) {
    state.inventoryId = id;
    showLoader(true);
    try {
      showWork();
      state.lines = await api(`/api/inventaires/${id}/programmes`);
      renderInventories();
      renderLines();
      scheduleRefresh();
    } catch (error) {
      alert("Chargement impossible: " + error.message);
    } finally {
      showLoader(false);
    }
  }

  function scheduleRefresh() {
    if (state.refreshTimer) clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(async () => {
      if (!state.inventoryId) return;
      const active = document.activeElement;
      const isEditing = active && active.closest && active.closest("#sync-lines");
      if (!isEditing) {
        await refreshLines(false);
        return;
      }
      scheduleRefresh();
    }, 12000);
  }

  async function refreshLines(showToast = false) {
    if (state.mode === "bl") {
      if (!state.blId) return;
      state.lines = await api(`/api/bl-fournisseurs/${state.blId}/lignes`);
      renderLines();
      if (showToast) toast("BL actualise");
      return;
    }
    if (!state.inventoryId) return;
    state.lines = await api(`/api/inventaires/${state.inventoryId}/programmes`);
    renderLines();
    scheduleRefresh();
    if (showToast) toast("Inventaire actualise");
  }

  async function saveQuantity(lineId) {
    if (!saveSettings()) return;
    const input = $(`sync-qty-${lineId}`);
    const priceInput = $(`sync-price-${lineId}`);
    const unitInput = $(`sync-unit-${lineId}`);
    const value = input.value === "" ? null : Number(input.value);
    const price = priceInput?.value === "" ? 0 : Number(priceInput?.value || 0);
    const unite = normalizeUnit(unitInput?.value);
    if (value !== null && Number.isNaN(value)) {
      alert("Saisissez une quantite valide.");
      return;
    }
    if (Number.isNaN(price)) {
      alert("Saisissez un prix valide.");
      return;
    }
    await api(`/api/inventaires-programmes/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantitePhysique: value, prix: price, unite, posteSaisie: state.holder })
    });
    await refreshLines();
  }

  async function identify(lineId) {
    await api(`/api/inventaires-programmes/${lineId}/identifier`, { method: "POST", body: "{}" });
    await refreshLines();
  }

  async function confirmLot(lineId, lotId) {
    if (!saveSettings()) return;
    await api(`/api/inventaires-programmes/${lineId}/confirmer-lot`, {
      method: "POST",
      body: JSON.stringify({ lotId, confirmePar: state.holder })
    });
    await refreshLines();
  }

  async function addCode(lineId, cible) {
    if (!saveSettings()) return;
    state.pendingCode = { lineId, cible };
    if (typeof AndroidScanner !== "undefined" && AndroidScanner.scan) {
      AndroidScanner.scan();
      toast("Scannez le code-barres a ajouter.");
      return;
    }
    if (typeof app !== "undefined" && app.go && navigator.mediaDevices?.getUserMedia) {
      app.go("scan");
      toast("Scannez le code-barres a ajouter.");
      return;
    }
    const code = prompt(cible === "lot" ? "Code-barres du lot" : "Code-barres de la DCI");
    if (!code) { state.pendingCode = null; return; }
    await saveScannedCode(code);
  }

  async function saveScannedCode(raw) {
    if (!state.pendingCode) return false;
    const pending = state.pendingCode;
    state.pendingCode = null;
    const code = String(raw || "").trim();
    if (!code) return true;
    const path = state.mode === "bl"
      ? `/api/bl-fournisseurs/lignes/${pending.lineId}/ajouter-code`
      : `/api/inventaires-programmes/${pending.lineId}/ajouter-code`;
    await api(path, {
      method: "POST",
      body: JSON.stringify({ cible: pending.cible, code })
    });
    await refreshLines();
    toast("Code-barres ajoute et synchronise.");
    return true;
  }

  function handleScannedCode(raw) {
    if (!state.pendingCode) return false;
    saveScannedCode(raw).catch((error) => alert("Code non enregistre: " + error.message));
    return true;
  }

  async function createLot(lineId) {
    if (!saveSettings()) return;
    const line = state.lines.find((item) => Number(item.id) === Number(lineId));
    const numeroLot = prompt("Numero de lot", line?.lot || "");
    if (!numeroLot) return;
    const datePeremption = prompt("Date de peremption (AAAA-MM-JJ)", line?.date_peremption || "");
    const prix = prompt("Prix du lot", String(Number(line?.prix_vente || line?.prix_achat || 0) || 0));
    if (prix === null) return;
    await api(`/api/inventaires-programmes/${lineId}/creer-lot`, {
      method: "POST",
      body: JSON.stringify({ numeroLot, datePeremption, prix, confirmePar: state.holder })
    });
    await refreshLines();
  }

  async function downloadBase() {
    if (!saveSettings()) return;
    await app.syncPull(true);
  }

  function open() {
    if (typeof app !== 'undefined' && app.go) app.go("inventaire-sync");
    state.mode = "inventory";
    state.serverUrl = storageGet("pharmaServerUrl") || state.serverUrl;
    $("sync-server-url").value = state.serverUrl;
    $("sync-holder").value = state.holder;
    try { ensureHolder(); } catch (error) { alert(error.message); return; }
    resolveServerUrl().catch(() => {});
    renderInventories();
    renderLines();
    scheduleRefresh();
  }

  function openBl() {
    if (typeof app !== 'undefined' && app.go) app.go("inventaire-sync");
    state.serverUrl = storageGet("pharmaServerUrl") || state.serverUrl;
    $("sync-server-url").value = state.serverUrl;
    $("sync-holder").value = state.holder;
    try { ensureHolder(); } catch (error) { alert(error.message); return; }
    loadBlInvoices();
  }


  function clearFilters() {
    state.fiche = "";
    state.family = "";
    state.search = "";
    const search = $("sync-search");
    if (search) search.value = "";
    renderLines();
  }

  function searchBarcode() {
    const code = prompt("Scannez ou saisissez le code-barres / CIP");
    if (!code) return;
    if (typeof app !== "undefined" && app.applyServerConfig && app.applyServerConfig(code)) return;
    state.search = code.trim();
    const search = $("sync-search");
    if (search) search.value = state.search;
    renderLines();
    const matches = filteredByFiche().filter((line) => `${line.code_cip || ""} ${line.dci || ""} ${line.lot || ""} ${line.unite || ""}`.toLowerCase().includes(state.search.toLowerCase()));
    toast(matches.length ? `${matches.length} ligne(s) trouvee(s)` : "Aucune ligne trouvee pour ce code");
  }
  function setFamily(value) {
    state.family = value;
    renderLines();
  }

  function setFiche(value) {
    state.fiche = value;
    state.family = "";
    renderLines();
  }

  function setSearch(value) {
    state.search = value;
    renderLines();
  }

  window.serverInventory = {
    open,
    openBl,
    showSetup,
    loadInventories,
    loadBlInvoices,
    selectBlInvoice,
    selectInventory,
    saveQuantity,
    identify,
    confirmLot,
    addCode,
    createLot,
    downloadBase,
    setServerUrl,
    handleScannedCode,
    setFamily,
    setFiche,
    searchBarcode,
    clearFilters,
    setSearch
  };
})();









