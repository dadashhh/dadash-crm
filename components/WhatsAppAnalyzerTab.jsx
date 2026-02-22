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

const WhatsAppAnalyzerTab = ({user, lang, spenders, txs, models, profiles, onRefresh}) => {
  const fr = lang === "fr";
  const addToast = useToast();
  const { convertAmount, currencySymbol } = useCurrency();

  const [messages, setMessages] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [activeView, setActiveView] = useState("import");
  const [selectedParticipant, setSelectedParticipant] = useState("all");

  // ── IA Analysis state ──
  const [claudeKey, setClaudeKey] = useState(() => localStorage.getItem("dadash_claude_key") || "");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState([]); // [{waContact, _raw}]
  const [tgMatches, setTgMatches] = useState([]); // [{waContact, tgMatch, matchScore, matchReason, confidence}]
  const [importedMap, setImportedMap] = useState({}); // {idx: true}
  const [importingMap, setImportingMap] = useState({});

  // ── WhatsApp export parser ──
  // Handles formats:
  //   [M/DD/YY, h:mm:ss AM] ~Name: msg   (US with brackets + optional tilde)
  //   [M/DD/YY, h:mm:ss AM] Name: msg
  //   [dd/mm/yyyy, hh:mm:ss] Name: msg    (EU with brackets)
  //   dd/mm/yyyy, hh:mm - Name: msg       (EU without brackets)
  //   dd/mm/yyyy hh:mm - Name: msg
  const parseWhatsApp = (text) => {
    const lines = text.split("\n");
    const results = [];
    // Multi-format regex — order matters: bracketed first, then bare
    const datePatterns = [
      // [date, time] (optional ~)Name:  — US/bracketed format (no dash after bracket)
      /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[APap][Mm])\]\s+/,
      // [date, time] Name:  — EU bracketed without AM/PM
      /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?)\]\s+/,
      // date, time - Name:  — bare with dash separator
      /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s*[-–]\s+/,
      // date time - Name:  — bare without comma
      /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s*[-–]\s+/,
    ];

    // Skip known system/header lines
    const skipLine = (l) => /^(Messages and calls are end-to-end encrypted|Les messages et les appels sont chiffr)/i.test(l.trim());

    let currentMsg = null;
