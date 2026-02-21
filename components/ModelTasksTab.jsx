// =============================================
// MODEL ROLE — MES TÂCHES (from model_tasks)
// =============================================
const ModelTasksTab = ({user, lang}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const {data} = await sb.from("model_tasks").select("*").eq("model_id", user.id).order("created_at", {ascending: false});
      if (cancelled) return;
      setTasks(data || []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const updateStatus = async (taskId, newStatus) => {
    const updates = {status: newStatus};
    if (newStatus === "done") updates.completed_at = new Date().toISOString();
    else updates.completed_at = null;
    const {error} = await sb.from("model_tasks").update(updates).eq("id", taskId);
    if (error) { addToast("Erreur: " + error.message, "error"); return; }
    setTasks(prev => prev.map(t => t.id === taskId ? {...t, ...updates} : t));
    if (newStatus === "done") addToast(fr ? "Tâche terminée" : "Task completed", "success");
  };

  const filtered = filter === "active" ? tasks.filter(t => t.status !== "done") : filter === "done" ? tasks.filter(t => t.status === "done") : tasks;
  const todoCount = tasks.filter(t => t.status === "todo").length;
  const inProgressCount = tasks.filter(t => t.status === "in_progress").length;
  const doneCount = tasks.filter(t => t.status === "done").length;
  const isOverdue = (d) => d && new Date(d) < new Date(new Date().toISOString().slice(0, 10));
  const catIcon = (c) => c === "social" ? "\u{1F4F1}" : c === "admin" ? "\u{1F4CB}" : c === "content" ? "\u{1F4F8}" : c === "communication" ? "\u{1F4AC}" : "\u{1F4CC}";

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h2 style={{fontSize:18,fontWeight:800,margin:0}}>{"\u{1F4CB}"} {fr?"Mes Tâches":"My Tasks"}</h2>
        <p style={{fontSize:12,color:"var(--text-tertiary)",margin:"3px 0 0"}}>{todoCount} {fr?"à faire":"to do"} {"\u00B7"} {inProgressCount} {fr?"en cours":"in progress"} {"\u00B7"} {doneCount} {fr?"terminées":"done"}</p>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[{k:"active",l:fr?"Actives":"Active"},{k:"done",l:fr?"Terminées":"Done"},{k:"all",l:fr?"Toutes":"All"}].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} className={`filter-chip ${filter===f.k?"active":""}`}>{f.l}</button>
        ))}
      </div>

      {loading && <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>Chargement...</div>}
      {!loading && filtered.length === 0 && <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>{fr?"Aucune tâche":"No tasks"}</div>}
      {filtered.map(task => (
        <div key={task.id} style={{
          display:"flex",alignItems:"center",gap:16,padding:"16px 20px",
          background:"var(--card-bg)",border:"1px solid "+(task.priority==="urgent"?"var(--danger-muted)":task.priority==="high"?"var(--warning-muted)":"var(--border-subtle)"),
          borderRadius:16,marginBottom:8,
          borderLeft:"4px solid "+(task.status==="done"?"var(--success)":task.status==="in_progress"?"var(--accent)":"var(--warning)"),
        }}>
          <input type="checkbox" checked={task.status==="done"} onChange={()=>updateStatus(task.id,task.status==="done"?"todo":"done")}
            style={{width:20,height:20,accentColor:"var(--success)",cursor:"pointer",flexShrink:0}} />
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,textDecoration:task.status==="done"?"line-through":"none",opacity:task.status==="done"?0.5:1}}>{task.title}</div>
            {task.description && <div style={{fontSize:11,color:"var(--text-tertiary)",marginTop:3}}>{task.description}</div>}
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <span style={{fontSize:10,padding:"1px 6px",borderRadius:6,background:"var(--accent-subtle)",color:"var(--accent)",fontWeight:600}}>{catIcon(task.category)} {task.category}</span>
              {task.due_date && <span style={{fontSize:10,color:isOverdue(task.due_date)&&task.status!=="done"?"var(--danger)":"var(--text-quaternary)"}}>{"\u{1F4C5}"} {fmtDate(task.due_date)}</span>}
              {task.priority==="urgent"&&<span style={{fontSize:10,color:"var(--danger)",fontWeight:700}}>{"\u{1F6A8}"} URGENT</span>}
              {task.priority==="high"&&<span style={{fontSize:10,color:"var(--warning)",fontWeight:600}}>{"\u26A0\uFE0F"} {fr?"Prioritaire":"High"}</span>}
            </div>
          </div>
          <select value={task.status} onChange={e=>updateStatus(task.id,e.target.value)} className="filter-select" style={{fontSize:11,padding:"5px 8px"}}>
            <option value="todo">{fr?"À faire":"To do"}</option>
            <option value="in_progress">{fr?"En cours":"In progress"}</option>
            <option value="done">{fr?"Terminé":"Done"}</option>
          </select>
        </div>
      ))}
    </div>
  );
};

