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

const ModelesTab = ({user, lang, txs, models, profiles, expenses, onRefresh, onNotify}) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const fr = lang === "fr";
  const dr = useDateRange("all");
  const [mfProvider, setMfProvider] = useState("");
  const [view, setView] = useState("global");
  const [selectedModel, setSelectedModel] = useState(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expForm, setExpForm] = useState({model_id:"",amount:"",currency:"EUR",category:"contenu",description:"",date:new Date().toISOString().slice(0,10)});
  const [editingTx, setEditingTx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [mCompSort, setMCompSort] = useState({key: null, dir: null});
  const [mCompPage, setMCompPage] = useState(0);
  const [mTxPage, setMTxPage] = useState(0);
  const [mTxSort, setMTxSort] = useState({key: null, dir: null});
  const [mExpPage, setMExpPage] = useState(0);
  const [mExpSort, setMExpSort] = useState({key: null, dir: null});
  const filteredTxs = useMemo(() => {
    return filterByProvider(dr.filterByDate(txs, "date"), mfProvider);
  }, [txs, dr.startDate, dr.endDate, dr.activePreset, mfProvider]);

  const modelStats = useMemo(() => {
    return models.map(m => {
      const mTxs = filteredTxs.filter(tx => tx.model_id === m.id);
      const validated = mTxs.filter(tx => tx.status==="validated"||tx.status==="confirmee");
      const pending = mTxs.filter(tx => tx.status==="pending"||tx.status==="en_attente");
      const ca = validated.reduce((s,tx) => s+convertAmount(Number(tx.amount),tx.currency), 0);
      const caPending = pending.reduce((s,tx) => s+convertAmount(Number(tx.amount),tx.currency), 0);
      const mExp = (expenses||[]).filter(e => e.model_id===m.id);
      const totalExp = mExp.reduce((s,e) => s+convertAmount(Number(e.amount),e.currency), 0);
      const benefice = ca - totalExp;
      const margin = ca > 0 ? Math.round((benefice/ca)*100) : 0;
      const convRate = mTxs.length > 0 ? Math.round((validated.length/mTxs.length)*100) : 0;
      const avgTicket = validated.length > 0 ? Math.round(ca/validated.length) : 0;
      const chatters = [...new Set(mTxs.map(tx=>tx.chatter_id).filter(Boolean))];
      const chatterNames = chatters.map(cid => profiles.find(p=>p.id===cid)?.name||"?");
      const now = Date.now();
      const last7dCA = mTxs.filter(tx=>(now-new Date(tx.date).getTime())<7*86400000&&(tx.status==="validated"||tx.status==="confirmee")).reduce((s,tx)=>s+convertAmount(Number(tx.amount),tx.currency),0);
      let streak = 0;
      for(let d=0;d<30;d++){const dk=new Date(now-d*86400000).toISOString().slice(0,10);if(validated.some(tx=>tx.date&&tx.date.slice(0,10)===dk))streak++;else if(d>0)break;}
      return {...m,mTxs,validated,pending,ca,caPending,totalExp,benefice,margin,convRate,avgTicket,chatters,chatterNames,txCount:mTxs.length,validatedCount:validated.length,last7dCA,streak,mExp};
    }).sort((a,b) => b.ca - a.ca);
  }, [filteredTxs, models, profiles, expenses, convertAmount]);

  const globalCA = modelStats.reduce((s,m)=>s+m.ca,0);
  const globalExp = modelStats.reduce((s,m)=>s+m.totalExp,0) + (expenses||[]).filter(e=>!e.model_id).reduce((s,e)=>s+convertAmount(Number(e.amount),e.currency),0);
  const globalBenef = globalCA - globalExp;
  const globalMargin = globalCA>0?Math.round((globalBenef/globalCA)*100):0;
  const totalTxCount = modelStats.reduce((s,m)=>s+m.txCount,0);
  const globalAvgTicket = modelStats.reduce((s,m)=>s+m.validatedCount,0)>0?Math.round(globalCA/modelStats.reduce((s,m)=>s+m.validatedCount,0)):0;

  const handleStatus = async (txId, newStatus) => {
    const currentTx = txs.find(tx => tx.id === txId);
    if (currentTx && currentTx.status !== "pending") {
      addToast(t(lang, "tx_immutable"), "error");
      return;
    }
    try {
      const {error} = await sb.from("transactions").update({status: newStatus}).eq("id", txId);
      if (error) { addToast("Erreur: " + error.message, "error"); return; }
      if(onNotify&&currentTx) {
        const cur=currencySymbol;
        const mName=models.find(m=>m.id===currentTx.model_id)?.name||"";
        if(newStatus==="validated"){
          if(currentTx.chatter_id) onNotify(currentTx.chatter_id,"tx_validated","TX validée ✅",`${currentTx.amount}${cur} de @${currentTx.spender_handle}`,txId);
          profiles.filter(p=>p.role==="gerant").forEach(g=>onNotify(g.id,"tx_validated","TX validée",`${currentTx.amount}${cur}${mName?" #"+mName:""}`,txId));
        } else {
          if(currentTx.chatter_id) onNotify(currentTx.chatter_id,"tx_refused","TX refusée ❌",`${currentTx.amount}${cur} de @${currentTx.spender_handle}`,txId);
          profiles.filter(p=>p.role==="gerant").forEach(g=>onNotify(g.id,"tx_refused","TX refusée",`${currentTx.amount}${cur}${mName?" #"+mName:""}`,txId));
        }
      }
      await onRefresh();
      addToast(newStatus === "validated" ? (t(lang, "tx_validated")) : (t(lang, "tx_refused")), newStatus === "validated" ? "success" : "error");
    } catch(e) { addToast("Erreur: " + e.message, "error"); }
  };

  const handleEditSave = async (updates) => {
    if (!editingTx || editingTx.status !== "pending") {
      addToast(t(lang, "tx_immutable"), "error");
      setEditingTx(null);
      return;
    }
    setSaving(true);
    try {
      const {error} = await sb.from("transactions").update({
        spender_handle:updates.spender_handle, amount:updates.amount, currency:updates.currency,
        model_id:updates.model_id, provider_id:updates.provider_id, chatter_id:updates.chatter_id,
        product:updates.product, tag:updates.tag, product_id:updates.product_id||null, product_tag_id:updates.product_tag_id||null, notes:updates.notes,
      }).eq("id", editingTx.id).eq("status", "pending");
      setSaving(false);
      if (error) { addToast("Erreur: " + error.message, "error"); return; }
      setEditingTx(null);
      await onRefresh();
      addToast(t(lang, "tx_updated"), "success");
    } catch(e) { setSaving(false); addToast("Erreur: " + e.message, "error"); }
  };

  const handleAddExpense = async () => {
    if(!expForm.amount){addToast("Montant requis","error");return;}
    setSaving(true);
    try {
      const row = {amount:parseFloat(expForm.amount),currency:expForm.currency,category:expForm.category,name:expForm.description||expForm.category,date:expForm.date||new Date().toISOString().slice(0,10)};
      if(expForm.model_id) row.model_id = expForm.model_id;
      const {error} = await sb.from("expenses").insert(row);
      setSaving(false);
      if(error){addToast("Erreur: "+error.message,"error");return;}
      setShowExpenseForm(false);
      setExpForm({model_id:selectedModel||"",amount:"",currency:"EUR",category:"contenu",description:"",date:new Date().toISOString().slice(0,10)});
      await onRefresh();
      addToast(fr?"Dépense ajoutée ✓":"Expense added ✓","success");
    } catch(e){setSaving(false);addToast("Erreur: "+e.message,"error");}
  };

  useEffect(() => { setMTxPage(0); setMTxSort({key:null,dir:null}); }, [selectedModel]);
  useEffect(() => { setMTxPage(0); }, [mTxSort.key, mTxSort.dir]);
  const mStatsLen = modelStats.length;
  const mExpLen = (expenses||[]).length;
  useEffect(() => { setMCompPage(0); }, [mStatsLen, mCompSort.key, mCompSort.dir]);
  useEffect(() => { setMExpPage(0); }, [mExpLen, mExpSort.key, mExpSort.dir]);
  const sel = selectedModel ? modelStats.find(m=>m.id===selectedModel) : null;
  const Badge = ({color,text}) => <span style={{fontSize:9,padding:"3px 8px",borderRadius:12,background:`${color}22`,color,fontWeight:700,whiteSpace:"nowrap"}}>{text}</span>;

  return (
    <div>
      <GlobalFilterBar lang={lang} dr={dr} models={null} profiles={profiles}
        provider={mfProvider} setProvider={setMfProvider} showProviderFilter />
      {/* Header + Toggle */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:17,fontWeight:800,margin:0}}>{fr?"Modèles · Performance & Management":"Models · Performance & Management"}</h2>
          <p style={{fontSize:11,color:"var(--text-tertiary)",margin:"3px 0 0"}}>{fr?"Rentabilité, dépenses et classement":"Profitability, expenses and ranking"}</p>
        </div>
        <div style={{display:"flex",gap:0,borderRadius:14,border:"1px solid var(--border-default)",overflow:"hidden"}}>
          <button onClick={()=>{setView("global");setSelectedModel(null);}} style={{padding:"7px 16px",border:"none",background:view==="global"?"var(--accent-muted)":"transparent",color:view==="global"?"var(--accent)":"var(--text-tertiary)",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{fr?"Vue Globale":"Global View"}</button>
          <button onClick={()=>setView("model")} style={{padding:"7px 16px",border:"none",background:view==="model"?"var(--accent-muted)":"transparent",color:view==="model"?"var(--accent)":"var(--text-tertiary)",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{fr?"Par Modèle":"Per Model"}</button>
        </div>
      </div>

      {/* ── GLOBAL VIEW ── */}
      {view==="global"&&<>
        <div className="kpi-grid" style={{marginBottom:20}}>
          <KPICard label={fr?"CA Total":"Total Revenue"} value={`${Math.round(globalCA)}${currencySymbol}`} icon="💰"/>
          <KPICard label={fr?"Dépenses":"Expenses"} value={`${Math.round(globalExp)}${currencySymbol}`} icon="💸"/>
          <KPICard label={fr?"Bénéfice Net":"Net Profit"} value={`${Math.round(globalBenef)}${currencySymbol}`} icon="📈"/>
          <KPICard label={fr?"Rentabilité":"Profitability"} value={`${globalMargin}%`} icon="🎯"/>
          <KPICard label="TX Total" value={`${totalTxCount}`} icon="📋"/>
          <KPICard label={fr?"Panier Moyen":"Avg Ticket"} value={`${globalAvgTicket||0}${currencySymbol}`} icon="🛒"/>
        </div>

        {/* Podium top 3 */}
        {modelStats.length>=3&&<div className="card" style={{marginBottom:20,textAlign:"center",padding:"24px 20px"}}>
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:20}}>{fr?"🏆 Classement Modèles":"🏆 Models Ranking"}</h3>
          <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:16,height:220}}>
            {/* 2nd */}
            <div style={{textAlign:"center",cursor:"pointer"}} onClick={()=>{setSelectedModel(modelStats[1].id);setView("model");}}>
              <div style={{width:56,height:56,borderRadius:16,background:"var(--accent-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:20,color:"var(--accent)",margin:"0 auto"}}>{modelStats[1].name[0]}</div>
              <div style={{fontSize:13,fontWeight:700,marginTop:8}}>{modelStats[1].name}</div>
              <div style={{fontSize:20,fontWeight:800,color:"var(--medal-silver)"}}>🥈</div>
              <div style={{width:100,height:100,background:"var(--bg-overlay)",borderRadius:"12px 12px 0 0",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",margin:"0 auto"}}>
                <div style={{fontSize:15,fontWeight:800}}>{Math.round(modelStats[1].ca).toLocaleString()}{currencySymbol}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{modelStats[1].margin}% marge</div>
              </div>
            </div>
            {/* 1st */}
            <div style={{textAlign:"center",cursor:"pointer"}} onClick={()=>{setSelectedModel(modelStats[0].id);setView("model");}}>
              <div style={{width:64,height:64,borderRadius:12,background:"var(--warning-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:24,color:"var(--warning)",margin:"0 auto"}}>{modelStats[0].name[0]}</div>
              <div style={{fontSize:16,fontWeight:800,marginTop:8}}>{modelStats[0].name}</div>
              <div style={{fontSize:24,fontWeight:800,color:"var(--warning)"}}>🥇</div>
              <div style={{width:110,height:140,background:"var(--warning-muted)",borderRadius:"12px 12px 0 0",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",margin:"0 auto"}}>
                <div style={{fontSize:17,fontWeight:800}}>{Math.round(modelStats[0].ca).toLocaleString()}{currencySymbol}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{modelStats[0].margin}% marge</div>
              </div>
            </div>
            {/* 3rd */}
            <div style={{textAlign:"center",cursor:"pointer"}} onClick={()=>{setSelectedModel(modelStats[2].id);setView("model");}}>
              <div style={{width:48,height:48,borderRadius:14,background:"var(--bg-hover)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,color:"var(--medal-bronze)",margin:"0 auto"}}>{modelStats[2].name[0]}</div>
              <div style={{fontSize:12,fontWeight:700,marginTop:8}}>{modelStats[2].name}</div>
              <div style={{fontSize:18,fontWeight:800,color:"var(--medal-bronze)"}}>🥉</div>
              <div style={{width:90,height:70,background:"var(--bg-overlay)",borderRadius:"12px 12px 0 0",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",margin:"0 auto"}}>
                <div style={{fontSize:14,fontWeight:800}}>{Math.round(modelStats[2].ca).toLocaleString()}{currencySymbol}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{modelStats[2].margin}% marge</div>
              </div>
            </div>
          </div>
        </div>}

        {/* Comparative Table */}
        <div className="card">
          <div className="section-title"><div className="section-bar"></div>{fr?"Tableau Comparatif":"Comparative Table"}</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><SortTh label={t(lang,"model")} sortKey="name" sort={mCompSort} onSort={setMCompSort}/><SortTh label="CA" sortKey="ca" sort={mCompSort} onSort={setMCompSort}/><SortTh label={fr?"Dépenses":"Expenses"} sortKey="totalExp" sort={mCompSort} onSort={setMCompSort}/><SortTh label={fr?"Bénéf":"Profit"} sortKey="benefice" sort={mCompSort} onSort={setMCompSort}/><SortTh label="Marge" sortKey="margin" sort={mCompSort} onSort={setMCompSort}/><SortTh label="TX" sortKey="txCount" sort={mCompSort} onSort={setMCompSort}/><SortTh label="Conv %" sortKey="convRate" sort={mCompSort} onSort={setMCompSort}/><th>Badges</th></tr></thead>
              <tbody>
                {paginate(sortData(modelStats, mCompSort), mCompPage).map(m => (
                  <tr key={m.id} style={{cursor:"pointer"}} onClick={()=>{setSelectedModel(m.id);setView("model");}}>
                    <td style={{fontWeight:600}}><Tag type="model" label={m.name} id={m.id}/></td>
                    <td style={{color:"var(--success)",fontWeight:700}}>{Math.round(m.ca)}{currencySymbol}</td>
                    <td style={{color:"var(--danger)",fontWeight:600}}>{m.totalExp>0?`-${Math.round(m.totalExp)}${currencySymbol}`:"-"}</td>
                    <td style={{fontWeight:700,color:m.benefice>=0?"var(--success)":"var(--danger)"}}>{Math.round(m.benefice)}{currencySymbol}</td>
                    <td><span style={{padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:700,background:m.margin>=70?"var(--success-muted)":m.margin>=40?"var(--warning-muted)":"var(--danger-muted)",color:m.margin>=70?"var(--success)":m.margin>=40?"var(--warning)":"var(--danger)"}}>{m.margin}%</span></td>
                    <td>{m.txCount}</td>
                    <td>{m.convRate}%</td>
                    <td style={{whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {m.margin>80&&<Badge color="var(--success)" text="🔥 High Margin"/>}
                      {m.txCount>50&&<Badge color="var(--accent)" text="⚡ Volume"/>}
                      {m.convRate>85&&<Badge color="var(--pink)" text="💎 Converter"/>}
                      {m.streak>2&&<Badge color="var(--warning)" text={`🔥 ${m.streak}j`}/>}
                    </div></td>
                  </tr>
                ))}
                {modelStats.length===0&&<tr><td colSpan={8}><EmptyState icon="📊" text={fr?"Aucun modèle":"No models"} lang={lang}/></td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={mCompPage} setPage={setMCompPage} totalItems={modelStats.length} lang={lang}/>
        </div>
      </>}

      {/* ── PER MODEL VIEW ── */}
      {view==="model"&&<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:20}}>
          {modelStats.map(m => (
            <div key={m.id} className="card" onClick={()=>setSelectedModel(m.id)}
              style={{cursor:"pointer",padding:"14px 16px",transition:"all 0.3s",border:selectedModel===m.id?"1px solid var(--border-accent)":"1px solid var(--border-subtle)",background:selectedModel===m.id?"var(--accent-subtle)":"var(--card-bg)"}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{m.name}</div>
              <div style={{fontSize:12,color:"var(--success)",fontWeight:700}}>{Math.round(m.ca)}{currencySymbol}</div>
              <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                {m.margin>80&&<Badge color="var(--success)" text="🔥"/>}
                {m.streak>2&&<Badge color="var(--warning)" text={`${m.streak}j`}/>}
                {m.convRate>85&&<Badge color="var(--pink)" text="💎"/>}
              </div>
            </div>
          ))}
        </div>
        {sel&&<>
          <div className="kpi-grid" style={{marginBottom:20}}>
            <KPICard label="CA" value={`${Math.round(sel.ca)}${currencySymbol}`} icon="💰"/>
            <KPICard label={fr?"Dépenses":"Expenses"} value={`${Math.round(sel.totalExp)}${currencySymbol}`} icon="💸"/>
            <KPICard label={fr?"Bénéfice":"Profit"} value={`${Math.round(sel.benefice)}${currencySymbol}`} icon="📈"/>
            <KPICard label="Marge" value={`${sel.margin}%`} icon="🎯"/>
            <KPICard label="TX" value={`${sel.txCount}`} icon="📋"/>
            <KPICard label={fr?"Panier Moyen":"Avg Ticket"} value={`${sel.avgTicket}${currencySymbol}`} icon="🛒"/>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
            {sel.margin>80&&<Badge color="var(--success)" text="🔥 High Margin"/>}
            {sel.txCount>50&&<Badge color="var(--accent)" text="⚡ Volume King"/>}
            {sel.convRate>85&&<Badge color="var(--pink)" text="💎 Top Converter"/>}
            {sel.streak>0&&<Badge color="var(--warning)" text={`🔥 ${sel.streak}j streak`}/>}
            {sel.last7dCA>0&&<Badge color="var(--accent)" text={`📈 ${Math.round(sel.last7dCA)}${currencySymbol} 7j`}/>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>📋 {sel.name} — TX ({sel.txCount})</div>
              <div className="table-wrap" style={{maxHeight:400,overflowY:"auto"}}>
                <table className="table">
                  <thead><tr><SortTh label={t(lang,"date")} sortKey="date" sort={mTxSort} onSort={setMTxSort}/><th>Spender</th><SortTh label={t(lang,"amount")} sortKey="amount" sort={mTxSort} onSort={setMTxSort}/><th>{lang==="fr"?"Produit":"Product"}</th><th>Tag</th><th>Chatter</th><th>Provider</th><SortTh label={t(lang,"status")} sortKey="status" sort={mTxSort} onSort={setMTxSort}/><th>{t(lang,"actions")}</th></tr></thead>
                  <tbody>
                    {paginate(sortData(sel.mTxs, mTxSort, {date:tx=>tx.date,amount:tx=>Number(tx.amount),status:tx=>tx.status}), mTxPage).map(tx => (
                      <tr key={tx.id} className={tx.status==="pending"?"pending-row":""}>
                        <td style={{fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)"}}>{fmtDate(tx.date)}</td>
                        <td><Tag type="spender" label={tx.spender_handle} id={tx.spender_handle}/></td>
                        <td style={{fontWeight:700}}>{fmtAmount(tx.amount,tx.currency)}</td>
                        <td>{tx.product||"—"}</td>
                        <td>{tx.tag||"—"}</td>
                        <td><Tag type="chatter" label={profiles.find(p=>p.id===tx.chatter_id)?.name||"?"} id={tx.chatter_id}/></td>
                        <td><Tag type="provider" label={profiles.find(p=>p.id===tx.provider_id)?.name||"?"} id={tx.provider_id}/></td>
                        <td><StatusPill status={tx.status} lang={lang}/></td>
                        <td style={{whiteSpace:"nowrap"}}>{tx.status==="pending"&&<>
                          <button className="btn-edit" style={{marginRight:4}} onClick={()=>setEditingTx(tx)}>✏️</button>
                          <button className="btn btn-success btn-small" onClick={()=>handleStatus(tx.id,"validated")}>✓</button>{" "}
                          <button className="btn btn-danger btn-small" onClick={()=>handleStatus(tx.id,"refused")}>✗</button>
                        </>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={mTxPage} setPage={setMTxPage} totalItems={sel.mTxs.length} lang={lang}/>
            </div>
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:14}}>💸 {fr?"Dépenses":"Expenses"} — {sel.name}</div>
                <button onClick={()=>{setExpForm({...expForm,model_id:sel.id});setShowExpenseForm(true);}} style={{padding:"6px 16px",borderRadius:14,border:"none",background:"var(--danger)",color:"var(--text-primary)",fontSize:11,fontWeight:700,cursor:"pointer",boxShadow:"var(--shadow-md)",fontFamily:"'DM Sans',sans-serif"}}>+ {fr?"Ajouter":"Add"}</button>
              </div>
              <div style={{fontSize:22,fontWeight:800,color:"var(--danger)",marginBottom:14}}>-{Math.round(sel.totalExp).toLocaleString()}{currencySymbol}</div>
              {EXPENSE_CATS.map(cat => {
                const catTotal = sel.mExp.filter(e=>e.category===cat.id).reduce((s,e)=>s+convertAmount(Number(e.amount),e.currency),0);
                if(catTotal===0) return null;
                return <div key={cat.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border-subtle)"}}>
                  <span style={{fontSize:12,color:"var(--text-secondary)"}}>{cat.icon} {cat.label}</span>
                  <span style={{fontSize:13,fontWeight:700,color:"var(--danger)"}}>-{Math.round(catTotal).toLocaleString()}{currencySymbol}</span>
                </div>;
              })}
              {sel.totalExp===0&&<div style={{textAlign:"center",padding:20,color:"var(--text-quaternary)",fontSize:12}}>{fr?"Aucune dépense":"No expenses"}</div>}
              {sel.mExp.length>0&&<div style={{marginTop:12,maxHeight:200,overflowY:"auto"}}>
                {sel.mExp.map((e,i) => (
                  <div key={e.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",fontSize:11,borderBottom:"1px solid var(--border-subtle)"}}>
                    <span style={{color:"var(--text-secondary)"}}>{e.date?.slice(0,10)||"-"} · {e.name||e.category}</span>
                    <span style={{fontWeight:700,color:"var(--danger)"}}>-{Number(e.amount).toFixed(0)}{currencySymbol}</span>
                  </div>
                ))}
              </div>}
            </div>
          </div>
          {/* Content Task Manager — gérant assigns tasks to model */}
          <div className="card" style={{ marginTop: 16 }}>
            <ContentTaskManager modelId={selectedModel} lang={lang} onRefresh={onRefresh} />
          </div>
        </>}
        {!sel&&<div className="card" style={{textAlign:"center",padding:40,color:"var(--text-quaternary)"}}>{fr?"Sélectionnez un modèle ci-dessus":"Select a model above"}</div>}
      </>}

      {/* ── EXPENSE FORM MODAL ── */}
      {showExpenseForm&&<div className="modal-overlay" onClick={()=>setShowExpenseForm(false)}>
        <div className="card" style={{maxWidth:440,width:"100%",margin:16}} onClick={e=>e.stopPropagation()}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:16}}>💸 {fr?"Ajouter une dépense":"Add an expense"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div className="form-group-modal" style={{gridColumn:"1/-1"}}>
              <label className="form-label">{t(lang,"model")}</label>
              <select className="filter-select" style={{width:"100%"}} value={expForm.model_id} onChange={e=>setExpForm({...expForm,model_id:e.target.value})}>
                <option value="">{fr?"Agence (général)":"Agency (general)"}</option>
                {models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{t(lang,"amount")}</label>
              <input className="form-input" type="number" value={expForm.amount} onChange={e=>setExpForm({...expForm,amount:e.target.value})}/>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{fr?"Devise":"Currency"}</label>
              <select className="filter-select" style={{width:"100%"}} value={expForm.currency} onChange={e=>setExpForm({...expForm,currency:e.target.value})}><option>EUR</option><option>CHF</option></select>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{fr?"Catégorie":"Category"}</label>
              <select className="filter-select" style={{width:"100%"}} value={expForm.category} onChange={e=>setExpForm({...expForm,category:e.target.value})}>
                {EXPENSE_CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div className="form-group-modal">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={expForm.date} onChange={e=>setExpForm({...expForm,date:e.target.value})}/>
            </div>
            <div className="form-group-modal" style={{gridColumn:"1/-1"}}>
              <label className="form-label">Description</label>
              <input className="form-input" value={expForm.description} onChange={e=>setExpForm({...expForm,description:e.target.value})} placeholder={fr?"Ex: Shooting photo":"Ex: Photo shoot"}/>
            </div>
          </div>
          <div style={{display:"flex",gap:12,marginTop:20}}>
            <button className="btn btn-danger" onClick={()=>setShowExpenseForm(false)} style={{flex:1}}>{t(lang,"cancel")}</button>
            <button className="btn btn-success" onClick={handleAddExpense} disabled={saving} style={{flex:1}}>{saving?<span className="btn-spinner"/>:fr?"Ajouter":"Add"}</button>
          </div>
        </div>
      </div>}

      {/* ── GLOBAL EXPENSE SECTION ── */}
      <div className="card" style={{marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div className="section-title" style={{marginBottom:0}}><div className="section-bar"></div>💸 {fr?"Espace Dépenses":"Expenses Space"}</div>
          <button onClick={()=>{setExpForm({model_id:"",amount:"",currency:"EUR",category:"contenu",description:"",date:new Date().toISOString().slice(0,10)});setShowExpenseForm(true);}} style={{padding:"7px 20px",borderRadius:14,border:"none",background:"var(--danger)",color:"var(--text-primary)",fontSize:12,fontWeight:700,cursor:"pointer",boxShadow:"var(--shadow-md)",fontFamily:"'DM Sans',sans-serif"}}>+ {fr?"Ajouter une dépense":"Add an expense"}</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><SortTh label="Date" sortKey="date" sort={mExpSort} onSort={setMExpSort}/><SortTh label={t(lang,"model")} sortKey="model_id" sort={mExpSort} onSort={setMExpSort}/><th>{fr?"Catégorie":"Category"}</th><th>Description</th><SortTh label={t(lang,"amount")} sortKey="amount" sort={mExpSort} onSort={setMExpSort}/></tr></thead>
            <tbody>
              {paginate(sortData(expenses||[], mExpSort, {date:e=>e.date||e.created_at||"",model_id:e=>models.find(m=>m.id===e.model_id)?.name||"",amount:e=>Number(e.amount)}), mExpPage).map((e,i) => {
                const mName = models.find(m=>m.id===e.model_id)?.name||(fr?"Agence":"Agency");
                const cat = EXPENSE_CATS.find(c=>c.id===e.category);
                return <tr key={e.id||i}>
                  <td style={{fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)"}}>{e.date?.slice(0,10)||e.created_at?.slice(0,10)||"-"}</td>
                  <td style={{fontWeight:600}}>{mName}</td>
                  <td>{cat?`${cat.icon} ${cat.label}`:e.category||"-"}</td>
                  <td style={{fontSize:11,color:"var(--text-secondary)"}}>{e.name||e.description||"-"}</td>
                  <td style={{fontWeight:700,color:"var(--danger)"}}>-{Number(e.amount).toFixed(0)}{currencySymbol}</td>
                </tr>;
              })}
              {(!expenses||expenses.length===0)&&<tr><td colSpan={5} style={{textAlign:"center",color:"var(--text-quaternary)",padding:20}}>{fr?"Aucune dépense":"No expenses"}</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={mExpPage} setPage={setMExpPage} totalItems={(expenses||[]).length} lang={lang}/>
      </div>

      {editingTx && <EditTxModal tx={editingTx} lang={lang} onSave={handleEditSave} onCancel={()=>setEditingTx(null)} saving={saving} models={models} profiles={profiles} products={products} productTags={productTags} modelPrices={modelPrices} />}
    </div>
  );
};
// =============================================
// MODEL ROLE — ONBOARDING (Page 1)
// =============================================
const ONBOARDING_ITEMS = [
  { key: "photos", icon: "\u{1F4F8}", label_fr: "Photos upload\u00E9es", label_en: "Photos uploaded" },
  { key: "videos", icon: "\u{1F3A5}", label_fr: "Vid\u00E9os envoy\u00E9es", label_en: "Videos sent" },
  { key: "infos", icon: "\u{1F4DD}", label_fr: "Infos remplies", label_en: "Info completed" },
  { key: "voice", icon: "\u{1F399}\uFE0F", label_fr: "Script voix", label_en: "Voice script" },
  { key: "ai_persona", icon: "\u{1F916}", label_fr: "Personnalit\u00E9 IA valid\u00E9e", label_en: "AI persona validated" },
  { key: "payments", icon: "\u{1F4B3}", label_fr: "Paiements configur\u00E9s", label_en: "Payments configured" },
];

const ONBOARDING_DOCS = [
  { icon: "\u{1F4C4}", label_fr: "Guide de d\u00E9marrage", label_en: "Getting started guide" },
  { icon: "\u{1F4CB}", label_fr: "Charte qualit\u00E9 contenu", label_en: "Content quality charter" },
  { icon: "\u{1F4D6}", label_fr: "FAQ mod\u00E8les", label_en: "Models FAQ" },
];

const ModelChecklistTab = ({user, lang}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const storageKey = `dadash-onboarding-${user.id}`;
  const [checked, setChecked] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch(e) { return {}; }
  });

  const toggle = (key) => {
    const next = { ...checked, [key]: !checked[key] };
    setChecked(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch(e) {/* ignore */}
  };

  const doneCount = ONBOARDING_ITEMS.filter(it => checked[it.key]).length;
  const total = ONBOARDING_ITEMS.length;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:800,margin:0}}>{"\u2705"} Onboarding</h2>
        <p style={{fontSize:12,color:"var(--text-tertiary)",margin:"3px 0 0"}}>{fr?"Compl\u00E8te toutes les \u00E9tapes pour commencer":"Complete all steps to get started"}</p>
      </div>

      {/* Progress bar */}
      <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:18,padding:"18px 20px",marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:14,fontWeight:700}}>Onboarding {doneCount}/{total} {fr?"compl\u00E9t\u00E9":"completed"}</span>
          <span style={{fontSize:16,fontWeight:800,color:pct===100?"var(--success)":pct>=50?"var(--accent)":"var(--warning)"}}>{pct}%</span>
        </div>
        <div style={{height:10,borderRadius:5,background:"var(--bg-overlay)"}}>
          <div style={{height:10,borderRadius:5,background:pct===100?"var(--success)":"var(--grad)",width:pct+"%",transition:"width 0.4s cubic-bezier(0.16,1,0.3,1)"}}/>
        </div>
      </div>

      {/* Checklist items */}
      <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:16,padding:20,marginBottom:24}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>{fr?"\u00C9tapes d'onboarding":"Onboarding steps"}</div>
        {ONBOARDING_ITEMS.map(item => (
          <div key={item.key} onClick={() => toggle(item.key)} style={{
            display:"flex",alignItems:"center",gap:14,padding:"14px 16px",cursor:"pointer",
            borderRadius:12,marginBottom:4,background:checked[item.key]?"var(--accent-subtle)":"transparent",transition:"background 0.2s",
          }}>
            <div style={{width:24,height:24,borderRadius:8,border:"2px solid "+(checked[item.key]?"var(--success)":"var(--border-default)"),background:checked[item.key]?"var(--success)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s"}}>
              {checked[item.key]&&<span style={{color:"#fff",fontSize:14,fontWeight:800}}>{"\u2713"}</span>}
            </div>
            <span style={{fontSize:18,flexShrink:0}}>{item.icon}</span>
            <span style={{fontSize:14,fontWeight:600,textDecoration:checked[item.key]?"line-through":"none",opacity:checked[item.key]?0.5:1,transition:"all 0.2s"}}>{fr?item.label_fr:item.label_en}</span>
            <span style={{marginLeft:"auto",fontSize:12,color:checked[item.key]?"var(--success)":"var(--text-quaternary)",fontWeight:700}}>{checked[item.key]?"\u2705":"\u2B55"}</span>
          </div>
        ))}
      </div>

      {/* Documents section */}
      <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:16,padding:20}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>{"\u{1F4E5}"} {fr?"Documents \u00E0 t\u00E9l\u00E9charger":"Documents to download"}</div>
        {ONBOARDING_DOCS.map((doc, i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:12,marginBottom:4,background:"var(--bg-overlay)"}}>
            <span style={{fontSize:18}}>{doc.icon}</span>
            <span style={{flex:1,fontSize:13,fontWeight:600}}>{fr?doc.label_fr:doc.label_en}</span>
            <button onClick={() => addToast(fr?"Bient\u00F4t disponible":"Coming soon","info")} className="btn" style={{padding:"4px 12px",fontSize:11,background:"var(--accent-subtle)",color:"var(--accent)",border:"1px solid var(--accent-muted)",borderRadius:8,cursor:"pointer",fontWeight:600}}>
              {"\u{1F4E5}"} {fr?"T\u00E9l\u00E9charger":"Download"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================
// MODEL ROLE — CONTENT LIST WEEKLY (Page 2)
// =============================================
const DAYS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const DAYS_EN = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

const getWeekRange = (offset) => {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + (offset * 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
};

const fmtShort = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

const ModelContentTab = ({user, lang, onRefresh}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const [weekOffset, setWeekOffset] = useState(0);
  const { start, end } = getWeekRange(weekOffset);
  const storageKey = `dadash-content-${user.id}-${start.toISOString().slice(0,10)}`;

  const DEFAULT_WEEK = [
    { day: 0, items: [{ text: fr?"5 photos casual":"5 casual photos", done: false }, { text: fr?"1 vid\u00E9o story":"1 story video", done: false }] },
    { day: 1, items: [{ text: fr?"3 photos lifestyle":"3 lifestyle photos", done: false }] },
    { day: 2, items: [{ text: fr?"5 photos sexy":"5 sexy photos", done: false }, { text: fr?"1 vid\u00E9o custom":"1 custom video", done: false }] },
    { day: 3, items: [{ text: fr?"3 photos casual":"3 casual photos", done: false }] },
    { day: 4, items: [{ text: fr?"5 photos premium":"5 premium photos", done: false }, { text: fr?"1 vid\u00E9o teaser":"1 teaser video", done: false }] },
    { day: 5, items: [{ text: fr?"Contenu libre":"Free content", done: false }] },
    { day: 6, items: [{ text: fr?"Repos ou contenu bonus":"Rest or bonus content", done: false }] },
  ];

  const [weekData, setWeekData] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : DEFAULT_WEEK;
    } catch(e) { return DEFAULT_WEEK; }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setWeekData(saved ? JSON.parse(saved) : DEFAULT_WEEK);
    } catch(e) { setWeekData(DEFAULT_WEEK); }
  }, [weekOffset]);

  const toggleItem = (dayIdx, itemIdx) => {
    const next = weekData.map((d, di) => di === dayIdx ? {
      ...d, items: d.items.map((it, ii) => ii === itemIdx ? { ...it, done: !it.done } : it)
    } : d);
    setWeekData(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch(e) {/* ignore */}
  };

  const totalItems = weekData.reduce((s, d) => s + d.items.length, 0);
  const doneItems = weekData.reduce((s, d) => s + d.items.filter(it => it.done).length, 0);
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
  const days = fr ? DAYS_FR : DAYS_EN;

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:800,margin:0}}>{"\u{1F4F8}"} {fr?"Content List":"Content List"}</h2>
        <p style={{fontSize:12,color:"var(--text-tertiary)",margin:"3px 0 0"}}>{fr?"Planning contenu semaine par semaine":"Weekly content planning"}</p>
      </div>

      {/* Week navigation */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <button onClick={() => setWeekOffset(w => w - 1)} className="btn" style={{padding:"6px 14px",fontSize:12,background:"var(--bg-overlay)",color:"var(--text-secondary)",border:"1px solid var(--border-default)",borderRadius:10,cursor:"pointer"}}>{"\u2190"} {fr?"Pr\u00E9c\u00E9dente":"Previous"}</button>
        <span style={{fontSize:14,fontWeight:700}}>{fr?"Semaine du":"Week of"} {fmtShort(start)} {fr?"au":"to"} {fmtShort(end)}</span>
        <button onClick={() => setWeekOffset(w => w + 1)} className="btn" style={{padding:"6px 14px",fontSize:12,background:"var(--bg-overlay)",color:"var(--text-secondary)",border:"1px solid var(--border-default)",borderRadius:10,cursor:"pointer"}}>{fr?"Suivante":"Next"} {"\u2192"}</button>
      </div>

      {/* Progress */}
      <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:14,padding:"14px 18px",marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:12,fontWeight:600}}>{doneItems}/{totalItems} {fr?"termin\u00E9s":"completed"}</span>
          <span style={{fontSize:12,fontWeight:800,color:pct===100?"var(--success)":"var(--accent)"}}>{pct}%</span>
        </div>
        <div style={{height:6,borderRadius:3,background:"var(--bg-overlay)"}}>
          <div style={{height:6,borderRadius:3,background:pct===100?"var(--success)":"var(--grad)",width:pct+"%",transition:"width 0.3s"}}/>
        </div>
      </div>

      {/* Daily checklist */}
      {weekData.map((dayData, dayIdx) => {
        const dayDone = dayData.items.every(it => it.done);
        return (
          <div key={dayIdx} style={{background:"var(--card-bg)",border:"1px solid "+(dayDone?"var(--success-muted)":"var(--border-subtle)"),borderRadius:14,padding:16,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:14,fontWeight:700}}>{days[dayIdx]}</span>
              {dayDone && <span style={{fontSize:11,color:"var(--success)",fontWeight:700}}>{"\u2705"} {fr?"Complet":"Complete"}</span>}
            </div>
            {dayData.items.map((item, itemIdx) => (
              <div key={itemIdx} onClick={() => toggleItem(dayIdx, itemIdx)} style={{
                display:"flex",alignItems:"center",gap:12,padding:"10px 12px",cursor:"pointer",
                borderRadius:10,marginBottom:2,background:item.done?"var(--accent-subtle)":"transparent",transition:"background 0.15s",
              }}>
                <div style={{width:20,height:20,borderRadius:6,border:"2px solid "+(item.done?"var(--success)":"var(--border-default)"),background:item.done?"var(--success)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {item.done&&<span style={{color:"#fff",fontSize:12,fontWeight:800}}>{"\u2713"}</span>}
                </div>
                <span style={{fontSize:13,fontWeight:500,textDecoration:item.done?"line-through":"none",opacity:item.done?0.5:1}}>{item.text}</span>
              </div>
            ))}
            <button onClick={() => addToast(fr?"Bient\u00F4t disponible":"Coming soon","info")} style={{marginTop:8,padding:"5px 12px",fontSize:11,background:"transparent",color:"var(--accent)",border:"1px dashed var(--accent-muted)",borderRadius:8,cursor:"pointer",fontWeight:600,width:"100%"}}>
              {"\u{1F4E4}"} {fr?"Upload contenu":"Upload content"}
            </button>
          </div>
        );
      })}
    </div>
  );
};

// =============================================
// MODEL ROLE — MES PAIEMENTS (Page 4)
// =============================================
const ModelPaymentsTab = ({user, lang, invoices}) => {
  const fr = lang === "fr";
  const { currencySymbol } = useCurrency();
  const [payments, setPayments] = useState([]);
  const [loadingP, setLoadingP] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await sb.from("model_payments").select("*").eq("model_id", user.id).order("date", { ascending: false });
      setPayments(data || []);
      setLoadingP(false);
    };
    load();
  }, [user.id]);

  const statusColor = (s) => s === "paid" ? "var(--success)" : s === "cancelled" ? "var(--danger)" : "var(--warning)";
  const statusLabel = (s) => s === "paid" ? (fr ? "Pay\u00E9" : "Paid") : s === "cancelled" ? (fr ? "Annul\u00E9" : "Cancelled") : (fr ? "En attente" : "Pending");

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:800,margin:0}}>{"\u{1F4B0}"} {fr?"Mes Paiements":"My Payments"}</h2>
        <p style={{fontSize:12,color:"var(--text-tertiary)",margin:"3px 0 0"}}>{fr?"Historique de tes paiements re\u00E7us":"Your received payment history"}</p>
      </div>

      <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border-subtle)",fontSize:13,fontWeight:700}}>{"\u{1F4CA}"} {fr?"Paiements re\u00E7us":"Received payments"}</div>
        {loadingP && <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>Chargement...</div>}
        {!loadingP && payments.length === 0 && <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>{fr?"Aucun paiement pour le moment":"No payments yet"}</div>}
        {!loadingP && payments.length > 0 && (
          <div style={{overflowX:"auto"}}>
            <table className="table" style={{fontSize:12}}>
              <thead><tr>
                <th>Date</th>
                <th>{fr?"P\u00E9riode":"Period"}</th>
                <th>{fr?"Montant":"Amount"}</th>
                <th>{fr?"Statut":"Status"}</th>
              </tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.date)}</td>
                    <td style={{color:"var(--text-secondary)"}}>{p.notes || "\u2014"}</td>
                    <td style={{fontWeight:800,color:"var(--success)"}}>+{Number(p.amount).toLocaleString("fr-FR",{maximumFractionDigits:0})}{p.currency === "EUR" ? "\u20AC" : " CHF"}</td>
                    <td><span style={{padding:"2px 8px",borderRadius:10,background:statusColor(p.status)+"15",color:statusColor(p.status),fontSize:10,fontWeight:700}}>{statusLabel(p.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================
// MODEL ROLE — TO DO LIST (Page 3)
// =============================================
const ModelTasksTab = ({user, lang}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");

  useEffect(() => {
    const load = async () => {
      const {data} = await sb.from("model_tasks").select("*").eq("model_id", user.id).order("due_date", {ascending: true, nullsFirst: false});
      setTasks(data || []);
      setLoading(false);
    };
    load();
  }, [user.id]);

  const updateStatus = async (taskId, newStatus) => {
    const updates = {status: newStatus};
    if (newStatus === "done") updates.completed_at = new Date().toISOString();
    else updates.completed_at = null;
    const {error} = await sb.from("model_tasks").update(updates).eq("id", taskId);
    if (error) { addToast("Erreur: " + error.message, "error"); return; }
    setTasks(prev => prev.map(t => t.id === taskId ? {...t, ...updates} : t));
    if (newStatus === "done") addToast(fr ? "T\u00E2che termin\u00E9e \u2705" : "Task completed \u2705", "success");
  };

  const todoCount = tasks.filter(t => t.status === "todo").length;
  const inProgressCount = tasks.filter(t => t.status === "in_progress").length;
  const doneCount = tasks.filter(t => t.status === "done").length;
  const pendingCount = todoCount + inProgressCount;
  const isOverdue = (d) => d && new Date(d) < new Date(new Date().toISOString().slice(0, 10));

  // Sort: overdue first, then by due_date ascending
  const sorted = [...tasks].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (a.status !== "done" && b.status === "done") return -1;
    const aOver = isOverdue(a.due_date) && a.status !== "done";
    const bOver = isOverdue(b.due_date) && b.status !== "done";
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    return (a.due_date || "9999").localeCompare(b.due_date || "9999");
  });

  const filtered = filter === "active" ? sorted.filter(t => t.status !== "done") : filter === "done" ? sorted.filter(t => t.status === "done") : sorted;

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:800,margin:0}}>{"\u{1F4CB}"} {fr?"Mes T\u00E2ches":"My Tasks"}</h2>
        <p style={{fontSize:12,color:"var(--text-tertiary)",margin:"3px 0 0"}}>
          {pendingCount > 0 && <span style={{color:"var(--warning)",fontWeight:700}}>{pendingCount} {fr?"en attente":"pending"}</span>}
          {pendingCount > 0 && " \u00B7 "}
          {doneCount} {fr?"termin\u00E9es":"done"}
        </p>
      </div>

      {/* Pending badge */}
      {pendingCount > 0 && (
        <div style={{background:"var(--warning-muted)",border:"1px solid var(--warning)",borderRadius:12,padding:"10px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>{"\u26A0\uFE0F"}</span>
          <span style={{fontSize:12,fontWeight:700,color:"var(--warning)"}}>{pendingCount} {fr?"t\u00E2ches en attente":"tasks pending"}</span>
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[{k:"active",l:fr?"Actives":"Active"},{k:"done",l:fr?"Termin\u00E9es":"Done"},{k:"all",l:fr?"Toutes":"All"}].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} className={`filter-chip ${filter===f.k?"active":""}`}>{f.l}</button>
        ))}
      </div>

      {loading && <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>Chargement...</div>}
      {!loading && filtered.length === 0 && <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>{fr?"Aucune t\u00E2che":"No tasks"} {"\u{1F389}"}</div>}
      {filtered.map(task => (
        <div key={task.id} style={{
          display:"flex",alignItems:"center",gap:16,padding:"16px 20px",
          background:"var(--card-bg)",
          border:"1px solid "+(isOverdue(task.due_date)&&task.status!=="done"?"var(--danger-muted)":"var(--border-subtle)"),
          borderRadius:16,marginBottom:8,
          borderLeft:"4px solid "+(task.status==="done"?"var(--success)":task.status==="in_progress"?"var(--accent)":"var(--warning)"),
        }}>
          <input type="checkbox" checked={task.status==="done"} onChange={()=>updateStatus(task.id,task.status==="done"?"todo":"done")}
            style={{width:20,height:20,accentColor:"var(--success)",cursor:"pointer",flexShrink:0}} />
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,textDecoration:task.status==="done"?"line-through":"none",opacity:task.status==="done"?0.5:1}}>{task.title}</div>
            {task.description && <div style={{fontSize:11,color:"var(--text-tertiary)",marginTop:3}}>{task.description}</div>}
            <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}>
              {task.due_date && <span style={{fontSize:10,color:isOverdue(task.due_date)&&task.status!=="done"?"var(--danger)":"var(--text-quaternary)",fontWeight:isOverdue(task.due_date)&&task.status!=="done"?700:400}}>{"\u{1F4C5}"} {fmtDate(task.due_date)} {isOverdue(task.due_date)&&task.status!=="done"?" \u2014 "+(fr?"EN RETARD":"OVERDUE"):""}</span>}
              {task.priority==="urgent"&&<span style={{fontSize:10,color:"var(--danger)",fontWeight:700}}>{"\u{1F6A8}"} URGENT</span>}
              {task.priority==="high"&&<span style={{fontSize:10,color:"var(--warning)",fontWeight:600}}>{"\u26A0\uFE0F"} {fr?"Prioritaire":"High"}</span>}
            </div>
          </div>
          <select value={task.status} onChange={e=>updateStatus(task.id,e.target.value)} className="filter-select" style={{fontSize:11,padding:"5px 8px"}}>
            <option value="todo">{fr?"\u00C0 faire":"To do"}</option>
            <option value="in_progress">{fr?"En cours":"In progress"}</option>
            <option value="done">{fr?"Termin\u00E9 \u2705":"Done \u2705"}</option>
          </select>
        </div>
      ))}
    </div>
  );
};


const ContentTaskManager = ({modelId, lang, onRefresh}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const [tasks, setTasks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "photo", priority: "medium", due_date: "", bonus_amount: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await sb.from("content_tasks").select("*").eq("model_id", modelId).order("created_at", { ascending: false });
      setTasks(data || []);
    };
    load();
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
          <button onClick={handleAdd} disabled={saving} className="btn btn-primary" style={{ fontSize: 11 }}>{saving ? "..." : (fr ? "Ajouter" : "Add")}</button>
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

// =============================================
// GÉRANT — MODÈLES MANAGEMENT TAB
// =============================================
const ModelManagementTab = ({user, lang, models, profiles, modelTasks, contentList, checklistTemplates, checklistInstances, onRefresh}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [subView, setSubView] = useState("tasks");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showContentModal, setShowContentModal] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [taskForm, setTaskForm] = useState({title:"",description:"",category:"general",priority:"medium",due_date:""});
  const [contentForm, setContentForm] = useState({title:"",description:"",content_type:"photo",platform:"onlyfans",due_date:"",bonus_amount:0});
  const [templateForm, setTemplateForm] = useState({name:"",items:[]});
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const modeleProfiles = profiles.filter(p => p.role === "modele");
  const today = new Date().toISOString().slice(0, 10);

  // Ensure today's checklist instances exist for all models
  const ensureInstances = async (modelId) => {
    const activeTemplates = checklistTemplates.filter(t => t.active);
    for (const tpl of activeTemplates) {
      const exists = checklistInstances.find(ci => ci.model_id === modelId && ci.template_id === tpl.id && ci.date === today);
      if (!exists) {
        const items = (tpl.items || []).map(it => ({title: it.title, checked: false}));
        await sb.from("checklist_instances").insert({model_id: modelId, template_id: tpl.id, date: today, items});
      }
    }
  };

  // Model health: checklist completion %
  const getModelHealth = (modelId) => {
    const todayInstances = checklistInstances.filter(ci => ci.model_id === modelId && ci.date === today);
    if (todayInstances.length === 0) return null;
    const allItems = todayInstances.flatMap(ci => ci.items || []);
    if (allItems.length === 0) return null;
    const checked = allItems.filter(i => i.checked).length;
    return Math.round((checked / allItems.length) * 100);
  };

  // Model card stats
  const modelCards = modeleProfiles.map(m => {
    const tasks = modelTasks.filter(t => t.model_id === m.id);
    const todoCount = tasks.filter(t => t.status === "todo").length;
    const inProgressCount = tasks.filter(t => t.status === "in_progress").length;
    const urgentCount = tasks.filter(t => t.priority === "urgent" && t.status !== "done").length;
    const contents = contentList.filter(c => c.model_id === m.id);
    const pendingContent = contents.filter(c => c.status !== "published").length;
    const health = getModelHealth(m.id);
    return {...m, tasks, todoCount, inProgressCount, urgentCount, contents, pendingContent, health};
  });

  const sel = selectedModelId ? modelCards.find(m => m.id === selectedModelId) : null;

  // ── TASK CRUD ──
  const handleAddTask = async () => {
    if (!taskForm.title || !selectedModelId) return;
    setSaving(true);
    const {error} = await sb.from("model_tasks").insert({
      model_id: selectedModelId, assigned_by: user.id,
      title: taskForm.title, description: taskForm.description,
      category: taskForm.category, priority: taskForm.priority,
      due_date: taskForm.due_date || null,
    });
    setSaving(false);
    if (error) { addToast("Erreur: " + error.message, "error"); return; }
    setTaskForm({title:"",description:"",category:"general",priority:"medium",due_date:""});
    setShowTaskModal(false);
    await onRefresh();
    addToast(fr ? "Tâche ajoutée" : "Task added", "success");
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    const updates = {status: newStatus};
    if (newStatus === "done") updates.completed_at = new Date().toISOString();
    else updates.completed_at = null;
    await sb.from("model_tasks").update(updates).eq("id", taskId);
    await onRefresh();
  };

  const deleteTask = async (taskId) => {
    await sb.from("model_tasks").delete().eq("id", taskId);
    await onRefresh();
    addToast(fr ? "Tâche supprimée" : "Task deleted", "success");
  };

  // ── CONTENT CRUD ──
  const handleAddContent = async () => {
    if (!contentForm.title || !selectedModelId) return;
    setSaving(true);
    const {error} = await sb.from("content_list").insert({
      model_id: selectedModelId, assigned_by: user.id,
      title: contentForm.title, description: contentForm.description,
      content_type: contentForm.content_type, platform: contentForm.platform,
      due_date: contentForm.due_date || null, bonus_amount: Number(contentForm.bonus_amount) || 0,
    });
    setSaving(false);
    if (error) { addToast("Erreur: " + error.message, "error"); return; }
    setContentForm({title:"",description:"",content_type:"photo",platform:"onlyfans",due_date:"",bonus_amount:0});
    setShowContentModal(false);
    await onRefresh();
    addToast(fr ? "Contenu ajouté" : "Content added", "success");
  };

  const updateContentStatus = async (contentId, newStatus) => {
    const updates = {status: newStatus};
    if (newStatus === "published") updates.completed_at = new Date().toISOString();
    else updates.completed_at = null;
    await sb.from("content_list").update(updates).eq("id", contentId);
    await onRefresh();
  };

  const deleteContent = async (contentId) => {
    await sb.from("content_list").delete().eq("id", contentId);
    await onRefresh();
    addToast(fr ? "Contenu supprimé" : "Content deleted", "success");
  };

  // ── CHECKLIST TEMPLATE CRUD ──
  const handleSaveTemplate = async () => {
    if (!templateForm.name) return;
    setSaving(true);
    const items = templateForm.items.map((t, i) => ({title: t, sort_order: i}));
    if (templateForm.id) {
      await sb.from("checklist_templates").update({name: templateForm.name, items}).eq("id", templateForm.id);
    } else {
      await sb.from("checklist_templates").insert({name: templateForm.name, items});
    }
    setSaving(false);
    setShowTemplateEditor(false);
    setTemplateForm({name:"",items:[]});
    await onRefresh();
    addToast(fr ? "Template sauvegardé" : "Template saved", "success");
  };

  const toggleChecklistItem = async (instanceId, itemIdx) => {
    const inst = checklistInstances.find(ci => ci.id === instanceId);
    if (!inst) return;
    const updatedItems = inst.items.map((it, i) => i === itemIdx ? {...it, checked: !it.checked} : it);
    await sb.from("checklist_instances").update({items: updatedItems}).eq("id", instanceId);
    await onRefresh();
  };

  const catIcon = (c) => c === "social" ? "\u{1F4F1}" : c === "admin" ? "\u{1F4CB}" : c === "content" ? "\u{1F4F8}" : c === "communication" ? "\u{1F4AC}" : "\u{1F4CC}";
  const contentTypeIcon = (t) => t === "photo" ? "\u{1F4F8}" : t === "video" ? "\u{1F3A5}" : t === "live" ? "\u{1F534}" : "\u{1F4E6}";
  const priorityColor = (p) => p === "urgent" ? "var(--danger)" : p === "high" ? "var(--warning)" : p === "medium" ? "var(--accent)" : "var(--text-tertiary)";
  const statusColor = (s) => s === "done" || s === "published" ? "var(--success)" : s === "in_progress" || s === "shooting" || s === "editing" ? "var(--accent)" : s === "ready" ? "var(--pink)" : "var(--warning)";
  const healthColor = (h) => h === null ? "var(--text-quaternary)" : h >= 70 ? "var(--success)" : h >= 40 ? "var(--warning)" : "var(--danger)";

  // ── OVERVIEW (no model selected) ──
  if (!selectedModelId) {
    const totalTasks = modelTasks.filter(t => t.status !== "done").length;
    const urgentTasks = modelTasks.filter(t => t.priority === "urgent" && t.status !== "done").length;
    const pendingContents = contentList.filter(c => c.status !== "published").length;

    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800,margin:0}}>{"\u{1F469}"} {fr?"Modèles Management":"Models Management"}</h2>
            <p style={{fontSize:11,color:"var(--text-tertiary)",margin:"3px 0 0"}}>{fr?"Tâches, contenu et checklists":"Tasks, content and checklists"}</p>
          </div>
          <button onClick={()=>setShowTemplateEditor(true)} className="btn btn-primary" style={{fontSize:11,padding:"7px 16px"}}>
            {"\u2699\uFE0F"} {fr?"Templates Checklist":"Checklist Templates"}
          </button>
        </div>

        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
          {[
            {label:fr?"Modèles":"Models",value:modeleProfiles.length,icon:"\u{1F469}",color:"var(--accent)"},
            {label:fr?"Tâches actives":"Active tasks",value:totalTasks,icon:"\u{1F4CB}",color:"var(--warning)"},
            {label:fr?"Urgentes":"Urgent",value:urgentTasks,icon:"\u{1F6A8}",color:"var(--danger)"},
            {label:fr?"Contenus en cours":"Pending content",value:pendingContents,icon:"\u{1F4F8}",color:"var(--pink)"},
          ].map((k)=>(
            <div key={k.label} style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:18,padding:"14px 16px"}}>
              <div style={{fontSize:10,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>{k.icon} {k.label}</div>
              <div style={{fontSize:22,fontWeight:800,color:k.color}}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Model cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280,1fr))",gap:16}}>
          {modelCards.map(m => (
            <div key={m.id} onClick={async()=>{await ensureInstances(m.id);setSelectedModelId(m.id);setSubView("tasks");}} style={{
              background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:18,padding:"20px",cursor:"pointer",
              transition:"all 0.2s",borderLeft:"4px solid "+healthColor(m.health),
            }}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{width:44,height:44,borderRadius:14,background:"var(--accent-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,color:"var(--accent)"}}>{m.name?m.name[0]:"?"}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700}}>{m.name}</div>
                  <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{m.email||""}</div>
                </div>
                {m.health !== null && (
                  <div style={{width:36,height:36,borderRadius:"50%",background:`conic-gradient(${healthColor(m.health)} ${m.health*3.6}deg, var(--bg-overlay) ${m.health*3.6}deg)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:"var(--card-bg)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:healthColor(m.health)}}>{m.health}%</div>
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {m.todoCount > 0 && <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,background:"var(--warning-muted)",color:"var(--warning)",fontWeight:700}}>{"\u{1F4CB}"} {m.todoCount} {fr?"à faire":"todo"}</span>}
                {m.inProgressCount > 0 && <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,background:"var(--accent-subtle)",color:"var(--accent)",fontWeight:700}}>{"\u{1F504}"} {m.inProgressCount} {fr?"en cours":"ongoing"}</span>}
                {m.urgentCount > 0 && <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,background:"var(--danger-muted)",color:"var(--danger)",fontWeight:700}}>{"\u{1F6A8}"} {m.urgentCount} {fr?"urgent":"urgent"}</span>}
                {m.pendingContent > 0 && <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,background:"var(--pink-muted,var(--accent-subtle))",color:"var(--pink)",fontWeight:700}}>{"\u{1F4F8}"} {m.pendingContent} {fr?"contenus":"content"}</span>}
              </div>
            </div>
          ))}
          {modeleProfiles.length === 0 && <div style={{gridColumn:"1/-1",textAlign:"center",color:"var(--text-quaternary)",padding:40}}>{fr?"Aucun modèle trouvé":"No models found"}</div>}
        </div>

        {/* Template Editor Modal */}
        {showTemplateEditor && (
          <div style={{position:"fixed",inset:0,background:"var(--modal-backdrop)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setShowTemplateEditor(false)}>
            <div style={{background:"var(--modal-bg)",borderRadius:20,padding:28,width:520,maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
              <h3 style={{fontSize:16,fontWeight:800,marginBottom:16}}>{"\u2699\uFE0F"} {fr?"Templates Checklists":"Checklist Templates"}</h3>
              {checklistTemplates.map(tpl => (
                <div key={tpl.id} style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:14,padding:16,marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:700}}>{tpl.name}</span>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{setTemplateForm({id:tpl.id,name:tpl.name,items:(tpl.items||[]).map(i=>i.title)});}} className="btn" style={{fontSize:10,padding:"3px 10px"}}>{fr?"Modifier":"Edit"}</button>
                      <span style={{fontSize:9,padding:"3px 8px",borderRadius:8,background:tpl.active?"var(--success-muted,var(--accent-subtle))":"var(--bg-overlay)",color:tpl.active?"var(--success)":"var(--text-quaternary)",fontWeight:700}}>{tpl.active?(fr?"Actif":"Active"):(fr?"Inactif":"Inactive")}</span>
                    </div>
                  </div>
                  <div style={{fontSize:11,color:"var(--text-secondary)"}}>
                    {(tpl.items||[]).map((it) => <div key={it.title} style={{padding:"3px 0"}}>{"\u2022"} {it.title}</div>)}
                  </div>
                </div>
              ))}
              {/* Edit/Create form */}
              {templateForm.name !== undefined && (
                <div style={{background:"var(--bg-overlay)",borderRadius:14,padding:16,marginTop:12}}>
                  <input placeholder={fr?"Nom du template":"Template name"} value={templateForm.name} onChange={e=>setTemplateForm({...templateForm,name:e.target.value})} className="input" style={{marginBottom:8,width:"100%"}} />
                  {(templateForm.items||[]).map((it,i)=>(
                    <div key={i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                      <span style={{flex:1,fontSize:12}}>{i+1}. {it}</span>
                      <button onClick={()=>setTemplateForm({...templateForm,items:templateForm.items.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:14}}>{"\u{1F5D1}"}</button>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    <input placeholder={fr?"Nouvel item...":"New item..."} value={newItem} onChange={e=>setNewItem(e.target.value)} className="input" style={{flex:1}} onKeyDown={e=>{if(e.key==="Enter"&&newItem){setTemplateForm({...templateForm,items:[...templateForm.items,newItem]});setNewItem("");}}} />
                    <button onClick={()=>{if(newItem){setTemplateForm({...templateForm,items:[...templateForm.items,newItem]});setNewItem("");}}} className="btn btn-primary" style={{fontSize:11}}>+</button>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:12}}>
                    <button onClick={handleSaveTemplate} disabled={saving} className="btn btn-primary" style={{fontSize:11}}>{saving?<span className="btn-spinner"/>:(fr?"Sauvegarder":"Save")}</button>
                    <button onClick={()=>setTemplateForm({name:"",items:[]})} className="btn" style={{fontSize:11}}>{fr?"Nouveau":"New"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW (model selected) ──
  const mTasks = modelTasks.filter(t => t.model_id === selectedModelId);
  const mContents = contentList.filter(c => c.model_id === selectedModelId);
  const todayInstances = checklistInstances.filter(ci => ci.model_id === selectedModelId && ci.date === today);

  const tasksByStatus = (status) => mTasks.filter(t => t.status === status);
  const isOverdue = (d) => d && new Date(d) < new Date(today);

  const CONTENT_STATUSES = [
    {value:"pending",label:fr?"En attente":"Pending",color:"var(--warning)"},
    {value:"shooting",label:fr?"Shooting":"Shooting",color:"var(--accent)"},
    {value:"editing",label:fr?"Montage":"Editing",color:"var(--pink)"},
    {value:"ready",label:fr?"Prêt":"Ready",color:"var(--success)"},
    {value:"published",label:fr?"Publié":"Published",color:"var(--success)"},
  ];

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={()=>setSelectedModelId(null)} className="btn" style={{fontSize:12,padding:"6px 14px"}}>{"\u2190"} {fr?"Retour":"Back"}</button>
        <div style={{width:40,height:40,borderRadius:12,background:"var(--accent-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,color:"var(--accent)"}}>{sel?.name?.[0]||"?"}</div>
        <div>
          <h2 style={{fontSize:17,fontWeight:800,margin:0}}>{sel?.name}</h2>
          <p style={{fontSize:11,color:"var(--text-tertiary)",margin:0}}>{sel?.email||""}</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:0,borderRadius:14,border:"1px solid var(--border-default)",overflow:"hidden",marginBottom:20}}>
        {[
          {id:"tasks",label:fr?"Tâches":"Tasks",icon:"\u{1F4CB}",count:mTasks.filter(t=>t.status!=="done").length},
          {id:"content",label:fr?"Contenu":"Content",icon:"\u{1F4F8}",count:mContents.filter(c=>c.status!=="published").length},
          {id:"checklist",label:"Checklist",icon:"\u2705",count:null},
        ].map(st=>(
          <button key={st.id} onClick={()=>setSubView(st.id)} style={{
            padding:"8px 18px",border:"none",background:subView===st.id?"var(--accent-muted)":"transparent",
            color:subView===st.id?"var(--accent)":"var(--text-tertiary)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
            display:"flex",alignItems:"center",gap:6,
          }}>
            {st.icon} {st.label} {st.count!==null&&st.count>0&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:"var(--danger-muted)",color:"var(--danger)",fontWeight:800}}>{st.count}</span>}
          </button>
        ))}
      </div>

      {/* ── TASKS SUB-VIEW: Kanban ── */}
      {subView==="tasks"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontSize:14,fontWeight:700}}>{"\u{1F4CB}"} {fr?"Tâches assignées":"Assigned tasks"} ({mTasks.length})</span>
            <button onClick={()=>setShowTaskModal(true)} className="btn btn-primary" style={{fontSize:11,padding:"6px 14px"}}>+ {fr?"Nouvelle tâche":"New task"}</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
            {[
              {status:"todo",label:fr?"À faire":"To do",color:"var(--warning)",icon:"\u{1F4DD}"},
              {status:"in_progress",label:fr?"En cours":"In progress",color:"var(--accent)",icon:"\u{1F504}"},
              {status:"done",label:fr?"Terminé":"Done",color:"var(--success)",icon:"\u2705"},
            ].map(col=>(
              <div key={col.status} style={{background:"var(--bg-overlay)",borderRadius:16,padding:14,minHeight:200}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
                  <span style={{fontSize:14}}>{col.icon}</span>
                  <span style={{fontSize:12,fontWeight:700,color:col.color}}>{col.label}</span>
                  <span style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:"var(--bg-overlay)",color:"var(--text-quaternary)",fontWeight:700}}>{tasksByStatus(col.status).length}</span>
                </div>
                {tasksByStatus(col.status).map(task=>(
                  <div key={task.id} style={{
                    background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:14,padding:"12px 14px",marginBottom:8,
                    borderLeft:"3px solid "+priorityColor(task.priority),
                  }}>
                    <div style={{fontSize:12,fontWeight:700,marginBottom:4}}>{task.title}</div>
                    {task.description && <div style={{fontSize:10,color:"var(--text-tertiary)",marginBottom:6}}>{task.description}</div>}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                      <span style={{fontSize:9,padding:"2px 6px",borderRadius:6,background:"var(--accent-subtle)",color:"var(--accent)",fontWeight:600}}>{catIcon(task.category)} {task.category}</span>
                      {task.due_date && <span style={{fontSize:9,color:isOverdue(task.due_date)&&task.status!=="done"?"var(--danger)":"var(--text-quaternary)"}}>{"\u{1F4C5}"} {fmtDate(task.due_date)}</span>}
                      {task.priority==="urgent"&&<span style={{fontSize:9,color:"var(--danger)",fontWeight:700}}>{"\u{1F6A8}"}</span>}
                    </div>
                    <div style={{display:"flex",gap:4,justifyContent:"space-between",alignItems:"center"}}>
                      <select value={task.status} onChange={e=>updateTaskStatus(task.id,e.target.value)} className="filter-select" style={{fontSize:10,padding:"3px 6px"}}>
                        <option value="todo">{fr?"À faire":"Todo"}</option>
                        <option value="in_progress">{fr?"En cours":"In progress"}</option>
                        <option value="done">{fr?"Terminé":"Done"}</option>
                      </select>
                      <button onClick={()=>setConfirmAction({type:"task",id:task.id})} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:12,opacity:0.6}}>{"\u{1F5D1}"}</button>
                    </div>
                  </div>
                ))}
                {tasksByStatus(col.status).length===0&&<div style={{textAlign:"center",color:"var(--text-quaternary)",fontSize:10,padding:20}}>{fr?"Aucune tâche":"No tasks"}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CONTENT SUB-VIEW: Table ── */}
      {subView==="content"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontSize:14,fontWeight:700}}>{"\u{1F4F8}"} {fr?"Contenu à produire":"Content to produce"} ({mContents.length})</span>
            <button onClick={()=>setShowContentModal(true)} className="btn btn-primary" style={{fontSize:11,padding:"6px 14px"}}>+ {fr?"Nouveau contenu":"New content"}</button>
          </div>
          {mContents.length === 0 && <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>{fr?"Aucun contenu":"No content"}</div>}
          {mContents.length > 0 && (
            <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:14,overflow:"hidden"}}>
              <table className="table" style={{fontSize:12}}>
                <thead><tr>
                  <th>{fr?"Titre":"Title"}</th><th>Type</th><th>{fr?"Plateforme":"Platform"}</th><th>{fr?"Statut":"Status"}</th><th>{fr?"Échéance":"Due"}</th><th>Bonus</th><th></th>
                </tr></thead>
                <tbody>
                  {mContents.map(c=>(
                    <tr key={c.id}>
                      <td>
                        <div style={{fontWeight:600}}>{c.title}</div>
                        {c.description&&<div style={{fontSize:10,color:"var(--text-tertiary)"}}>{c.description}</div>}
                      </td>
                      <td><span style={{fontSize:10}}>{contentTypeIcon(c.content_type)} {c.content_type}</span></td>
                      <td><span style={{fontSize:10,textTransform:"capitalize"}}>{c.platform||"\u2014"}</span></td>
                      <td>
                        <select value={c.status} onChange={e=>updateContentStatus(c.id,e.target.value)} className="filter-select" style={{fontSize:10,padding:"3px 6px"}}>
                          {CONTENT_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td style={{fontSize:10,color:isOverdue(c.due_date)&&c.status!=="published"?"var(--danger)":"var(--text-secondary)"}}>{c.due_date?fmtDate(c.due_date):"\u2014"}</td>
                      <td style={{fontWeight:600,color:"var(--success)"}}>{c.bonus_amount>0?`+${c.bonus_amount}\u20AC`:"\u2014"}</td>
                      <td><button onClick={()=>setConfirmAction({type:"content",id:c.id})} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:12,opacity:0.6}}>{"\u{1F5D1}"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CHECKLIST SUB-VIEW ── */}
      {subView==="checklist"&&(
        <div>
          <div style={{marginBottom:16}}>
            <span style={{fontSize:14,fontWeight:700}}>{"\u2705"} Checklist du {today}</span>
          </div>
          {todayInstances.length===0&&<div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>{fr?"Aucune checklist pour aujourd'hui. Créez un template d'abord.":"No checklist for today. Create a template first."}</div>}
          {todayInstances.map(inst=>{
            const tpl = checklistTemplates.find(t=>t.id===inst.template_id);
            const items = inst.items||[];
            const checked = items.filter(i=>i.checked).length;
            const pct = items.length>0?Math.round((checked/items.length)*100):0;
            return (
              <div key={inst.id} style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:16,padding:20,marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <span style={{fontSize:13,fontWeight:700}}>{tpl?.name||"Checklist"}</span>
                  <span style={{fontSize:11,fontWeight:700,color:pct===100?"var(--success)":pct>=50?"var(--accent)":"var(--warning)"}}>{checked}/{items.length} ({pct}%)</span>
                </div>
                {/* Progress bar */}
                <div style={{height:6,borderRadius:3,background:"var(--bg-overlay)",marginBottom:14}}>
                  <div style={{height:6,borderRadius:3,background:pct===100?"var(--success)":pct>=50?"var(--accent)":"var(--warning)",width:pct+"%",transition:"width 0.3s"}}/>
                </div>
                {items.map((item,idx)=>(
                  <div key={idx} onClick={()=>toggleChecklistItem(inst.id,idx)} style={{
                    display:"flex",alignItems:"center",gap:12,padding:"10px 14px",cursor:"pointer",
                    borderRadius:10,marginBottom:4,background:item.checked?"var(--accent-subtle)":"transparent",
                    transition:"background 0.2s",
                  }}>
                    <div style={{width:20,height:20,borderRadius:6,border:"2px solid "+(item.checked?"var(--success)":"var(--border-default)"),background:item.checked?"var(--success)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s"}}>
                      {item.checked&&<span style={{color:"#fff",fontSize:12,fontWeight:800}}>{"\u2713"}</span>}
                    </div>
                    <span style={{fontSize:13,fontWeight:500,textDecoration:item.checked?"line-through":"none",opacity:item.checked?0.5:1,transition:"all 0.2s"}}>{item.title}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ADD TASK MODAL ── */}
      {showTaskModal&&(
        <div style={{position:"fixed",inset:0,background:"var(--modal-backdrop)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setShowTaskModal(false)}>
          <div style={{background:"var(--modal-bg)",borderRadius:20,padding:28,width:480}} onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:16,fontWeight:800,marginBottom:16}}>{"\u{1F4CB}"} {fr?"Nouvelle tâche":"New task"}</h3>
            <input placeholder={fr?"Titre":"Title"} value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})} className="input" style={{marginBottom:8,width:"100%"}} />
            <input placeholder="Description" value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})} className="input" style={{marginBottom:8,width:"100%"}} />
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <select value={taskForm.category} onChange={e=>setTaskForm({...taskForm,category:e.target.value})} className="filter-select">
                <option value="general">{"\u{1F4CC}"} {fr?"Général":"General"}</option>
                <option value="social">{"\u{1F4F1}"} Social</option>
                <option value="admin">{"\u{1F4CB}"} Admin</option>
                <option value="content">{"\u{1F4F8}"} {fr?"Contenu":"Content"}</option>
                <option value="communication">{"\u{1F4AC}"} Com</option>
              </select>
              <select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value})} className="filter-select">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
              <input type="date" value={taskForm.due_date} onChange={e=>setTaskForm({...taskForm,due_date:e.target.value})} className="filter-date" />
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleAddTask} disabled={saving} className="btn btn-primary" style={{fontSize:12}}>{saving?<span className="btn-spinner"/>:(fr?"Ajouter":"Add")}</button>
              <button onClick={()=>setShowTaskModal(false)} className="btn" style={{fontSize:12}}>{fr?"Annuler":"Cancel"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD CONTENT MODAL ── */}
      {showContentModal&&(
        <div style={{position:"fixed",inset:0,background:"var(--modal-backdrop)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setShowContentModal(false)}>
          <div style={{background:"var(--modal-bg)",borderRadius:20,padding:28,width:480}} onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:16,fontWeight:800,marginBottom:16}}>{"\u{1F4F8}"} {fr?"Nouveau contenu":"New content"}</h3>
            <input placeholder={fr?"Titre":"Title"} value={contentForm.title} onChange={e=>setContentForm({...contentForm,title:e.target.value})} className="input" style={{marginBottom:8,width:"100%"}} />
            <input placeholder="Description" value={contentForm.description} onChange={e=>setContentForm({...contentForm,description:e.target.value})} className="input" style={{marginBottom:8,width:"100%"}} />
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <select value={contentForm.content_type} onChange={e=>setContentForm({...contentForm,content_type:e.target.value})} className="filter-select">
                <option value="photo">{"\u{1F4F8}"} Photo</option><option value="video">{"\u{1F3A5}"} {fr?"Vidéo":"Video"}</option><option value="live">{"\u{1F534}"} Live</option><option value="custom">{"\u{1F4E6}"} Custom</option>
              </select>
              <select value={contentForm.platform} onChange={e=>setContentForm({...contentForm,platform:e.target.value})} className="filter-select">
                <option value="onlyfans">OnlyFans</option><option value="fansly">Fansly</option><option value="mym">MYM</option><option value="other">{fr?"Autre":"Other"}</option>
              </select>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input type="date" value={contentForm.due_date} onChange={e=>setContentForm({...contentForm,due_date:e.target.value})} className="filter-date" />
              <input type="number" placeholder={fr?"Bonus \u20AC":"Bonus \u20AC"} value={contentForm.bonus_amount} onChange={e=>setContentForm({...contentForm,bonus_amount:e.target.value})} className="input" style={{width:100}} />
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleAddContent} disabled={saving} className="btn btn-primary" style={{fontSize:12}}>{saving?<span className="btn-spinner"/>:(fr?"Ajouter":"Add")}</button>
              <button onClick={()=>setShowContentModal(false)} className="btn" style={{fontSize:12}}>{fr?"Annuler":"Cancel"}</button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={!!confirmAction} title={fr?"Supprimer":"Delete"} message={fr?"Cet élément sera supprimé définitivement. Êtes-vous sûr ?":"This item will be permanently deleted. Are you sure?"} lang={lang} onCancel={()=>setConfirmAction(null)} onConfirm={()=>{if(confirmAction?.type==="task")deleteTask(confirmAction.id);else if(confirmAction?.type==="content")deleteContent(confirmAction.id);setConfirmAction(null);}}/>
    </div>
  );
};

module.exports = { ModelesTab, ModelContentTab, ModelPaymentsTab, ContentTaskManager, ModelManagementTab, ModelChecklistTab, ModelTasksTab };