for (let line of lines) {
    line = line.replace(/[\u200E\u200F\u200B\u00A0\uFEFF]/g, "").trim();      if (skipLine(line)) continue;
      let matched = false;
      for (const pat of datePatterns) {
        const m = line.match(pat);
        if (m) {
          if (currentMsg) results.push(currentMsg);
          const dateStr = m[1];
          const timeStr = m[2];
          const rest = line.slice(m[0].length);
          // Strip leading ~ (WhatsApp contact prefix)
          const cleanRest = rest.replace(/^~\s*/, "");
          const colonIdx = cleanRest.indexOf(":");
          if (colonIdx > 0 && colonIdx < 60) {
            const sender = cleanRest.slice(0, colonIdx).trim();
            const body = cleanRest.slice(colonIdx + 1).trim();
            // Parse date parts
            const dateParts = dateStr.split("/");
            let day, month, year;
            if (dateParts.length === 3) {
              const p0 = parseInt(dateParts[0], 10);
              const p1 = parseInt(dateParts[1], 10);
              year = parseInt(dateParts[2], 10);
              if (year < 100) year += 2000;
              // Detect M/D/YY (US) vs D/M/YY (EU)
              if (p1 > 12) {
                // p1 can't be month → must be M/D/YY (US format)
                month = p0; day = p1;
              } else if (p0 > 12) {
                // p0 can't be month → must be D/M/YY (EU format)
                day = p0; month = p1;
              } else {
                // Ambiguous — use US (M/D/YY) for bracketed format, EU for bare
                if (line.startsWith("[")) { month = p0; day = p1; }
                else { day = p0; month = p1; }
              }
            }
            // Parse time with AM/PM support
            const isPM = /PM/i.test(timeStr);
            const isAM = /AM/i.test(timeStr);
            const timeParts = timeStr.replace(/\s*[APap][Mm]/g, "").trim().split(":");
            let hour = parseInt(timeParts[0], 10);
            const min = parseInt(timeParts[1], 10) || 0;
            const sec = parseInt(timeParts[2], 10) || 0;
            if (isPM && hour < 12) hour += 12;
            if (isAM && hour === 12) hour = 0;
            const date = new Date(year, month - 1, day, hour, min, sec);
            const isMedia = /(<Media omitted>|<Médias omis>|image omitted|video omitted|audio omitted|document omitted|sticker omitted|GIF omitted)/i.test(body);
            const isLink = /(https?:\/\/[^\s]+)/i.test(body);
            currentMsg = { date, sender, body, isMedia, isLink, isSystem: false };
          } else {
            // System message (no colon = no sender)
            if (currentMsg) results.push(currentMsg);
            currentMsg = { date: new Date(), sender: "__system__", body: cleanRest, isMedia: false, isLink: false, isSystem: true };
          }
          matched = true;
          break;
        }
      }
      if (!matched && currentMsg && line.trim()) {
        currentMsg.body += "\n" + line.trim();
      }
    }
    if (currentMsg) results.push(currentMsg);
    return results.filter(m => !m.isSystem && m.sender !== "__system__");
  };

  // ── Import handler ──
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setParsing(true);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseWhatsApp(text);
      if (parsed.length === 0) {
        addToast(fr ? "Aucun message trouvé. Vérifie le format du fichier." : "No messages found. Check file format.", "error");
      } else {
        setMessages(parsed);
        addToast(fr ? `${parsed.length} messages analysés ✓` : `${parsed.length} messages analyzed ✓`, "success");
        setTimeout(() => setActiveView("overview"), 400);
      }
    } catch (err) {
      addToast(fr ? "Erreur de lecture: " + err.message : "Read error: " + err.message, "error");
    }
    setParsing(false);
    e.target.value = "";
  };

  // ── Computed analytics ──
  const participants = useMemo(() => {
    const map = {};
    messages.forEach(m => {
      if (!map[m.sender]) map[m.sender] = { name: m.sender, count: 0, chars: 0, media: 0, links: 0, words: 0 };
      map[m.sender].count++;
      map[m.sender].chars += m.body.length;
      map[m.sender].words += m.body.split(/\s+/).filter(Boolean).length;
      if (m.isMedia) map[m.sender].media++;
      if (m.isLink) map[m.sender].links++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [messages]);

  const filteredMsgs = useMemo(() => {
    if (selectedParticipant === "all") return messages;
    return messages.filter(m => m.sender === selectedParticipant);
  }, [messages, selectedParticipant]);

  const overview = useMemo(() => {
    if (!messages.length) return null;
    const dates = messages.map(m => m.date).filter(d => !isNaN(d));
    const first = new Date(Math.min(...dates));
    const last = new Date(Math.max(...dates));
    const days = Math.max(1, Math.ceil((last - first) / 86400000));
    const totalWords = messages.reduce((a, m) => a + m.body.split(/\s+/).filter(Boolean).length, 0);
    const totalMedia = messages.filter(m => m.isMedia).length;
    const totalLinks = messages.filter(m => m.isLink).length;
    return {
      total: messages.length, participants: participants.length, first, last, days,
      avgPerDay: (messages.length / days).toFixed(1), totalWords, totalMedia, totalLinks,
      avgWordsPerMsg: messages.length ? (totalWords / messages.length).toFixed(1) : 0,
    };
  }, [messages, participants]);

  // Hourly activity
  const hourlyData = useMemo(() => {
    const hours = Array(24).fill(0);
    filteredMsgs.forEach(m => { if (!isNaN(m.date)) hours[m.date.getHours()]++; });
    return hours.map((count, h) => ({ hour: `${h}h`, count }));
  }, [filteredMsgs]);

  // Daily activity
  const dailyData = useMemo(() => {
    const map = {};
    filteredMsgs.forEach(m => {
      if (isNaN(m.date)) return;
      const key = m.date.toISOString().slice(0, 10);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort().map(([date, count]) => ({ date, count }));
  }, [filteredMsgs]);

  // Day of week
  const dowData = useMemo(() => {
    const names = fr
      ? ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const counts = Array(7).fill(0);
    filteredMsgs.forEach(m => { if (!isNaN(m.date)) counts[m.date.getDay()]++; });
    return counts.map((count, i) => ({ day: names[i], count }));
  }, [filteredMsgs, fr]);

  // Top words
  const topWords = useMemo(() => {
    const stopFR = new Set(["de","le","la","les","un","une","des","et","en","du","au","aux","est","a","je","tu","il","elle","on","nous","vous","ils","elles","ce","se","ne","pas","que","qui","mais","ou","dans","pour","par","sur","avec","son","sa","ses","mon","ma","mes","ton","ta","tes","plus","très","bien","tout","cette","ces","leur","leurs","fait","été","avoir","être","faire","dit","aussi","comme","quoi","moi","toi","lui","ça","là","oui","non","si","car"]);
    const stopEN = new Set(["the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","shall","should","may","might","can","could","i","you","he","she","it","we","they","me","him","her","us","them","my","your","his","its","our","their","this","that","these","those","and","but","or","so","if","in","on","at","to","for","of","with","not","no","yes","from","by","up","out","just","like","what","when","how","all","very","too"]);
    const stops = new Set([...stopFR, ...stopEN]);
    const freq = {};
    filteredMsgs.forEach(m => {
      if (m.isMedia) return;
      m.body.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).forEach(w => {
        if (w.length < 3 || stops.has(w)) return;
        freq[w] = (freq[w] || 0) + 1;
      });
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([word, count]) => ({ word, count }));
  }, [filteredMsgs]);

  // Response times (per participant)
  const responseTimes = useMemo(() => {
    if (messages.length < 2) return [];
    const rtMap = {};
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const cur = messages[i];
      if (prev.sender === cur.sender) continue;
      const diffMs = cur.date - prev.date;
      if (diffMs < 0 || diffMs > 3600000 * 4) continue; // skip > 4h gaps
      if (!rtMap[cur.sender]) rtMap[cur.sender] = [];
      rtMap[cur.sender].push(diffMs / 60000); // minutes
    }
    return Object.entries(rtMap).map(([name, times]) => ({
      name,
      avg: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1),
      median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)]?.toFixed(1) || "0",
      count: times.length,
    })).sort((a, b) => parseFloat(a.avg) - parseFloat(b.avg));
  }, [messages]);

  // Messages per participant (for bar chart)
  const participantChartData = useMemo(() => {
    return participants.slice(0, 15).map(p => ({ name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name, messages: p.count, fullName: p.name }));
  }, [participants]);

  // Emoji frequency
  const topEmojis = useMemo(() => {
    const freq = {};
    filteredMsgs.forEach(m => {
      const emojis = m.body.match(/\p{Extended_Pictographic}/gu) || [];
      emojis.forEach(e => { freq[e] = (freq[e] || 0) + 1; });
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([emoji, count]) => ({ emoji, count }));
  }, [filteredMsgs]);

  // ══ IA ANALYSIS ══
  const WA_ANALYSIS_PROMPT = `Tu es un analyste expert de conversations WhatsApp pour une agence de modèles. Analyse cette conversation et extrais les informations.
CONTEXTE : C'est une conversation entre un(e) modèle (l'agence) et un client potentiel/spender.
Retourne UNIQUEMENT un JSON valide avec cette structure :
{
  "contact": {"display_name":"","first_name":null,"age":null,"city":null,"country":null,"job":null,"relationship_status":"inconnu","language":"fr"},
  "spending": {"total_detected":0,"currency":"EUR","transactions":[{"amount":0,"currency":"EUR","product":null,"date":null,"confirmed":false}],"payment_methods_mentioned":[]},
  "classification":"lead","classification_reason":"",
  "behavior": {"interest_level":"medium","favorite_content":null,"responsiveness":"normal","best_time":null,"personality_notes":"","preferences":null,"risk_flags":[]},
  "telegram_clues": {"mentions_telegram":false,"telegram_username":null,"redirected_to_telegram":false},
  "summary":"","recommended_action":""
}
RÈGLES :
- total_detected = somme des montants dont on a une confirmation de paiement
- confirmed = true si le client a dit "envoyé","payé","c'est fait" ou si le modèle a confirmé réception
- Classification: whale(500€+), vip(200-500€), regular(50-200€), lead(intéressé pas acheté), timewaster(10+msg 0 achat)
- Retourne UNIQUEMENT le JSON, sans backticks, sans explication.`;

  const analyzeWithClaude = async () => {
    if (!claudeKey.trim()) { addToast(fr ? "Ajoute ta clé API Claude" : "Add your Claude API key", "warning"); return; }
    if (messages.length === 0) { addToast(fr ? "Importe d'abord une conversation" : "Import a conversation first", "warning"); return; }
    localStorage.setItem("dadash_claude_key", claudeKey);
    setAnalyzing(true);
    try {
      // Group messages by conversation (all in one for single file import)
      const recentMsgs = messages.slice(-200);
      const text = recentMsgs.map(m => `${m.date instanceof Date ? m.date.toLocaleString("fr-FR") : m.date} - ${m.sender}: ${m.body}`).join("\n");
      const contactName = participants.length >= 2
        ? participants.sort((a,b) => a.count - b.count)[0]?.name || "inconnu"
        : participants[0]?.name || "inconnu";
      const phone = extractPhoneFromFilename(fileName || "");

      const resp = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": claudeKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: WA_ANALYSIS_PROMPT,
          messages: [{ role: "user", content: `Analyse cette conversation WhatsApp :\n\nContact : ${contactName}\nNuméro : ${phone || "inconnu"}\n\n--- CONVERSATION ---\n${text}\n--- FIN ---` }],
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const raw = (data.content?.[0]?.text || "").trim().replace(/```json|```/g, "").trim();
      const analysis = JSON.parse(raw);
      const result = {
        ...analysis,
        _raw: { filename: fileName, phone, contactName, totalMessages: messages.length, dateRange: { first: messages[0]?.date, last: messages[messages.length-1]?.date } },
      };
      // Cross-match with existing spenders (TG contacts)
      const matched = crossMatchTelegram(result, spenders || []);
      setAnalysisResults([result]);
      setTgMatches([matched]);
      setImportedMap({});
      setImportingMap({});
      addToast(fr ? "Analyse IA terminée !" : "IA analysis complete!", "success");
      setActiveView("results");
    } catch (err) {
      addToast(fr ? "Erreur IA: " + err.message : "IA error: " + err.message, "error");
    }
    setAnalyzing(false);
  };

  const extractPhoneFromFilename = (filename) => {
    const phoneMatch = (filename || "").match(/\+?\d[\d\s\-]{8,}/);
    return phoneMatch ? phoneMatch[0].replace(/[\s\-]/g, "") : null;
  };

  // ── Cross-match Telegram ──
  const crossMatchTelegram = (waResult, dbSpenders) => {
    let bestMatch = null, matchScore = 0, matchReason = "";
    const wa = waResult;
    for (const sp of dbSpenders) {
      let score = 0; const reasons = [];
      // Match by first name
      if (wa.contact?.first_name && sp.first_name && wa.contact.first_name.toLowerCase() === sp.first_name.toLowerCase()) {
        score += 40; reasons.push(fr ? "même prénom" : "same first name");
      }
      // Match by telegram username mentioned in conversation
      if (wa.telegram_clues?.telegram_username && sp.telegram_username && wa.telegram_clues.telegram_username.replace("@","").toLowerCase() === sp.telegram_username.replace("@","").toLowerCase()) {
        score += 80; reasons.push("@username TG");
      }
      // Match by handle / display name
      if (wa.contact?.display_name && sp.handle && wa.contact.display_name.toLowerCase() === sp.handle.toLowerCase()) {
        score += 50; reasons.push(fr ? "même handle" : "same handle");
      }
      // Match by city
      if (wa.contact?.city && sp.city && wa.contact.city.toLowerCase() === sp.city.toLowerCase()) {
        score += 15; reasons.push(fr ? "même ville" : "same city");
      }
      // Match by age (±2)
      if (wa.contact?.age && sp.age && Math.abs(wa.contact.age - sp.age) <= 2) {
        score += 10; reasons.push(fr ? "âge similaire" : "similar age");
      }
      // Match by spending
      const spTxs = (txs || []).filter(t => t.spender_handle === sp.handle);
      const spTotal = spTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      if (wa.spending?.total_detected > 0 && spTotal > 0) {
        const ratio = wa.spending.total_detected / spTotal;
        if (ratio > 0.8 && ratio < 1.2) { score += 10; reasons.push(fr ? "dépenses similaires" : "similar spending"); }
      }
      if (wa.telegram_clues?.redirected_to_telegram && score >= 40) {
        score += 20; reasons.push(fr ? "redirigé vers TG" : "redirected to TG");
      }
      if (score > matchScore) { matchScore = score; bestMatch = sp; matchReason = reasons.join(" + "); }
    }
    return {
      waContact: wa,
      tgMatch: matchScore >= 40 ? bestMatch : null,
      matchScore,
      matchReason,
      confidence: matchScore >= 80 ? "high" : matchScore >= 40 ? "medium" : "low",
    };
  };

  // ── Import to CRM ──
  const importToCRM = async (idx, result) => {
    setImportingMap(p => ({...p, [idx]: true}));
    try {
      const wa = result.waContact || result;
      const phone = wa._raw?.phone || null;
      const handle = wa.contact?.display_name?.replace(/\s+/g, "_").toLowerCase() || wa._raw?.contactName?.replace(/\s+/g, "_").toLowerCase() || "wa_unknown";
      const spenderData = {
        handle,
        name: wa.contact?.display_name || handle,
        first_name: wa.contact?.first_name || null,
        age: wa.contact?.age || null,
        city: wa.contact?.city || null,
        job: wa.contact?.job || null,
        relationship_status: wa.contact?.relationship_status || null,
        whatsapp_phone: phone,
        classification: wa.classification || "lead",
        favorite_content: wa.behavior?.favorite_content || null,
        best_time: wa.behavior?.best_time || null,
        personality_notes: wa.behavior?.personality_notes || null,
        source: "whatsapp_scan",
        last_contact_date: new Date().toISOString(),
        status: "active",
      };
      // Upsert spender
      await safeUpsertSpender(spenderData);
      // Create confirmed TX
      const confirmedTx = (wa.spending?.transactions || []).filter(t => t.confirmed);
      for (const tx of confirmedTx) {
        await safeInsertTx({
          amount: tx.amount,
          currency: tx.currency || wa.spending?.currency || "EUR",
          spender_handle: handle,
          product: tx.product || null,
          status: "pending",
          notes: "Auto-detect WhatsApp Analyzer",
          date: tx.date ? new Date(tx.date.split("/").reverse().join("-")).toISOString() : new Date().toISOString(),
          chatter_id: user.id,
        });
      }
      // Link to TG match if exists
      const match = tgMatches[idx];
      if (match?.tgMatch?.id) {
        await sb.from("spenders").update({ whatsapp_phone: phone }).eq("id", match.tgMatch.id);
      }
      // Log analysis
      try {
        await sb.from("wa_analysis_logs").insert({
          analyzed_by: user.id,
          filename: wa._raw?.filename || null,
          contact_phone: phone,
          contact_name: wa.contact?.display_name || null,
          total_messages: wa._raw?.totalMessages || 0,
          analysis_result: wa,
          tg_match_id: match?.tgMatch?.id || null,
          tg_match_score: match?.matchScore || 0,
          imported: true,
        });
      } catch (e) { /* wa_analysis_logs insert failed */ }
      setImportedMap(p => ({...p, [idx]: true}));
      addToast(fr ? `${wa.contact?.display_name || handle} importé dans le CRM !` : `${wa.contact?.display_name || handle} imported to CRM!`, "success");
      if (onRefresh) await onRefresh();
    } catch (err) {
      addToast(fr ? "Erreur import: " + err.message : "Import error: " + err.message, "error");
    }
    setImportingMap(p => ({...p, [idx]: false}));
  };

  // ── Analysis KPIs ──
  const analysisKPIs = useMemo(() => {
    if (!analysisResults.length) return null;
    const contacts = analysisResults.length;
    const whales = analysisResults.filter(r => r.classification === "whale").length;
    const totalSpent = analysisResults.reduce((s, r) => s + (r.spending?.total_detected || 0), 0);
    const tgMatchCount = tgMatches.filter(m => m.tgMatch).length;
    const totalTx = analysisResults.reduce((s, r) => s + (r.spending?.transactions?.filter(t => t.confirmed)?.length || 0), 0);
    return { contacts, whales, totalSpent, tgMatchCount, totalTx };
  }, [analysisResults, tgMatches]);

  const COLORS = ["#818cf8", "#34d399", "#f472b6", "#fbbf24", "var(--danger)", "#22d3ee", "#a78bfa", "#fb923c", "#4ade80", "#e879f9"];

  // ── Card helper ──
  const StatCard = ({icon, label, value, sub}) => (
    <div className="card" style={{padding: "16px 20px", flex: "1 1 180px", minWidth: 160}}>
      <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 6}}>
        <span style={{fontSize: 18}}>{icon}</span>
        <span style={{fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600}}>{label}</span>
      </div>
      <div style={{fontSize: 24, fontWeight: 800, color: "var(--text-primary)"}}>{value}</div>
      {sub && <div style={{fontSize: 11, color: "var(--text-tertiary)", marginTop: 2}}>{sub}</div>}
    </div>
  );

  // ══════════════════════════════════
  // RENDER
  // ══════════════════════════════════
  return (
    <div>
      {/* ═══ NAV TABS ═══ */}
      <div style={{display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap"}}>
        {[
          {key: "import", icon: "📱", label: fr ? "Import WhatsApp" : "Import WhatsApp"},
          ...(messages.length > 0 ? [
            {key: "ia_analyze", icon: "🤖", label: fr ? "Analyse IA" : "IA Analysis"},
            ...(analysisResults.length > 0 ? [{key: "results", icon: "📋", label: fr ? "Résultats" : "Results"}] : []),
            {key: "overview", icon: "📊", label: fr ? "Vue globale" : "Overview"},
            {key: "participants", icon: "👥", label: fr ? "Participants" : "Participants"},
            {key: "activity", icon: "📈", label: fr ? "Activité" : "Activity"},
            {key: "words", icon: "💬", label: fr ? "Mots & Emojis" : "Words & Emojis"},
            {key: "response", icon: "⚡", label: fr ? "Temps de réponse" : "Response Time"},
          ] : []),
        ].map(tab => (
          <button key={tab.key}
            className={`filter-chip ${activeView === tab.key ? "active" : ""}`}
            onClick={() => setActiveView(tab.key)}
            style={{fontSize: 13, padding: "8px 16px"}}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ PARTICIPANT FILTER ═══ */}
      {messages.length > 0 && activeView !== "import" && activeView !== "participants" && (
        <div style={{marginBottom: 16, display: "flex", gap: 6, flexWrap: "wrap"}}>
          <button className={`filter-chip ${selectedParticipant === "all" ? "active" : ""}`}
            onClick={() => setSelectedParticipant("all")} style={{fontSize: 12, padding: "5px 12px"}}>
            {fr ? "Tous" : "All"}
          </button>
          {participants.map(p => (
            <button key={p.name} className={`filter-chip ${selectedParticipant === p.name ? "active" : ""}`}
              onClick={() => setSelectedParticipant(p.name)} style={{fontSize: 12, padding: "5px 12px"}}>
              {p.name.length > 16 ? p.name.slice(0, 16) + "…" : p.name}
            </button>
          ))}
        </div>
      )}

      {/* ═══ 1) IMPORT ═══ */}
      {activeView === "import" && (
        <div>
          <div className="card" style={{marginBottom: 16}}>
            <div className="section-title"><div className="section-bar"></div>📱 WhatsApp Chat Analyzer</div>
            <p style={{color: "var(--text-secondary)", fontSize: 13, marginBottom: 16}}>
              {fr
                ? "Importe un export de conversation WhatsApp (.txt). Va dans WhatsApp > Conversation > ⋮ > Exporter la discussion > Sans médias."
                : "Import a WhatsApp chat export (.txt). Go to WhatsApp > Chat > ⋮ > Export chat > Without media."}
            </p>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px",
              background: "var(--accent-muted)", color: "var(--accent)", borderRadius: "var(--radius-md)",
              cursor: "pointer", fontWeight: 600, fontSize: 14, border: "1px solid var(--border-accent)",
              transition: "all 0.2s",
            }}>
              📂 {fr ? "Choisir un fichier .txt" : "Choose a .txt file"}
              <input type="file" accept=".txt,.text" onChange={handleImport} style={{display: "none"}} />
            </label>
            {parsing && <div style={{marginTop: 12, color: "var(--accent)"}}>⏳ {fr ? "Analyse en cours..." : "Analyzing..."}</div>}
            {fileName && messages.length > 0 && (
              <div style={{marginTop: 12, padding: "10px 16px", background: "var(--success-muted)", borderRadius: "var(--radius-sm)", color: "var(--success)", fontSize: 13}}>
                ✅ {fileName} — {messages.length} {fr ? "messages importés" : "messages imported"}
              </div>
            )}
          </div>

          {/* How-to */}
          <div className="card" style={{marginBottom: 16}}>
            <div className="section-title"><div className="section-bar"></div>{fr ? "Comment exporter" : "How to export"}</div>
            <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16}}>
              {[
                {step: "1", text: fr ? "Ouvre la conversation WhatsApp" : "Open the WhatsApp conversation"},
                {step: "2", text: fr ? "Appuie sur ⋮ (menu) en haut" : "Tap ⋮ (menu) at the top"},
                {step: "3", text: fr ? "\"Plus\" > \"Exporter discussion\"" : "\"More\" > \"Export chat\""},
                {step: "4", text: fr ? "Choisis \"Sans médias\"" : "Choose \"Without media\""},
              ].map(s => (
                <div key={s.step} style={{display: "flex", gap: 12, alignItems: "flex-start"}}>
                  <div style={{width: 28, height: 28, borderRadius: "50%", background: "var(--accent-muted)", color: "var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0}}>{s.step}</div>
                  <span style={{fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5}}>{s.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Supported formats */}
          <div className="card">
            <div className="section-title"><div className="section-bar"></div>{fr ? "Formats supportés" : "Supported formats"}</div>
            <div style={{fontFamily: "monospace", fontSize: 12, color: "var(--text-tertiary)", lineHeight: 2}}>
              <div>21/02/2024, 14:30 - John: Hello!</div>
              <div>[21/02/2024, 14:30:15] John: Hello!</div>
              <div>2/21/24, 2:30 PM - John: Hello!</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 1b) IA ANALYSIS ═══ */}
      {activeView === "ia_analyze" && (
        <div>
          <div className="card" style={{marginBottom: 16}}>
            <div className="section-title"><div className="section-bar"></div>{"\u{1F916}"} {fr ? "Analyse IA par Claude" : "Claude IA Analysis"}</div>
            <p style={{color: "var(--text-secondary)", fontSize: 13, marginBottom: 16}}>
              {fr ? "Claude analyse la conversation et extrait : infos perso, d\u00E9penses, classification, comportement, indices Telegram." : "Claude analyzes the conversation and extracts: personal info, spending, classification, behavior, Telegram clues."}
            </p>
            {/* API Key input */}
            <div style={{marginBottom: 16}}>
              <label style={{fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4}}>{fr ? "Cl\u00E9 API Claude (stock\u00E9e localement)" : "Claude API Key (stored locally)"}</label>
              <input type="password" value={claudeKey} onChange={e => setClaudeKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                style={{width: "100%", maxWidth: 400, padding: "10px 14px", borderRadius: 10, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-primary)", fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box"}} />
            </div>
            <div style={{display: "flex", gap: 10, alignItems: "center"}}>
              <button onClick={analyzeWithClaude} disabled={analyzing || !claudeKey.trim()} style={{
                padding: "12px 28px", borderRadius: 12, background: "var(--accent-muted)", border: "1px solid var(--border-accent)",
                color: "var(--accent)", fontSize: 14, fontWeight: 700, cursor: analyzing ? "wait" : "pointer",
                fontFamily: "'DM Sans',sans-serif", opacity: !claudeKey.trim() ? 0.5 : 1,
              }}>
                {analyzing ? "\u23F3" : "\u{1F916}"} {analyzing ? (fr ? "Analyse en cours..." : "Analyzing...") : (fr ? "Analyser avec Claude" : "Analyze with Claude")}
              </button>
              <span style={{fontSize: 12, color: "var(--text-quaternary)"}}>{messages.length} {fr ? "messages \u00E0 analyser" : "messages to analyze"}</span>
            </div>
          </div>
          {/* Preview of what will be analyzed */}
          {messages.length > 0 && (
            <div className="card">
              <div className="section-title"><div className="section-bar"></div>{fr ? "Aper\u00E7u de la conversation" : "Conversation preview"}</div>
              <div style={{fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8}}>
                {participants.length} {fr ? "participants" : "participants"} {"\u00B7"} {messages.length} messages {"\u00B7"} {fileName || ""}
              </div>
              <div style={{maxHeight: 200, overflowY: "auto", padding: 12, borderRadius: 10, background: "var(--bg-overlay)", border: "1px solid var(--border-subtle)", fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6}}>
                {messages.slice(-30).map((m, i) => (
                  <div key={i}><span style={{color: "var(--text-quaternary)"}}>{m.date instanceof Date ? m.date.toLocaleString("fr-FR",{hour:"2-digit",minute:"2-digit"}) : ""}</span> <span style={{color: "var(--accent)", fontWeight: 600}}>{m.sender}:</span> {m.body.slice(0, 100)}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 1c) RESULTS ═══ */}
      {activeView === "results" && analysisResults.length > 0 && (
        <div>
          {/* KPIs */}
          {analysisKPIs && (
            <div style={{display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap"}}>
              <StatCard icon={"\u{1F4AC}"} label={fr ? "Contacts analys\u00E9s" : "Contacts analyzed"} value={analysisKPIs.contacts} />
              <StatCard icon={"\u{1F40B}"} label="Whales" value={analysisKPIs.whales} />
              <StatCard icon={"\u{1F4B0}"} label={fr ? "D\u00E9penses d\u00E9tect\u00E9es" : "Spending detected"} value={`${analysisKPIs.totalSpent}${currencySymbol}`} />
              <StatCard icon={"\u2708\uFE0F"} label={fr ? "Matchs TG" : "TG matches"} value={analysisKPIs.tgMatchCount} />
              <StatCard icon={"\u{1F4B8}"} label="TX" value={analysisKPIs.totalTx} />
            </div>
          )}
          {/* Result cards */}
          {analysisResults.map((wa, idx) => {
            const match = tgMatches[idx] || {};
            const tg = match.tgMatch;
            const isImported = importedMap[idx];
            const isImporting = importingMap[idx];
            const classCol = {whale:{bg:"var(--accent-subtle)",border:"var(--accent-muted)",text:"var(--accent)",icon:"\u{1F40B}"},vip:{bg:"var(--warning-muted)",border:"var(--warning-muted)",text:"var(--warning)",icon:"\u2B50"},regular:{bg:"var(--success-muted)",border:"var(--success-muted)",text:"var(--success)",icon:"\u{1F464}"},lead:{bg:"var(--pink-muted)",border:"var(--pink-muted)",text:"var(--pink)",icon:"\u{1F3AF}"},timewaster:{bg:"var(--danger-muted)",border:"var(--danger-muted)",text:"var(--danger)",icon:"\u23F0"}};
            const c = classCol[wa.classification] || classCol.lead;
            return (
              <div key={idx} className="card" style={{marginBottom: 16, opacity: isImported ? 0.7 : 1}}>
                {/* Header */}
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14}}>
                  <div style={{display: "flex", alignItems: "center", gap: 10}}>
                    <div style={{width:44,height:44,borderRadius:14,background:c.bg,border:`1px solid ${c.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:c.text}}>
                      {wa.contact?.first_name?.[0] || "?"}
                    </div>
                    <div>
                      <div style={{fontSize:15,fontWeight:800}}>{wa.contact?.display_name || "?"}</div>
                      <div style={{fontSize:11,color:"var(--text-tertiary)"}}>
                        {"\u{1F4DE}"} {wa._raw?.phone || (fr ? "num\u00E9ro inconnu" : "unknown")} {"\u00B7"} {wa._raw?.totalMessages || 0} messages
                      </div>
                    </div>
                  </div>
                  <span style={{padding:"3px 10px",borderRadius:8,background:c.bg,border:`1px solid ${c.border}`,color:c.text,fontSize:10,fontWeight:700}}>{c.icon} {(wa.classification||"lead").toUpperCase()}</span>
                </div>
                {/* Info tags */}
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12}}>
                  {wa.contact?.first_name && <span style={{padding:"2px 8px",borderRadius:6,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",fontSize:10,color:"var(--text-secondary)"}}>{"\u{1F464}"} {wa.contact.first_name}</span>}
                  {wa.contact?.age && <span style={{padding:"2px 8px",borderRadius:6,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",fontSize:10,color:"var(--text-secondary)"}}>{"\u{1F382}"} {wa.contact.age} ans</span>}
                  {wa.contact?.city && <span style={{padding:"2px 8px",borderRadius:6,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",fontSize:10,color:"var(--text-secondary)"}}>{"\u{1F4CD}"} {wa.contact.city}</span>}
                  {wa.contact?.job && <span style={{padding:"2px 8px",borderRadius:6,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",fontSize:10,color:"var(--text-secondary)"}}>{"\u{1F4BC}"} {wa.contact.job}</span>}
                  {wa.contact?.relationship_status && wa.contact.relationship_status !== "inconnu" && <span style={{padding:"2px 8px",borderRadius:6,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",fontSize:10,color:"var(--text-secondary)"}}>{"\u{1F48D}"} {wa.contact.relationship_status}</span>}
                  {wa.behavior?.favorite_content && <span style={{padding:"2px 8px",borderRadius:6,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",fontSize:10,color:"var(--text-secondary)"}}>{"\u2764\uFE0F"} {wa.behavior.favorite_content}</span>}
                  {wa.behavior?.best_time && <span style={{padding:"2px 8px",borderRadius:6,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",fontSize:10,color:"var(--text-secondary)"}}>{"\u{1F550}"} {wa.behavior.best_time}</span>}
                </div>
                {/* Metrics row */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                  <div style={{padding:"8px 12px",borderRadius:10,background:"var(--bg-overlay)",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"var(--text-quaternary)",textTransform:"uppercase",letterSpacing:0.5}}>{fr?"D\u00E9pens\u00E9":"Spent"}</div>
                    <div style={{fontSize:18,fontWeight:800,color:"var(--success)"}}>{wa.spending?.total_detected || 0}{wa.spending?.currency==="USD"?"$":"\u20AC"}</div>
                  </div>
                  <div style={{padding:"8px 12px",borderRadius:10,background:"var(--bg-overlay)",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"var(--text-quaternary)",textTransform:"uppercase",letterSpacing:0.5}}>TX</div>
                    <div style={{fontSize:18,fontWeight:800}}>{wa.spending?.transactions?.filter(t=>t.confirmed)?.length || 0}</div>
                  </div>
                  <div style={{padding:"8px 12px",borderRadius:10,background:"var(--bg-overlay)",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"var(--text-quaternary)",textTransform:"uppercase",letterSpacing:0.5}}>{fr?"Int\u00E9r\u00EAt":"Interest"}</div>
                    <div style={{fontSize:14,fontWeight:700,color:wa.behavior?.interest_level==="high"?"var(--success)":wa.behavior?.interest_level==="medium"?"var(--warning)":"var(--danger)"}}>{wa.behavior?.interest_level || "?"}</div>
                  </div>
                </div>
                {/* IA Analysis summary */}
                <div style={{padding:"12px 16px",borderRadius:12,background:"var(--accent-subtle)",border:"1px solid var(--accent-muted)",marginBottom:12}}>
                  <div style={{fontSize:10,color:"var(--accent)",fontWeight:700,marginBottom:4}}>{"\u{1F916}"} ANALYSE IA</div>
                  <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.5}}>{wa.summary || ""}</div>
                  {wa.recommended_action && <div style={{fontSize:11,color:"var(--success)",fontWeight:600,marginTop:6}}>{"\u{1F4A1}"} {wa.recommended_action}</div>}
                </div>
                {/* Personality */}
                {wa.behavior?.personality_notes && (
                  <div style={{padding:"8px 12px",borderRadius:10,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",fontSize:11,color:"var(--text-tertiary)",fontStyle:"italic",marginBottom:12}}>
                    {"\u{1F4A1}"} {wa.behavior.personality_notes}
                  </div>
                )}
                {/* Detected TX */}
                {wa.spending?.transactions?.length > 0 && (
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:"var(--text-quaternary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>{fr?"Transactions d\u00E9tect\u00E9es":"Detected transactions"}</div>
                    {wa.spending.transactions.map((tx, ti) => (
                      <div key={ti} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",marginBottom:4,fontSize:12}}>
                        <span style={{fontWeight:700,color:tx.confirmed?"var(--success)":"var(--text-tertiary)"}}>{tx.amount}{tx.currency==="USD"?"$":"\u20AC"} {tx.confirmed?"\u2705":"\u2753"}</span>
                        <span style={{color:"var(--text-secondary)"}}>{tx.product || "\u2014"}</span>
                        <span style={{fontSize:10,color:"var(--text-quaternary)"}}>{tx.date || "\u2014"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Risk flags */}
                {wa.behavior?.risk_flags?.length > 0 && (
                  <div style={{padding:"8px 12px",borderRadius:10,background:"var(--danger-muted)",border:"1px solid var(--danger-muted)",marginBottom:12}}>
                    <span style={{fontSize:10,color:"var(--danger)",fontWeight:700}}>{"\u26A0\uFE0F"} {wa.behavior.risk_flags.join(" \u00B7 ")}</span>
                  </div>
                )}
                {/* TG Cross-match */}
                {tg ? (
                  <div style={{padding:"10px 14px",borderRadius:12,background:"var(--success-muted)",border:"1px solid var(--success-muted)",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div>
                      <div style={{fontSize:11,color:"var(--success)",fontWeight:700}}>{"\u2708\uFE0F"} MATCH TELEGRAM ({match.confidence})</div>
                      <div style={{fontSize:11,color:"var(--text-tertiary)",marginTop:2}}>@{tg.telegram_username||tg.handle} {"\u2014"} {match.matchReason}</div>
                    </div>
                    <span style={{padding:"3px 10px",borderRadius:8,background:"var(--success-muted)",color:"var(--success)",fontSize:10,fontWeight:700}}>{match.matchScore}%</span>
                  </div>
                ) : (
                  <div style={{padding:"8px 12px",borderRadius:10,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",fontSize:11,color:"var(--text-quaternary)",marginBottom:12}}>
                    {"\u2708\uFE0F"} {fr ? "Pas de match Telegram trouv\u00E9" : "No Telegram match found"}
                  </div>
                )}
                {/* Action buttons */}
                <div style={{display:"flex",gap:8}}>
                  {isImported ? (
                    <span style={{padding:"10px 20px",borderRadius:12,background:"var(--success-muted)",color:"var(--success)",fontSize:13,fontWeight:700}}>{"\u2705"} {fr ? "Import\u00E9 dans le CRM" : "Imported to CRM"}</span>
                  ) : (
                    <button onClick={() => importToCRM(idx, {waContact: wa})} disabled={isImporting} style={{
                      flex:1,padding:"10px 20px",borderRadius:12,background:"var(--accent-muted)",border:"1px solid var(--border-accent)",
                      color:"var(--accent)",fontSize:13,fontWeight:700,cursor:isImporting?"wait":"pointer",fontFamily:"'DM Sans',sans-serif",
                    }}>
                      {isImporting ? "\u23F3" : "\u{1F4BE}"} {fr ? "Importer dans le CRM" : "Import to CRM"}
                    </button>
                  )}
                  {tg && !isImported && (
                    <button onClick={() => importToCRM(idx, {waContact: wa})} style={{
                      padding:"10px 16px",borderRadius:12,background:"var(--success-muted)",border:"1px solid var(--success-muted)",
                      color:"var(--success)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
                    }}>
                      {"\u{1F517}"} {fr ? "Lier au TG" : "Link to TG"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ 2) OVERVIEW ═══ */}
      {activeView === "overview" && overview && (
        <div>
          {/* Stats row */}
          <div style={{display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20}}>
            <StatCard icon="💬" label={fr ? "Messages" : "Messages"} value={overview.total.toLocaleString()} sub={`${overview.avgPerDay}/jour`} />
            <StatCard icon="👥" label="Participants" value={overview.participants} />
            <StatCard icon="📅" label={fr ? "Période" : "Period"} value={`${overview.days}j`} sub={`${overview.first.toLocaleDateString()} → ${overview.last.toLocaleDateString()}`} />
            <StatCard icon="📝" label={fr ? "Mots/msg" : "Words/msg"} value={overview.avgWordsPerMsg} sub={`${overview.totalWords.toLocaleString()} ${fr ? "mots total" : "total words"}`} />
            <StatCard icon="📸" label={fr ? "Médias" : "Media"} value={overview.totalMedia} />
            <StatCard icon="🔗" label="Liens" value={overview.totalLinks} />
          </div>

          {/* Participants pie */}
          <div className="card" style={{marginBottom: 16}}>
            <div className="section-title"><div className="section-bar"></div>{fr ? "Répartition des messages" : "Message distribution"}</div>
            <div style={{display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center"}}>
              {rechartsReady && PieChart && Pie && Cell ? (
                <div style={{width: 280, height: 250}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={participantChartData} dataKey="messages" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45}
                        stroke="var(--bg-base)" strokeWidth={2}>
                        {participantChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip contentStyle={{background: "var(--bg-overlay)", border: "1px solid var(--border-default)", borderRadius: 8, color: "var(--text-primary)"}} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
              <div style={{flex: 1, minWidth: 200}}>
                {participants.slice(0, 8).map((p, i) => (
                  <div key={p.name} style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 8}}>
                    <div style={{width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0}} />
                    <span style={{fontSize: 13, color: "var(--text-primary)", flex: 1}}>{p.name}</span>
                    <span style={{fontSize: 13, fontWeight: 700, color: "var(--text-primary)"}}>{p.count}</span>
                    <span style={{fontSize: 11, color: "var(--text-tertiary)", minWidth: 42, textAlign: "right"}}>
                      {(p.count / messages.length * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Daily timeline */}
          {rechartsReady && dailyData.length > 1 && (
            <div className="card">
              <div className="section-title"><div className="section-bar"></div>{fr ? "Messages par jour" : "Messages per day"}</div>
              <div style={{width: "100%", height: 220}}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData}>
                    <defs><linearGradient id="waGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="date" tick={{fill: "var(--text-tertiary)", fontSize: 10}} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{fill: "var(--text-tertiary)", fontSize: 10}} />
                    <RechartsTooltip contentStyle={{background: "var(--bg-overlay)", border: "1px solid var(--border-default)", borderRadius: 8, color: "var(--text-primary)"}} />
                    <Area type="monotone" dataKey="count" stroke="#818cf8" fill="url(#waGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 3) PARTICIPANTS ═══ */}
      {activeView === "participants" && (
        <div>
          {/* Bar chart */}
          {rechartsReady && BarChart && Bar && participantChartData.length > 0 && (
            <div className="card" style={{marginBottom: 16}}>
              <div className="section-title"><div className="section-bar"></div>{fr ? "Messages par participant" : "Messages per participant"}</div>
              <div style={{width: "100%", height: 280}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={participantChartData} layout="vertical" margin={{left: 80}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis type="number" tick={{fill: "var(--text-tertiary)", fontSize: 10}} />
                    <YAxis type="category" dataKey="name" tick={{fill: "var(--text-secondary)", fontSize: 11}} width={75} />
                    <RechartsTooltip contentStyle={{background: "var(--bg-overlay)", border: "1px solid var(--border-default)", borderRadius: 8, color: "var(--text-primary)"}} />
                    <Bar dataKey="messages" radius={[0, 4, 4, 0]}>
                      {participantChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Detailed table */}
          <div className="card">
            <div className="section-title"><div className="section-bar"></div>{fr ? "Détail par participant" : "Participant details"}</div>
            <div style={{overflowX: "auto"}}>
              <table style={{width: "100%", borderCollapse: "collapse", fontSize: 13}}>
                <thead>
                  <tr style={{borderBottom: "1px solid var(--border-default)"}}>
                    {[fr ? "Nom" : "Name", "Messages", fr ? "Mots" : "Words", fr ? "Mots/msg" : "Words/msg", fr ? "Médias" : "Media", "Liens", "%"].map(h => (
                      <th key={h} style={{padding: "10px 12px", textAlign: "left", color: "var(--text-tertiary)", fontWeight: 600, fontSize: 11, textTransform: "uppercase"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p, i) => (
                    <tr key={p.name} style={{borderBottom: "1px solid var(--border-subtle)"}}>
                      <td style={{padding: "10px 12px", display: "flex", alignItems: "center", gap: 8}}>
                        <div style={{width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length]}} />
                        <span style={{fontWeight: 600, color: "var(--text-primary)"}}>{p.name}</span>
                      </td>
                      <td style={{padding: "10px 12px", fontWeight: 700, color: "var(--accent)"}}>{p.count.toLocaleString()}</td>
                      <td style={{padding: "10px 12px", color: "var(--text-secondary)"}}>{p.words.toLocaleString()}</td>
                      <td style={{padding: "10px 12px", color: "var(--text-secondary)"}}>{p.count ? (p.words / p.count).toFixed(1) : 0}</td>
                      <td style={{padding: "10px 12px", color: "var(--text-secondary)"}}>{p.media}</td>
                      <td style={{padding: "10px 12px", color: "var(--text-secondary)"}}>{p.links}</td>
                      <td style={{padding: "10px 12px", color: "var(--text-tertiary)"}}>{(p.count / messages.length * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 4) ACTIVITY ═══ */}
      {activeView === "activity" && (
        <div>
          {/* Hourly */}
          {rechartsReady && BarChart && Bar && (
            <div className="card" style={{marginBottom: 16}}>
              <div className="section-title"><div className="section-bar"></div>{fr ? "Activité par heure" : "Hourly activity"}</div>
              <div style={{width: "100%", height: 220}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="hour" tick={{fill: "var(--text-tertiary)", fontSize: 10}} />
                    <YAxis tick={{fill: "var(--text-tertiary)", fontSize: 10}} />
                    <RechartsTooltip contentStyle={{background: "var(--bg-overlay)", border: "1px solid var(--border-default)", borderRadius: 8, color: "var(--text-primary)"}} />
                    <Bar dataKey="count" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Day of week */}
          {rechartsReady && BarChart && Bar && (
            <div className="card" style={{marginBottom: 16}}>
              <div className="section-title"><div className="section-bar"></div>{fr ? "Activité par jour de la semaine" : "Day of week activity"}</div>
              <div style={{width: "100%", height: 220}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dowData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="day" tick={{fill: "var(--text-tertiary)", fontSize: 11}} />
                    <YAxis tick={{fill: "var(--text-tertiary)", fontSize: 10}} />
                    <RechartsTooltip contentStyle={{background: "var(--bg-overlay)", border: "1px solid var(--border-default)", borderRadius: 8, color: "var(--text-primary)"}} />
                    <Bar dataKey="count" fill="#34d399" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Daily timeline */}
          {rechartsReady && dailyData.length > 1 && (
            <div className="card">
              <div className="section-title"><div className="section-bar"></div>{fr ? "Timeline quotidienne" : "Daily timeline"}</div>
              <div style={{width: "100%", height: 220}}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData}>
                    <defs><linearGradient id="waGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="date" tick={{fill: "var(--text-tertiary)", fontSize: 10}} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{fill: "var(--text-tertiary)", fontSize: 10}} />
                    <RechartsTooltip contentStyle={{background: "var(--bg-overlay)", border: "1px solid var(--border-default)", borderRadius: 8, color: "var(--text-primary)"}} />
                    <Area type="monotone" dataKey="count" stroke="#34d399" fill="url(#waGrad2)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 5) WORDS & EMOJIS ═══ */}
      {activeView === "words" && (
        <div>
          {/* Word cloud style */}
          <div className="card" style={{marginBottom: 16}}>
            <div className="section-title"><div className="section-bar"></div>{fr ? "Mots les plus utilisés" : "Most used words"}</div>
            <div style={{display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 0"}}>
              {topWords.map((w, i) => {
                const maxCount = topWords[0]?.count || 1;
                const ratio = w.count / maxCount;
                const size = 12 + ratio * 20;
                const opacity = 0.4 + ratio * 0.6;
                return (
                  <span key={w.word} style={{
                    fontSize: size, fontWeight: ratio > 0.5 ? 700 : 500,
                    color: COLORS[i % COLORS.length], opacity,
                    padding: "4px 10px", background: "var(--bg-surface)", borderRadius: "var(--radius-sm)",
                  }}>
                    {w.word} <span style={{fontSize: 10, opacity: 0.6}}>({w.count})</span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Emojis */}
          {topEmojis.length > 0 && (
            <div className="card" style={{marginBottom: 16}}>
              <div className="section-title"><div className="section-bar"></div>{fr ? "Emojis les plus utilisés" : "Most used emojis"}</div>
              <div style={{display: "flex", flexWrap: "wrap", gap: 12}}>
                {topEmojis.map((e, i) => (
                  <div key={i} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    padding: "10px 14px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)",
                    minWidth: 56,
                  }}>
                    <span style={{fontSize: 28}}>{e.emoji}</span>
                    <span style={{fontSize: 11, fontWeight: 700, color: "var(--text-secondary)"}}>{e.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top words bar chart */}
          {rechartsReady && BarChart && Bar && topWords.length > 0 && (
            <div className="card">
              <div className="section-title"><div className="section-bar"></div>{fr ? "Top 15 mots (graphique)" : "Top 15 words (chart)"}</div>
              <div style={{width: "100%", height: 320}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topWords.slice(0, 15)} layout="vertical" margin={{left: 80}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis type="number" tick={{fill: "var(--text-tertiary)", fontSize: 10}} />
                    <YAxis type="category" dataKey="word" tick={{fill: "var(--text-secondary)", fontSize: 11}} width={75} />
                    <RechartsTooltip contentStyle={{background: "var(--bg-overlay)", border: "1px solid var(--border-default)", borderRadius: 8, color: "var(--text-primary)"}} />
                    <Bar dataKey="count" fill="#f472b6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 6) RESPONSE TIME ═══ */}
      {activeView === "response" && (
        <div>
          <div className="card" style={{marginBottom: 16}}>
            <div className="section-title"><div className="section-bar"></div>{fr ? "Temps de réponse moyen" : "Average response time"}</div>
            <p style={{color: "var(--text-tertiary)", fontSize: 12, marginBottom: 16}}>
              {fr ? "Temps entre le dernier message d'une personne et la réponse d'une autre (écarts > 4h exclus)." : "Time between one person's last message and another's reply (gaps > 4h excluded)."}
            </p>
            {responseTimes.length === 0 ? (
              <div style={{color: "var(--text-tertiary)", fontSize: 13, padding: 20, textAlign: "center"}}>
                {fr ? "Pas assez de données pour calculer les temps de réponse." : "Not enough data to compute response times."}
              </div>
            ) : (
              <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12}}>
                {responseTimes.map((rt, i) => (
                  <div key={rt.name} style={{
                    padding: "16px 20px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                  }}>
                    <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 10}}>
                      <div style={{width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length]}} />
                      <span style={{fontSize: 14, fontWeight: 700, color: "var(--text-primary)"}}>{rt.name}</span>
                    </div>
                    <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8}}>
                      <div>
                        <div style={{fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 2}}>{fr ? "Moyen" : "Average"}</div>
                        <div style={{fontSize: 18, fontWeight: 800, color: "var(--accent)"}}>{rt.avg}<span style={{fontSize: 11, fontWeight: 400}}>min</span></div>
                      </div>
                      <div>
                        <div style={{fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 2}}>{fr ? "Médian" : "Median"}</div>
                        <div style={{fontSize: 18, fontWeight: 800, color: "var(--success)"}}>{rt.median}<span style={{fontSize: 11, fontWeight: 400}}>min</span></div>
                      </div>
                      <div>
                        <div style={{fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 2}}>{fr ? "Échanges" : "Exchanges"}</div>
                        <div style={{fontSize: 18, fontWeight: 800, color: "var(--text-primary)"}}>{rt.count}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Response time bar chart */}
          {rechartsReady && BarChart && Bar && responseTimes.length > 0 && (
            <div className="card">
              <div className="section-title"><div className="section-bar"></div>{fr ? "Comparaison (minutes)" : "Comparison (minutes)"}</div>
              <div style={{width: "100%", height: 220}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={responseTimes.map(rt => ({name: rt.name.length > 12 ? rt.name.slice(0, 12) + "…" : rt.name, avg: parseFloat(rt.avg), median: parseFloat(rt.median)}))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="name" tick={{fill: "var(--text-secondary)", fontSize: 11}} />
                    <YAxis tick={{fill: "var(--text-tertiary)", fontSize: 10}} />
                    <RechartsTooltip contentStyle={{background: "var(--bg-overlay)", border: "1px solid var(--border-default)", borderRadius: 8, color: "var(--text-primary)"}} />
                    <Bar dataKey="avg" fill="#818cf8" name={fr ? "Moyen" : "Average"} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="median" fill="#34d399" name={fr ? "Médian" : "Median"} radius={[4, 4, 0, 0]} />
                    {Legend && <Legend wrapperStyle={{color: "var(--text-secondary)", fontSize: 12}} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

module.exports = WhatsAppAnalyzerTab;
