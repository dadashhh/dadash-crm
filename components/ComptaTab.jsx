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

const ObjectifsTab = ({user, lang, txs, profiles, onRefresh}) => {
  const { convertAmount, currencySymbol } = useCurrency();
  const addToast = useToast();
  const fr = lang === "fr";
  const [confettiShown, setConfettiShown] = useState({});

  const renderChatterObjectifs = (ch, isOwn) => {
    const xp = calculateXP(ch.id, txs, convertAmount);
    const level = getLevel(xp);
    const streak = calculateStreak(ch.id, txs);
    const streakBadges = getStreakBadges(streak);
    const dailyCA = getDailyProgress(ch.id, txs, convertAmount);
    const weeklyCA = getWeeklyProgress(ch.id, txs, convertAmount);
    const dGoal = Number(ch.daily_goal) || 500;
    const wGoal = Number(ch.weekly_goal) || 3000;
    const dailyPct = Math.min(Math.round((dailyCA / dGoal) * 100), 200);
    const weeklyPct = Math.min(Math.round((weeklyCA / wGoal) * 100), 200);
    const isMultiplier = dailyCA >= dGoal * 1.5;

    // Confetti on goal reached
    if (dailyCA >= dGoal && !confettiShown[ch.id]) {
      setConfettiShown(prev => ({ ...prev, [ch.id]: true }));
      if (isOwn) setTimeout(launchConfetti, 300);
    }

    return (
      <div key={ch.id} style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20, marginBottom: 14 }}>
        {/* Header: name + level + streak */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {!isOwn && <Tag type="chatter" label={ch.name} id={ch.id}/>}
            {isOwn && <span style={{ fontSize: 15, fontWeight: 800 }}>{ch.name}</span>}
            <LevelBadge xp={xp} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StreakBadge streak={streak} />
            {isMultiplier && (
              <div style={{ padding: "4px 12px", borderRadius: 12, background: "var(--warning-muted)", border: "1px solid var(--warning-muted)", animation: "glowPulse 2s infinite" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--warning)" }}>{"\u26A1"} XP x2</span>
              </div>
            )}
          </div>
        </div>
        {/* XP Progress */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>
            <span>{level.icon} {level.name}</span>
            <span>{level.nextLevel ? `${xp.toLocaleString()} / ${level.nextLevel.min.toLocaleString()} XP` : "MAX LEVEL"}</span>
          </div>
          <XPProgressBar xp={xp} />
        </div>
        {/* Daily Goal */}
        <div style={{ background: "var(--bg-overlay)", borderRadius: 14, padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>
              {fr ? "OBJECTIF DAILY" : "DAILY GOAL"} {isMultiplier && "\u26A1 BONUS x2 ACTIF"}
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: dailyPct >= 100 ? "var(--success)" : "var(--text-primary)" }}>
              {Math.round(dailyCA).toLocaleString()} / {dGoal.toLocaleString()}{currencySymbol}
            </span>
          </div>
          <div style={{ width: "100%", height: 10, borderRadius: 10, background: "var(--bg-hover)", overflow: "hidden" }}>
            <div style={{
              width: Math.min(dailyPct, 100) + "%", height: "100%", borderRadius: 10,
              background: dailyPct >= 150 ? "linear-gradient(90deg, var(--success), var(--warning), var(--pink))" : dailyPct >= 100 ? "linear-gradient(90deg, var(--success), var(--accent))" : "var(--accent)",
              transition: "width 0.8s ease",
              boxShadow: dailyPct >= 100 ? "none" : "none",
            }} />
          </div>
          <div style={{ fontSize: 10, color: "var(--text-quaternary)", marginTop: 4 }}>
            {dailyPct}% \u2014 {dailyPct >= 150 ? "\u{1F525} BONUS MULTIPLICATEUR x2 !" : dailyPct >= 100 ? "\u2705 Objectif atteint !" : `${fr ? "Encore" : "Still"} ${Math.round(dGoal - dailyCA).toLocaleString()}${currencySymbol}`}
          </div>
        </div>
        {/* Weekly Goal */}
        <div style={{ background: "var(--bg-overlay)", borderRadius: 14, padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>{fr ? "OBJECTIF WEEKLY" : "WEEKLY GOAL"}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: weeklyPct >= 100 ? "var(--success)" : "var(--text-primary)" }}>
              {Math.round(weeklyCA).toLocaleString()} / {wGoal.toLocaleString()}{currencySymbol}
            </span>
          </div>
          <div style={{ width: "100%", height: 10, borderRadius: 10, background: "var(--bg-hover)", overflow: "hidden" }}>
            <div style={{ width: Math.min(weeklyPct, 100) + "%", height: "100%", borderRadius: 10, background: weeklyPct >= 100 ? "linear-gradient(90deg, var(--success), var(--accent))" : "var(--accent)", transition: "width 0.8s ease" }} />
          </div>
          <div style={{ fontSize: 10, color: "var(--text-quaternary)", marginTop: 4 }}>{weeklyPct}%</div>
        </div>
        {/* Streak badges */}
        {streakBadges.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {streakBadges.map(b => (
              <span key={b.name} style={{ padding: "3px 10px", borderRadius: 10, background: b.color + "15", border: "1px solid " + b.color + "30", color: b.color, fontSize: 10, fontWeight: 700 }}>{b.icon} {b.name}</span>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (user.role === "chatter") {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{"\u{1F3AF}"} {fr ? "Mes Objectifs" : "My Goals"}</h2>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "3px 0 0" }}>{fr ? "XP, niveaux, streaks et objectifs" : "XP, levels, streaks and goals"}</p>
        </div>
        {renderChatterObjectifs(user, true)}
      </div>
    );
  }

  // Gérant view: all chatters + goal config
  const chatters = profiles.filter(u => u.role === "chatter");
  const [editGoals, setEditGoals] = useState(null);
  const [goalForm, setGoalForm] = useState({ daily_goal: 0, weekly_goal: 0 });
  const saveGoals = async () => {
    if (!editGoals) return;
    await sb.from("profiles").update({ daily_goal: Number(goalForm.daily_goal), weekly_goal: Number(goalForm.weekly_goal) }).eq("id", editGoals);
    addToast(fr ? "Objectifs mis \u00E0 jour" : "Goals updated", "success");
    setEditGoals(null);
    if (onRefresh) await onRefresh();
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{"\u{1F3AF}"} {fr ? "Objectifs \u00E9quipe" : "Team Goals"}</h2>
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "3px 0 0" }}>{fr ? "Suivi des objectifs de chaque chatter" : "Track each chatter's goals"}</p>
      </div>
      {chatters.map(ch => (
        <div key={ch.id}>
          {renderChatterObjectifs(ch, false)}
          {/* Goal edit button */}
          <div style={{ display: "flex", gap: 8, marginTop: -8, marginBottom: 14, paddingLeft: 8 }}>
            {editGoals === ch.id ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Daily:</span>
                <input type="number" value={goalForm.daily_goal} onChange={e => setGoalForm({ ...goalForm, daily_goal: e.target.value })} className="input" style={{ width: 80, fontSize: 11, padding: "4px 8px" }} />
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Weekly:</span>
                <input type="number" value={goalForm.weekly_goal} onChange={e => setGoalForm({ ...goalForm, weekly_goal: e.target.value })} className="input" style={{ width: 80, fontSize: 11, padding: "4px 8px" }} />
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{currencySymbol}</span>
                <button onClick={saveGoals} className="btn btn-primary" style={{ fontSize: 10, padding: "4px 10px" }}>{"\u2705"}</button>
                <button onClick={() => setEditGoals(null)} style={{ fontSize: 10, color: "var(--text-quaternary)", background: "none", border: "none", cursor: "pointer" }}>{"\u2715"}</button>
              </div>
            ) : (
              <button onClick={() => { setEditGoals(ch.id); setGoalForm({ daily_goal: ch.daily_goal || 0, weekly_goal: ch.weekly_goal || 0 }); }}
                style={{ fontSize: 10, color: "var(--text-quaternary)", background: "none", border: "1px solid var(--border-default)", borderRadius: 8, padding: "3px 10px", cursor: "pointer" }}>
                {"\u2699\uFE0F"} {fr ? "Configurer objectifs" : "Configure goals"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// =============================================
// COMPETITION TAB
// =============================================
const CompetitionTab = ({user, lang, txs, profiles}) => {
  const { convertAmount, currencySymbol } = useCurrency();
  const fr = lang === "fr";
  const dr = useDateRange("7d");
  const [leaderMetric, setLeaderMetric] = useState("ca");
  const chatters = profiles.filter(u=>u.role==="chatter");
  const compFiltered = dr.filterByDate(txs, "date");

  const ranking = useMemo(() => {
    return chatters.map(ch => {
      const chTx = compFiltered.filter(tx => tx.chatter_id === ch.id && (tx.status === "validated" || tx.status === "confirmee"));
      const ca = chTx.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
      const allChTx = compFiltered.filter(tx => tx.chatter_id === ch.id);
      const convRate = allChTx.length > 0 ? Math.round((chTx.length / allChTx.length) * 100) : 0;
      const avgTicket = chTx.length > 0 ? Math.round(ca / chTx.length) : 0;
      const xp = calculateXP(ch.id, txs, convertAmount);
      const streak = calculateStreak(ch.id, txs);
      return { user: ch, ca, cnt: allChTx.length, validCnt: chTx.length, convRate, avgTicket, xp, streak };
    }).sort((a, b) => {
      if (leaderMetric === "ca") return b.ca - a.ca;
      if (leaderMetric === "txCount") return b.validCnt - a.validCnt;
      if (leaderMetric === "convRate") return b.convRate - a.convRate;
      if (leaderMetric === "avgTicket") return b.avgTicket - a.avgTicket;
      return b.ca - a.ca;
    });
  }, [compFiltered, chatters, leaderMetric, txs, convertAmount]);

  const top3 = ranking.slice(0, 3);
  const maxCA = top3.length > 0 ? top3[0].ca : 1;
  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

  const getMetricValue = (r) => {
    if (leaderMetric === "ca") return Math.round(r.ca).toLocaleString() + currencySymbol;
    if (leaderMetric === "txCount") return r.validCnt + " TX";
    if (leaderMetric === "convRate") return r.convRate + "%";
    if (leaderMetric === "avgTicket") return Math.round(r.avgTicket).toLocaleString() + currencySymbol;
    return Math.round(r.ca).toLocaleString() + currencySymbol;
  };

  return (
    <div>
      <GlobalFilterBar lang={lang} dr={dr} />

      {/* Metric selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[{k:"ca",l:"CA Brut"},{k:"txCount",l:"Nombre TX"},{k:"convRate",l:"Taux Conv."},{k:"avgTicket",l:"Panier Moyen"}].map(m => (
          <button key={m.k} onClick={() => setLeaderMetric(m.k)} className={`filter-chip ${leaderMetric===m.k?"active":""}`}>{m.l}</button>
        ))}
      </div>

      <div className="trophy">{"\u{1F3C6}"}</div>

      {/* Podium */}
      <div className="podium">
        {top3.map((r, idx) => (
          <div key={r.user.id} className="podium-step">
            <div className="podium-rank">{medals[idx]}</div>
            <LevelBadge xp={r.xp} />
            <div className="podium-bar" style={{ height: `${(r.ca / maxCA) * 200}px` }}></div>
            <div className="podium-name">{r.user.name}</div>
            <div className="podium-ca">{getMetricValue(r)}</div>
            <StreakBadge streak={r.streak} />
          </div>
        ))}
      </div>

      {/* Full table */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr>
              <th>#</th><th>Chatter</th><th>{fr ? "Niveau" : "Level"}</th><th>CA</th><th>TX</th><th>{fr ? "Taux Conv." : "Conv. Rate"}</th><th>{fr ? "Panier Moyen" : "Avg Ticket"}</th><th>Streak</th><th>XP</th>
            </tr></thead>
            <tbody>
              {ranking.map((r, idx) => (
                <tr key={r.user.id} style={{ background: user.id === r.user.id ? "var(--accent-subtle)" : "" }}>
                  <td style={{ fontWeight: 700 }}>{idx < 3 ? medals[idx] : (idx + 1)}</td>
                  <td><Tag type="chatter" label={r.user.name} id={r.user.id}/> {user.id === r.user.id && <span style={{ fontSize: 9, color: "var(--accent)" }}>({t(lang, "you")})</span>}</td>
                  <td><LevelBadge xp={r.xp} /></td>
                  <td style={{ fontWeight: 700 }}>{Math.round(r.ca).toLocaleString()}{currencySymbol}</td>
                  <td>{r.validCnt}</td>
                  <td>
                    <span style={{ padding: "2px 8px", borderRadius: 10, background: r.convRate >= 80 ? "var(--success-muted)" : r.convRate >= 50 ? "var(--warning-muted)" : "var(--danger-muted)", color: r.convRate >= 80 ? "var(--success)" : r.convRate >= 50 ? "var(--warning)" : "var(--danger)", fontSize: 11, fontWeight: 700 }}>{r.convRate}%</span>
                  </td>
                  <td>{Math.round(r.avgTicket).toLocaleString()}{currencySymbol}</td>
                  <td><StreakBadge streak={r.streak} /></td>
                  <td style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.xp.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
const ChattersTab = ({user, lang, txs, profiles, models}) => {
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const [selectedId, setSelectedId] = useState(null);
  const chatters = profiles.filter(u=>u.role==="chatter");
  const getStats = (chatterId) => {
    const chTx = txs.filter(tx=>tx.chatter_id===chatterId);
    const validTx = chTx.filter(tx=>tx.status==="validated");
    const validCA = validTx.reduce((s,tx)=>s+Number(tx.amount),0);
    const pendingCA = chTx.filter(tx=>tx.status==="pending").reduce((s,tx)=>s+Number(tx.amount),0);
    const refusedCount = chTx.filter(tx=>tx.status==="refused").length;
    const commDue = validTx.reduce((s,tx)=>s+Number(tx.chatter_commission||0),0);
    const avgTicket = validTx.length ? validCA/validTx.length : 0;
    const spenders = [...new Set(chTx.map(tx=>tx.spender_handle))];
    return {validCA, validCount:validTx.length, pendingCA, pendingCount:chTx.filter(tx=>tx.status==="pending").length, refusedCount, commDue, avgTicket, spenders};
  };
  const totalValidCA = chatters.reduce((s,ch)=>s+getStats(ch.id).validCA,0);
  const totalCommOwed = chatters.reduce((s,ch)=>s+getStats(ch.id).commDue,0);
  const totalPendingCA = chatters.reduce((s,ch)=>s+getStats(ch.id).pendingCA,0);
  const selected = selectedId ? chatters.find(c=>c.id===selectedId) : null;
  const selStats = selected ? getStats(selected.id) : null;
  const medals = ["🥇","🥈","🥉"];
  return (
    <div>
      <div className="kpi-grid">
        <KPICard label={t(lang,"active_chatters")} value={String(chatters.length)} icon="💬"/>
        <KPICard label={t(lang,"ca_validated")} value={String(totalValidCA)+currencySymbol} icon="✅"/>
        <KPICard label={t(lang,"total_comm_owed")} value={totalCommOwed.toFixed(0)+currencySymbol} icon="💸"/>
        <KPICard label={t(lang,"ca_pending")} value={String(totalPendingCA)+currencySymbol} icon="⏳" className="warning" />
      </div>
      <div style={{display:"grid",gridTemplateColumns:selected?"300px 1fr":"1fr",gap:16}}>
        <div>
          {chatters.map((ch,i)=>{
            const stats = getStats(ch.id);
            const chXP = calculateXP(ch.id, txs, convertAmount);
            const chStreak = calculateStreak(ch.id, txs);
            return (
              <div key={ch.id} className="spender-card" onClick={()=>setSelectedId(selectedId===ch.id?null:ch.id)}
                style={{border:selectedId===ch.id?"1px solid var(--accent)":""}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:20}}>{medals[i]||("#"+(i+1))}</span>
                    <div>
                      <div className="spender-name"><Tag type="chatter" label={ch.name} id={ch.id}/></div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                        <LevelBadge xp={chXP} />
                        {chStreak > 0 && <StreakBadge streak={chStreak} />}
                      </div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div className="spender-ltv">{stats.validCA}{currencySymbol}</div>
                    <div style={{fontSize:10,color:"var(--text2)"}}>{stats.validCount} ventes</div>
                  </div>
                </div>
                <XPProgressBar xp={chXP} />
              </div>
            );
          })}
        </div>
        {selected && selStats && (
          <div className="profile-panel">
            <div className="profile-header">
              <div className="profile-name">{selected.name}</div>
              <button className="profile-close" onClick={()=>setSelectedId(null)}>X</button>
            </div>
            <div style={{fontSize:12,color:"var(--text2)",marginBottom:8}}>Commission: {selected.commission_pct}%</div>
            <div style={{marginBottom:12}}>
              <LevelBadge xp={calculateXP(selected.id, txs, convertAmount)} />
              <XPProgressBar xp={calculateXP(selected.id, txs, convertAmount)} />
              <div style={{display:"flex",gap:8,marginTop:6}}>
                <StreakBadge streak={calculateStreak(selected.id, txs)} />
                {getStreakBadges(calculateStreak(selected.id, txs)).map(b => (
                  <span key={b.name} style={{padding:"2px 8px",borderRadius:8,background:b.color+"15",color:b.color,fontSize:10,fontWeight:600}}>{b.icon} {b.name}</span>
                ))}
              </div>
            </div>
            <BadgeBar badges={getBadges(txs, selected.id).badges}/>
            <div className="profile-section">
              <div className="profile-section-title">KPIs</div>
              <div className="profile-row"><span>{t(lang,"ca_validated")}</span><span style={{color:"var(--accent)",fontWeight:700}}>{selStats.validCA}{currencySymbol}</span></div>
              <div className="profile-row"><span>{t(lang,"ca_pending")}</span><span style={{color:"var(--warning)",fontWeight:700}}>{selStats.pendingCA}{currencySymbol}</span></div>
              <div className="profile-row"><span>{t(lang,"total_comm_owed")}</span><span style={{color:selStats.commDue>0?"var(--warning)":"var(--success)",fontWeight:700}}>{selStats.commDue.toFixed(0)}{currencySymbol}</span></div>
              <div className="profile-row"><span>Panier moyen</span><span>{selStats.avgTicket.toFixed(0)}{currencySymbol}</span></div>
            </div>
            <div className="profile-section">
              <div className="profile-section-title">{t(lang,"stats")}</div>
              <div className="profile-row"><span>{t(lang,"validated")}</span><span>{selStats.validCount}</span></div>
              <div className="profile-row"><span>{t(lang,"pending")}</span><span>{selStats.pendingCount}</span></div>
              <div className="profile-row"><span>{t(lang,"refused")}</span><span>{selStats.refusedCount}</span></div>
            </div>
            <div className="profile-section">
              <div className="profile-section-title">{t(lang,"managed_spenders")} ({selStats.spenders.length})</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {selStats.spenders.map(sp=>(
                  <Tag key={sp} type="spender" label={sp} id={sp}/>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================
// COMPTA TAB (gerant only)
// =============================================
const ComptaTab = ({user, lang, txs, expenses, models, profiles, onRefresh}) => {
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const addToast = useToast();
  const dr = useDateRange("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({name:"",amount:"",category:"ops"});
  const comptaFiltered = dr.filterByDate(txs, "date");
  const validTxs = comptaFiltered.filter(tx=>tx.status==="validated");
  const grossRev = validTxs.reduce((s,tx)=>s+Number(tx.amount),0);
  const totalProvFees = validTxs.reduce((s,tx)=>s+Number(tx.provider_fee||0),0);
  const totalDadaFees = validTxs.reduce((s,tx)=>s+Number(tx.dada_fee||0),0);
  const totalNet = validTxs.reduce((s,tx)=>s+Number(tx.net_amount||0),0);
  const totalComms = validTxs.reduce((s,tx)=>s+Number(tx.chatter_commission||0),0);
  const totalExpenses = expenses.reduce((s,e)=>s+Number(e.amount),0);
  const netProfit = totalNet - totalComms - totalExpenses;
  const handleAdd = async () => {
    if(!form.name||!form.amount) return;
    setSaving(true);
    try {
      const {error} = await sb.from("expenses").insert({name:form.name, amount:parseFloat(form.amount), category:form.category});
      if(error) { addToast("Erreur dépense: " + error.message, "error"); setSaving(false); return; }
      setForm({name:"",amount:"",category:"ops"});
      setShowForm(false);
      await onRefresh();
      addToast(t(lang,"expense_added")||"Dépense ajoutée ✓","success");
    } catch(e) { addToast("Erreur dépense: " + e.message, "error"); }
    setSaving(false);
  };
  return (
    <div>
      <GlobalFilterBar lang={lang} dr={dr} />
      <div className="card" style={{marginBottom:20}}>
        <div className="section-title"><div className="section-bar"></div>P&L Statement</div>
        <div className="table-wrap">
          <table className="table" style={{fontSize:13}}>
            <tbody>
              <tr><td>{t(lang,"gross_rev")}</td><td>{grossRev}</td></tr>
              <tr><td>{t(lang,"provider_fees")}</td><td>-{totalProvFees.toFixed(0)}</td></tr>
              <tr><td>{t(lang,"dada_fee")}</td><td>-{totalDadaFees.toFixed(0)}</td></tr>
              <tr><td style={{fontWeight:600}}>{t(lang,"net")}</td><td style={{fontWeight:600}}>{totalNet.toFixed(0)}</td></tr>
              <tr><td>{t(lang,"chatter_comms")}</td><td>-{totalComms.toFixed(0)}</td></tr>
              <tr><td style={{fontWeight:600}}>{t(lang,"gross_margin")}</td><td style={{fontWeight:600}}>{(totalNet-totalComms).toFixed(0)}</td></tr>
              <tr><td>{t(lang,"expenses")}</td><td>-{totalExpenses.toFixed(0)}</td></tr>
              <tr><td style={{fontWeight:600,color:"var(--success)"}}>{t(lang,"net_profit")}</td><td style={{fontWeight:600,color:"var(--success)"}}>{netProfit.toFixed(0)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="section-title"><div className="section-bar"></div>{t(lang,"revenue_by_model")}</div>
          <div className="table-wrap">
            <table className="table"><thead><tr><th>Model</th><th>CA</th></tr></thead>
            <tbody>
              {models.map(m=>{
                const ca = validTxs.filter(tx=>tx.model_id===m.id).reduce((s,tx)=>s+Number(tx.amount),0);
                return <tr key={m.id}><td>{m.name}</td><td>{ca}</td></tr>;
              })}
            </tbody></table>
          </div>
        </div>
        <div className="card">
          <div className="section-title"><div className="section-bar"></div>Commission Distribution</div>
          <table className="table"><thead><tr><th>Chatter</th><th>Comm</th></tr></thead>
          <tbody>
            {profiles.filter(u=>u.role==="chatter").map(u=>{
              const comm = validTxs.filter(tx=>tx.chatter_id===u.id).reduce((s,tx)=>s+Number(tx.chatter_commission||0),0);
              return <tr key={u.id}><td><Tag type="chatter" label={u.name} id={u.id}/></td><td>{comm.toFixed(0)}</td></tr>;
            })}
          </tbody></table>
        </div>
      </div>
      <div className="card" style={{marginBottom:20}}>
        <div className="section-title"><div className="section-bar"></div>{t(lang,"expenses")}</div>
        <button className="btn btn-primary" style={{marginBottom:12,width:"auto"}} onClick={()=>setShowForm(!showForm)}>+ Add Expense</button>
        {showForm&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:12}}>
            <input className="form-input" placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
            <input className="form-input" type="number" placeholder="Amount" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} />
            <select className="filter-select" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
              <option value="ops">Operations</option><option value="modele">Model Salary</option><option value="marketing">Marketing</option><option value="autre">Autre</option>
            </select>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-success" onClick={handleAdd} disabled={saving} style={{flex:1}}>{saving?<span className="btn-spinner"/>:"Add"}</button>
              <button className="btn btn-danger" onClick={()=>setShowForm(false)} style={{flex:1}}>Cancel</button>
            </div>
          </div>
        )}
        <table className="table"><thead><tr><th>Name</th><th>Category</th><th>Amount</th></tr></thead>
        <tbody>
          {expenses.map(e=>(
            <tr key={e.id}><td>{e.name}</td><td>{e.category}</td><td>{e.amount}</td></tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
};

module.exports = { ComptaTab, ObjectifsTab, CompetitionTab, ChattersTab };
