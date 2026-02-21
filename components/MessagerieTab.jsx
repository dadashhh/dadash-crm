// =============================================
// MESSAGERIE INTÉGRÉE — CONVERSATIONS
// =============================================
// Tables Supabase requises :
//   conversations (id uuid PK, created_at, updated_at, spender_handle text,
//     spender_id uuid FK spenders, model_id uuid FK models, channel text [telegram|whatsapp],
//     status text [bot|escalade|humain|resolved], assigned_chatter_id uuid FK profiles,
//     last_message_at timestamptz, last_message_preview text, unread_count int, metadata jsonb)
//   conversation_messages (id uuid PK, conversation_id uuid FK conversations,
//     created_at timestamptz, sender_type text [spender|bot|chatter],
//     sender_id uuid, sender_name text, body text, is_media bool, blocked bool, blocked_reason text)
//   chatter_logs (id uuid PK, created_at timestamptz, chatter_id uuid FK profiles,
//     chatter_name text, conversation_id uuid FK conversations,
//     message_text text, action text [sent|blocked|took_over|returned_to_bot], blocked_reason text)

// ── Constants ──
const BLOCKED_PATTERNS = [
  { pattern: /https?:\/\/\S+/i, reason: "URL" },
  { pattern: /www\.\S+/i, reason: "URL" },
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i, reason: "Email" },
  { pattern: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/i, reason: "Phone" },
];

const BLOCKED_WORDS = [
  "paypal","bitcoin","btc","eth","ethereum","crypto","virement","transfer","wire",
  "cashapp","venmo","zelle","wallet","iban","western union","moneygram",
  "revolut","wise","skrill","paysafecard","carte bancaire","carte credit",
  "carte debit","bank account","compte bancaire","routing number","swift",
  "usdt","tether","binance","coinbase","blockchain","monero","litecoin","dogecoin",
];

const CONV_STATUS = {
  escalade: { label: "ESCALADE", color: "#ef4444", bg: "#fef2f2" },
  bot:      { label: "BOT",      color: "#22c55e", bg: "#f0fdf4" },
  humain:   { label: "HUMAIN",   color: "#3b82f6", bg: "#eff6ff" },
  resolved: { label: "RÉSOLU",   color: "#9ca3af", bg: "#f3f4f6" },
};

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// ── Helpers ──
const anonymizeSpender = (name) => {
  if (!name) return "Anonyme";
  const s = sanitize(name).trim();
  const parts = s.split(/\s+/);
  if (parts.length <= 1) return s;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
};

const checkBlocked = (text) => {
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(text)) return reason;
  }
  const lower = text.toLowerCase();
  for (const word of BLOCKED_WORDS) {
    if (lower.includes(word)) return `Mot interdit: ${word}`;
  }
  return null;
};

const fmtRelative = (d, fr) => {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return fr ? "à l'instant" : "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 172800000) return fr ? "hier" : "yesterday";
  return new Date(d).toLocaleDateString(fr ? "fr-FR" : "en-US", { day: "numeric", month: "short" });
};

