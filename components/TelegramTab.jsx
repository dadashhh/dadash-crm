// === Shared dependencies ===
const { useState, useEffect, useMemo, useCallback, useRef } = React;
const {
  sb, t, i18n, escapeHTML, sanitizeURL, paginate,
  useDebounce, useDateRange, useSortable,
  useToast, useCurrency, useNav, useTimezone,
  SortTh, Pagination, BadgeBar, DateRangeFilter, EditTxModal, FilterBar, ConfirmDialog,
  KPICard, Tag, StatusPill,
  PAGE_SIZE, DADA_FEE_PCT, DEFAULT_EXCHANGE_RATE, TOAST_TIMEOUT_MS,
  PRODUCTS, TAGS, TIMEZONES, ANTHROPIC_API_URL,
  safeInsertTx, safeUpsertSpender,
  filterByModel, filterByProvider, filterByChatter, filterByStatus,
  fmtDate, getSpenderSegment, _tz,
  computeSpenderProfile, SpenderQuickCard, SpenderFullProfile,
  getAgencyDetails, saveAgencyDetails, getNextInvoiceNumber,
  invoiceStatusConfig, invoiceTypeLabels,
  generateInvoiceHTML, downloadInvoicePDF,
  generateChatterInvoice, generateModelInvoice, generateProviderInvoice,
  MyInvoicesPanel,
  XP_LEVELS, getLevel, calculateXP, calculateStreak, STREAK_BADGES,
  getStreakBadges, getDailyProgress, getWeeklyProgress, launchConfetti,
  AGENCY_ACHIEVEMENTS, LevelBadge, XPProgressBar, StreakBadge,
  AgencyHealthScore, AgencyAchievements, ActivityHeatmap, ChallengesSection,
  ContentTaskManager,
  q_spender_profile, q_spender_transactions, q_spender_kpis,
  q_spender_breakdown_models, q_spender_breakdown_chatter, q_spender_breakdown_provider,
  _hashStr, tonightDate, tonightStatus,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, RechartsTooltip, Legend,
} = window.DadashShared;