// =============================================
// GÉRANT — AGENCY HEALTH SCORE
// =============================================
const AgencyHealthScore = ({txs, profiles}) => {
  const score = useMemo(() => {
    let s = 100;
    const now = Date.now();
    const pendingOld = txs.filter(tx => tx.status === "pending" && (now - new Date(tx.date).getTime()) > 24 * 3600000);
    s -= Math.min(pendingOld.length * 2, 20);
    const decided = txs.filter(tx => tx.status !== "pending");
    const validated = txs.filter(tx => tx.status === "validated" || tx.status === "confirmee");
    const convRate = decided.length > 0 ? (validated.length / decided.length) * 100 : 100;
    if (convRate < 60) s -= 15; else if (convRate < 75) s -= 5;
    const chatters = profiles.filter(p => p.role === "chatter");
    const weekAgo = now - 7 * 86400000;
    const inactiveChatters = chatters.filter(ch => !txs.some(tx => tx.chatter_id === ch.id && new Date(tx.date).getTime() > weekAgo));
    s -= Math.min(inactiveChatters.length * 5, 15);
    return Math.max(0, Math.min(100, Math.round(s)));
  }, [txs, profiles]);

  const color = score > 70 ? "var(--success)" : score > 40 ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: `conic-gradient(${color} ${score * 3.6}deg, var(--bg-overlay) ${score * 3.6}deg)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 20px ${color}25`,
      }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bg-raised)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 20, fontWeight: 800, color }}>{score}</span>
          <span style={{ fontSize: 8, color: "var(--text-quaternary)", textTransform: "uppercase", letterSpacing: 1 }}>Sant\u00E9</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{score > 70 ? "\u2705 Excellente" : score > 40 ? "\u26A0\uFE0F Attention" : "\u{1F6A8} Critique"}</div>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Score de sant\u00E9 de l'agence</div>
      </div>
    </div>
  );
};