const fmtMsgTime = (d) => {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

const avatarColor = (name) => {
  const colors = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899"];
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
const MessagerieTab = ({ user, lang, txs, models, profiles, spenders, onRefresh, onNotify }) => {
  const fr = lang === "fr";
  const addToast = useToast();
  const { convertAmount, currencySymbol } = useCurrency();
  const isChatter = user.role === "chatter";

  // ── State ──
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [showInfo, setShowInfo] = useState(true);

  // Filters
  const [filterModel, setFilterModel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");

  // Session timeout
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [sessionLocked, setSessionLocked] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const resetActivity = useCallback(() => setLastActivity(Date.now()), []);

  // ── Load conversations ──
  const loadConversations = useCallback(async () => {
    try {
      let q = sb.from("conversations").select("*").order("last_message_at", { ascending: false });
      if (user.role === "chatter" && user.assigned_models?.length > 0) {
        q = q.in("model_id", user.assigned_models);
      }
      const { data, error } = await q;
      if (error) throw error;
      setConversations(data || []);
    } catch (err) {
      console.error("loadConversations:", err);
    } finally {
      setLoadingConvs(false);
    }
  }, [user]);

  // ── Load messages for selected conversation ──
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    setLoadingMsgs(true);
    try {
      const { data, error } = await sb.from("conversation_messages")
        .select("*").eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error("loadMessages:", err);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Supabase Realtime (no polling) ──
  useEffect(() => {
    const channel = sb.channel("messagerie-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setConversations(prev => [payload.new, ...prev]);
          if (payload.new.status === "escalade") {
            addToast(fr ? "🚨 Nouvelle escalade !" : "🚨 New escalation!", "warning");
          }
        } else if (payload.eventType === "UPDATE") {
          setConversations(prev => {
            const idx = prev.findIndex(c => c.id === payload.new.id);
            if (idx === -1) return [payload.new, ...prev];
            const next = [...prev];
            next[idx] = payload.new;
            return next;
          });
          if (payload.new.status === "escalade" && payload.old?.status !== "escalade") {
            addToast(fr ? "🚨 Conversation escaladée !" : "🚨 Conversation escalated!", "warning");
          }
        } else if (payload.eventType === "DELETE") {
          setConversations(prev => prev.filter(c => c.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_messages" }, (payload) => {
        if (payload.new.conversation_id === selectedId) {
          setMessages(prev => [...prev, payload.new]);
        }
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [selectedId, fr, addToast]);

  // ── Session timeout (30 min) ──
  useEffect(() => {
    const iv = setInterval(() => {
      if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) setSessionLocked(true);
    }, 60000);
    return () => clearInterval(iv);
  }, [lastActivity]);

  // ── Send message (with keyword blocking + chatter_logs) ──
  const handleSend = async () => {
    const text = msgInput.trim();
    if (!text || !selectedId || sending) return;
    resetActivity();

    // ── Security: blocked keywords ──
    const blockedReason = checkBlocked(text);
    if (blockedReason) {
      try {
        await sb.from("chatter_logs").insert({
          chatter_id: user.id, chatter_name: user.name,
          conversation_id: selectedId, message_text: text,
          action: "blocked", blocked_reason: blockedReason,
        });
        const gerants = (profiles || []).filter(p => p.role === "gerant");
        for (const g of gerants) {
          if (onNotify) await onNotify(g.id, "security",
            fr ? "⚠️ Message bloqué" : "⚠️ Message blocked",
            `${user.name}: "${text.substring(0, 60)}…" — ${blockedReason}`
          );
        }
      } catch (e) { console.error("logBlocked:", e); }
      addToast(fr ? "⛔ Message bloqué — contenu interdit détecté" : "⛔ Blocked — prohibited content", "error");
      setMsgInput("");
      return;
    }

    setSending(true);
    try {
      const { error: msgErr } = await sb.from("conversation_messages").insert({
        conversation_id: selectedId, sender_type: "chatter",
        sender_id: user.id, sender_name: user.name, body: sanitize(text),
      });
      if (msgErr) throw msgErr;

      // Log to chatter_logs
      await sb.from("chatter_logs").insert({
        chatter_id: user.id, chatter_name: user.name,
        conversation_id: selectedId, message_text: text, action: "sent",
      });

      // Update conversation
      const conv = conversations.find(c => c.id === selectedId);
      const updates = { last_message_at: new Date().toISOString(), last_message_preview: text.substring(0, 100) };
      if (conv && conv.status === "escalade") {
        updates.status = "humain";
        updates.assigned_chatter_id = user.id;
      }
      await sb.from("conversations").update(updates).eq("id", selectedId);
      setMsgInput("");
      inputRef.current?.focus();
    } catch (err) {
      console.error("sendMessage:", err);
      addToast(fr ? "Erreur d'envoi" : "Send error", "error");
    } finally {
      setSending(false);
    }
  };

  // ── Take over escalated conversation ──
  const handleTakeOver = async () => {
    if (!selectedId) return;
    resetActivity();
    try {
      await sb.from("conversations").update({ status: "humain", assigned_chatter_id: user.id }).eq("id", selectedId);
      await sb.from("chatter_logs").insert({
        chatter_id: user.id, chatter_name: user.name,
        conversation_id: selectedId, message_text: "", action: "took_over",
      });
      addToast(fr ? "Conversation prise en charge" : "Conversation taken over", "success");
      inputRef.current?.focus();
    } catch (err) { console.error("takeOver:", err); }
  };

  // ── Return conversation to bot ──
  const handleReturnToBot = async () => {
    if (!selectedId) return;
    resetActivity();
    try {
      await sb.from("conversations").update({ status: "bot", assigned_chatter_id: null }).eq("id", selectedId);
      await sb.from("chatter_logs").insert({
        chatter_id: user.id, chatter_name: user.name,
        conversation_id: selectedId, message_text: "", action: "returned_to_bot",
      });
      addToast(fr ? "Conversation rendue au bot" : "Returned to bot", "success");
    } catch (err) { console.error("returnToBot:", err); }
  };

  // ── Filtered & sorted conversations ──
  const filtered = useMemo(() => {
    let list = [...conversations];
    if (filterModel) list = list.filter(c => c.model_id === filterModel);
    if (filterStatus) list = list.filter(c => c.status === filterStatus);
    if (filterDate) {
      const d = new Date(filterDate).getTime();
      list = list.filter(c => new Date(c.last_message_at).getTime() >= d);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.spender_handle || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
  }, [conversations, filterModel, filterStatus, filterDate, search]);

  const selectedConv = conversations.find(c => c.id === selectedId);

  // ── Spender info for right panel ──
  const spenderInfo = useMemo(() => {
    if (!selectedConv) return null;
    const sp = (spenders || []).find(s => s.id === selectedConv.spender_id || s.handle === selectedConv.spender_handle);
    if (!sp) return { handle: selectedConv.spender_handle, segment: "regular", ltv: 0, convCount: 0, lastTx: null };
    const spTxs = (txs || []).filter(tx => tx.spender_handle === sp.handle);
    const validTxs = spTxs.filter(tx => tx.status === "validated" || tx.status === "confirmee");
    const ltv = validTxs.reduce((s, tx) => s + (convertAmount(tx.amount, tx.currency) || 0), 0);
    const lastTx = spTxs.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const convCount = conversations.filter(c => c.spender_id === sp.id || c.spender_handle === sp.handle).length;
    let segment = sp.classification || "regular";
    if (!sp.classification) { if (ltv >= 1000) segment = "whale"; else if (ltv >= 300) segment = "vip"; }
    return { ...sp, ltv, lastTx, segment, convCount };
  }, [selectedConv, spenders, txs, conversations, convertAmount]);

  // ── Session locked overlay ──
  if (sessionLocked) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h3 style={{ margin: 0 }}>{fr ? "Session expirée" : "Session expired"}</h3>
        <p style={{ color: "var(--text-tertiary)", margin: 0 }}>{fr ? "30 minutes d'inactivité" : "30 minutes of inactivity"}</p>
        <button className="btn btn-primary" onClick={() => { setSessionLocked(false); resetActivity(); }}>
          {fr ? "Reprendre" : "Resume"}
        </button>
      </div>
    );
  }

  // ── Shared styles ──
  const bd = "1px solid var(--border-default)";
  const bg = "var(--bg-card)";
  const selStyle = { padding: "6px 8px", borderRadius: 8, border: bd, background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, fontFamily: "'DM Sans',sans-serif" };

  // ══════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════
  return (
    <div style={{ display: "flex", height: "calc(100vh - 130px)", gap: 0, borderRadius: 16, overflow: "hidden", border: bd, background: bg }} onClick={resetActivity}>

      {/* ════════ LEFT: CONVERSATION LIST ════════ */}
      <div style={{ width: 340, minWidth: 280, borderRight: bd, display: "flex", flexDirection: "column", background: bg }}>

        {/* ── Filters ── */}
        <div style={{ padding: "12px 12px 8px", borderBottom: bd, display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="text" placeholder={fr ? "🔍 Rechercher..." : "🔍 Search..."} value={search}
            onChange={e => { setSearch(e.target.value); resetActivity(); }}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: bd, background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 4 }}>
            <select value={filterModel} onChange={e => setFilterModel(e.target.value)} style={{ ...selStyle, flex: 1 }}>
              <option value="">{fr ? "Tous modèles" : "All models"}</option>
              {(models || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selStyle, flex: 1 }}>
              <option value="">{fr ? "Tous statuts" : "All statuses"}</option>
              {Object.entries(CONV_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            style={{ ...selStyle, width: "100%", boxSizing: "border-box" }} />
        </div>

        {/* ── List ── */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingConvs ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon="💬" text={fr ? "Aucune conversation" : "No conversations"} />
          ) : filtered.map(conv => {
            const selected = conv.id === selectedId;
            const st = CONV_STATUS[conv.status] || CONV_STATUS.bot;
            const name = anonymizeSpender(conv.spender_handle);
            const modelName = (models || []).find(m => m.id === conv.model_id)?.name;
            return (
              <div key={conv.id} onClick={() => { setSelectedId(conv.id); resetActivity(); }}
                style={{ padding: "12px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start",
                  borderBottom: "1px solid var(--border-subtle,var(--border-default))",
                  background: selected ? "var(--accent-muted)" : "transparent", transition: "background .15s" }}>
                {/* Avatar */}
                <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                  background: avatarColor(name), color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>
                  {(name[0] || "?").toUpperCase()}
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0, marginLeft: 6 }}>
                      {fmtRelative(conv.last_message_at, fr)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                      color: st.color, background: st.bg, border: `1px solid ${st.color}20` }}>
                      {st.label}
                    </span>
                    {modelName && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>#{modelName}</span>}
                    {conv.channel && <span style={{ fontSize: 10 }}>{conv.channel === "telegram" ? "📱" : "💬"}</span>}
                    {(conv.unread_count || 0) > 0 && (
                      <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 10,
                        padding: "0 6px", fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: "center" }}>
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {conv.last_message_preview || (fr ? "Pas de message" : "No messages")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer count ── */}
        <div style={{ padding: "8px 14px", borderTop: bd, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
          {filtered.length} conversation{filtered.length !== 1 ? "s" : ""}
          {conversations.filter(c => c.status === "escalade").length > 0 && (
            <span style={{ color: "#ef4444", fontWeight: 700, marginLeft: 8 }}>
              🚨 {conversations.filter(c => c.status === "escalade").length} escalade{conversations.filter(c => c.status === "escalade").length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ════════ CENTER: CHAT ZONE ════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!selectedConv ? (
          /* ── Empty state ── */
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "var(--text-tertiary)" }}>
            <div style={{ fontSize: 48 }}>💬</div>
            <p style={{ margin: 0, fontSize: 14 }}>{fr ? "Sélectionnez une conversation" : "Select a conversation"}</p>
          </div>
        ) : (
          <>
            {/* ── Chat header ── */}
            <div style={{ padding: "10px 16px", borderBottom: bd, display: "flex", alignItems: "center", justifyContent: "space-between", background: bg }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%",
                  background: avatarColor(selectedConv.spender_handle || ""), color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>
                  {(anonymizeSpender(selectedConv.spender_handle)[0] || "?").toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
                    {anonymizeSpender(selectedConv.spender_handle)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
                    {(() => { const s = CONV_STATUS[selectedConv.status] || CONV_STATUS.bot; return (
                      <span style={{ padding: "0 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, color: s.color, background: s.bg }}>{s.label}</span>
                    ); })()}
                    {selectedConv.channel && <span>{selectedConv.channel === "telegram" ? "Telegram" : "WhatsApp"}</span>}
                    {selectedConv.assigned_chatter_id && (
                      <span>• {(profiles || []).find(p => p.id === selectedConv.assigned_chatter_id)?.name || "Chatter"}</span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {selectedConv.status === "escalade" && (
                  <button onClick={handleTakeOver} style={{
                    padding: "6px 12px", borderRadius: 8, border: "1px solid #3b82f6", background: "#eff6ff",
                    color: "#3b82f6", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                    👤 {fr ? "Prendre en charge" : "Take over"}
                  </button>
                )}
                {selectedConv.status === "humain" && (
                  <button onClick={handleReturnToBot} style={{
                    padding: "6px 12px", borderRadius: 8, border: "1px solid #22c55e", background: "#f0fdf4",
                    color: "#22c55e", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                    🤖 {fr ? "Rendre au bot" : "Return to bot"}
                  </button>
                )}
                <button onClick={() => setShowInfo(v => !v)} style={{
                  padding: "6px 10px", borderRadius: 8, border: bd,
                  background: showInfo ? "var(--accent-muted)" : "transparent",
                  color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" }}
                  title={fr ? "Info spender" : "Spender info"}>ℹ️</button>
              </div>
            </div>

            {/* ── Messages ── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
              {loadingMsgs ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="spinner" /></div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-tertiary)", padding: 40, fontSize: 13 }}>
                  {fr ? "Aucun message dans cette conversation" : "No messages in this conversation"}
                </div>
              ) : messages.map(msg => {
                const isSpender = msg.sender_type === "spender";
                const isBot = msg.sender_type === "bot";
                const isRight = isBot || msg.sender_type === "chatter";

                let bubbleBg, tagLabel, tagBg;
                if (isSpender) { bubbleBg = "var(--bg-overlay)"; }
                else if (isBot) { bubbleBg = "#7c3aed20"; tagLabel = "IA"; tagBg = "#7c3aed"; }
                else { bubbleBg = "#3b82f620"; tagLabel = `CHATTER: ${msg.sender_name || "?"}`; tagBg = "#3b82f6"; }

                return (
                  <div key={msg.id} style={{ display: "flex", flexDirection: "column",
                    alignItems: isRight ? "flex-end" : "flex-start",
                    maxWidth: "75%", alignSelf: isRight ? "flex-end" : "flex-start" }}>
                    {tagLabel && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                        background: tagBg, color: "#fff", marginBottom: 2 }}>{tagLabel}</span>
                    )}
                    <div style={{ padding: "8px 14px", borderRadius: 14, background: bubbleBg,
                      color: "var(--text-primary)", fontSize: 13, lineHeight: 1.5, wordBreak: "break-word",
                      borderBottomLeftRadius: isSpender ? 4 : 14,
                      borderBottomRightRadius: isRight ? 4 : 14 }}>
                      {msg.body}
                    </div>
                    <span style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2, padding: "0 4px" }}>
                      {fmtMsgTime(msg.created_at)}
                    </span>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* ── Input area ── */}
            {(selectedConv.status === "humain" || selectedConv.status === "escalade") ? (
              <div style={{ padding: "10px 16px", borderTop: bd, display: "flex", gap: 8, alignItems: "center", background: bg }}>
                <input ref={inputRef} type="text" value={msgInput}
                  onChange={e => { setMsgInput(e.target.value); resetActivity(); }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={fr ? "Tapez votre message..." : "Type your message..."}
                  disabled={sending}
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: bd,
                    background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 13,
                    fontFamily: "'DM Sans',sans-serif", outline: "none" }} />
                <button onClick={handleSend}
                  disabled={sending || !msgInput.trim()}
                  style={{ padding: "10px 18px", borderRadius: 12, border: "none",
                    background: (sending || !msgInput.trim()) ? "var(--text-tertiary)" : "var(--accent)",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: (sending || !msgInput.trim()) ? "not-allowed" : "pointer",
                    fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 6,
                    opacity: (sending || !msgInput.trim()) ? 0.5 : 1 }}>
                  {sending ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "📤"}
                  {fr ? "Envoyer" : "Send"}
                </button>
              </div>
            ) : (
              <div style={{ padding: "10px 16px", borderTop: bd, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", background: "var(--bg-overlay)" }}>
                {selectedConv.status === "bot"
                  ? (fr ? "💡 Conversation gérée par le bot — prenez en charge pour répondre" : "💡 Bot-managed — take over to reply")
                  : (fr ? "✅ Conversation résolue" : "✅ Conversation resolved")}
              </div>
            )}
          </>
        )}
      </div>

      {/* ════════ RIGHT: SPENDER INFO PANEL ════════ */}
      {showInfo && selectedConv && spenderInfo && (
        <div style={{ width: 260, minWidth: 220, borderLeft: bd, padding: "16px 14px", overflowY: "auto", background: bg }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", margin: "0 auto 8px",
              background: avatarColor(spenderInfo.handle || selectedConv.spender_handle || ""),
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700 }}>
              {(anonymizeSpender(spenderInfo.handle || selectedConv.spender_handle)[0] || "?").toUpperCase()}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
              {anonymizeSpender(spenderInfo.handle || selectedConv.spender_handle)}
            </div>
            <div style={{ marginTop: 6 }}>
              <span style={{ display: "inline-block", padding: "3px 12px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                background: spenderInfo.segment === "whale" ? "#7c3aed20" : spenderInfo.segment === "vip" ? "#f59e0b20" : "#6b728020",
                color: spenderInfo.segment === "whale" ? "#7c3aed" : spenderInfo.segment === "vip" ? "#f59e0b" : "#6b7280",
                border: `1px solid ${spenderInfo.segment === "whale" ? "#7c3aed40" : spenderInfo.segment === "vip" ? "#f59e0b40" : "#6b728040"}` }}>
                {spenderInfo.segment === "whale" ? "🐋 WHALE" : spenderInfo.segment === "vip" ? "⭐ VIP" : "👤 REGULAR"}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* LTV — hidden for chatters */}
            {!isChatter && (
              <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--bg-overlay)" }}>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 2 }}>LTV Total</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>
                  {Math.round(spenderInfo.ltv).toLocaleString()} {currencySymbol}
                </div>
              </div>
            )}

            <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--bg-overlay)" }}>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 2 }}>Conversations</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{spenderInfo.convCount || 0}</div>
            </div>

            {/* Last TX — hidden for chatters */}
            {!isChatter && spenderInfo.lastTx && (
              <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--bg-overlay)" }}>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 2 }}>
                  {fr ? "Dernière TX" : "Last TX"}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{fmtDate(spenderInfo.lastTx.date)}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {spenderInfo.lastTx.amount} {spenderInfo.lastTx.currency || "USD"}
                </div>
              </div>
            )}

            {selectedConv.channel && (
              <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--bg-overlay)" }}>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 2 }}>{fr ? "Canal" : "Channel"}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {selectedConv.channel === "telegram" ? "📱 Telegram" : "💬 WhatsApp"}
                </div>
              </div>
            )}

            {selectedConv.model_id && (
              <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--bg-overlay)" }}>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 2 }}>{fr ? "Modèle" : "Model"}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {(models || []).find(m => m.id === selectedConv.model_id)?.name || "—"}
                </div>
              </div>
            )}

            {spenderInfo.telegram_id && (
              <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--bg-overlay)" }}>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 2 }}>Telegram ID</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{spenderInfo.telegram_id}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

module.exports.default = MessagerieTab;
