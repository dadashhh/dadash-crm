// =============================================
// MODEL ROLE — MON ESPACE (DASHBOARD)
// =============================================
const ModelDashboardTab = ({user, lang}) => {
  const fr = lang === "fr";
  const { currencySymbol } = useCurrency();
  const [tasks, setTasks] = useState([]);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [tR, pR] = await Promise.all([
        sb.from("content_tasks").select("*").eq("model_id", user.id).order("created_at", { ascending: false }),
        sb.from("model_payments").select("*").eq("model_id", user.id).order("date", { ascending: false }),
      ]);
      if (cancelled) return;
      setTasks(tR.data || []);
      setPayments(pR.data || []);
    };
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const doneThisMonth = tasks.filter(t => t.status === "done" && t.completed_at && new Date(t.completed_at) >= monthStart).length;
  const totalBonus = tasks.filter(t => t.status === "done").reduce((s, t) => s + Number(t.bonus_amount || 0), 0);

  // Streak: consecutive days with a completed task
  const doneDates = tasks.filter(t => t.status === "done" && t.completed_at).map(t => new Date(t.completed_at).toISOString().slice(0, 10)).filter((v, i, a) => a.indexOf(v) === i).sort().reverse();
  let streak = 0;
  if (doneDates.length) {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (doneDates[0] === today || doneDates[0] === yesterday) {
      streak = 1;
      for (let i = 0; i < doneDates.length - 1; i++) {
        if ((new Date(doneDates[i]) - new Date(doneDates[i + 1])) / 86400000 === 1) streak++; else break;
      }
    }
  }

  // Badges
  const MODEL_BADGES = [
    { icon: "\u{1F4F8}", name: "First Shot", desc: "1 contenu termin\u00E9", unlocked: tasks.filter(t=>t.status==="done").length >= 1 },
    { icon: "\u{1F3AC}", name: "Productrice", desc: "10 contenus termin\u00E9s", unlocked: tasks.filter(t=>t.status==="done").length >= 10 },
    { icon: "\u{1F31F}", name: "Star", desc: "25 contenus termin\u00E9s", unlocked: tasks.filter(t=>t.status==="done").length >= 25 },
    { icon: "\u{1F525}", name: "On Fire", desc: "7j streak", unlocked: streak >= 7 },
    { icon: "\u{1F4B0}", name: "Bonus Queen", desc: "500\u20AC de bonus", unlocked: totalBonus >= 500 },
    { icon: "\u{1F451}", name: "Legend", desc: "50 contenus + 1000\u20AC bonus", unlocked: tasks.filter(t=>t.status==="done").length >= 50 && totalBonus >= 1000 },
  ];

  const upcomingTasks = tasks.filter(t => t.status !== "done").sort((a, b) => (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1).slice(0, 5);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{"\u{1F469}\u200D\u{1F4BC}"} {fr ? "Mon Espace" : "My Space"} \u2014 {user.name}</h2>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "3px 0 0", fontStyle: "italic" }}>{fr ? "Ton tableau de bord personnel" : "Your personal dashboard"}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: fr ? "Contenus ce mois" : "Done this month", value: doneThisMonth, icon: "\u2705", color: "var(--success)" },
          { label: "Streak \u{1F525}", value: streak + (fr ? " jours" : " days"), icon: "\u{1F525}", color: "var(--warning)" },
          { label: fr ? "Bonus accumul\u00E9" : "Bonus earned", value: totalBonus + currencySymbol, icon: "\u{1F4B0}", color: "var(--pink)" },
        ].map((k, i) => (
          <div key={k.label} style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 18, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{k.icon} {k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{"\u{1F3C6}"} {fr ? "Mes Badges" : "My Badges"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {MODEL_BADGES.map((b, i) => (
            <div key={b.name} style={{
              padding: "14px 12px", borderRadius: 14, textAlign: "center",
              background: b.unlocked ? "var(--accent-subtle)" : "var(--bg-overlay)",
              border: "1px solid " + (b.unlocked ? "var(--accent-muted)" : "var(--border-subtle)"),
              opacity: b.unlocked ? 1 : 0.3,
            }}>
              <div style={{ fontSize: 28 }}>{b.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6 }}>{b.name}</div>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>{b.desc}</div>
              {b.unlocked && <div style={{ fontSize: 9, color: "var(--success)", marginTop: 4, fontWeight: 600 }}>{"\u2705"} {fr ? "D\u00C9BLOQU\u00C9" : "UNLOCKED"}</div>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{"\u{1F4CB}"} {fr ? "Prochaines t\u00E2ches" : "Upcoming tasks"}</h3>
        {upcomingTasks.length === 0 && <div style={{ color: "var(--text-quaternary)", textAlign: "center", padding: 20 }}>{fr ? "Aucune t\u00E2che en attente \u{1F389}" : "No pending tasks \u{1F389}"}</div>}
        {upcomingTasks.map(task => (
          <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: task.status === "in_progress" ? "var(--accent)" : task.status === "review" ? "var(--pink)" : "var(--warning)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{task.title}</div>
              <div style={{ fontSize: 10, color: "var(--text-quaternary)" }}>{task.category} {task.due_date ? "\u00B7 " + fmtDate(task.due_date) : ""}</div>
            </div>
            {task.bonus_amount > 0 && <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 600 }}>{"\u{1F4B0}"} +{task.bonus_amount}\u20AC</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

module.exports.default = ModelDashboardTab;