// =============================================
// GÉRANT — AGENCY ACHIEVEMENTS
// =============================================
const AgencyAchievements = ({txs, profiles, models, expenses, convertAmount}) => {
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0);
    const validated = txs.filter(tx => tx.status === "validated" || tx.status === "confirmee");
    const monthlyCA = validated.filter(tx => new Date(tx.date) >= monthStart).reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
    const weeklyTxCount = txs.filter(tx => new Date(tx.date) >= monday && (tx.status === "validated" || tx.status === "confirmee")).length;
    const modelStats = models.map(m => {
      const mTxs = validated.filter(tx => tx.model_id === m.id);
      const ca = mTxs.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
      const mExp = (expenses || []).filter(e => e.model_id === m.id).reduce((s, e) => s + Number(e.amount), 0);
      return { margin: ca > 0 ? ((ca - mExp) / ca) * 100 : 0 };
    });
    const highMarginModels = modelStats.filter(m => m.margin >= 80).length;
    const now48h = Date.now() - 48 * 3600000;
    const oldPending = txs.filter(tx => tx.status === "pending" && new Date(tx.date).getTime() < now48h).length;
    const chatters = profiles.filter(p => p.role === "chatter");
    const allGoalsMet = chatters.length > 0 && chatters.every(ch => {
      const goal = Number(ch.daily_goal) || 500;
      const daily = getDailyProgress(ch.id, txs, convertAmount);
      return daily >= goal;
    });
    const allStreaks7 = chatters.length > 0 && chatters.every(ch => calculateStreak(ch.id, txs) >= 7);
    const spenderWeekly = {};
    txs.filter(tx => new Date(tx.date) >= monday && (tx.status === "validated" || tx.status === "confirmee")).forEach(tx => {
      const k = tx.spender_handle || "?";
      spenderWeekly[k] = (spenderWeekly[k] || 0) + convertAmount(Number(tx.amount), tx.currency);
    });
    const topWeeklySpender = Math.max(0, ...Object.values(spenderWeekly));
    return { monthlyCA, weeklyTxCount, highMarginModels, oldPending, allGoalsMet, allStreaks7, topWeeklySpender };
  }, [txs, profiles, models, expenses, convertAmount]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {AGENCY_ACHIEVEMENTS.map(a => {
        const unlocked = a.check(stats);
        return (
          <div key={a.id} style={{
            padding: "18px 14px", borderRadius: 16, textAlign: "center",
            background: unlocked ? "var(--accent-subtle)" : "var(--bg-overlay)",
            border: "1px solid " + (unlocked ? "var(--accent-muted)" : "var(--border-subtle)"),
            opacity: unlocked ? 1 : 0.35, transition: "all 0.3s",
          }}>
            <div style={{ fontSize: 32 }}>{a.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>{a.name}</div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 3 }}>{a.desc}</div>
            {unlocked && <div style={{ fontSize: 9, color: "var(--success)", marginTop: 6, fontWeight: 600 }}>{"\u2705"} D\u00C9BLOQU\u00C9</div>}
          </div>
        );
      })}
    </div>
  );
};

// =============================================
// GÉRANT — ACTIVITY HEATMAP (365 days)
// =============================================
const ActivityHeatmap = ({txs, convertAmount, currencySymbol}) => {
  const heatmapData = useMemo(() => {
    const data = {};
    txs.forEach(tx => {
      if (tx.status === "validated" || tx.status === "confirmee") {
        const day = new Date(tx.date).toISOString().slice(0, 10);
        if (!data[day]) data[day] = 0;
        data[day] += convertAmount(Number(tx.amount), tx.currency);
      }
    });
    return data;
  }, [txs, convertAmount]);
  const maxCA = Math.max(1, ...Object.values(heatmapData));

  const cells = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const ca = heatmapData[key] || 0;
    const intensity = ca / maxCA;
    cells.push(
      <div key={key} title={`${key} \u2014 ${Math.round(ca).toLocaleString()}${currencySymbol}`}
        style={{ width: 12, height: 12, borderRadius: 3, background: ca === 0 ? "var(--card-bg)" : `rgba(99,102,241,${0.15 + intensity * 0.85})`, cursor: "pointer", opacity: ca === 0 ? 1 : undefined }} />
    );
  }

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{"\u{1F4C5}"} Activit\u00E9 de l'agence \u2014 12 derniers mois</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(53, 12px)", gridTemplateRows: "repeat(7, 12px)", gap: 2, gridAutoFlow: "column", overflowX: "auto" }}>
        {cells}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--text-quaternary)" }}>Moins</span>
        {[0.1, 0.3, 0.5, 0.7, 1].map((op, i) => (
          <div key={"heatmap-" + op} style={{ width: 12, height: 12, borderRadius: 3, background: `rgba(99,102,241,${0.15 + op * 0.85})` }} />
        ))}
        <span style={{ fontSize: 10, color: "var(--text-quaternary)" }}>Plus</span>
      </div>
    </div>
  );
};

