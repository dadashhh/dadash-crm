// =============================================
// MODEL ROLE — CONTENT LIST TAB
// =============================================
const ModelContentTab = ({user, lang, onRefresh}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const { currencySymbol } = useCurrency();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("tout");
  const [loadingTasks, setLoadingTasks] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await sb.from("content_tasks").select("*").eq("model_id", user.id).order("created_at", { ascending: false });
      if (cancelled) return;
      setTasks(data || []);
      setLoadingTasks(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const updateStatus = async (taskId, newStatus) => {
    const updates = { status: newStatus };
    if (newStatus === "done") updates.completed_at = new Date().toISOString();
    const { error } = await sb.from("content_tasks").update(updates).eq("id", taskId);
    if (error) { addToast("Erreur: " + error.message, "error"); return; }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
    if (newStatus === "done") addToast(fr ? "T\u00E2che termin\u00E9e \u2705" : "Task completed \u2705", "success");
  };

  const toggleTask = (task) => {
    updateStatus(task.id, task.status === "done" ? "todo" : "done");
  };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todoCount = tasks.filter(t => t.status === "todo").length;
  const inProgressCount = tasks.filter(t => t.status === "in_progress").length;
  const doneThisMonth = tasks.filter(t => t.status === "done" && t.completed_at && new Date(t.completed_at) >= monthStart).length;
  const totalBonus = tasks.filter(t => t.status === "done").reduce((s, t) => s + Number(t.bonus_amount || 0), 0);

  const filtered = filter === "tout" ? tasks : tasks.filter(t => t.status === filter);
  const isOverdue = (d) => d && new Date(d) < new Date(new Date().toISOString().slice(0, 10));

  const catIcon = (c) => c === "photo" ? "\u{1F4F8}" : c === "video" ? "\u{1F3A5}" : c === "live" ? "\u{1F534}" : "\u{1F4E6}";

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{"\u{1F4CB}"} {fr ? "Ma Content List" : "My Content List"}</h2>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "3px 0 0" }}>
          {fr ? "Contenus \u00E0 produire" : "Content to produce"} \u2014 {todoCount} {fr ? "\u00E0 faire" : "to do"} {"\u00B7"} {doneThisMonth} {fr ? "termin\u00E9s" : "done"}
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: fr ? "\u00C0 faire" : "To do", value: todoCount, icon: "\u{1F4DD}", color: "var(--warning)" },
          { label: fr ? "En cours" : "In progress", value: inProgressCount, icon: "\u{1F504}", color: "var(--accent)" },
          { label: fr ? "Termin\u00E9s ce mois" : "Done this month", value: doneThisMonth, icon: "\u2705", color: "var(--success)" },
          { label: fr ? "Bonus accumul\u00E9" : "Bonus earned", value: totalBonus + currencySymbol, icon: "\u{1F4B0}", color: "var(--pink)" },
        ].map((k, i) => (
          <div key={k.label} style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 18, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{k.icon} {k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[{k:"tout",l:fr?"Tout":"All"},{k:"todo",l:fr?"\u00C0 faire":"To do"},{k:"in_progress",l:fr?"En cours":"In progress"},{k:"review",l:fr?"En review":"In review"},{k:"done",l:fr?"Fait":"Done"}].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} className={`filter-chip ${filter===f.k?"active":""}`}>{f.l}</button>
        ))}
      </div>
      {loadingTasks && <div style={{ textAlign: "center", color: "var(--text-quaternary)", padding: 40 }}>Chargement...</div>}
      {!loadingTasks && filtered.length === 0 && <div style={{ textAlign: "center", color: "var(--text-quaternary)", padding: 40 }}>{fr ? "Aucune t\u00E2che" : "No tasks"}</div>}
      {filtered.map(task => (
        <div key={task.id} style={{
          display: "flex", alignItems: "center", gap: 16, padding: "16px 20px",
          background: "var(--card-bg)",
          border: "1px solid " + (task.priority === "urgent" ? "var(--danger-muted)" : task.priority === "high" ? "var(--warning-muted)" : "var(--border-subtle)"),
          borderRadius: 16, marginBottom: 8,
          borderLeft: "4px solid " + (task.status === "done" ? "var(--success)" : task.status === "in_progress" ? "var(--accent)" : task.status === "review" ? "var(--pink)" : "var(--warning)"),
        }}>
          <input type="checkbox" checked={task.status === "done"} onChange={() => toggleTask(task)}
            style={{ width: 20, height: 20, accentColor: "var(--success)", cursor: "pointer", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, textDecoration: task.status === "done" ? "line-through" : "none", opacity: task.status === "done" ? 0.5 : 1 }}>{task.title}</div>
            {task.description && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3 }}>{task.description}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: "var(--accent-subtle)", color: "var(--accent)", fontWeight: 600 }}>{catIcon(task.category)} {task.category}</span>
              {task.due_date && <span style={{ fontSize: 10, color: isOverdue(task.due_date) && task.status !== "done" ? "var(--danger)" : "var(--text-quaternary)" }}>{"\u{1F4C5}"} {fmtDate(task.due_date)}</span>}
              {task.bonus_amount > 0 && <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 600 }}>{"\u{1F4B0}"} +{task.bonus_amount}{task.bonus_currency === "EUR" ? "\u20AC" : " CHF"}</span>}
              {task.priority === "urgent" && <span style={{ fontSize: 10, color: "var(--danger)", fontWeight: 700 }}>{"\u{1F6A8}"} URGENT</span>}
              {task.priority === "high" && <span style={{ fontSize: 10, color: "var(--warning)", fontWeight: 600 }}>{"\u26A0\uFE0F"} {fr?"Prioritaire":"High"}</span>}
            </div>
          </div>
          <select value={task.status} onChange={e => updateStatus(task.id, e.target.value)} className="filter-select" style={{ fontSize: 11, padding: "5px 8px" }}>
            <option value="todo">{fr ? "\u00C0 faire" : "To do"}</option>
            <option value="in_progress">{fr ? "En cours" : "In progress"}</option>
            <option value="review">{fr ? "En review" : "In review"}</option>
            <option value="done">{fr ? "Fait \u2705" : "Done \u2705"}</option>
          </select>
        </div>
      ))}
    </div>
  );
};

module.exports.default = ModelContentTab;
