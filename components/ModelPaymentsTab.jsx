// =============================================
// MODEL ROLE — MES PAIES
// =============================================
const ModelPaymentsTab = ({user, lang, invoices}) => {
  const fr = lang === "fr";
  const { currencySymbol } = useCurrency();
  const [payments, setPayments] = useState([]);
  const [loadingP, setLoadingP] = useState(true);
  const [modelPaySubTab, setModelPaySubTab] = useState("paies");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await sb.from("model_payments").select("*").eq("model_id", user.id).order("date", { ascending: false });
      if (cancelled) return;
      setPayments(data || []);
      setLoadingP(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const salaryThisMonth = payments.filter(p => p.type === "salary" && p.status === "paid" && new Date(p.date) >= monthStart).reduce((s, p) => s + Number(p.amount), 0);
  const bonusThisMonth = payments.filter(p => p.type === "bonus" && p.status === "paid" && new Date(p.date) >= monthStart).reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = payments.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);

  const typeLabel = (t) => t === "salary" ? (fr ? "\u{1F4B5} Salaire" : "\u{1F4B5} Salary") : t === "bonus" ? (fr ? "\u{1F381} Bonus" : "\u{1F381} Bonus") : (fr ? "\u{1F4B8} Autre" : "\u{1F4B8} Other");
  const statusColor = (s) => s === "paid" ? "var(--success)" : s === "cancelled" ? "var(--danger)" : "var(--warning)";
  const statusLabel = (s) => s === "paid" ? (fr ? "Pay\u00E9" : "Paid") : s === "cancelled" ? (fr ? "Annul\u00E9" : "Cancelled") : "Pending";

  const myModelInvoices = (invoices||[]).filter(inv => inv.profile_id === user.id && inv.type === "outgoing_model");

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{"\u{1F4B0}"} {fr ? "Mes Paies" : "My Payments"}</h2>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "3px 0 0", fontStyle: "italic" }}>{fr ? "Historique de tes paiements" : "Your payment history"}</p>
      </div>
      {/* Sub-tabs */}
      <div style={{display:"flex",gap:4,marginBottom:20}}>
        {[{id:"paies",label:fr?"Mes Paies":"My Payments"},{id:"factures",label:fr?"Mes Factures":"My Invoices"}].map(tb=>(
          <button key={tb.id} className="btn" style={{padding:"6px 16px",fontSize:12,fontWeight:modelPaySubTab===tb.id?800:600,background:modelPaySubTab===tb.id?"var(--accent)":"var(--card-bg)",color:modelPaySubTab===tb.id?"#fff":"var(--text-secondary)",border:"1px solid "+(modelPaySubTab===tb.id?"var(--accent)":"var(--border-subtle)"),borderRadius:20}} onClick={()=>setModelPaySubTab(tb.id)}>{tb.label}</button>
        ))}
      </div>
      {modelPaySubTab === "factures" ? (
        <MyInvoicesPanel invoices={myModelInvoices} lang={lang} />
      ) : (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: fr ? "Salaire ce mois" : "Salary this month", value: salaryThisMonth.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + currencySymbol, icon: "\u{1F4B5}", color: "var(--accent)" },
          { label: fr ? "Bonus ce mois" : "Bonus this month", value: bonusThisMonth.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + currencySymbol, icon: "\u{1F381}", color: "var(--success)" },
          { label: fr ? "Total vers\u00E9" : "Total paid", value: totalPaid.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + currencySymbol, icon: "\u{1F4B0}", color: "var(--pink)" },
        ].map((k, i) => (
          <div key={k.label} style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 18, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{k.icon} {k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)", fontSize: 13, fontWeight: 700 }}>{"\u{1F4CA}"} {fr ? "Historique des paiements" : "Payment history"}</div>
        {loadingP && <div style={{ textAlign: "center", color: "var(--text-quaternary)", padding: 40 }}>Chargement...</div>}
        {!loadingP && payments.length === 0 && <div style={{ textAlign: "center", color: "var(--text-quaternary)", padding: 40 }}>{fr ? "Aucun paiement" : "No payments"}</div>}
        {!loadingP && payments.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead><tr>
                <th>Date</th><th>Type</th><th>{fr ? "Montant" : "Amount"}</th><th>{fr ? "Devise" : "Currency"}</th><th>Notes</th><th>{fr ? "Statut" : "Status"}</th>
              </tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.date)}</td>
                    <td>{typeLabel(p.type)}</td>
                    <td style={{ fontWeight: 800, color: "var(--success)" }}>+{Number(p.amount).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{p.currency === "EUR" ? "\u20AC" : " CHF"}</td>
                    <td>{p.currency}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{p.notes || "\u2014"}</td>
                    <td><span style={{ padding: "2px 8px", borderRadius: 10, background: statusColor(p.status) + "15", color: statusColor(p.status), fontSize: 10, fontWeight: 700 }}>{statusLabel(p.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
};

// =============================================
// GÉRANT — CONTENT TASK MANAGER (used inside ModelesTab)
// =============================================
const ContentTaskManager = ({modelId, lang, onRefresh}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const [tasks, setTasks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "photo", priority: "medium", due_date: "", bonus_amount: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await sb.from("content_tasks").select("*").eq("model_id", modelId).order("created_at", { ascending: false });
      if (cancelled) return;
      setTasks(data || []);
    };
    load();
    return () => { cancelled = true; };
  }, [modelId]);

  const handleAdd = async () => {
    if (!form.title) return;
    setSaving(true);
    const { error } = await sb.from("content_tasks").insert({
      model_id: modelId, title: form.title, description: form.description,
      category: form.category, priority: form.priority,
      due_date: form.due_date || null, bonus_amount: Number(form.bonus_amount) || 0,
    });
    setSaving(false);
    if (error) { addToast("Erreur: " + error.message, "error"); return; }
    setForm({ title: "", description: "", category: "photo", priority: "medium", due_date: "", bonus_amount: 0 });
    setShowForm(false);
    const { data } = await sb.from("content_tasks").select("*").eq("model_id", modelId).order("created_at", { ascending: false });
    setTasks(data || []);
    addToast(fr ? "T\u00E2che ajout\u00E9e \u2705" : "Task added \u2705", "success");
  };

  const updateStatus = async (taskId, newStatus) => {
    await sb.from("content_tasks").update({ status: newStatus, completed_at: newStatus === "done" ? new Date().toISOString() : null }).eq("id", taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const catIcon = (c) => c === "photo" ? "\u{1F4F8}" : c === "video" ? "\u{1F3A5}" : c === "live" ? "\u{1F534}" : "\u{1F4E6}";
  const stColor = (s) => s === "done" ? "var(--success)" : s === "in_progress" ? "var(--accent)" : s === "review" ? "var(--pink)" : "var(--warning)";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{"\u{1F4CB}"} Content List ({tasks.length})</span>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary" style={{ fontSize: 11, padding: "5px 14px" }}>+ {fr ? "Ajouter" : "Add"}</button>
      </div>
      {showForm && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-default)", borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <input placeholder={fr ? "Titre de la t\u00E2che" : "Task title"} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input" style={{ marginBottom: 8, width: "100%" }} />
          <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input" style={{ marginBottom: 8, width: "100%" }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="filter-select">
              <option value="photo">{"\u{1F4F8}"} Photo</option><option value="video">{"\u{1F3A5}"} Vid\u00E9o</option><option value="live">{"\u{1F534}"} Live</option><option value="custom">{"\u{1F4E6}"} Custom</option>
            </select>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="filter-select">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="filter-date" />
            <input type="number" placeholder="Bonus \u20AC" value={form.bonus_amount} onChange={e => setForm({ ...form, bonus_amount: e.target.value })} className="input" style={{ width: 80 }} />
          </div>
          <button onClick={handleAdd} disabled={saving} className="btn btn-primary" style={{ fontSize: 11 }}>{saving ? <><BtnSpinner/>{" "}</> : (fr ? "Ajouter" : "Add")}</button>
        </div>
      )}
      {tasks.map(task => (
        <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: stColor(task.status), flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, textDecoration: task.status === "done" ? "line-through" : "none", opacity: task.status === "done" ? 0.5 : 1 }}>{task.title}</span>
            <div style={{ fontSize: 9, color: "var(--text-quaternary)" }}>{catIcon(task.category)} {task.category} {task.due_date ? "\u00B7 " + fmtDate(task.due_date) : ""} {task.bonus_amount > 0 ? "\u00B7 +" + task.bonus_amount + "\u20AC" : ""}</div>
          </div>
          <select value={task.status} onChange={e => updateStatus(task.id, e.target.value)} className="filter-select" style={{ fontSize: 10, padding: "3px 6px" }}>
            <option value="todo">Todo</option><option value="in_progress">En cours</option><option value="review">Review</option><option value="done">Done</option>
          </select>
        </div>
      ))}
    </div>
  );
};

module.exports.default = ModelPaymentsTab;