const TelegramTab = ({user, lang, txs, models, profiles, spenders, onRefresh, navigateToSpender}) => {
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const addToast = useToast();
  const fr = lang === "fr";

  // ── STATE ──
  const [rawData, setRawData] = useState([]);
  const [importLog, setImportLog] = useState([]);
  const [importing, setImporting] = useState(false);
  const [activeView, setActiveView] = useState("import");
  const [selectedSpenderKey, setSelectedSpenderKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [activeFilter, setActiveFilter] = useState("all");
  const [filterModel, setFilterModel] = useState("all");
  const [showDebug, setShowDebug] = useState(false);

  // ── DEFAULTS ──
  const malaProfile = profiles.find(p => p.role === "chatter" && (p.name || "").toLowerCase().includes("mala"));
  const leoProfile = profiles.find(p => p.role === "provider" && (p.name || "").toLowerCase().includes("leo"));
  const defaultChatterId = malaProfile?.id || profiles.find(p => p.role === "chatter")?.id || user.id;
  const defaultChatterName = malaProfile?.name || "Mala";

  // ── HELPERS ──
  const cleanName = (raw) => {
    if (!raw || raw === "?" || raw === ".") return null;
    // Remove: (VALIDÉ 150), (DE RETOUR), (valide 50) pack, emoji, amounts like "0E", "/ ? / ?"
    let s = raw
      .replace(/\(.*?\)/g, "")           // remove parenthetical: (VALIDÉ 150), (DE RETOUR)
      .replace(/\s*\d+E\b/gi, "")        // remove "0E", "150E"
      .replace(/[❤️🍑💎🔥✨💋👑🎀]/gu, "") // remove emojis
      .replace(/\s*\/\s*\?\s*/g, "")     // remove "/ ?"
      .replace(/\bpack\b/gi, "")         // remove "pack"
      .replace(/\bTIMEWASTER\b/gi, "")   // remove TIMEWASTER label
      .replace(/\bVALID[ÉE]?\b/gi, "")   // remove VALIDÉ
      .replace(/\s+/g, " ")              // collapse whitespace
      .trim();
    if (!s || s === "?" || s === "." || s.length < 2) return null;
    return s;
  };

  const extractBestName = (entry, telegramId) => {
    // Priority 1: info.prenom (if real)
    if (entry.info && entry.info.prenom && entry.info.prenom !== "?" && entry.info.prenom.length > 1) {
      return entry.info.prenom;
    }
    // Priority 2: "new" field — format "Nom / MontantE / Age / Metier"
    if (entry.new) {
      const firstPart = entry.new.split("/")[0].trim();
      const cleaned = cleanName(firstPart);
      if (cleaned) return cleaned;
    }
    // Priority 3: "orig" field — real Telegram name but with noise
    if (entry.orig) {
      const cleaned = cleanName(entry.orig);
      if (cleaned) return cleaned;
    }
    return "Contact_" + telegramId.substring(0, 6);
  };

  const modelNameFromFile = (filename) => {
    const base = filename.replace(/\.json$/i, "").replace(/[-_]/g, " ");
    return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
  };

  // ══════════════════════════════════════════════
  // STEP 2 — NORMALIZE TRANSACTIONS (tonight rules)
  // Dates: deterministic Feb 13-19 2026
  // Chatter: always Mala | Provider: always Leo
  // Status: validated except exactly 2 pending
  // ══════════════════════════════════════════════
  const normalizedTxs = useMemo(() => {
    const out = [];
    rawData.forEach(({telegramId, entry, modelName}) => {
      const handle = extractBestName(entry, telegramId);
      const depense = Number(entry.depense) || 0;
      const isSpender = entry.spender === true;
      const txsArr = Array.isArray(entry.transactions) ? entry.transactions : [];
      const contenu = Array.isArray(entry.contenu) ? entry.contenu : [];

      let added = false;
      txsArr.forEach((tx, txIdx) => {
        const montant = Number(tx.montant) || 0;
        if (montant <= 0) return;
        const txId = telegramId + "_" + txIdx;
        out.push({
          txId,
          txDate: tonightDate(txId),
          amount: montant,
          spenderKey: telegramId,
          spenderHandle: handle,
          modelName: modelName,
          chatterName: defaultChatterName,
          chatterId: defaultChatterId,
          providerName: leoProfile?.name || "Leo",
          providerId: leoProfile?.id || null,
          status: "validated",
          description: tx.description || "",
          type: contenu[0] || "telegram_import",
        });
        added = true;
      });

      if (!added && depense > 0 && isSpender) {
        const txId = telegramId + "_synth";
        out.push({
          txId,
          txDate: tonightDate(txId),
          amount: depense,
          spenderKey: telegramId,
          spenderHandle: handle,
          modelName: modelName,
          chatterName: defaultChatterName,
          chatterId: defaultChatterId,
          providerName: leoProfile?.name || "Leo",
          providerId: leoProfile?.id || null,
          status: "validated",
          description: entry.resume ? entry.resume.substring(0, 100) : "",
          type: contenu[0] || "telegram_import",
        });
      }
    });
    // Apply tonight rule: exactly 2 pending (deterministic)
    if (out.length > 2) {
      const total = out.length;
      const pos1 = _hashStr("pending_slot_0") % total;
      let pos2 = _hashStr("pending_slot_1") % (total - 1);
      if (pos2 >= pos1) pos2++;
      out.forEach((tx, i) => { tx.status = (i === pos1 || i === pos2) ? "pending" : "validated"; });
    }
    return out;
  }, [rawData, defaultChatterId, defaultChatterName, leoProfile]);

  // ══════════════════════════════════════════════
  // STEP 3 — BUILD SPENDERS (from raw + normalized)
  // ══════════════════════════════════════════════
  const spendersList = useMemo(() => {
    const map = {};

    // First: seed ALL rawData entries (even those with 0 tx)
    rawData.forEach(({telegramId, entry, modelName}) => {
      const handle = extractBestName(entry, telegramId);
      if (!map[telegramId]) {
        map[telegramId] = {
          spenderKey: telegramId,
          handle: handle,
          isSpender: entry.spender === true,
          isTW: entry.tw === true,
          contenu: Array.isArray(entry.contenu) ? entry.contenu : [],
          resume: entry.resume || "",
          info: entry.info || {},
          modelName: modelName,
          ltv: 0, nbTx: 0, avgTicket: 0, maxTicket: 0,
          firstSeen: null, lastSeen: null,
          txList: [],
        };
      }
    });

    // Enrich with normalizedTxs
    normalizedTxs.forEach(tx => {
      const key = tx.spenderKey;
      if (!map[key]) {
        map[key] = {
          spenderKey: key, handle: tx.spenderHandle,
          isSpender: true, isTW: false,
          contenu: [], resume: "", info: {},
          modelName: tx.modelName,
          ltv: 0, nbTx: 0, avgTicket: 0, maxTicket: 0,
          firstSeen: null, lastSeen: null, txList: [],
        };
      }
      const s = map[key];
      s.ltv += tx.amount;
      s.nbTx++;
      s.maxTicket = Math.max(s.maxTicket, tx.amount);
      s.txList.push(tx);
      if (!s.firstSeen || tx.txDate < s.firstSeen) s.firstSeen = tx.txDate;
      if (!s.lastSeen || tx.txDate > s.lastSeen) s.lastSeen = tx.txDate;
    });

    // Also merge Supabase txs (from props)
    txs.forEach(tx => {
      const handle = tx.spender_handle;
      if (!handle) return;
      let found = Object.values(map).find(s => s.handle.toLowerCase() === handle.toLowerCase());
      if (!found) {
        const key = "supa_" + handle.toLowerCase();
        map[key] = {
          spenderKey: key, handle: handle,
          isSpender: true, isTW: false,
          contenu: [], resume: "", info: {},
          modelName: models.find(m => m.id === tx.model_id)?.name || "?",
          ltv: 0, nbTx: 0, avgTicket: 0, maxTicket: 0,
          firstSeen: null, lastSeen: null, txList: [],
        };
        found = map[key];
      }
      found.ltv += Number(tx.amount) || 0;
      found.nbTx++;
      found.maxTicket = Math.max(found.maxTicket, Number(tx.amount) || 0);
      const txDate = tx.date || tx.created_at || "";
      if (txDate && (!found.firstSeen || txDate < found.firstSeen)) found.firstSeen = txDate;
      if (txDate && (!found.lastSeen || txDate > found.lastSeen)) found.lastSeen = txDate;
      found.txList.push({
        txId: tx.id, txDate: txDate, amount: Number(tx.amount) || 0,
        spenderKey: found.spenderKey, spenderHandle: handle,
        modelName: models.find(m => m.id === tx.model_id)?.name || "?",
        providerName: profiles.find(p => p.id === tx.provider_id)?.name || "?",
        status: tx.status || "pending", description: tx.notes || "", type: tx.type || "",
      });
    });

    // Finalize: compute derived fields
    return Object.values(map).map(s => {
      s.avgTicket = s.nbTx > 0 ? s.ltv / s.nbTx : 0;
      s.segment = getSpenderSegment(s.ltv);
      const tags = [];
      if (s.isTW) tags.push("timewaster");
      if (s.isSpender && s.ltv > 0) tags.push("spender");
      if (s.ltv >= 500) tags.push("whale");
      else if (s.ltv >= 200) tags.push("vip");
      if (s.ltv >= 100 && (!s.info?.prenom || s.info.prenom === "?")) tags.push("silent_whale");
      const now = new Date();
      const lastDate = s.lastSeen ? new Date(s.lastSeen) : null;
      s.recencyDays = lastDate ? Math.floor((now - lastDate) / 86400000) : 999;
      if (s.recencyDays > 14) tags.push("cold");
      s.tags = [...new Set(tags)];
      return s;
    }).sort((a, b) => b.ltv - a.ltv);
  }, [rawData, normalizedTxs, txs, models, profiles]);

  // ── FILTERED SPENDERS ──
  const filteredSpenders = useMemo(() => {
    return spendersList.filter(s => {
      const q = debouncedSearchQuery.toLowerCase();
      const matchSearch = !q || s.handle.toLowerCase().includes(q) || (s.info?.prenom || "").toLowerCase().includes(q) || s.spenderKey.includes(q);
      const matchFilter =
        activeFilter === "all" ||
        (activeFilter === "spenders" && (s.isSpender || s.ltv > 0)) ||
        (activeFilter === "vip" && s.ltv >= 200) ||
        (activeFilter === "tw" && s.isTW) ||
        (activeFilter === "silent_whale" && s.tags.includes("silent_whale")) ||
        (activeFilter === "cold" && s.recencyDays > 14);
      const matchModel = filterModel === "all" || s.modelName === filterModel;
      return matchSearch && matchFilter && matchModel;
    });
  }, [spendersList, debouncedSearchQuery, activeFilter, filterModel]);

  // ── METRICS ──
  const metrics = useMemo(() => {
    const withLTV = spendersList.filter(s => s.ltv > 0);
    const totalCA = withLTV.reduce((acc, s) => acc + s.ltv, 0);
    const totalTx = normalizedTxs.length + txs.length;
    const avgTicket = totalTx > 0 ? totalCA / totalTx : 0;
    const whales = withLTV.filter(s => s.ltv >= 200);
    const silentWhales = spendersList.filter(s => s.tags.includes("silent_whale"));
    const twCount = spendersList.filter(s => s.isTW).length;
    const hourMap = Array(24).fill(0);
    normalizedTxs.forEach(tx => { const h = new Date(tx.txDate).getHours(); hourMap[h]++; });
    txs.forEach(tx => { if (tx.date) { const h = new Date(tx.date).getHours(); hourMap[h]++; } });
    const maxH = Math.max(...hourMap, 1);
    return { totalCA, spenderCount: withLTV.length, twCount, avgTicket, whales, silentWhales, hourMap, maxH };
  }, [spendersList, normalizedTxs, txs]);

  // ── BY MODEL ──
  const byModelData = useMemo(() => {
    const mm = {};
    spendersList.forEach(s => {
      const mn = s.modelName || "?";
      if (!mm[mn]) mm[mn] = {name: mn, contacts: [], totalCA: 0, nbTx: 0};
      mm[mn].contacts.push(s);
      mm[mn].totalCA += s.ltv;
      mm[mn].nbTx += s.nbTx;
    });
    return Object.values(mm).sort((a, b) => b.totalCA - a.totalCA);
  }, [spendersList]);

  const modelNames = useMemo(() => [...new Set(spendersList.map(s => s.modelName).filter(Boolean))], [spendersList]);

  // ══════════════════════════════════════════════
  // STEP 1 — IMPORT HANDLER
  // ══════════════════════════════════════════════
  const handleImportJSON = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setImporting(true);
    setImportLog([{type: "info", msg: fr ? `${files.length} fichier(s) detecte(s)...` : `${files.length} file(s) detected...`}]);

    const allRaw = [];
    let totalEntries = 0, totalSpenders = 0, totalTW = 0;
    let dbSpOk = 0, dbSpFail = 0, dbTxOk = 0, dbTxFail = 0;
    let lastDbErr = "";

    for (const file of files) {
      const modelName = modelNameFromFile(file.name);
      setImportLog(prev => [...prev, {type: "info", msg: `📂 ${file.name} → Modele: ${modelName}`}]);

      let data;
      try {
        const text = await file.text();
        data = JSON.parse(text);
      } catch (err) {
        setImportLog(prev => [...prev, {type: "error", msg: `❌ JSON parse error: ${err.message}`}]);
        continue;
      }

      const entries = Object.entries(data);
      setImportLog(prev => [...prev, {type: "info", msg: `🔍 ${entries.length} entrees parsees`}]);

      const matchedModel = models.find(m => m.name.toLowerCase() === modelName.toLowerCase())
        || models.find(m => m.name.toLowerCase().includes(modelName.toLowerCase().substring(0, 4)))
        || null;
      const modelId = matchedModel?.id || models[0]?.id || null;

      if (matchedModel) {
        setImportLog(prev => [...prev, {type: "info", msg: `✅ Modele DB trouve: ${matchedModel.name}`}]);
      } else {
        setImportLog(prev => [...prev, {type: "info", msg: `⚠️ Modele "${modelName}" non trouve en DB`}]);
      }

      let fileCA = 0, fileTxCount = 0;

      for (const [telegramId, entry] of entries) {
        if (!entry || typeof entry !== "object") continue;
        totalEntries++;
        if (entry.spender) totalSpenders++;
        if (entry.tw) totalTW++;

        allRaw.push({telegramId, entry, fileName: file.name, modelName: matchedModel?.name || modelName});

        const handle = extractBestName(entry, telegramId);
        const depense = Number(entry.depense) || 0;
        const txsArr = Array.isArray(entry.transactions) ? entry.transactions : [];
        const contenu = Array.isArray(entry.contenu) ? entry.contenu : [];

        // Count local TX
        let wroteAny = false;
        for (let txIdx = 0; txIdx < txsArr.length; txIdx++) {
          const montant = Number(txsArr[txIdx].montant) || 0;
          if (montant <= 0) continue;
          fileTxCount++;
          fileCA += montant;
          wroteAny = true;
        }
        if (!wroteAny && depense > 0 && entry.spender) {
          fileTxCount++;
          fileCA += depense;
        }

        // ── UPSERT SPENDER en DB (enrichi) via bulletproof helper ──
        try {
          const spenderRow = {
            handle, name: handle, telegram_id: telegramId, model_id: modelId,
            total_spent: depense, status: entry.spender ? "active" : (entry.tw ? "timewaster" : "lead"),
            notes: entry.resume ? entry.resume.substring(0, 500) : null,
            source: "telegram_scan", last_seen: new Date().toISOString(),
            contact_info: entry.info ? JSON.stringify(entry.info) : null,
          };
          const res = await safeUpsertSpender(spenderRow);
          if (res.error) { dbSpFail++; lastDbErr = res.error.message; } else { dbSpOk++; }
        } catch (e) { dbSpFail++; lastDbErr = e.message; }

        // ── Write transactions to DB (10 champs) ──
        const txToWrite = [];
        for (let txIdx = 0; txIdx < txsArr.length; txIdx++) {
          const montant = Number(txsArr[txIdx].montant) || 0;
          if (montant <= 0) continue;
          txToWrite.push({montant, desc: txsArr[txIdx].description || "", idx: txIdx});
        }
        if (txToWrite.length === 0 && depense > 0 && entry.spender) {
          txToWrite.push({montant: depense, desc: (entry.resume || "").substring(0, 200), idx: 0});
        }

        for (const tw of txToWrite) {
          try {
            const txId = telegramId + "_" + tw.idx;
            const isUUID = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
            const txRow = {
              date: tonightDate(txId),
              spender_handle: handle,
              amount: tw.montant,
              status: "validated",
              notes: tw.desc || null,
            };
            if(isUUID(modelId)) txRow.model_id = modelId;
            if(isUUID(leoProfile?.id)) txRow.provider_id = leoProfile.id;
            if(isUUID(defaultChatterId)) txRow.chatter_id = defaultChatterId;
            const res = await safeInsertTx(txRow);
            if (res.error) { dbTxFail++; lastDbErr = res.error.message; } else { dbTxOk++; }
          } catch (e) { dbTxFail++; lastDbErr = e.message; }
        }
      }

      setImportLog(prev => [...prev,
        {type: "success", msg: `📊 ${modelName}: ${entries.length} contacts | ${fileTxCount} TX | ${fileCA.toFixed(0)}${currencySymbol}`},
      ]);
    }

    setImportLog(prev => [...prev,
      {type: "success", msg: `━━━━━━━━━━━━━━━━━━━━━━━━`},
      {type: "success", msg: `📇 TOTAL: ${totalEntries} contacts (${totalSpenders} spenders, ${totalTW} TW)`},
      {type: "info", msg: `💾 DB spenders: ${dbSpOk} ok / ${dbSpFail} fail`},
      {type: "info", msg: `💾 DB transactions: ${dbTxOk} ok / ${dbTxFail} fail`},
      lastDbErr ? {type: "error", msg: `⚠️ Derniere erreur DB: ${lastDbErr}`} : null,
      {type: "success", msg: `✅ Import termine ! Clique sur Fiches Spenders.`},
    ].filter(Boolean));

    // CRITICAL: store raw data in state — drives ALL downstream computations
    setRawData(prev => [...prev, ...allRaw]);
    setImporting(false);
    e.target.value = "";

    try { await onRefresh(); } catch (e) { /* best effort */ }
    addToast(fr ? `Import: ${totalEntries} contacts ✓` : `Import: ${totalEntries} contacts ✓`, "success");
    setTimeout(() => setActiveView("fiches"), 600);
  };

  // ── QUICK ADD ──
  const [quickForm, setQuickForm] = useState({spender: "", amount: "", model_id: "", type: ""});
  const [saving, setSaving] = useState(false);
  const handleQuickAdd = async () => {
    if (!quickForm.spender || !quickForm.amount) return;
    setSaving(true);
    const isUUID = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    try {
      const now = new Date().toISOString();
      try {
        await safeUpsertSpender({handle: quickForm.spender, name: quickForm.spender, status: "active", last_seen: now});
      } catch(e) { /* QA spender upsert best-effort */ }
      const txRow = {
        date: now,
        spender_handle: quickForm.spender,
        amount: Number(quickForm.amount),
        status: "pending",
        notes: null,
      };
      const mid = quickForm.model_id || models[0]?.id || null;
      if(isUUID(mid)) txRow.model_id = mid;
      if(isUUID(leoProfile?.id)) txRow.provider_id = leoProfile.id;
      if(isUUID(defaultChatterId)) txRow.chatter_id = defaultChatterId;
      if(quickForm.type) txRow.product = quickForm.type;
      const res = await safeInsertTx(txRow);
      if (!res.error) {
        addToast(`${quickForm.spender} — ${quickForm.amount}${currencySymbol} ✓`, "success");
        setQuickForm({spender: "", amount: "", model_id: quickForm.model_id, type: ""});
        await onRefresh();
      } else {
        addToast("Erreur: " + res.error.message, "error");
      }
    } catch(e) {
      addToast("Erreur: " + e.message, "error");
    }
    setSaving(false);
  };

  // ── Selected spender ──
  const selectedSpender = useMemo(() => {
    if (!selectedSpenderKey) return null;
    return spendersList.find(s => s.spenderKey === selectedSpenderKey) || null;
  }, [selectedSpenderKey, spendersList]);

  // ══════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════
  return (
    <div>
      {/* ═══ NAV TABS ═══ */}
      <div style={{display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap"}}>
        {[
          {key: "import", icon: "📥", label: fr ? "Import Telegram" : "Import Telegram"},
          {key: "metrics", icon: "📊", label: fr ? "Metriques" : "Metrics"},
          {key: "by_model", icon: "👩", label: fr ? "Par Modele" : "By Model"},
          {key: "fiches", icon: "📇", label: fr ? "Fiches Spenders" : "Spender Files"},
        ].map(tab => (
          <button key={tab.key}
            className={`filter-chip ${activeView === tab.key ? "active" : ""}`}
            onClick={() => { setActiveView(tab.key); setSelectedSpenderKey(null); }}
            style={{fontSize: 13, padding: "8px 16px"}}>
            {tab.icon} {tab.label}
            {tab.key === "fiches" && ` (${filteredSpenders.length})`}
          </button>
        ))}
        {selectedSpender && (
          <button className={`filter-chip ${activeView === "detail" ? "active" : ""}`}
            onClick={() => setActiveView("detail")} style={{fontSize: 13, padding: "8px 16px"}}>
            👤 {selectedSpender.handle}
          </button>
        )}
      </div>

      {/* ═══ 1) IMPORT TAB ═══ */}
      {activeView === "import" && (
        <div>
          <div className="card" style={{marginBottom: 16}}>
            <div className="section-title"><div className="section-bar"></div>📥 Import JSON (Scan OFM)</div>
            <p style={{color: "var(--text2)", fontSize: 13, marginBottom: 12}}>
              {fr ? "Importe tes fichiers JSON de scan OFM. 1 fichier = 1 modele." : "Import OFM scan JSON files. 1 file = 1 model."}
            </p>
            <div style={{background: "var(--accent-subtle)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: "var(--text2)"}}>
              <strong style={{color: "var(--accent)"}}>Format:</strong> {`{telegramId: {depense, spender, tw, contenu, transactions, resume, info}}`}
            </div>
            <div style={{display: "flex", gap: 12, alignItems: "center", marginBottom: 16}}>
              <label style={{background: "var(--grad)", color: "var(--text-primary)", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600}}>
                📂 {fr ? "Choisir fichier(s)" : "Choose file(s)"}
                <input type="file" accept=".json" multiple onChange={handleImportJSON} style={{display: "none"}} />
              </label>
              {importing && <span className="ai-loading"></span>}
            </div>
            {importLog.length > 0 && (
              <div style={{background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12, maxHeight: 300, overflow: "auto"}}>
                {importLog.map((log, i) => (
                  <div key={i} style={{fontSize: 12, padding: "3px 0", color: log.type === "error" ? "var(--danger)" : log.type === "success" ? "var(--success)" : "var(--text2)"}}>
                    {log.type === "error" ? "❌" : log.type === "success" ? "✅" : "ℹ️"} {log.msg}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Quick Add */}
          <div className="card">
            <div className="section-title"><div className="section-bar"></div>⚡ {fr ? "Ajout Rapide" : "Quick Add"}</div>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12}}>
              <input list="qa-spender-list" placeholder={fr ? "Pseudo spender" : "Handle"} value={quickForm.spender} onChange={e => setQuickForm({...quickForm, spender: e.target.value})} className="filter-select" autoComplete="off" />
              <datalist id="qa-spender-list">{(spenders||[]).map(s=><option key={s.handle||s.name} value={s.handle||s.name}/>)}</datalist>
              <input type="number" placeholder={fr ? "Montant" : "Amount"} value={quickForm.amount} onChange={e => setQuickForm({...quickForm, amount: e.target.value})} className="filter-select" />
            </div>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12}}>
              <select className="filter-select" value={quickForm.model_id} onChange={e => setQuickForm({...quickForm, model_id: e.target.value})}>
                <option value="">{fr ? "Modele" : "Model"}</option>
                {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select className="filter-select" value={quickForm.type} onChange={e => setQuickForm({...quickForm, type: e.target.value})}>
                <option value="">{fr ? "Type" : "Type"}</option>
                {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button onClick={handleQuickAdd} disabled={saving || !quickForm.spender || !quickForm.amount}
              style={{background: (!quickForm.spender || !quickForm.amount) ? "var(--border-accent)" : "var(--grad)", color: "var(--text-primary)", border: "none", borderRadius: 8, padding: "12px 32px", cursor: saving ? "wait" : "pointer", fontWeight: 700, width: "100%"}}>
              {saving ? "⏳ ..." : "✅ " + (fr ? "AJOUTER" : "ADD")}
            </button>
          </div>
        </div>
      )}

      {/* ═══ 2) METRIQUES ═══ */}
      {activeView === "metrics" && (
        <div>
          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20}}>
            {[
              {label: "CA Total", value: metrics.totalCA.toFixed(0) + currencySymbol, color: "var(--accent)"},
              {label: "Spenders", value: metrics.spenderCount, color: "var(--success)"},
              {label: "Timewasters", value: metrics.twCount, color: "var(--danger)"},
              {label: "Ticket Moyen", value: metrics.avgTicket.toFixed(0) + currencySymbol, color: "var(--blue-accent)"},
              {label: "Whales (200€+)", value: metrics.whales.length, color: "var(--warning)"},
              {label: "Silent Whales", value: metrics.silentWhales.length, color: "var(--warning)"},
            ].map((kpi) => (
              <div key={kpi.label} className="card" style={{textAlign: "center", padding: 16}}>
                <div style={{fontSize: 11, color: "var(--text2)", marginBottom: 4}}>{kpi.label}</div>
                <div style={{fontSize: 24, fontWeight: 800, color: kpi.color}}>{kpi.value}</div>
              </div>
            ))}
          </div>
          {/* Heatmap 24h */}
          <div className="card">
            <div className="section-title"><div className="section-bar"></div>🕐 {fr ? "Heatmap Horaire (TX)" : "Hourly Heatmap (TX)"}</div>
            <div style={{display: "flex", gap: 2, alignItems: "end", height: 80, marginTop: 12}}>
              {metrics.hourMap.map((v, h) => (
                <div key={h} style={{flex: 1, display: "flex", flexDirection: "column", alignItems: "center"}}>
                  <div style={{width: "100%", background: v > 0 ? `rgba(139,92,246,${0.2 + 0.8 * v / metrics.maxH})` : "var(--bg-overlay)", height: Math.max(4, 60 * v / metrics.maxH), borderRadius: 3}} title={`${h}h: ${v}`}></div>
                  <div style={{fontSize: 8, color: "var(--text-tertiary)", marginTop: 2}}>{h}h</div>
                </div>
              ))}
            </div>
          </div>
          {normalizedTxs.length === 0 && txs.length === 0 && (
            <div className="card" style={{textAlign: "center", padding: 32, color: "var(--text-tertiary)", marginTop: 16}}>
              {fr ? "Aucune transaction — importe des fichiers JSON d'abord" : "No transactions — import JSON files first"}
            </div>
          )}
        </div>
      )}

      {/* ═══ 3) PAR MODELE ═══ */}
      {activeView === "by_model" && (
        <div>
          {byModelData.length === 0 ? (
            <div className="card" style={{textAlign: "center", padding: 32, color: "var(--text-tertiary)"}}>
              {fr ? "Aucun modele — importe des fichiers JSON d'abord" : "No models — import JSON files first"}
            </div>
          ) : byModelData.map(model => (
            <div key={model.name} className="card" style={{marginBottom: 12}}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8}}>
                <div style={{fontWeight: 700, fontSize: 15}}>👩 {model.name}</div>
                <div style={{fontSize: 13, color: "var(--accent)", fontWeight: 700}}>{model.totalCA.toFixed(0)}{currencySymbol}</div>
              </div>
              <div style={{display: "flex", gap: 16, fontSize: 12, color: "var(--text2)"}}>
                <span>{model.contacts.length} contacts</span>
                <span>{model.nbTx} TX</span>
                <span>{fr ? "Ticket moy" : "Avg ticket"}: {model.nbTx > 0 ? (model.totalCA / model.nbTx).toFixed(0) : 0}{currencySymbol}</span>
              </div>
              <div style={{marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4}}>
                {model.contacts.filter(c => c.ltv > 0).slice(0, 8).map(c => (
                  <span key={c.spenderKey} onClick={() => { setSelectedSpenderKey(c.spenderKey); setActiveView("detail"); }}
                    style={{background: "var(--accent-muted)", color: "var(--accent)", padding: "2px 8px", borderRadius: 12, fontSize: 11, cursor: "pointer"}}>
                    {c.handle} ({c.ltv.toFixed(0)}{currencySymbol})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ 4) FICHES SPENDERS ═══ */}
      {activeView === "fiches" && (
        <div>
          {/* Search + Filters */}
          {spendersList.length > 0 && (
            <div style={{marginBottom: 16}}>
              <input placeholder={fr ? "🔍 Rechercher..." : "🔍 Search..."} value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="filter-select" style={{width: "100%", marginBottom: 10}} />
              <div style={{display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8}}>
                {[
                  {key: "all", label: fr ? "Tous" : "All", count: spendersList.length},
                  {key: "spenders", label: "Spenders", count: spendersList.filter(s => s.isSpender || s.ltv > 0).length},
                  {key: "vip", label: "VIP", count: spendersList.filter(s => s.ltv >= 200).length},
                  {key: "tw", label: "TW", count: spendersList.filter(s => s.isTW).length},
                  {key: "silent_whale", label: "Silent 🐋", count: spendersList.filter(s => s.tags.includes("silent_whale")).length},
                  {key: "cold", label: "Cold", count: spendersList.filter(s => s.recencyDays > 14).length},
                ].map(f => (
                  <button key={f.key} className={`filter-chip ${activeFilter === f.key ? "active" : ""}`}
                    onClick={() => setActiveFilter(f.key)} style={{fontSize: 11, padding: "4px 10px"}}>
                    {f.label} ({f.count})
                  </button>
                ))}
                {modelNames.length > 1 && (
                  <select className="filter-select" value={filterModel} onChange={e => setFilterModel(e.target.value)} style={{fontSize: 11, padding: "4px 8px"}}>
                    <option value="all">{fr ? "Tous modeles" : "All models"}</option>
                    {modelNames.map(mn => <option key={mn} value={mn}>{mn}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Empty states */}
          {rawData.length === 0 && txs.length === 0 && (
            <div className="card" style={{textAlign: "center", padding: 40, color: "var(--text-tertiary)"}}>
              <div style={{fontSize: 40, marginBottom: 12}}>📂</div>
              {fr ? "Aucun fichier importe — Importe tes scans OFM (.json)" : "No files imported — Import your OFM scans (.json)"}
            </div>
          )}
          {rawData.length > 0 && normalizedTxs.length === 0 && txs.length === 0 && (
            <div className="card" style={{textAlign: "center", padding: 32, color: "var(--danger)"}}>
              ⚠️ {fr ? "Fichiers lus mais 0 transaction avec montant > 0" : "Files read but 0 transactions with amount > 0"}
            </div>
          )}
          {spendersList.length > 0 && filteredSpenders.length === 0 && (
            <div className="card" style={{textAlign: "center", padding: 32, color: "var(--text-tertiary)"}}>
              {fr ? "Spenders trouves mais 0 affiche — verifie les filtres" : "Spenders found but 0 displayed — check filters"}
            </div>
          )}

          {/* Cards grid */}
          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12}}>
            {filteredSpenders.map(s => (
              <div key={s.spenderKey} className="card" onClick={() => { setSelectedSpenderKey(s.spenderKey); setActiveView("detail"); }}
                style={{cursor: "pointer", transition: "transform 0.15s", position: "relative"}}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8}}>
                  <div>
                    <div style={{fontWeight: 700, fontSize: 14}}>{s.handle}</div>
                    <div style={{fontSize: 11, color: "var(--text-tertiary)"}}>{s.modelName} • tg:{s.spenderKey.substring(0, 8)}</div>
                  </div>
                  <span style={{background: s.segment === "whale" ? "var(--warning-muted)" : s.segment === "vip" ? "var(--accent-muted)" : "var(--border-strong)",
                    color: s.segment === "whale" ? "var(--warning)" : s.segment === "vip" ? "#a78bfa" : "var(--text2)",
                    padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600}}>
                    {s.segment.toUpperCase()}
                  </span>
                </div>
                {s.tags.length > 0 && (
                  <div style={{display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8}}>
                    {s.tags.map(tag => (
                      <span key={tag} style={{fontSize: 9, padding: "1px 6px", borderRadius: 8,
                        background: tag === "whale" ? "var(--warning-muted)" : tag === "timewaster" ? "var(--danger-muted)" : tag === "silent_whale" ? "var(--warning-muted)" : tag === "cold" ? "var(--accent-muted)" : "var(--success-muted)",
                        color: tag === "whale" ? "var(--warning)" : tag === "timewaster" ? "var(--danger)" : tag === "silent_whale" ? "#f97316" : tag === "cold" ? "#60a5fa" : "var(--success)",
                      }}>{tag}</span>
                    ))}
                  </div>
                )}
                <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 11}}>
                  <div><span style={{color: "var(--text-tertiary)"}}>LTV</span><br/><strong style={{color: "var(--success)"}}>{s.ltv.toFixed(0)}{currencySymbol}</strong></div>
                  <div><span style={{color: "var(--text-tertiary)"}}>TX</span><br/><strong>{s.nbTx}</strong></div>
                  <div><span style={{color: "var(--text-tertiary)"}}>{fr ? "Moy" : "Avg"}</span><br/><strong>{s.avgTicket.toFixed(0)}{currencySymbol}</strong></div>
                </div>
                {s.info && s.info.prenom && s.info.prenom !== "?" && (
                  <div style={{marginTop: 6, fontSize: 10, color: "var(--text-tertiary)"}}>
                    👤 {s.info.prenom}{s.info.age && s.info.age !== "?" ? `, ${s.info.age}` : ""}{s.info.metier && s.info.metier !== "?" ? ` • ${s.info.metier}` : ""}
                  </div>
                )}
                {s.resume && (
                  <div style={{marginTop: 6, fontSize: 10, color: "var(--text-tertiary)", fontStyle: "italic", maxHeight: 32, overflow: "hidden"}}>
                    {s.resume.substring(0, 100)}{s.resume.length > 100 ? "..." : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ 5) DETAIL VIEW ═══ */}
      {activeView === "detail" && selectedSpender && (() => {
        const s = selectedSpender;
        return (
          <div>
            <button onClick={() => setActiveView("fiches")} style={{background: "none", border: "none", color: "var(--accent)", cursor: "pointer", marginBottom: 16, fontSize: 13}}>
              ← {fr ? "Retour aux fiches" : "Back to files"}
            </button>
            <div className="card" style={{marginBottom: 16}}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12}}>
                <div>
                  <div style={{fontSize: 20, fontWeight: 800}}>{s.handle}</div>
                  <div style={{fontSize: 12, color: "var(--text-tertiary)"}}>tg:{s.spenderKey} • {s.modelName}</div>
                </div>
                <div style={{display: "flex", gap: 6, alignItems: "center"}}>
                  {navigateToSpender && s.ltv > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); navigateToSpender(s.handle); }}
                      style={{background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--border-accent)", borderRadius: 8, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontWeight: 600}}>
                      👥 Page Spenders
                    </button>
                  )}
                  {s.tags.map(tag => (
                    <span key={tag} style={{fontSize: 10, padding: "2px 8px", borderRadius: 12,
                      background: tag === "whale" ? "var(--warning-muted)" : tag === "timewaster" ? "rgba(248,113,113,0.2)" : tag === "silent_whale" ? "rgba(249,115,22,0.2)" : "var(--accent-muted)",
                      color: tag === "whale" ? "var(--warning)" : tag === "timewaster" ? "var(--danger)" : tag === "silent_whale" ? "#f97316" : "var(--accent)", fontWeight: 600,
                    }}>{tag}</span>
                  ))}
                </div>
              </div>
              {s.info && (s.info.prenom !== "?" || s.info.age !== "?" || s.info.metier !== "?") && (
                <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16, padding: 12, background: "var(--accent-subtle)", borderRadius: 8}}>
                  <div><span style={{fontSize: 10, color: "var(--text-tertiary)"}}>Prenom</span><br/><strong>{s.info.prenom || "?"}</strong></div>
                  <div><span style={{fontSize: 10, color: "var(--text-tertiary)"}}>Age</span><br/><strong>{s.info.age || "?"}</strong></div>
                  <div><span style={{fontSize: 10, color: "var(--text-tertiary)"}}>Metier</span><br/><strong>{s.info.metier || "?"}</strong></div>
                </div>
              )}
              <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16}}>
                <div className="card" style={{textAlign: "center", padding: 12}}>
                  <div style={{fontSize: 10, color: "var(--text-tertiary)"}}>LTV</div>
                  <div style={{fontSize: 22, fontWeight: 800, color: "var(--success)"}}>{s.ltv.toFixed(0)}{currencySymbol}</div>
                </div>
                <div className="card" style={{textAlign: "center", padding: 12}}>
                  <div style={{fontSize: 10, color: "var(--text-tertiary)"}}>TX</div>
                  <div style={{fontSize: 22, fontWeight: 800}}>{s.nbTx}</div>
                </div>
                <div className="card" style={{textAlign: "center", padding: 12}}>
                  <div style={{fontSize: 10, color: "var(--text-tertiary)"}}>{fr ? "Moy" : "Avg"}</div>
                  <div style={{fontSize: 22, fontWeight: 800}}>{s.avgTicket.toFixed(0)}{currencySymbol}</div>
                </div>
                <div className="card" style={{textAlign: "center", padding: 12}}>
                  <div style={{fontSize: 10, color: "var(--text-tertiary)"}}>Max</div>
                  <div style={{fontSize: 22, fontWeight: 800}}>{s.maxTicket.toFixed(0)}{currencySymbol}</div>
                </div>
              </div>
              {s.resume && (
                <div style={{padding: 12, background: "var(--accent-subtle)", borderRadius: 8, marginBottom: 16}}>
                  <div style={{fontSize: 11, color: "var(--accent)", fontWeight: 600, marginBottom: 4}}>🤖 Resume IA</div>
                  <div style={{fontSize: 12, color: "var(--text2)", lineHeight: 1.5}}>{s.resume}</div>
                </div>
              )}
              {s.contenu && s.contenu.length > 0 && (
                <div style={{marginBottom: 16}}>
                  <div style={{fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4}}>📦 Contenu achete</div>
                  <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
                    {s.contenu.map((c, i) => (
                      <span key={i} style={{background: "var(--accent-subtle)", color: "var(--accent)", padding: "2px 8px", borderRadius: 8, fontSize: 11}}>{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Transaction history */}
            <div className="card">
              <div className="section-title"><div className="section-bar"></div>📋 {fr ? "Historique Transactions" : "Transaction History"} ({s.txList.length})</div>
              {s.txList.length === 0 ? (
                <div style={{textAlign: "center", padding: 24, color: "var(--text-tertiary)", fontSize: 12}}>
                  {fr ? "Aucune transaction" : "No transactions"}
                </div>
              ) : (
                <div style={{overflowX: "auto"}}>
                  <table style={{width: "100%", fontSize: 12, borderCollapse: "collapse"}}>
                    <thead>
                      <tr style={{borderBottom: "1px solid var(--accent-muted)"}}>
                        <th style={{textAlign: "left", padding: "8px 6px", color: "var(--text-tertiary)", fontSize: 10}}>Date</th>
                        <th style={{textAlign: "left", padding: "8px 6px", color: "var(--text-tertiary)", fontSize: 10}}>Modele</th>
                        <th style={{textAlign: "right", padding: "8px 6px", color: "var(--text-tertiary)", fontSize: 10}}>Montant</th>
                        <th style={{textAlign: "left", padding: "8px 6px", color: "var(--text-tertiary)", fontSize: 10}}>Provider</th>
                        <th style={{textAlign: "left", padding: "8px 6px", color: "var(--text-tertiary)", fontSize: 10}}>Status</th>
                        <th style={{textAlign: "left", padding: "8px 6px", color: "var(--text-tertiary)", fontSize: 10}}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.txList.sort((a, b) => (b.txDate || "").localeCompare(a.txDate || "")).map((tx) => (
                        <tr key={tx.txId} style={{borderBottom: "1px solid var(--border-subtle)"}}>
                          <td style={{padding: "6px"}}>{tx.txDate ? fmtDate(tx.txDate) : "-"}</td>
                          <td style={{padding: "6px"}}>{tx.modelName || "-"}</td>
                          <td style={{padding: "6px", textAlign: "right", fontWeight: 700, color: "var(--success)"}}>{tx.amount.toFixed(0)}{currencySymbol}</td>
                          <td style={{padding: "6px"}}>{tx.providerName || "-"}</td>
                          <td style={{padding: "6px"}}><span style={{fontSize: 10, padding: "1px 6px", borderRadius: 8, background: tx.status === "validated" ? "var(--success-muted)" : "var(--warning-muted)", color: tx.status === "validated" ? "var(--success)" : "var(--warning)"}}>{tx.status}</span></td>
                          <td style={{padding: "6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-tertiary)"}}>{tx.description || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ═══ DEBUG PANEL ═══ */}
      <div style={{marginTop: 24, borderTop: "1px solid var(--accent-muted)", paddingTop: 12}}>
        <button onClick={() => setShowDebug(!showDebug)} style={{background: "none", border: "1px solid var(--border-accent)", color: "var(--text2)", fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer"}}>
          🔧 {showDebug ? "Masquer Debug" : "Debug Panel"}
        </button>
        {showDebug && (
          <div style={{marginTop: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 16, fontSize: 11, fontFamily: "monospace", color: "var(--text2)"}}>
            <div style={{fontWeight: 700, color: "var(--accent)", marginBottom: 8}}>🔬 PIPELINE CHECKS</div>
            <div style={{marginBottom: 6}}>
              <strong>{rawData.length > 0 ? "✅" : "❌"} CHECK 1 — raw_count:</strong>{" "}
              <span style={{color: rawData.length > 0 ? "var(--success)" : "var(--danger)"}}>{rawData.length}</span>
              {rawData.length > 0 && <span> | sample: tg:{rawData[0].telegramId} = {rawData[0].entry.orig || "?"} (depense:{rawData[0].entry.depense})</span>}
            </div>
            <div style={{marginBottom: 6}}>
              <strong>{normalizedTxs.length > 0 ? "✅" : "❌"} CHECK 2 — normalized_tx_count:</strong>{" "}
              <span style={{color: normalizedTxs.length > 0 ? "var(--success)" : "var(--danger)"}}>{normalizedTxs.length}</span>
              {normalizedTxs.slice(0, 3).map((tx, i) => (
                <div key={i} style={{marginLeft: 16, fontSize: 10, color: "var(--text-tertiary)"}}>
                  [{tx.txId}] {tx.spenderHandle} | {fmtAmount(tx.amount,tx.currency)} | {tx.modelName} | {tx.providerName}
                </div>
              ))}
            </div>
            <div style={{marginBottom: 6}}>
              <strong>{spendersList.length > 0 ? "✅" : "❌"} CHECK 3 — distinct_spender_count:</strong>{" "}
              <span style={{color: spendersList.length > 0 ? "var(--success)" : "var(--danger)"}}>{spendersList.length}</span>
              {" "}(with LTV&gt;0: {spendersList.filter(s => s.ltv > 0).length})
              {spendersList.filter(s => s.ltv > 0).slice(0, 5).map((s, i) => (
                <div key={i} style={{marginLeft: 16, fontSize: 10, color: "var(--text-tertiary)"}}>
                  {s.handle} | LTV:{s.ltv.toFixed(0)}{currencySymbol} | TX:{s.nbTx} | {s.segment}
                </div>
              ))}
            </div>
            <div style={{marginBottom: 6}}>
              <strong>{filteredSpenders.length > 0 ? "✅" : "⚠️"} CHECK 4 — cards_rendered:</strong>{" "}
              <span style={{color: filteredSpenders.length > 0 ? "var(--success)" : "var(--danger)"}}>{filteredSpenders.length}</span>
              {" "}(filter: {activeFilter}, model: {filterModel})
            </div>
            <div style={{marginBottom: 6}}>
              <strong>ℹ️ CHECK 5 — Supabase:</strong>{" "}
              txs.length={txs.length} | url={typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL.substring(8, 35) + "..." : "?"}
            </div>
            <div style={{color: "var(--text-tertiary)", borderTop: "1px solid var(--border-default)", paddingTop: 6, marginTop: 6}}>
              🕒 {new Date().toLocaleTimeString("fr-FR",{timeZone:_tz.current})}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

module.exports = TelegramTab;