// =============================================
// GÉRANT — CHALLENGES MANAGER
// =============================================
const ChallengesSection = ({user, lang, txs, profiles, convertAmount, currencySymbol}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const [challenges, setChallenges] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", metric: "ca", start_date: "", end_date: "", reward: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await sb.from("challenges").select("*").order("created_at", { ascending: false });
      if (cancelled) return;
      setChallenges(data || []);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async () => {
    if (!form.title || !form.start_date || !form.end_date) return;
    setSaving(true);
    const { error } = await sb.from("challenges").insert({ ...form, created_by: user.id });
    setSaving(false);
    if (error) { addToast("Erreur: " + error.message, "error"); return; }
    setForm({ title: "", metric: "ca", start_date: "", end_date: "", reward: "" });
    setShowForm(false);
    const { data } = await sb.from("challenges").select("*").order("created_at", { ascending: false });
    setChallenges(data || []);
    addToast(fr ? "Challenge cr\u00E9\u00E9 \u{1F3C6}" : "Challenge created \u{1F3C6}", "success");
  };

  const now = new Date();
  const active = challenges.filter(c => c.active && new Date(c.end_date) >= now);
  const past = challenges.filter(c => !c.active || new Date(c.end_date) < now);

  const getChallengeRanking = (ch) => {
    const start = new Date(ch.start_date);
    const end = new Date(ch.end_date);
    const chatters = profiles.filter(p => p.role === "chatter");
    return chatters.map(chatter => {
      const cTxs = txs.filter(tx => tx.chatter_id === chatter.id && new Date(tx.date) >= start && new Date(tx.date) <= end && (tx.status === "validated" || tx.status === "confirmee"));
      let val = 0;
      if (ch.metric === "ca") val = cTxs.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
      else if (ch.metric === "tx_count") val = cTxs.length;
      else if (ch.metric === "avg_ticket") val = cTxs.length > 0 ? cTxs.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0) / cTxs.length : 0;
      return { chatter, val };
    }).sort((a, b) => b.val - a.val);
  };

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{"\u{1F3C6}"} Challenges</h3>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary" style={{ fontSize: 11, padding: "5px 14px" }}>+ {fr ? "Cr\u00E9er" : "Create"}</button>
      </div>
      {showForm && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-default)", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <input placeholder={fr ? "Titre du challenge" : "Challenge title"} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input" style={{ marginBottom: 8, width: "100%" }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })} className="filter-select">
              <option value="ca">CA Brut</option><option value="tx_count">Nombre TX</option><option value="avg_ticket">Panier Moyen</option>
            </select>
            <input type="datetime-local" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="filter-date" />
            <input type="datetime-local" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="filter-date" />
          </div>
          <input placeholder={fr ? "R\u00E9compense (texte libre)" : "Reward"} value={form.reward} onChange={e => setForm({ ...form, reward: e.target.value })} className="input" style={{ marginBottom: 8, width: "100%" }} />
          <button onClick={handleCreate} disabled={saving} className="btn btn-primary" style={{ fontSize: 11 }}>{saving ? <><BtnSpinner/>{" "}</> : (fr ? "Cr\u00E9er le challenge" : "Create challenge")}</button>
        </div>
      )}
      {active.length === 0 && past.length === 0 && <div style={{ color: "var(--text-quaternary)", textAlign: "center", padding: 20 }}>{fr ? "Aucun challenge" : "No challenges"}</div>}
      {active.map(ch => {
        const ranking = getChallengeRanking(ch);
        const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
        return (
          <div key={ch.id} style={{ border: "1px solid var(--accent-muted)", borderRadius: 14, padding: 14, marginBottom: 10, background: "var(--accent-subtle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{"\u{1F525}"} {ch.title}</span>
              <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 600 }}>ACTIF</span>
            </div>
            {ch.reward && <div style={{ fontSize: 10, color: "var(--warning)", marginBottom: 8 }}>{"\u{1F381}"} {ch.reward}</div>}
            {ranking.slice(0, 5).map((r, i) => (
              <div key={r.chatter.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <span style={{ fontSize: 14, width: 20 }}>{medals[i] || (i + 1)}</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{r.chatter.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{Math.round(r.val).toLocaleString()}{ch.metric === "ca" ? currencySymbol : ch.metric === "tx_count" ? " TX" : currencySymbol}</span>
              </div>
            ))}
          </div>
        );
      })}
      {past.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-quaternary)", marginBottom: 6 }}>{fr ? "Challenges pass\u00E9s" : "Past challenges"}</div>
          {past.slice(0, 3).map(ch => (
            <div key={ch.id} style={{ fontSize: 11, color: "var(--text-quaternary)", padding: "4px 0" }}>{ch.title} \u2014 {fmtDate(ch.end_date)}</div>
          ))}
        </div>
      )}
    </div>
  );
};

module.exports.default = ModelTasksTab;
