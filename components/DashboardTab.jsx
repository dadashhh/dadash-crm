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
  q_spender_profile, q_spender_transactions, q_spender_kpis,
  q_spender_breakdown_models, q_spender_breakdown_chatter, q_spender_breakdown_provider,
  _hashStr, tonightDate, tonightStatus,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, RechartsTooltip, Legend,
} = window.DadashShared;

const DashboardTab = ({user, lang, txs, models, profiles, onRefresh, onNotify, alerts, botStats, onDismissAlert, onAlertNavigate}) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const dr = useDateRange("7d");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [chatter, setChatter] = useState("");
  const [provider, setProvider] = useState("");
  const [editingTx, setEditingTx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeMetrics, setActiveMetrics] = useState(["brut", "valide"]);
  const toggleMetric = (key) => {
    setActiveMetrics(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };
  const handleDashStatus = async (txId, newStatus) => {
    try {
      const currentTx = txs.find(tx=>tx.id===txId);
      // Immutability guard: only pending transactions can change status
      if (currentTx && currentTx.status !== "pending") {
        addToast(t(lang,"tx_immutable"), "error");
        return;
      }
      const {error} = await sb.from("transactions").update({status:newStatus}).eq("id",txId);
      if(error) { addToast("Erreur: " + error.message, "error"); return; }
      if(onNotify&&currentTx) {
        const cur = currencySymbol;
        const modelName = models.find(m=>m.id===currentTx.model_id)?.name||"";
        if(newStatus==="validated") {
          if(currentTx.chatter_id) onNotify(currentTx.chatter_id,"tx_validated","TX validée ✅",`${currentTx.amount}${cur} de @${currentTx.spender_handle}`,txId);
          profiles.filter(p=>p.role==="gerant").forEach(g=>onNotify(g.id,"tx_validated","TX validée",`${currentTx.amount}${cur} @${currentTx.spender_handle}${modelName?" #"+modelName:""}`,txId));
        } else {
          if(currentTx.chatter_id) onNotify(currentTx.chatter_id,"tx_refused","TX refusée ❌",`${currentTx.amount}${cur} de @${currentTx.spender_handle}`,txId);
          profiles.filter(p=>p.role==="gerant").forEach(g=>onNotify(g.id,"tx_refused","TX refusée",`${currentTx.amount}${cur} @${currentTx.spender_handle}${modelName?" #"+modelName:""}`,txId));
        }
      }
      await onRefresh();
      addToast(newStatus==="validated"?(t(lang,"tx_validated")):(t(lang,"tx_refused")), newStatus==="validated"?"success":"error");
    } catch(e) { addToast("Erreur: " + e.message, "error"); }
  };
  const handleDashEditSave = async (updates) => {
    if (!editingTx || editingTx.status !== "pending") { setEditingTx(null); return; }
    setSaving(true);
    try {
      const {error} = await sb.from("transactions").update({spender_handle:updates.spender_handle,amount:updates.amount,currency:updates.currency,model_id:updates.model_id,provider_id:updates.provider_id,chatter_id:updates.chatter_id,product:updates.product,tag:updates.tag,product_id:updates.product_id||null,product_tag_id:updates.product_tag_id||null,notes:updates.notes}).eq("id",editingTx.id).eq("status","pending");
      setSaving(false);
      if(error) { addToast("Erreur: " + error.message, "error"); return; }
      setEditingTx(null);
      await onRefresh();
      addToast(t(lang,"tx_updated"), "success");
    } catch(e) { setSaving(false); addToast("Erreur: " + e.message, "error"); }
  };
  const filtered = useMemo(() => filterByStatus(filterByChatter(filterByProvider(filterByModel(dr.filterByDate(txs, "date"), model), provider), chatter), status), [txs, dr.startDate, dr.endDate, dr.activePreset, model, provider, chatter, status]);
  const pending = useMemo(() => filtered.filter(tx=>tx.status==="pending"), [filtered]);
  const validated = useMemo(() => filtered.filter(tx=>tx.status==="validated"), [filtered]);
  const dashKpis = useMemo(() => {
    const caGross = filtered.reduce((s,tx)=>s+convertAmount(Number(tx.amount),tx.currency),0);
    const commTotal = filtered.reduce((s,tx)=>s+convertAmount(Number(tx.chatter_commission||0),tx.currency),0);
    const caNet = filtered.reduce((s,tx)=>s+convertAmount(Number(tx.net_amount||0),tx.currency),0);
    const caPending = pending.reduce((s,tx)=>s+convertAmount(Number(tx.amount),tx.currency),0);
    const caValidated = validated.reduce((s,tx)=>s+convertAmount(Number(tx.amount),tx.currency),0);
    return { caGross, commTotal, caNet, caPending, caValidated };
  }, [filtered, pending, validated, convertAmount]);
  const { caGross, commTotal, caNet, caPending, caValidated } = dashKpis;
  const tz = useTimezone() || "Europe/Paris";
  const chartData = useMemo(() => {
    const byDay = {};
    filtered.forEach(tx => {
      const d = new Date(tx.date);
      const key = d.toLocaleDateString("fr-FR", { timeZone: tz, day: "2-digit", month: "short" });
      const sortKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      if (!byDay[sortKey]) byDay[sortKey] = { name: key, sortKey, brut: 0, valide: 0, pending: 0, refuse: 0 };
      byDay[sortKey].brut += convertAmount(Number(tx.amount), tx.currency);
      if (tx.status === "validated" || tx.status === "confirmee" || tx.status === "payee") {
        byDay[sortKey].valide += convertAmount(Number(tx.amount), tx.currency);
      }
      if (tx.status === "pending" || tx.status === "en_attente") {
        byDay[sortKey].pending += convertAmount(Number(tx.amount), tx.currency);
      }
      if (tx.status === "refused" || tx.status === "refusee" || tx.status === "annulee") {
        byDay[sortKey].refuse += convertAmount(Number(tx.amount), tx.currency);
      }
    });
    return Object.values(byDay).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filtered, tz, convertAmount]);
  const { totalBrut, totalValide, totalPending } = useMemo(() => ({
    totalBrut: chartData.reduce((s, d) => s + d.brut, 0),
    totalValide: chartData.reduce((s, d) => s + d.valide, 0),
    totalPending: chartData.reduce((s, d) => s + d.pending, 0),
  }), [chartData]);
  return (
    <div>
      <GlobalFilterBar lang={lang} dr={dr} models={models} profiles={profiles}
        model={model} setModel={setModel} showModelFilter
        provider={provider} setProvider={setProvider} showProviderFilter={user.role==="gerant"}
        chatter={chatter} setChatter={setChatter} showChatterFilter={user.role==="gerant"}
        status={status} setStatus={setStatus} showStatusFilter />
      {user.role==="gerant" && alerts && <AlertsPanel alerts={alerts} onDismiss={onDismissAlert} onNavigate={onAlertNavigate} lang={lang} />}
      {user.role==="gerant" && botStats && <BotStatsKPIs botStats={botStats} lang={lang} />}
      <div className="kpi-grid">
        {user.role==="gerant"?
          <><KPICard label={t(lang,"ca_brut")} value={`${caGross.toFixed(0)}${currencySymbol}`} icon="💰"/><KPICard label={t(lang,"net_agence")} value={`${caNet.toFixed(0)}${currencySymbol}`} icon="🏦"/></>
          :<KPICard label={t(lang,"mon_ca")} value={`${caGross.toFixed(0)}${currencySymbol}`} icon="💰"/>
        }
        <KPICard label={t(lang,"nb_txs")} value={`${filtered.length}`} icon="📋"/>
        <KPICard label={t(lang,"marge_comm")} value={`${(caNet-commTotal).toFixed(0)}${currencySymbol}`} sublabel={`Comm: ${commTotal.toFixed(0)}${currencySymbol}`} icon="📊"/>
      </div>
      <div className="kpi-grid">
        <KPICard label={t(lang,"ca_pending")} value={`${caPending.toFixed(0)}${currencySymbol}`} icon="⏳" className="warning" />
        <KPICard label={t(lang,"nb_pending")} value={`${pending.length}`} icon="🔄" className="warning" />
        <KPICard label={t(lang,"ca_validated")} value={`${caValidated.toFixed(0)}${currencySymbol}`} icon="✅" className="warning" />
        <KPICard label={t(lang,"nb_validated")} value={`${validated.length}`} icon="🎯" className="warning" />
      </div>
      {/* ═══════════════════════════════════════════
          GRAPHE CA BRUT DYNAMIQUE
          ═══════════════════════════════════════════ */}
      {user.role==="gerant" && (
      <div style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: "24px 24px 16px",
        marginBottom: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--text)" }}>📈 CA Brut Agence</h2>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "3px 0 0" }}>
              {lang==="fr"?"Évolution jour par jour — réagit aux filtres":"Day by day evolution — reacts to filters"}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {totalBrut.toLocaleString("fr-FR", {maximumFractionDigits:0})}{currencySymbol}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
              CA brut {lang==="fr"?"période":"period"} · {totalValide.toLocaleString("fr-FR", {maximumFractionDigits:0})}{currencySymbol} {lang==="fr"?"validé":"validated"} · {totalPending.toLocaleString("fr-FR", {maximumFractionDigits:0})}{currencySymbol} pending
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {[
            { key: "brut", label: "CA Brut", color: "var(--accent)" },
            { key: "valide", label: lang==="fr"?"Validé":"Validated", color: "var(--success)" },
            { key: "pending", label: "Pending", color: "var(--warning)" },
            { key: "refuse", label: lang==="fr"?"Refusé":"Refused", color: "var(--danger)" },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 12,
                border: activeMetrics.includes(m.key) ? `1px solid ${m.color}66` : "1px solid var(--border-default)",
                background: activeMetrics.includes(m.key) ? `${m.color}20` : "transparent",
                color: activeMetrics.includes(m.key) ? m.color : "var(--text-tertiary)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        {chartData.length > 0 && rechartsReady ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradBrut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradValide" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--warning)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--warning)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRefuse" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--danger)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--text-tertiary)", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
                tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(1) + "K" : v}
              />
              <RechartsTooltip
                contentStyle={{
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 12,
                  padding: "14px 18px",
                  boxShadow: "var(--shadow-lg)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                }}
                formatter={(value) => [value.toLocaleString("fr-FR", {maximumFractionDigits:0}) + (currencySymbol === "€" ? "€" : " CHF")]}
                labelStyle={{ color: "var(--text-secondary)", marginBottom: 6 }}
              />
              {activeMetrics.includes("brut") && (
                <Area type="monotone" dataKey="brut" stroke="var(--accent)" strokeWidth={3} fill="url(#gradBrut)"
                  dot={{ fill: "var(--accent)", stroke: "var(--bg-raised)", strokeWidth: 3, r: 5 }}
                  activeDot={{ r: 7, stroke: "var(--accent)", strokeWidth: 2, fill: "var(--bg-raised)" }}
                  name="CA Brut" animationDuration={600} />
              )}
              {activeMetrics.includes("valide") && (
                <Area type="monotone" dataKey="valide" stroke="var(--success)" strokeWidth={2} fill="url(#gradValide)"
                  dot={{ fill: "var(--success)", stroke: "var(--bg-raised)", strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 6, stroke: "var(--success)", strokeWidth: 2, fill: "var(--bg-raised)" }}
                  name={lang==="fr"?"Validé":"Validated"} animationDuration={600} />
              )}
              {activeMetrics.includes("pending") && (
                <Area type="monotone" dataKey="pending" stroke="var(--warning)" strokeWidth={2} fill="url(#gradPending)"
                  dot={{ fill: "var(--warning)", stroke: "var(--bg-raised)", strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 6, stroke: "var(--warning)", strokeWidth: 2, fill: "var(--bg-raised)" }}
                  name="Pending" animationDuration={600} />
              )}
              {activeMetrics.includes("refuse") && (
                <Area type="monotone" dataKey="refuse" stroke="var(--danger)" strokeWidth={2} fill="url(#gradRefuse)"
                  dot={{ fill: "var(--danger)", stroke: "var(--bg-raised)", strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 6, stroke: "var(--danger)", strokeWidth: 2, fill: "var(--bg-raised)" }}
                  name={lang==="fr"?"Refusé":"Refused"} animationDuration={600} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 40 }}>📭</span>
            <span style={{ fontSize: 13, color: "var(--text-quaternary)" }}>
              {lang==="fr"?"Aucune transaction sur cette période":"No transactions for this period"}
            </span>
          </div>
        )}
      </div>
      )}
      <div className="grid-2">
        <div className="card">
          <div className="section-title"><div className="section-bar"></div>{t(lang,"revenue_by_model")}</div>
          <div className="table-wrap">
            <table className="table"><thead><tr><th>Model</th><th>CA</th></tr></thead>
            <tbody>
              {models.map(m=>{
                const ca = filtered.filter(tx=>tx.model_id===m.id).reduce((s,tx)=>s+convertAmount(Number(tx.amount),tx.currency),0);
                return <tr key={m.id}><td><Tag type="model" label={m.name} id={m.id}/></td><td>{ca.toFixed(0)}{currencySymbol}</td></tr>;
              })}
            </tbody></table>
          </div>
        </div>
        {user.role==="gerant"?
          <div className="card">
            <div className="section-title"><div className="section-bar"></div>{t(lang,"revenue_by_chatter")}</div>
            <div className="table-wrap">
              <table className="table"><thead><tr><th>Chatter</th><th>CA</th></tr></thead>
              <tbody>
                {profiles.filter(u=>u.role==="chatter").map(u=>{
                  const ca = filtered.filter(tx=>tx.chatter_id===u.id).reduce((s,tx)=>s+convertAmount(Number(tx.amount),tx.currency),0);
                  return <tr key={u.id}><td><Tag type="chatter" label={u.name} id={u.id}/></td><td>{ca.toFixed(0)}{currencySymbol}</td></tr>;
                })}
              </tbody></table>
            </div>
          </div>
          :
          <div className="card">
            <div className="section-title"><div className="section-bar"></div>{t(lang,"recent_tx")}</div>
            <div className="table-wrap">
              <table className="table" style={{fontSize:11}}><thead><tr><th>{t(lang,"date")}</th><th>Spender</th><th>{t(lang,"amount")}</th><th>{lang==="fr"?"Produit":"Product"}</th><th>Tag</th><th>{lang==="fr"?"Modèle":"Model"}</th><th>Chatter</th><th>Provider</th><th>{t(lang,"status")}</th></tr></thead>
              <tbody>
                {filtered.slice(0,5).map(tx=>(
                  <tr key={tx.id}><td>{fmtDate(tx.date)}</td><td><Tag type="spender" label={tx.spender_handle} id={tx.spender_handle}/></td><td style={{fontWeight:700}}>{fmtAmount(tx.amount,tx.currency)}</td><td>{tx.product||"—"}</td><td>{tx.tag||"—"}</td><td><Tag type="model" label={models.find(m=>m.id===tx.model_id)?.name||"?"} id={tx.model_id}/></td><td><Tag type="chatter" label={profiles.find(p=>p.id===tx.chatter_id)?.name||"?"} id={tx.chatter_id}/></td><td><Tag type="provider" label={profiles.find(p=>p.id===tx.provider_id)?.name||"?"} id={tx.provider_id}/></td><td><StatusPill status={tx.status} lang={lang}/></td></tr>
                ))}
              </tbody></table>
            </div>
          </div>
        }
      </div>
      <div className="card">
        <div className="section-title"><div className="section-bar"></div>{t(lang,"recent_tx")}</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t(lang,"date")}</th><th>Spender</th><th>{t(lang,"amount")}</th><th>{lang==="fr"?"Produit":"Product"}</th><th>Tag</th><th>{lang==="fr"?"Modèle":"Model"}</th><th>Chatter</th><th>Provider</th><th>{t(lang,"fees")}</th><th>{t(lang,"commission")}</th><th>{t(lang,"status")}</th><th>{t(lang,"actions")}</th></tr>
            </thead>
            <tbody>
              {filtered.slice(0,10).map(tx=>{
                  const canEdit = tx.status==="pending"&&(user.role==="gerant"||user.role==="chatter"||(user.role==="provider"&&tx.provider_id===user.id));
                  return (
                  <tr key={tx.id} className={tx.status==="pending"?"pending-row":""}>
                    <td style={{fontFamily:"monospace",fontSize:12,color:"var(--text-secondary)"}}>{fmtDate(tx.date)}</td>
                    <td><Tag type="spender" label={tx.spender_handle} id={tx.spender_handle}/></td>
                    <td style={{fontSize:14,fontWeight:800,color:"var(--text-primary)"}}>{fmtAmount(tx.amount,tx.currency)}{tx.currency&&tx.currency!=="EUR"&&<span style={{fontSize:9,color:"var(--text-quaternary)",marginLeft:4}}>({tx.amount}{tx.currency==="CHF"?" CHF":"€"})</span>}</td>
                    <td>{tx.product||"—"}</td>
                    <td>{tx.tag||"—"}</td>
                    <td><Tag type="model" label={models.find(m=>m.id===tx.model_id)?.name||"?"} id={tx.model_id}/></td>
                    <td><Tag type="chatter" label={profiles.find(p=>p.id===tx.chatter_id)?.name||"?"} id={tx.chatter_id}/></td>
                    <td><Tag type="provider" label={profiles.find(p=>p.id===tx.provider_id)?.name||"?"} id={tx.provider_id}/></td>
                    <td>{displayFees(tx,user.role)}</td>
                    <td>{Number(tx.chatter_commission||0).toFixed(0)}</td>
                    <td><StatusPill status={tx.status} lang={lang}/></td>
                    <td style={{whiteSpace:"nowrap"}}>
                      {canEdit&&<button className="btn-edit" style={{marginRight:4}} onClick={()=>setEditingTx(tx)}>✏️ Modifier</button>}
                      {tx.status==="pending"&&(user.role==="gerant"||(user.role==="provider"&&tx.provider_id===user.id))&&(
                        <><button className="btn btn-success btn-small" onClick={()=>handleDashStatus(tx.id,"validated")}>{t(lang,"validate")}</button>{" "}<button className="btn btn-danger btn-small" onClick={()=>handleDashStatus(tx.id,"refused")}>{t(lang,"refuse")}</button></>
                      )}
                    </td>
                  </tr>
                  );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {/* ── GÉRANT GAMIFICATION SECTION ── */}
      {user.role === "gerant" && (
        <div style={{ marginTop: 24 }}>
          {/* Health Score + Achievements */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, marginBottom: 20 }}>
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20, display: "flex", alignItems: "center" }}>
              <AgencyHealthScore txs={txs} profiles={profiles} />
            </div>
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{"\u{1F3C6}"} Achievements Agence</h3>
              <AgencyAchievements txs={txs} profiles={profiles} models={models} expenses={[]} convertAmount={convertAmount} />
            </div>
          </div>
          {/* Heatmap */}
          <div style={{ marginBottom: 20 }}>
            <ActivityHeatmap txs={txs} convertAmount={convertAmount} currencySymbol={currencySymbol} />
          </div>
          {/* Challenges */}
          <ChallengesSection user={user} lang={lang} txs={txs} profiles={profiles} convertAmount={convertAmount} currencySymbol={currencySymbol} />
        </div>
      )}
      {editingTx && <EditTxModal tx={editingTx} lang={lang} onSave={handleDashEditSave} onCancel={() => setEditingTx(null)} saving={saving} models={models} profiles={profiles} />}
    </div>
  );
};

module.exports = DashboardTab;
