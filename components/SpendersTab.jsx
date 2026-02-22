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

const SpendersTab = ({user, lang, txs, models, profiles, dbSpenders, selectedSpenderKey, setSelectedSpenderKey, onRefresh, onNotify}) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const fr = lang === "fr";
  const dr = useDateRange("all");
  const [sortBy, setSortBy] = useState("ltv");
  const [filterModel, setFilterModel] = useState("");
  const [selected, setSelected] = useState(null);
  const [detailModel, setDetailModel] = useState("");
  const [detailTab, setDetailTab] = useState("models");
  const [editingTx, setEditingTx] = useState(null);
  const [spSaving, setSpSaving] = useState(false);
  const [spPage, setSpPage] = useState(0);
  const handleSpStatus = async (txId, newStatus) => {
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
        const cur=currencySymbol;
        if(newStatus==="validated"&&currentTx.chatter_id) onNotify(currentTx.chatter_id,"tx_validated","TX validée ✅",`${currentTx.amount}${cur} de @${currentTx.spender_handle}`,txId);
        if(newStatus==="refused"&&currentTx.chatter_id) onNotify(currentTx.chatter_id,"tx_refused","TX refusée ❌",`${currentTx.amount}${cur} de @${currentTx.spender_handle}`,txId);
        profiles.filter(p=>p.role==="gerant").forEach(g=>onNotify(g.id,newStatus==="validated"?"tx_validated":"tx_refused",newStatus==="validated"?"TX validée":"TX refusée",`${currentTx.amount}${cur} @${currentTx.spender_handle}`,txId));
      }
      await onRefresh();
      addToast(newStatus==="validated"?(t(lang,"tx_validated")):(t(lang,"tx_refused")), newStatus==="validated"?"success":"error");
    } catch(e) { addToast("Erreur: " + e.message, "error"); }
  };
  const handleSpEditSave = async (updates) => {
    if (!editingTx || editingTx.status !== "pending") { setEditingTx(null); return; }
    setSpSaving(true);
    try {
      const {error} = await sb.from("transactions").update({spender_handle:updates.spender_handle,amount:updates.amount,currency:updates.currency,model_id:updates.model_id,provider_id:updates.provider_id,chatter_id:updates.chatter_id,product:updates.product,tag:updates.tag,product_id:updates.product_id||null,product_tag_id:updates.product_tag_id||null,notes:updates.notes}).eq("id",editingTx.id).eq("status","pending");
      setSpSaving(false);
      if(error) { addToast("Erreur: " + error.message, "error"); return; }
      setEditingTx(null);
      await onRefresh();
      addToast(t(lang,"tx_updated"), "success");
    } catch(e) { setSpSaving(false); addToast("Erreur: " + e.message, "error"); }
  };

  // Build spender data: merge DB spenders + transactions + breakdowns
  const spFilteredTxs = useMemo(() => dr.filterByDate(txs, "date"), [txs, dr.startDate, dr.endDate, dr.activePreset]);
  const spenders = useMemo(()=>{
    const map = {};

    // 1) Seed from DB spenders table (source of truth for metadata)
    (dbSpenders || []).forEach(dbSp => {
      const h = dbSp.handle || dbSp.name;
      if (!h) return;
      let contactInfo = {};
      try { contactInfo = typeof dbSp.contact_info === "string" ? JSON.parse(dbSp.contact_info) : (dbSp.contact_info || {}); } catch(e) { /* malformed JSON in contact_info – use empty object */ }
      map[h] = {
        name: h,
        dbId: dbSp.id,
        telegramId: dbSp.telegram_id || null,
        whatsapp_phone: dbSp.whatsapp_phone || null,
        age: dbSp.age || null,
        city: dbSp.city || null,
        job: dbSp.job || null,
        classification: dbSp.classification || "new",
        last_contact_date: dbSp.last_contact_date || null,
        source: dbSp.source || null,
        dbTags: Array.isArray(dbSp.tags) ? dbSp.tags : [],
        dbStatus: dbSp.status || "active",
        contactInfo,
        dbNotes: dbSp.notes || "",
        totalSpentDb: Number(dbSp.total_spent) || 0,
        txs: [], byModel: {}, byChatter: {}, byProvider: {},
      };
    });

    // 2) Enrich with transactions
    spFilteredTxs.forEach(tx => {
      const h = tx.spender_handle;
      if (!h) return;
      if (!map[h]) map[h] = {name: h, dbId: null, telegramId: null, dbTags: [], dbStatus: "active", contactInfo: {}, dbNotes: "", totalSpentDb: 0, txs: [], byModel: {}, byChatter: {}, byProvider: {}};
      map[h].txs.push(tx);
      // Model breakdown
      const mid = tx.model_id;
      if (!map[h].byModel[mid]) map[h].byModel[mid] = {txs: [], ca: 0, validated: 0, pending: 0};
      map[h].byModel[mid].txs.push(tx);
      map[h].byModel[mid].ca += Number(tx.amount);
      if (tx.status === "validated") map[h].byModel[mid].validated += Number(tx.amount);
      if (tx.status === "pending") map[h].byModel[mid].pending += Number(tx.amount);
      // Chatter breakdown
      const cid = tx.chatter_id || "unknown";
      const cName = profiles.find(p => p.id === cid)?.name || "?";
      if (!map[h].byChatter[cid]) map[h].byChatter[cid] = {id: cid, name: cName, ca: 0, count: 0, validated: 0, pending: 0};
      map[h].byChatter[cid].ca += Number(tx.amount);
      map[h].byChatter[cid].count++;
      if (tx.status === "validated") map[h].byChatter[cid].validated += Number(tx.amount);
      if (tx.status === "pending") map[h].byChatter[cid].pending += Number(tx.amount);
      // Provider breakdown
      const pid = tx.provider_id || "unknown";
      const pName = profiles.find(p => p.id === pid)?.name || "?";
      if (!map[h].byProvider[pid]) map[h].byProvider[pid] = {id: pid, name: pName, ca: 0, count: 0, validated: 0, pending: 0};
      map[h].byProvider[pid].ca += Number(tx.amount);
      map[h].byProvider[pid].count++;
      if (tx.status === "validated") map[h].byProvider[pid].validated += Number(tx.amount);
      if (tx.status === "pending") map[h].byProvider[pid].pending += Number(tx.amount);
    });

    return Object.values(map).map(s => {
      const ltv = s.txs.reduce((sum, tx) => sum + Number(tx.amount), 0);
      const cnt = s.txs.length;
      const aov = cnt > 0 ? ltv / cnt : 0;
      const validCA = s.txs.filter(tx => tx.status === "validated").reduce((sum, tx) => sum + Number(tx.amount), 0);
      const pendingCA = s.txs.filter(tx => tx.status === "pending").reduce((sum, tx) => sum + Number(tx.amount), 0);
      const modelCount = Object.keys(s.byModel).length;
      const modelBreakdown = Object.entries(s.byModel).map(([mid, data]) => {
        const mName = models.find(m => m.id === mid)?.name || "?";
        return {id: mid, name: mName, ca: data.ca, validated: data.validated, pending: data.pending, txCount: data.txs.length, txs: data.txs, pct: ltv > 0 ? ((data.ca / ltv) * 100) : 0};
      }).sort((a, b) => b.ca - a.ca);
      const chatterBreakdown = Object.values(s.byChatter).sort((a, b) => b.ca - a.ca);
      const providerBreakdown = Object.values(s.byProvider).sort((a, b) => b.ca - a.ca);
      return {...s, ltv, cnt, aov, validCA, pendingCA, segment: getSpenderSegment(ltv), modelCount, modelBreakdown, chatterBreakdown, providerBreakdown};
    });
  }, [spFilteredTxs, models, profiles, dbSpenders]);

  // Auto-select from cross-page navigation
  useEffect(()=>{
    if(selectedSpenderKey && spenders.length > 0) {
      const found = spenders.find(s => s.name.toLowerCase() === selectedSpenderKey.toLowerCase());
      if(found) { setSelected(found); setDetailModel(""); setDetailTab("models"); }
      if(setSelectedSpenderKey) setSelectedSpenderKey(null);
    }
  },[selectedSpenderKey, spenders]);

  let filtered = filterModel ? spenders.filter(s=>s.byModel[filterModel]) : spenders;
  let sorted = [...filtered];
  if(sortBy==="frequency") sorted.sort((a,b)=>b.cnt-a.cnt);
  else if(sortBy==="recency") sorted.sort((a,b)=>new Date(b.txs[b.txs.length-1]?.date||0)-new Date(a.txs[a.txs.length-1]?.date||0));
  else if(sortBy==="model_ca" && filterModel) sorted.sort((a,b)=>(b.byModel[filterModel]?.ca||0)-(a.byModel[filterModel]?.ca||0));
  else sorted.sort((a,b)=>b.ltv-a.ltv);

  const spSortedLen = sorted.length;
  useEffect(() => { setSpPage(0); }, [spSortedLen, sortBy, filterModel]);
  const paginatedSpenders = paginate(sorted, spPage);

  const avgLtv = sorted.length>0 ? sorted.reduce((s,x)=>s+x.ltv,0)/sorted.length : 0;
  const multiModelCount = sorted.filter(s=>s.modelCount>1).length;
  const totalValidated = sorted.reduce((s,x)=>s+x.validCA,0);
  const totalPending = sorted.reduce((s,x)=>s+x.pendingCA,0);

  return (
    <div>
      <GlobalFilterBar lang={lang} dr={dr} models={models} profiles={null}
        model={filterModel} setModel={(v)=>{setFilterModel(v);setSelected(null);}} showModelFilter />
      <div className="kpi-grid">
        <KPICard label={t(lang,"spenders")} value={`${sorted.length}`} icon="👥"/>
        <KPICard label={t(lang,"avg_ltv")} value={`${avgLtv.toFixed(0)}${currencySymbol}`} icon="💎"/>
        <KPICard label={fr?"Valide":"Validated"} value={`${totalValidated.toFixed(0)}${currencySymbol}`} icon="✅"/>
        <KPICard label="Pending" value={`${totalPending.toFixed(0)}${currencySymbol}`} icon="⏳"/>
      </div>

      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12,alignItems:"center"}}>
        <select className="filter-select" value={filterModel} onChange={e=>{setFilterModel(e.target.value);setSelected(null);}}>
          <option value="">{fr?"Tous les modeles":"All models"}</option>
          {models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button className={`filter-chip ${sortBy==="ltv"?"active":""}`} onClick={()=>setSortBy("ltv")}>LTV</button>
        <button className={`filter-chip ${sortBy==="frequency"?"active":""}`} onClick={()=>setSortBy("frequency")}>{t(lang,"frequency")}</button>
        <button className={`filter-chip ${sortBy==="recency"?"active":""}`} onClick={()=>setSortBy("recency")}>{t(lang,"recency")}</button>
        {filterModel && <button className={`filter-chip ${sortBy==="model_ca"?"active":""}`} onClick={()=>setSortBy("model_ca")}>{fr?"CA modele":"Model CA"}</button>}
      </div>

      <div className="grid-55-45">
        <div>
          {paginatedSpenders.map(s=>(
            <div key={s.name} className="spender-card" onClick={()=>{setSelected(s);setDetailModel("");setDetailTab("models");}}>
              <div className="spender-top">
                <div className="spender-name"><Tag type="spender" label={s.name} id={s.name}/></div>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  {s.telegramId && <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--brand-telegram-muted)",color:"var(--brand-telegram)",fontWeight:700}}>TG</span>}
                  {s.whatsapp_phone && <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--brand-whatsapp-muted)",color:"var(--brand-whatsapp)",fontWeight:700}}>WA</span>}
                  {s.modelCount>1 && <span style={{background:"var(--accent-muted)",color:"var(--accent)",fontSize:10,padding:"2px 8px",borderRadius:12,fontWeight:600}}>{s.modelCount} models</span>}
                  <span className={`badge badge-${s.segment}`}>{s.segment}</span>
                </div>
              </div>
              <div className="spender-ltv">{filterModel ? (s.byModel[filterModel]?.ca||0) : s.ltv}{currencySymbol}{filterModel && <span style={{fontSize:11,color:"var(--text2)",marginLeft:6}}>/ {s.ltv}{currencySymbol} total</span>}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
                {s.modelBreakdown.slice(0,3).map(mb=>(
                  <span key={mb.id} style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:"var(--accent-subtle)",color:"var(--text)",display:"flex",gap:4,alignItems:"center"}}>
                    <span style={{color:"var(--accent)",fontWeight:600}}>{mb.name}</span>
                    <span>{mb.ca}{currencySymbol}</span>
                  </span>
                ))}
              </div>
              {/* Chatter + Provider mini summary */}
              <div style={{display:"flex",gap:8,marginTop:4,fontSize:10,color:"var(--text-tertiary)"}}>
                {s.chatterBreakdown.length>0 && <span>💬 {s.chatterBreakdown.map(c=>c.name).join(", ")}</span>}
                {s.providerBreakdown.length>0 && <span>🔒 {s.providerBreakdown.map(p=>p.name).join(", ")}</span>}
              </div>
              <div className="spender-meta" style={{marginTop:6}}>
                <div className="spender-meta-item"><span>{t(lang,"aov")}</span><span>{s.aov.toFixed(0)}{currencySymbol}</span></div>
                <div className="spender-meta-item"><span>{t(lang,"frequency")}</span><span>{s.cnt}</span></div>
                <div className="spender-meta-item"><span style={{color:"var(--success)"}}>✓</span><span style={{color:"var(--success)"}}>{s.validCA.toFixed(0)}{currencySymbol}</span></div>
                <div className="spender-meta-item"><span style={{color:"var(--warning)"}}>⏳</span><span style={{color:"var(--warning)"}}>{s.pendingCA.toFixed(0)}{currencySymbol}</span></div>
              </div>
            </div>
          ))}
          {sorted.length===0 && <div style={{color:"var(--text2)",textAlign:"center",padding:40}}>{fr?"Aucun spender":"No spenders"}</div>}
          <Pagination currentPage={spPage} setPage={setSpPage} totalItems={sorted.length} lang={lang}/>
        </div>

        {/* Detail Panel */}
        {selected&&(
          <div className="profile-panel">
            <div className="profile-header">
              <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
                <div style={{width:36,height:36,borderRadius:12,background:"var(--accent-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,color:"var(--accent)"}}>{selected.name?selected.name[0].toUpperCase():"?"}</div>
                <div>
                  <div className="profile-name" style={{margin:0}}>{selected.name}</div>
                  <div style={{display:"flex",gap:4,marginTop:3}}>
                    {selected.classification && selected.classification !== "new" && <span style={{fontSize:8,padding:"1px 6px",borderRadius:6,background:selected.classification==="whale"?"var(--warning-muted)":selected.classification==="vip"?"var(--accent-subtle)":selected.classification==="regular"?"var(--success-muted,var(--accent-subtle))":"var(--bg-overlay)",color:selected.classification==="whale"?"var(--warning)":selected.classification==="vip"?"var(--accent)":"var(--text-tertiary)",fontWeight:700,textTransform:"uppercase"}}>{selected.classification}</span>}
                    {selected.telegramId && <span style={{fontSize:8,padding:"1px 6px",borderRadius:6,background:"var(--brand-telegram-muted)",color:"var(--brand-telegram)",fontWeight:700}}>TG</span>}
                    {selected.whatsapp_phone && <span style={{fontSize:8,padding:"1px 6px",borderRadius:6,background:"var(--brand-whatsapp-muted)",color:"var(--brand-whatsapp)",fontWeight:700}}>WA</span>}
                    {selected.source && <span style={{fontSize:8,padding:"1px 6px",borderRadius:6,background:"var(--bg-overlay)",color:"var(--text-quaternary)",fontWeight:600}}>{selected.source}</span>}
                  </div>
                </div>
              </div>
              <button className="profile-close" onClick={()=>setSelected(null)}>X</button>
            </div>
            {/* KPIs */}
            <div className="profile-section">
              <div className="profile-section-title">KPIs</div>
              <div className="profile-row"><span>LTV Total</span><span style={{fontWeight:700}}>{selected.ltv}{currencySymbol}</span></div>
              <div className="profile-row"><span>{t(lang,"aov")}</span><span>{selected.aov.toFixed(0)}{currencySymbol}</span></div>
              <div className="profile-row"><span>{fr?"Valide":"Validated"}</span><span style={{color:"var(--success)"}}>{selected.validCA}{currencySymbol}</span></div>
              <div className="profile-row"><span>Pending</span><span style={{color:"var(--warning)"}}>{selected.pendingCA}{currencySymbol}</span></div>
              <div className="profile-row"><span>{t(lang,"frequency")}</span><span>{selected.cnt} tx</span></div>
              <div className="profile-row"><span>{fr?"Modeles":"Models"}</span><span>{selected.modelCount}</span></div>
              {selected.dbStatus && <div className="profile-row"><span>Status DB</span><span style={{textTransform:"capitalize"}}>{selected.dbStatus}</span></div>}
            </div>

            {/* DB Metadata: contact info, tags, notes */}
            {(selected.contactInfo?.prenom || selected.dbTags?.length > 0 || selected.dbNotes) && (
              <div className="profile-section">
                <div className="profile-section-title">📋 {fr?"Fiche Spender":"Spender Profile"}</div>
                {selected.contactInfo?.prenom && selected.contactInfo.prenom !== "?" && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8,padding:10,background:"var(--accent-subtle)",borderRadius:8}}>
                    <div><span style={{fontSize:10,color:"var(--text-tertiary)"}}>Prenom</span><br/><strong>{selected.contactInfo.prenom}</strong></div>
                    <div><span style={{fontSize:10,color:"var(--text-tertiary)"}}>Age</span><br/><strong>{selected.contactInfo.age || "?"}</strong></div>
                    <div><span style={{fontSize:10,color:"var(--text-tertiary)"}}>Metier</span><br/><strong>{selected.contactInfo.metier || "?"}</strong></div>
                  </div>
                )}
                {selected.telegramId && (
                  <div className="profile-row"><span>Telegram ID</span><span style={{fontSize:11,fontFamily:"monospace"}}>{selected.telegramId}</span></div>
                )}
                {selected.dbTags && selected.dbTags.length > 0 && (
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                    {selected.dbTags.map(tag=>(
                      <span key={tag} style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:tag==="whale"?"var(--warning-muted)":tag==="timewaster"?"var(--danger-muted)":"var(--accent-muted)",color:tag==="whale"?"var(--warning)":tag==="timewaster"?"var(--danger)":"var(--accent)",fontWeight:600}}>{tag}</span>
                    ))}
                  </div>
                )}
                {selected.dbNotes && (
                  <div style={{padding:10,background:"var(--accent-subtle)",borderRadius:8,fontSize:12,color:"var(--text2)",fontStyle:"italic",lineHeight:1.5}}>
                    {selected.dbNotes.substring(0, 300)}{selected.dbNotes.length > 300 ? "..." : ""}
                  </div>
                )}
              </div>
            )}

            {/* DETAIL TABS: Models / Chatters / Providers / TX / Notes */}
            <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
              <button className={`filter-chip ${detailTab==="models"?"active":""}`} onClick={()=>setDetailTab("models")} style={{fontSize:10,padding:"3px 10px"}}>{"\u{1F469}"} {fr?"Modeles":"Models"}</button>
              <button className={`filter-chip ${detailTab==="chatters"?"active":""}`} onClick={()=>setDetailTab("chatters")} style={{fontSize:10,padding:"3px 10px"}}>{"\u{1F4AC}"} Chatters</button>
              <button className={`filter-chip ${detailTab==="providers"?"active":""}`} onClick={()=>setDetailTab("providers")} style={{fontSize:10,padding:"3px 10px"}}>{"\u{1F512}"} Providers</button>
              <button className={`filter-chip ${detailTab==="txs"?"active":""}`} onClick={()=>setDetailTab("txs")} style={{fontSize:10,padding:"3px 10px"}}>{"\u{1F4CB}"} TX</button>
              <button className={`filter-chip ${detailTab==="notes"?"active":""}`} onClick={()=>setDetailTab("notes")} style={{fontSize:10,padding:"3px 10px"}}>{"\u{1F4DD}"} Notes</button>
              <button className={`filter-chip ${detailTab==="channels"?"active":""}`} onClick={()=>setDetailTab("channels")} style={{fontSize:10,padding:"3px 10px"}}>{"\u{1F517}"} Canaux</button>
            </div>

            {/* MODEL BREAKDOWN */}
            {detailTab==="models" && (
              <div className="profile-section">
                <div className="profile-section-title" style={{marginBottom:8}}>{fr?"Depenses par Modele":"Spending by Model"}</div>
                {selected.modelBreakdown.length>1 && (
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
                    <button className={`filter-chip ${detailModel===""?"active":""}`} onClick={()=>setDetailModel("")} style={{fontSize:10,padding:"3px 10px"}}>{fr?"Tous":"All"}</button>
                    {selected.modelBreakdown.map(mb=>(
                      <button key={mb.id} className={`filter-chip ${detailModel===mb.id?"active":""}`} onClick={()=>setDetailModel(mb.id)} style={{fontSize:10,padding:"3px 10px"}}>{mb.name}</button>
                    ))}
                  </div>
                )}
                {(detailModel ? selected.modelBreakdown.filter(mb=>mb.id===detailModel) : selected.modelBreakdown).map(mb=>(
                  <div key={mb.id} style={{background:"var(--accent-subtle)",borderRadius:10,padding:12,marginBottom:8,border:"1px solid var(--accent-muted)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <Tag type="model" label={mb.name} id={mb.id}/>
                      <span style={{fontWeight:700,fontSize:16}}>{mb.ca}{currencySymbol} <span style={{fontSize:11,color:"var(--text2)",fontWeight:400}}>({mb.pct.toFixed(0)}%)</span></span>
                    </div>
                    <div style={{background:"var(--accent-subtle)",borderRadius:4,height:6,marginBottom:8,overflow:"hidden"}}>
                      <div style={{background:"var(--accent)",height:"100%",width:`${mb.pct}%`,borderRadius:4,transition:"width 0.3s"}}></div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,fontSize:11}}>
                      <div><span style={{color:"var(--text2)"}}>{fr?"Valide":"Valid"}</span><br/><span style={{color:"var(--success)",fontWeight:600}}>{mb.validated}{currencySymbol}</span></div>
                      <div><span style={{color:"var(--text2)"}}>Pending</span><br/><span style={{color:"var(--warning)",fontWeight:600}}>{mb.pending}{currencySymbol}</span></div>
                      <div><span style={{color:"var(--text2)"}}>TX</span><br/><span style={{fontWeight:600}}>{mb.txCount}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CHATTER BREAKDOWN */}
            {detailTab==="chatters" && (
              <div className="profile-section">
                <div className="profile-section-title" style={{marginBottom:8}}>💬 {fr?"CA par Chatter":"Revenue by Chatter"}</div>
                {selected.chatterBreakdown.length===0 ? (
                  <div style={{color:"var(--text-tertiary)",fontSize:12,textAlign:"center",padding:20}}>{fr?"Aucun chatter":"No chatters"}</div>
                ) : selected.chatterBreakdown.map(ch=>(
                  <div key={ch.id} style={{background:"rgba(96,165,250,0.05)",borderRadius:10,padding:12,marginBottom:8,border:"1px solid rgba(96,165,250,0.15)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <span style={{fontWeight:700,color:"var(--blue-accent)"}}>{ch.name}</span>
                      <span style={{fontWeight:700,fontSize:16}}>{ch.ca}{currencySymbol}</span>
                    </div>
                    <div style={{background:"rgba(96,165,250,0.1)",borderRadius:4,height:5,marginBottom:6,overflow:"hidden"}}>
                      <div style={{background:"var(--blue-accent)",height:"100%",width:`${selected.ltv>0?((ch.ca/selected.ltv)*100):0}%`,borderRadius:4}}></div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,fontSize:11}}>
                      <div><span style={{color:"var(--text2)"}}>TX</span><br/><span style={{fontWeight:600}}>{ch.count}</span></div>
                      <div><span style={{color:"var(--text2)"}}>{fr?"Valide":"Valid"}</span><br/><span style={{color:"var(--success)",fontWeight:600}}>{ch.validated}{currencySymbol}</span></div>
                      <div><span style={{color:"var(--text2)"}}>Pending</span><br/><span style={{color:"var(--warning)",fontWeight:600}}>{ch.pending}{currencySymbol}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PROVIDER BREAKDOWN */}
            {detailTab==="providers" && (
              <div className="profile-section">
                <div className="profile-section-title" style={{marginBottom:8}}>🔒 {fr?"CA par Provider":"Revenue by Provider"}</div>
                {selected.providerBreakdown.length===0 ? (
                  <div style={{color:"var(--text-tertiary)",fontSize:12,textAlign:"center",padding:20}}>{fr?"Aucun provider":"No providers"}</div>
                ) : selected.providerBreakdown.map(pv=>(
                  <div key={pv.id} style={{background:"var(--warning-muted)",borderRadius:10,padding:12,marginBottom:8,border:"1px solid var(--warning-muted)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <span style={{fontWeight:700,color:"var(--warning)"}}>{pv.name}</span>
                      <span style={{fontWeight:700,fontSize:16}}>{pv.ca}{currencySymbol}</span>
                    </div>
                    <div style={{background:"var(--warning-muted)",borderRadius:4,height:5,marginBottom:6,overflow:"hidden"}}>
                      <div style={{background:"var(--warning)",height:"100%",width:`${selected.ltv>0?((pv.ca/selected.ltv)*100):0}%`,borderRadius:4}}></div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,fontSize:11}}>
                      <div><span style={{color:"var(--text2)"}}>TX</span><br/><span style={{fontWeight:600}}>{pv.count}</span></div>
                      <div><span style={{color:"var(--text2)"}}>{fr?"Valide":"Valid"}</span><br/><span style={{color:"var(--success)",fontWeight:600}}>{pv.validated}{currencySymbol}</span></div>
                      <div><span style={{color:"var(--text2)"}}>Pending</span><br/><span style={{color:"var(--warning)",fontWeight:600}}>{pv.pending}{currencySymbol}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TX LIST */}
            {detailTab==="txs" && (
              <div className="profile-section">
                <div className="profile-section-title" style={{marginBottom:8}}>📋 {fr?"Transactions":"Transactions"} ({selected.cnt})</div>
                <div className="table-wrap">
                  <table className="table" style={{fontSize:10}}>
                    <thead><tr><th>Date</th><th>{t(lang,"amount")}</th><th>{fr?"Produit":"Product"}</th><th>Tag</th><th>{fr?"Modele":"Model"}</th><th>Chatter</th><th>Provider</th><th>{t(lang,"status")}</th><th>{t(lang,"actions")}</th></tr></thead>
                    <tbody>
                      {selected.txs.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,20).map((tx)=>{
                        const mName = models.find(m=>m.id===tx.model_id)?.name||"?";
                        const cName = profiles.find(p=>p.id===tx.chatter_id)?.name||"?";
                        const pName = profiles.find(p=>p.id===tx.provider_id)?.name||"?";
                        const canEdit = tx.status==="pending"&&(user.role==="gerant"||user.role==="chatter"||(user.role==="provider"&&tx.provider_id===user.id));
                        return (
                          <tr key={tx.id}>
                            <td>{fmtDate(tx.date)}</td>
                            <td style={{fontWeight:700}}>{fmtAmount(tx.amount,tx.currency)}</td>
                            <td>{tx.product||"—"}</td>
                            <td>{tx.tag||"—"}</td>
                            <td>{mName}</td>
                            <td style={{color:"var(--blue-accent)"}}>{cName}</td>
                            <td style={{color:"var(--warning)"}}>{pName}</td>
                            <td><StatusPill status={tx.status} lang={lang}/></td>
                            <td style={{whiteSpace:"nowrap"}}>
                              {canEdit&&<button className="btn-edit" style={{marginRight:4}} onClick={()=>setEditingTx(tx)}>✏️ Modifier</button>}
                              {tx.status==="pending"&&(user.role==="gerant"||(user.role==="provider"&&tx.provider_id===user.id))&&(
                                <><button className="btn btn-success btn-small" style={{fontSize:9}} onClick={()=>handleSpStatus(tx.id,"validated")}>{t(lang,"validate")}</button>{" "}<button className="btn btn-danger btn-small" style={{fontSize:9}} onClick={()=>handleSpStatus(tx.id,"refused")}>{t(lang,"refuse")}</button></>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {selected.cnt>20 && <div style={{fontSize:10,color:"var(--text2)",textAlign:"center",marginTop:4}}>+{selected.cnt-20} {fr?"autres":"more"}</div>}
                </div>
              </div>
            )}

            {/* NOTES TAB */}
            {detailTab==="notes" && (
              <div className="profile-section">
                <div className="profile-section-title">{"\u{1F4DD}"} Notes</div>
                {selected.dbNotes ? (
                  <div style={{padding:12,background:"var(--accent-subtle)",borderRadius:10,fontSize:12,color:"var(--text-secondary)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{selected.dbNotes}</div>
                ) : (
                  <div style={{color:"var(--text-quaternary)",fontSize:12,textAlign:"center",padding:20}}>{fr?"Aucune note":"No notes"}</div>
                )}
                {selected.contactInfo?.prenom && (
                  <div style={{marginTop:12,background:"var(--bg-overlay)",borderRadius:10,padding:12}}>
                    <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>{"\u{1F464}"} {fr?"Infos Contact":"Contact Info"}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:11}}>
                      <div><span style={{color:"var(--text-tertiary)"}}>Prénom:</span> <strong>{selected.contactInfo.prenom||"?"}</strong></div>
                      <div><span style={{color:"var(--text-tertiary)"}}>Age:</span> <strong>{selected.age||selected.contactInfo?.age||"?"}</strong></div>
                      <div><span style={{color:"var(--text-tertiary)"}}>{fr?"Ville":"City"}:</span> <strong>{selected.city||"?"}</strong></div>
                      <div><span style={{color:"var(--text-tertiary)"}}>{fr?"Métier":"Job"}:</span> <strong>{selected.job||selected.contactInfo?.metier||"?"}</strong></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CHANNELS TAB (cross-channel matching) */}
            {detailTab==="channels" && (
              <div className="profile-section">
                <div className="profile-section-title">{"\u{1F517}"} {fr?"Canaux & Liens":"Channels & Links"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {/* Telegram */}
                  <div style={{padding:12,borderRadius:10,background:selected.telegramId?"rgba(0,136,204,0.08)":"var(--bg-overlay)",border:"1px solid "+(selected.telegramId?"rgba(0,136,204,0.2)":"var(--border-subtle)")}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:600}}>{"\u2708\uFE0F"} Telegram</span>
                      {selected.telegramId ? <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:"var(--brand-telegram-muted)",color:"var(--brand-telegram)",fontWeight:700}}>{"\u2705"} {fr?"Lié":"Linked"}</span>
                        : <span style={{fontSize:10,color:"var(--text-quaternary)"}}>{fr?"Non lié":"Not linked"}</span>}
                    </div>
                    {selected.telegramId && <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:4,fontFamily:"monospace"}}>ID: {selected.telegramId}</div>}
                  </div>
                  {/* WhatsApp */}
                  <div style={{padding:12,borderRadius:10,background:selected.whatsapp_phone?"rgba(37,211,102,0.08)":"var(--bg-overlay)",border:"1px solid "+(selected.whatsapp_phone?"rgba(37,211,102,0.2)":"var(--border-subtle)")}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:600}}>{"\u{1F4F1}"} WhatsApp</span>
                      {selected.whatsapp_phone ? <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:"var(--brand-whatsapp-muted)",color:"var(--brand-whatsapp)",fontWeight:700}}>{"\u2705"} {fr?"Lié":"Linked"}</span>
                        : <span style={{fontSize:10,color:"var(--text-quaternary)"}}>{fr?"Non lié":"Not linked"}</span>}
                    </div>
                    {selected.whatsapp_phone && <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:4,fontFamily:"monospace"}}>{selected.whatsapp_phone}</div>}
                  </div>
                  {/* Source */}
                  <div style={{padding:12,borderRadius:10,background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:600}}>{"\u{1F30D}"} Source</span>
                      <span style={{fontSize:10,color:"var(--text-secondary)"}}>{selected.source||"?"}</span>
                    </div>
                    {selected.last_contact_date && <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:4}}>{fr?"Dernier contact":"Last contact"}: {fmtDate(selected.last_contact_date)}</div>}
                  </div>
                </div>
                {/* Relance IA button */}
                {(selected.telegramId || selected.whatsapp_phone) && (
                  <div style={{marginTop:12}}>
                    <button onClick={()=>{addToast(fr?"Relance programmée via bot":"Re-engagement scheduled via bot","success");}} className="btn btn-primary" style={{width:"100%",fontSize:12,padding:"10px 16px"}}>
                      {"\u{1F504}"} {fr?"Relancer via":"Re-engage via"} {selected.telegramId?"TG":""}{selected.telegramId&&selected.whatsapp_phone?"/":""}{selected.whatsapp_phone?"WA":""}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Profile info */}
            {selected.txs.length > 0 && (
              <div className="profile-section">
                <div className="profile-section-title">{t(lang,"profile")}</div>
                <div className="profile-row"><span>{t(lang,"first_tx")}</span><span>{fmtDate(selected.txs[selected.txs.length-1]?.date)}</span></div>
                <div className="profile-row"><span>{t(lang,"last_activity")}</span><span>{fmtDate(selected.txs[0]?.date)}</span></div>
              </div>
            )}
          </div>
        )}
      </div>
      {editingTx && <EditTxModal tx={editingTx} lang={lang} onSave={handleSpEditSave} onCancel={() => setEditingTx(null)} saving={spSaving} models={models} profiles={profiles} />}
    </div>
  );
};

// =============================================
// MES SPENDERS TAB — Chatter + Gérant enriched cards
// =============================================
const MesSpendersTab = ({user, lang, txs, models, profiles, dbSpenders, products, productTags, onRefresh}) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const fr = lang === "fr";
  const dr = useDateRange("all");
  const [filterModel, setFilterModel] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [viewMode, setViewMode] = useState("cards");
  const [selectedSpender, setSelectedSpender] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  // ── WhatsApp Analyzer state ──
  const [waText, setWaText] = useState("");
  const [waExtracting, setWaExtracting] = useState(false);
  const [waResults, setWaResults] = useState(null); // {entries: [{spender, amount, product, date, currency, notes}], raw}
  const [waMatchedSpenders, setWaMatchedSpenders] = useState({}); // {idx: {matched: spender|null, action: "link"|"create"|null}}
  const [waTxCreating, setWaTxCreating] = useState({});
  const [waTxCreated, setWaTxCreated] = useState({});

  const classColors = {
    whale: { bg: "var(--accent-subtle)", border: "var(--accent-muted)", text: "var(--accent)", icon: "\u{1F40B}" },
    vip: { bg: "var(--warning-muted)", border: "var(--warning-muted)", text: "var(--warning)", icon: "\u2B50" },
    regular: { bg: "var(--success-muted)", border: "var(--success-muted)", text: "var(--success)", icon: "\u{1F464}" },
    lead: { bg: "var(--pink-muted)", border: "var(--pink-muted)", text: "var(--pink)", icon: "\u{1F3AF}" },
    timewaster: { bg: "var(--danger-muted)", border: "var(--danger-muted)", text: "var(--danger)", icon: "\u23F0" },
    new: { bg: "var(--border-subtle)", border: "var(--border-default)", text: "var(--text-secondary)", icon: "\u{1F195}" },
  };

  const metricBoxStyle = { padding: "6px 8px", borderRadius: 10, background: "var(--bg-overlay)", textAlign: "center" };
  const tagStyle = { padding: "2px 8px", borderRadius: 6, background: "var(--bg-overlay)", border: "1px solid var(--border-subtle)", fontSize: 10, fontWeight: 500, color: "var(--text-secondary)", display: "inline-block" };

  const timeAgo = (dateStr) => {
    if (!dateStr) return fr ? "jamais" : "never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return fr ? "maintenant" : "now";
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}j`;
  };

  // Date-filtered transactions
  const filteredTxs = useMemo(() => {
    let ft = dr.filterByDate(txs, "date");
    if (filterModel) ft = ft.filter(tx => tx.model_id === filterModel);
    return ft;
  }, [txs, dr.startDate, dr.endDate, dr.activePreset, filterModel]);

  // Build enriched spenders from DB + TX data
  const enrichedSpenders = useMemo(() => {
    const map = {};
    // Seed from DB spenders
    (dbSpenders || []).forEach(dbSp => {
      const h = dbSp.handle || dbSp.name;
      if (!h) return;
      map[h] = { ...dbSp, spender_handle: h, txs: [], classification: dbSp.classification || "new" };
    });
    // Enrich with transactions
    filteredTxs.forEach(tx => {
      const h = tx.spender_handle;
      if (!h) return;
      if (!map[h]) map[h] = { spender_handle: h, classification: "new", txs: [] };
      map[h].txs.push(tx);
    });
    // Compute stats and auto-classify
    return Object.values(map).map(sp => {
      const spTxs = sp.txs || [];
      const validTxs = spTxs.filter(tx => tx.status === "validated" || tx.status === "confirmee");
      const total = validTxs.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
      const txCount = spTxs.length;
      const avgTicket = validTxs.length > 0 ? Math.round(total / validTxs.length) : 0;
      const sortedByDate = [...spTxs].sort((a, b) => new Date(b.date) - new Date(a.date));
      const lastPurchase = sortedByDate.length > 0 ? sortedByDate[0].date : null;
      // Auto-classification if still "new" or not set
      let classification = sp.classification;
      if (!classification || classification === "new") {
        if (total >= 500) classification = "whale";
        else if (total >= 200) classification = "vip";
        else if (total > 0) classification = "regular";
        else if (txCount === 0) classification = "lead";
      }
      // Collect model_ids this spender appears in
      const modelIds = [...new Set(spTxs.map(tx => tx.model_id).filter(Boolean))];
      return {
        ...sp,
        total_spent: total,
        tx_count: txCount,
        avg_ticket: avgTicket,
        last_purchase_date: sp.last_purchase_date || lastPurchase,
        classification,
        model_ids: modelIds,
      };
    });
  }, [filteredTxs, dbSpenders, convertAmount]);

  // Filter by role: chatter sees only spenders of their assigned models
  const mySpenders = useMemo(() => {
    let list = enrichedSpenders;
    if (user.role === "chatter" && user.assigned_models && user.assigned_models.length > 0) {
      list = list.filter(sp => sp.model_ids.some(mid => user.assigned_models.includes(mid)));
    }
    // Apply classification filter
    if (filter !== "all") list = list.filter(sp => sp.classification === filter);
    // Apply search
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(sp =>
        (sp.spender_handle || "").toLowerCase().includes(q) ||
        (sp.first_name || "").toLowerCase().includes(q) ||
        (sp.city || "").toLowerCase().includes(q) ||
        (sp.telegram_username || "").toLowerCase().includes(q) ||
        (sp.job || "").toLowerCase().includes(q)
      );
    }
    // Sort by total_spent desc
    return [...list].sort((a, b) => b.total_spent - a.total_spent);
  }, [enrichedSpenders, user, filter, debouncedSearch]);

  // KPIs
  const whaleCount = mySpenders.filter(s => s.classification === "whale").length;
  const totalCA = mySpenders.reduce((s, sp) => s + sp.total_spent, 0);
  const avgTicket = mySpenders.length > 0 ? Math.round(totalCA / Math.max(mySpenders.filter(s => s.tx_count > 0).length, 1)) : 0;

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSaveSpender = async (formData) => {
    setSaving(true);
    try {
      const updates = {
        first_name: formData.first_name || null,
        age: formData.age ? parseInt(formData.age) : null,
        city: formData.city || null,
        country: formData.country || null,
        job: formData.job || null,
        telegram_username: formData.telegram_username || null,
        whatsapp_phone: formData.whatsapp_phone || null,
        classification: formData.classification || "new",
        favorite_content: formData.favorite_content || null,
        preferences: formData.preferences || null,
        personality_notes: formData.personality_notes || null,
        best_time: formData.best_time || null,
        relationship_status: formData.relationship_status || null,
        risk_level: formData.risk_level || "safe",
        chatter_notes: formData.chatter_notes || null,
        last_contact_date: formData.last_contact_date || null,
      };
      if (formData.id) {
        const { error } = await sb.from("spenders").update(updates).eq("id", formData.id);
        if (error) { addToast("Erreur: " + error.message, "error"); setSaving(false); return; }
      } else {
        const { error } = await sb.from("spenders").upsert({ handle: formData.spender_handle, name: formData.spender_handle, ...updates }, { onConflict: "handle" });
        if (error) { addToast("Erreur: " + error.message, "error"); setSaving(false); return; }
      }
      setSaving(false);
      setEditMode(false);
      addToast(fr ? "Fiche sauvegardée" : "Profile saved", "success");
      await onRefresh();
      setSelectedSpender(null);
    } catch (e) { setSaving(false); addToast("Erreur: " + e.message, "error"); }
  };

  const openDetail = (sp) => {
    setSelectedSpender(sp);
    setForm({ ...sp });
    setEditMode(false);
  };

  const spenderTxs = useMemo(() => {
    if (!selectedSpender) return [];
    return txs.filter(tx => tx.spender_handle === selectedSpender.spender_handle).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [selectedSpender, txs]);

  // ── WhatsApp Analyzer: IA extraction ──
  const waExtract = () => {
    if (!waText.trim()) return;
    setWaExtracting(true);
    try {
      const lines = waText.split("\n").map(l => l.trim()).filter(Boolean);
      const entries = [];
      // Amount patterns: $50, 50$, 50€, €50, 50 USD, 50 EUR, 50.00, 50,00
      const amountRe = /(?:[\$\u20AC\u00A3])\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:[\$\u20AC\u00A3]|(?:USD|EUR|GBP|usd|eur))/;
      const amountRe2 = /\b(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:\$|\u20AC|\u00A3|USD|EUR|dollars?|euros?)/i;
      const amountRe3 = /(?:\$|\u20AC|\u00A3)\s*(\d{1,6}(?:[.,]\d{1,2})?)/;
      // Date patterns in messages
      const msgDateRe = /\[?(\d{1,2}\/\d{1,2}\/\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]?\s*[-–]?\s*/;
      // Known product keywords from catalog
      const productNames = (products || []).map(p => p.name?.toLowerCase()).filter(Boolean);
      const tagNames = (productTags || []).map(t => t.name?.toLowerCase()).filter(Boolean);
      let currentSender = null;
      let currentDate = null;
      for (const line of lines) {
        // Try to parse message header
        const hdr = line.match(msgDateRe);
        if (hdr) {
          const rest = line.slice(hdr[0].length);
          const colonIdx = rest.indexOf(":");
          if (colonIdx > 0 && colonIdx < 60) {
            currentSender = rest.slice(0, colonIdx).replace(/^~\s*/, "").trim();
            const dateParts = hdr[1].split("/");
            if (dateParts.length === 3) {
              const p0 = parseInt(dateParts[0],10), p1 = parseInt(dateParts[1],10);
              let yr = parseInt(dateParts[2],10); if (yr < 100) yr += 2000;
              const day = p0 > 12 ? p0 : (p1 > 12 ? p1 : p0);
              const month = p0 > 12 ? p1 : (p1 > 12 ? p0 : p1);
              currentDate = `${yr}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            }
          }
        }
        // Look for amounts in this line
        let amt = null, cur = "EUR";
        const m1 = line.match(amountRe) || line.match(amountRe2) || line.match(amountRe3);
        if (m1) {
          const rawAmt = (m1[1] || m1[2] || "").replace(",", ".");
          amt = parseFloat(rawAmt);
          if (isNaN(amt) || amt <= 0 || amt > 100000) amt = null;
          if (line.match(/[\$]|USD|usd|dollars?/i)) cur = "USD";
          else if (line.match(/[\u00A3]|GBP|pounds?/i)) cur = "GBP";
        }
        if (amt) {
          // Detect product mention
          let product = null, tag = null;
          const lower = line.toLowerCase();
          for (const pn of productNames) { if (lower.includes(pn)) { product = pn; break; } }
          for (const tn of tagNames) { if (lower.includes(tn)) { tag = tn; break; } }
          entries.push({
            spender: currentSender || "?",
            amount: amt,
            currency: cur,
            product: product,
            tag: tag,
            date: currentDate || new Date().toISOString().slice(0,10),
            notes: line.slice(0, 120),
            line: line,
          });
        }
      }
      // Try matching spenders
      const matches = {};
      entries.forEach((e, idx) => {
        const name = (e.spender || "").toLowerCase().trim();
        const found = enrichedSpenders.find(sp =>
          sp.spender_handle?.toLowerCase() === name ||
          sp.first_name?.toLowerCase() === name ||
          sp.name?.toLowerCase() === name ||
          (sp.telegram_username && sp.telegram_username.toLowerCase() === name)
        );
        matches[idx] = { matched: found || null, action: found ? "link" : null };
      });
      setWaResults({ entries });
      setWaMatchedSpenders(matches);
      setWaTxCreated({});
      setWaTxCreating({});
      if (entries.length === 0) {
        addToast(fr ? "Aucune transaction d\u00E9tect\u00E9e dans le texte." : "No transactions detected in text.", "warning");
      } else {
        addToast(fr ? `${entries.length} transaction(s) d\u00E9tect\u00E9e(s) !` : `${entries.length} transaction(s) detected!`, "success");
      }
    } catch (err) {
      addToast(fr ? "Erreur d'extraction: " + err.message : "Extraction error: " + err.message, "error");
    }
    setWaExtracting(false);
  };

  // ── WhatsApp Analyzer: create TX from extracted entry ──
  const waCreateTx = async (idx, entry, matchedSp) => {
    setWaTxCreating(p => ({...p, [idx]: true}));
    try {
      const handle = matchedSp?.spender_handle || entry.spender?.replace(/^@/, "").replace(/\s+/g, "_").toLowerCase() || "unknown";
      // Upsert spender if new
      if (!matchedSp) {
        await safeUpsertSpender({ handle, name: entry.spender || handle, status: "active", last_seen: new Date().toISOString() });
      }
      // Build TX row
      const isUUID = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      const txRow = {
        date: new Date(entry.date || Date.now()).toISOString(),
        spender_handle: handle,
        amount: entry.amount,
        status: "pending",
        notes: entry.notes || null,
      };
      if (entry.currency && entry.currency !== "EUR") txRow.currency = entry.currency;
      if (entry.product) txRow.product = entry.product;
      if (entry.tag) txRow.tag = entry.tag;
      // Try to find model from user's assigned models
      if (user.assigned_models && user.assigned_models.length === 1) {
        txRow.model_id = user.assigned_models[0];
      }
      txRow.chatter_id = user.id;
      const res = await safeInsertTx(txRow);
      if (!res.error) {
        setWaTxCreated(p => ({...p, [idx]: true}));
        addToast(`${handle} \u2014 ${entry.amount}${entry.currency === "USD" ? "$" : "\u20AC"} \u2713`, "success");
        await onRefresh();
      } else {
        addToast("Erreur: " + res.error.message, "error");
      }
    } catch (e) {
      addToast("Erreur: " + e.message, "error");
    }
    setWaTxCreating(p => ({...p, [idx]: false}));
  };

  // ── WhatsApp Analyzer: create all TX at once ──
  const waCreateAll = async () => {
    if (!waResults?.entries) return;
    for (let i = 0; i < waResults.entries.length; i++) {
      if (waTxCreated[i]) continue;
      const e = waResults.entries[i];
      const m = waMatchedSpenders[i]?.matched;
      await waCreateTx(i, e, m);
    }
  };

  // ── RENDER ──
  return (
    <div>
      {/* GlobalFilterBar */}
      <GlobalFilterBar lang={lang} dr={dr} models={models} profiles={null}
        model={filterModel} setModel={setFilterModel} showModelFilter />

      {/* Header + View Toggle */}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{"\u{1F4B0}"} {fr ? "Mes Spenders" : "My Spenders"}</h2>
          <p style={{ color: "var(--text-tertiary)", fontSize: 11, margin: "3px 0 0", fontStyle: "italic" }}>
            {fr ? "Connais ton client, close ta vente" : "Know your client, close the deal"}
          </p>
        </div>
        <div style={{display:"flex",gap:0,borderRadius:14,border:"1px solid var(--border-default)",overflow:"hidden"}}>
          <button onClick={()=>setViewMode("cards")} style={{padding:"7px 14px",border:"none",background:viewMode==="cards"?"var(--accent-muted)":"transparent",color:viewMode==="cards"?"var(--accent)":"var(--text-tertiary)",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{"\u{1F4CB}"} Cards</button>
          <button onClick={()=>setViewMode("table")} style={{padding:"7px 14px",border:"none",background:viewMode==="table"?"var(--accent-muted)":"transparent",color:viewMode==="table"?"var(--accent)":"var(--text-tertiary)",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{"\u{1F4CA}"} Table</button>
          <button onClick={()=>setViewMode("analyzer")} style={{padding:"7px 14px",border:"none",background:viewMode==="analyzer"?"var(--accent-muted)":"transparent",color:viewMode==="analyzer"?"var(--accent)":"var(--text-tertiary)",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{"\u{1F4F1}"} WA Analyzer</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{"\u{1F465}"} {fr ? "Mes Spenders" : "My Spenders"}</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{mySpenders.length}</div>
        </div>
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{"\u{1F40B}"} Whales</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)" }}>{whaleCount}</div>
        </div>
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{"\u{1F4B0}"} CA Total</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--success)" }}>{totalCA.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{currencySymbol}</div>
        </div>
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{"\u{1F451}"} Top Spender</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--warning)", overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{mySpenders[0]?`@${mySpenders[0].spender_handle}`:"\u2014"}</div>
          {mySpenders[0] && <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{(mySpenders[0].total_spent||0).toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</div>}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {[
          { key: "all", label: fr ? "Tous" : "All", icon: "\u{1F465}" },
          { key: "whale", label: "Whale", icon: "\u{1F40B}", color: "var(--accent)" },
          { key: "vip", label: "VIP", icon: "\u2B50", color: "var(--warning)" },
          { key: "regular", label: "Regular", icon: "\u{1F464}", color: "var(--success)" },
          { key: "lead", label: "Lead", icon: "\u{1F3AF}", color: "var(--pink)" },
          { key: "timewaster", label: "Timewaster", icon: "\u23F0", color: "var(--danger)" },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: "6px 14px", borderRadius: 12,
            border: filter === f.key ? `1px solid ${(f.color || "var(--text-quaternary)")}66` : "1px solid var(--border-default)",
            background: filter === f.key ? `${(f.color || "var(--text-quaternary)")}20` : "transparent",
            color: filter === f.key ? (f.color || "var(--text-primary)") : "var(--text-tertiary)",
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder={fr ? "\u{1F50D} Chercher par nom, pseudo, ville..." : "\u{1F50D} Search by name, handle, city..."}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%", padding: "10px 16px", borderRadius: 14,
          border: "1px solid var(--border-default)", background: "var(--card-bg)",
          color: "var(--text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          outline: "none", marginBottom: 20, boxSizing: "border-box",
        }}
      />

      {/* Grid of cards */}
      {viewMode === "cards" && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {mySpenders.map(sp => {
          const c = classColors[sp.classification] || classColors.new;
          const lastActivity = sp.last_purchase_date ? timeAgo(sp.last_purchase_date) : sp.last_contact_date ? timeAgo(sp.last_contact_date) : (fr ? "jamais" : "never");
          const isInactive = sp.classification === "whale" && sp.last_purchase_date && (Date.now() - new Date(sp.last_purchase_date)) > 7 * 86400000;
          return (
            <div key={sp.spender_handle} onClick={() => openDetail(sp)} style={{
              background: "var(--card-bg)", border: `1px solid ${isInactive ? "var(--danger-muted)" : "var(--border-subtle)"}`,
              borderRadius: 14, padding: 20, cursor: "pointer", transition: "all 0.2s", position: "relative", overflow: "hidden",
            }}>
              {/* Inactive whale alert */}
              {isInactive && (
                <div style={{ position: "absolute", top: 0, right: 0, padding: "3px 10px", borderRadius: "0 14px 0 10px",
                  background: "var(--danger-muted)", fontSize: 9, fontWeight: 700, color: "var(--danger)" }}>
                  {"\u26A0\uFE0F"} INACTIF {Math.floor((Date.now() - new Date(sp.last_purchase_date)) / 86400000)}j
                </div>
              )}
              {/* Row 1: Avatar + Name + Classification + Channel badges */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14, background: c.bg, border: `1px solid ${c.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800,
                  color: c.text,
                }}>
                  {sp.first_name?.[0]?.toUpperCase() || sp.spender_handle?.[0]?.toUpperCase() || "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{sp.spender_handle}</span>
                    {sp.telegram_id && <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--accent-muted)",color:"var(--accent)",fontWeight:700}}>TG</span>}
                    {sp.whatsapp_phone && <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--success-muted)",color:"var(--success)",fontWeight:700}}>WA</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {sp.first_name || "?"} {"\u00B7"} {sp.age ? sp.age + " ans" : "?"} {"\u00B7"} {sp.city || "?"}
                  </div>
                </div>
                <span style={{
                  padding: "3px 10px", borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`,
                  color: c.text, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                }}>
                  {c.icon} {(sp.classification || "new").toUpperCase()}
                </span>
              </div>
              {/* Row 2: Quick metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 9, color: "var(--text-quaternary)", textTransform: "uppercase", letterSpacing: 0.5 }}>LTV</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--success)" }}>{(sp.total_spent || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{currencySymbol}</div>
                </div>
                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 9, color: "var(--text-quaternary)", textTransform: "uppercase", letterSpacing: 0.5 }}>TX</div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{sp.tx_count || 0}</div>
                </div>
                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 9, color: "var(--text-quaternary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{fr ? "Dernier" : "Last"}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isInactive ? "var(--danger)" : "var(--text-secondary)" }}>{lastActivity}</div>
                </div>
              </div>
              {/* Row 3: Info tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                {sp.job && <span style={tagStyle}>{"\u{1F4BC}"} {sp.job}</span>}
                {sp.favorite_content && <span style={tagStyle}>{"\u2764\uFE0F"} {sp.favorite_content}</span>}
                {sp.best_time && <span style={tagStyle}>{"\u{1F550}"} {sp.best_time}</span>}
                {sp.relationship_status && sp.relationship_status !== "inconnu" && <span style={tagStyle}>{"\u{1F48D}"} {sp.relationship_status}</span>}
                {sp.source === "telegram_scan" && <span style={{ ...tagStyle, background: "var(--accent-subtle)", color: "var(--accent)" }}>{"\u{1F4E1}"} TG Scan</span>}
              </div>
              {/* Row 4: Notes preview */}
              {(sp.personality_notes || sp.chatter_notes) && (
                <div style={{
                  padding: "8px 12px", borderRadius: 10, background: "var(--bg-overlay)",
                  border: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-tertiary)",
                  fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {"\u{1F4A1}"} {sp.personality_notes || sp.chatter_notes}
                </div>
              )}
              {/* Row 5: Quick actions */}
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                {sp.telegram_username && /^[a-zA-Z0-9_]+$/.test(sp.telegram_username) && (
                  <a href={`https://t.me/${encodeURIComponent(sp.telegram_username)}`} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ padding: "5px 12px", borderRadius: 10, background: "var(--accent-muted)",
                      border: "1px solid var(--border-accent)", color: "var(--accent)", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>
                    {"\u2708\uFE0F"} Telegram
                  </a>
                )}
                <button onClick={(e) => { e.stopPropagation(); openDetail(sp); }} style={{
                  padding: "5px 12px", borderRadius: 10, background: "var(--warning-muted)",
                  border: "1px solid var(--warning-muted)", color: "var(--warning)", fontSize: 10, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  {"\u270F\uFE0F"} {fr ? "\u00C9diter" : "Edit"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Table view */}
      {viewMode === "table" && (
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-overlay)", borderBottom: "1px solid var(--border-subtle)" }}>
              {["Handle","Classification","Canaux","TX","CA total",fr?"Dernier achat":"Last purchase",fr?"Panier moy.":"Avg ticket",fr?"Modèle(s)":"Model(s)"].map((h,i) => (
                <th key={i} style={{ padding: "10px 14px", textAlign: i >= 3 && i <= 6 ? "right" : "left", fontSize: 10, fontWeight: 700, color: "var(--text-quaternary)", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mySpenders.map((sp, idx) => {
              const c = classColors[sp.classification] || classColors.new;
              const lastDate = sp.last_purchase_date ? new Date(sp.last_purchase_date).toLocaleDateString("fr-FR") : "\u2014";
              const modelNames = (sp.model_ids || []).map(mid => models.find(m => m.id === mid)?.name || "?").join(", ");
              return (
                <tr key={sp.spender_handle} onClick={() => openDetail(sp)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer", background: idx % 2 === 0 ? "transparent" : "var(--bg-overlay)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>@{sp.spender_handle}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 6, background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: 10, fontWeight: 700 }}>
                      {c.icon} {(sp.classification || "new").toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {sp.telegram_id && <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--accent-muted)",color:"var(--accent)",fontWeight:700}}>TG</span>}
                      {sp.whatsapp_phone && <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--success-muted)",color:"var(--success)",fontWeight:700}}>WA</span>}
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{sp.tx_count || 0}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 800, color: "var(--success)" }}>{(sp.total_spent || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{currencySymbol}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 12 }}>{lastDate}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{(sp.avg_ticket || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{currencySymbol}</td>
                  <td style={{ padding: "10px 14px", fontSize: 11, color: "var(--text-secondary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{modelNames || "\u2014"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* ══ WhatsApp Analyzer View ══ */}
      {viewMode === "analyzer" && (
      <div>
        {/* Step 1: Paste conversation */}
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>{"\u{1F4F1}"}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{fr ? "Analyseur WhatsApp" : "WhatsApp Analyzer"}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fr ? "Colle une conversation WhatsApp pour extraire automatiquement les transactions" : "Paste a WhatsApp conversation to auto-extract transactions"}</div>
            </div>
          </div>
          <textarea
            value={waText}
            onChange={e => setWaText(e.target.value)}
            placeholder={fr
              ? "Colle ici l'export WhatsApp ou le texte d'une conversation...\n\nExemple:\n21/02/2024, 14:30 - John: Je veux acheter le custom video pour 50$\n21/02/2024, 14:32 - Moi: Ok je t'envoie \u00E7a !\n21/02/2024, 14:35 - John: $50 envoy\u00E9"
              : "Paste the WhatsApp export or conversation text here...\n\nExample:\n02/21/2024, 2:30 PM - John: I want to buy the custom video for $50\n02/21/2024, 2:32 PM - Me: Ok sending!\n02/21/2024, 2:35 PM - John: $50 sent"}
            style={{
              width: "100%", minHeight: 160, padding: 14, borderRadius: 12,
              background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
              color: "var(--text-primary)", fontSize: 12, fontFamily: "monospace",
              resize: "vertical", outline: "none", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
            <button onClick={waExtract} disabled={waExtracting || !waText.trim()} style={{
              padding: "10px 24px", borderRadius: 12, background: "var(--accent-muted)",
              border: "1px solid var(--border-accent)", color: "var(--accent)",
              fontSize: 13, fontWeight: 700, cursor: waExtracting ? "wait" : "pointer",
              fontFamily: "'DM Sans',sans-serif", opacity: !waText.trim() ? 0.5 : 1,
            }}>
              {waExtracting ? "\u23F3" : "\u{1F9E0}"} {fr ? "Extraire les TX" : "Extract TXs"}
            </button>
            {waText.trim() && (
              <button onClick={() => { setWaText(""); setWaResults(null); setWaMatchedSpenders({}); setWaTxCreated({}); }} style={{
                padding: "10px 16px", borderRadius: 12, background: "transparent",
                border: "1px solid var(--border-default)", color: "var(--text-tertiary)",
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              }}>
                {fr ? "Effacer" : "Clear"}
              </button>
            )}
            <span style={{ fontSize: 11, color: "var(--text-quaternary)", marginLeft: "auto" }}>
              {fr ? "Supporte les formats EU et US" : "Supports EU and US formats"}
            </span>
          </div>
        </div>

        {/* Step 2: Results */}
        {waResults && waResults.entries.length > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>
              {"\u{1F4B8}"} {waResults.entries.length} transaction{waResults.entries.length > 1 ? "s" : ""} {fr ? "d\u00E9tect\u00E9e(s)" : "detected"}
            </div>
            <button onClick={waCreateAll} disabled={Object.keys(waTxCreated).length === waResults.entries.length} style={{
              padding: "8px 18px", borderRadius: 10, background: "var(--success-muted)",
              border: "1px solid var(--success-muted)", color: "var(--success)",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            }}>
              {"\u26A1"} {fr ? "Cr\u00E9er toutes les TX" : "Create all TXs"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {waResults.entries.map((e, idx) => {
              const match = waMatchedSpenders[idx];
              const isCreated = waTxCreated[idx];
              const isCreating = waTxCreating[idx];
              const c = match?.matched ? classColors[match.matched.classification] || classColors.regular : classColors.new;
              return (
                <div key={idx} style={{
                  padding: 16, borderRadius: 12, border: `1px solid ${isCreated ? "var(--success-muted)" : "var(--border-subtle)"}`,
                  background: isCreated ? "var(--success-muted)" : "var(--bg-overlay)", opacity: isCreated ? 0.7 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    {/* Left: spender + match info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800 }}>@{e.spender}</span>
                        {match?.matched ? (
                          <span style={{ padding: "2px 8px", borderRadius: 6, background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: 9, fontWeight: 700 }}>
                            {"\u2705"} {fr ? "Match\u00E9" : "Matched"}: @{match.matched.spender_handle}
                          </span>
                        ) : (
                          <span style={{ padding: "2px 8px", borderRadius: 6, background: "var(--warning-muted)", color: "var(--warning)", fontSize: 9, fontWeight: 700 }}>
                            {"\u{1F195}"} {fr ? "Nouveau spender" : "New spender"}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: "var(--success)" }}>
                          {e.amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}{e.currency === "USD" ? "$" : "\u20AC"}
                        </span>
                        {e.product && <span style={{ padding: "2px 8px", borderRadius: 6, background: "var(--accent-subtle)", color: "var(--accent)", fontSize: 10, fontWeight: 600 }}>{e.product}</span>}
                        {e.tag && <span style={{ padding: "2px 8px", borderRadius: 6, background: "var(--pink-muted)", color: "var(--pink)", fontSize: 10, fontWeight: 600 }}>{e.tag}</span>}
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{e.date}</span>
                      </div>
                      {e.notes && <div style={{ fontSize: 10, color: "var(--text-quaternary)", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>{"\u{1F4AC}"} {e.notes}</div>}
                    </div>
                    {/* Right: action button */}
                    <div style={{ flexShrink: 0 }}>
                      {isCreated ? (
                        <span style={{ padding: "8px 16px", borderRadius: 10, background: "var(--success-muted)", color: "var(--success)", fontSize: 12, fontWeight: 700 }}>
                          {"\u2705"} {fr ? "Cr\u00E9\u00E9e" : "Created"}
                        </span>
                      ) : (
                        <button onClick={() => waCreateTx(idx, e, match?.matched)} disabled={isCreating} style={{
                          padding: "8px 16px", borderRadius: 10, background: "var(--accent-muted)",
                          border: "1px solid var(--border-accent)", color: "var(--accent)",
                          fontSize: 12, fontWeight: 700, cursor: isCreating ? "wait" : "pointer",
                          fontFamily: "'DM Sans',sans-serif",
                        }}>
                          {isCreating ? "\u23F3" : "\u{1F4BE}"} {fr ? "Cr\u00E9er TX" : "Create TX"}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Spender matching section for new spenders */}
                  {!match?.matched && !isCreated && (
                    <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "var(--bg-overlay)", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 6 }}>{fr ? "Chercher un spender existant :" : "Search existing spender:"}</div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {enrichedSpenders.filter(sp => {
                          const q = (e.spender || "").toLowerCase();
                          return q.length >= 2 && (
                            sp.spender_handle?.toLowerCase().includes(q) ||
                            sp.first_name?.toLowerCase().includes(q) ||
                            sp.name?.toLowerCase().includes(q)
                          );
                        }).slice(0, 5).map(sp => (
                          <button key={sp.spender_handle} onClick={() => {
                            setWaMatchedSpenders(prev => ({...prev, [idx]: { matched: sp, action: "link" }}));
                          }} style={{
                            padding: "3px 10px", borderRadius: 8, background: "var(--accent-subtle)",
                            border: "1px solid var(--accent-muted)", color: "var(--accent)",
                            fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                          }}>
                            @{sp.spender_handle}
                          </button>
                        ))}
                        {enrichedSpenders.filter(sp => {
                          const q = (e.spender || "").toLowerCase();
                          return q.length >= 2 && (sp.spender_handle?.toLowerCase().includes(q) || sp.first_name?.toLowerCase().includes(q));
                        }).length === 0 && (
                          <span style={{ fontSize: 10, color: "var(--text-quaternary)", fontStyle: "italic" }}>
                            {fr ? "Aucun match \u2014 un nouveau spender sera cr\u00E9\u00E9" : "No match \u2014 a new spender will be created"}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* No results state */}
        {waResults && waResults.entries.length === 0 && (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 14, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{"\u{1F50D}"}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
              {fr ? "Aucune transaction d\u00E9tect\u00E9e" : "No transactions detected"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-quaternary)" }}>
              {fr ? "V\u00E9rifie que le texte contient des montants ($, \u20AC, USD, EUR...)" : "Check that the text contains amounts ($, \u20AC, USD, EUR...)"}
            </div>
          </div>
        )}
      </div>
      )}

      {mySpenders.length === 0 && viewMode !== "analyzer" && (
        <div style={{ textAlign: "center", color: "var(--text-quaternary)", padding: 60, fontSize: 14 }}>
          {fr ? "Aucun spender trouv\u00E9" : "No spenders found"}
        </div>
      )}

      {/* ── DETAIL MODAL ── */}
      {selectedSpender && (
        <div style={{ position: "fixed", inset: 0, background: "var(--modal-backdrop)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5000 }} onClick={() => setSelectedSpender(null)}>
          <div style={{
            width: 620, maxHeight: "90vh", overflowY: "auto", background: "var(--bg-raised)",
            border: "1px solid var(--border-default)", borderRadius: 24,
            boxShadow: "var(--shadow-lg)",
          }} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 16,
                  background: (classColors[selectedSpender.classification] || classColors.new).bg,
                  border: `1px solid ${(classColors[selectedSpender.classification] || classColors.new).border}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800,
                  color: (classColors[selectedSpender.classification] || classColors.new).text,
                }}>
                  {selectedSpender.first_name?.[0]?.toUpperCase() || selectedSpender.spender_handle?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>@{selectedSpender.spender_handle}</h2>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {selectedSpender.first_name || "?"} {"\u00B7"} {(classColors[selectedSpender.classification] || classColors.new).icon} {(selectedSpender.classification || "new").toUpperCase()}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditMode(!editMode)} style={{
                  padding: "6px 14px", borderRadius: 12, background: editMode ? "var(--success-muted)" : "var(--warning-muted)",
                  border: `1px solid ${editMode ? "var(--success-muted)" : "var(--warning-muted)"}`,
                  color: editMode ? "var(--success)" : "var(--warning)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                }}>
                  {editMode ? (fr ? "\u{1F441}\uFE0F Voir" : "\u{1F441}\uFE0F View") : (fr ? "\u270F\uFE0F \u00C9diter" : "\u270F\uFE0F Edit")}
                </button>
                <button onClick={() => setSelectedSpender(null)} style={{
                  width: 32, height: 32, borderRadius: 10, background: "var(--bg-overlay)",
                  border: "1px solid var(--border-default)", color: "var(--text-tertiary)",
                  fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {"\u2715"}
                </button>
              </div>
            </div>

            <div style={{ padding: "20px 28px" }}>
              {/* Section 1: Personal Info */}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>{"\u{1F464}"} {fr ? "Infos Personnelles" : "Personal Info"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  { label: fr ? "Pr\u00E9nom" : "First name", field: "first_name", type: "text" },
                  { label: fr ? "\u00C2ge" : "Age", field: "age", type: "number" },
                  { label: fr ? "Ville" : "City", field: "city", type: "text" },
                  { label: fr ? "Pays" : "Country", field: "country", type: "text" },
                  { label: fr ? "M\u00E9tier" : "Job", field: "job", type: "text" },
                  { label: "Statut", field: "relationship_status", type: "select", options: ["inconnu", "c\u00E9libataire", "en couple", "mari\u00E9"] },
                ].map(f => (
                  <div key={f.field}>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</div>
                    {editMode ? (
                      f.type === "select" ? (
                        <select value={form[f.field] || ""} onChange={e => updateForm(f.field, e.target.value)} style={{
                          width: "100%", padding: "8px 12px", borderRadius: 10,
                          border: "1px solid var(--border-default)", background: "var(--bg-overlay)",
                          color: "var(--text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
                        }}>
                          <option value="">—</option>
                          {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input type={f.type} value={form[f.field] || ""} onChange={e => updateForm(f.field, e.target.value)} style={{
                          width: "100%", padding: "8px 12px", borderRadius: 10,
                          border: "1px solid var(--border-default)", background: "var(--bg-overlay)",
                          color: "var(--text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
                        }} />
                      )
                    ) : (
                      <div style={{ fontSize: 14, fontWeight: 600, padding: "8px 0" }}>{form[f.field] || "—"}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Section 2: Buying Behavior */}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>{"\u{1F4B0}"} {fr ? "Comportement d'achat" : "Buying Behavior"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "LTV", value: (selectedSpender.total_spent || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + currencySymbol, color: "var(--success)" },
                  { label: "Transactions", value: selectedSpender.tx_count || 0 },
                  { label: fr ? "Panier moyen" : "Avg ticket", value: selectedSpender.avg_ticket ? selectedSpender.avg_ticket.toLocaleString() + currencySymbol : "\u2014" },
                ].map((m) => (
                  <div key={m.label} style={{ padding: "10px 12px", borderRadius: 12, background: "var(--bg-overlay)", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "var(--text-quaternary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: m.color || "var(--text-primary)", marginTop: 4 }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{fr ? "Contenu favori" : "Favorite content"}</div>
                  {editMode ? (
                    <select value={form.favorite_content || ""} onChange={e => updateForm("favorite_content", e.target.value)} style={{
                      width: "100%", padding: "8px 12px", borderRadius: 10,
                      border: "1px solid var(--border-default)", background: "var(--bg-overlay)",
                      color: "var(--text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
                    }}>
                      <option value="">—</option>
                      {["cam", "pack_photo", "video", "sexting", "custom", "dick_rating", "tribute"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, padding: "8px 0" }}>{form.favorite_content || "\u2014"}</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{fr ? "Meilleur moment" : "Best time"}</div>
                  {editMode ? (
                    <input value={form.best_time || ""} onChange={e => updateForm("best_time", e.target.value)} placeholder="ex: soir 21h-23h" style={{
                      width: "100%", padding: "8px 12px", borderRadius: 10,
                      border: "1px solid var(--border-default)", background: "var(--bg-overlay)",
                      color: "var(--text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
                    }} />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, padding: "8px 0" }}>{form.best_time || "\u2014"}</div>
                  )}
                </div>
              </div>

              {/* Section 3: Intelligence */}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>{"\u{1F9E0}"} {fr ? "Intelligence Chatter" : "Chatter Intelligence"}</div>
              <div style={{ marginBottom: 20 }}>
                {[
                  { label: fr ? "Personnalit\u00E9 / Comment lui parler" : "Personality / How to talk", field: "personality_notes", placeholder: fr ? "Ex: timide au d\u00E9but, aime le GFE, r\u00E9pond tard le soir..." : "Ex: shy at first, likes GFE..." },
                  { label: fr ? "Pr\u00E9f\u00E9rences / Kinks" : "Preferences / Kinks", field: "preferences", placeholder: fr ? "Ex: pieds, lingerie noire, vid\u00E9os POV..." : "Ex: feet, black lingerie, POV videos..." },
                  { label: fr ? "Notes priv\u00E9es" : "Private notes", field: "chatter_notes", placeholder: fr ? "Notes libres pour toi..." : "Free notes for you..." },
                ].map(f => (
                  <div key={f.field} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</div>
                    {editMode ? (
                      <textarea value={form[f.field] || ""} onChange={e => updateForm(f.field, e.target.value)} placeholder={f.placeholder} rows={3} style={{
                        width: "100%", padding: "8px 12px", borderRadius: 10,
                        border: "1px solid var(--border-default)", background: "var(--bg-overlay)",
                        color: "var(--text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
                        resize: "vertical", boxSizing: "border-box",
                      }} />
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic", padding: "6px 0", lineHeight: 1.5 }}>
                        {form[f.field] || "\u2014"}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Section 4: Classification */}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>{"\u{1F4CA}"} Classification</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
                {["whale", "vip", "regular", "lead", "timewaster"].map(cls => (
                  <button key={cls} onClick={() => editMode && updateForm("classification", cls)} style={{
                    padding: "7px 16px", borderRadius: 12,
                    border: form.classification === cls ? `2px solid ${classColors[cls].border}` : "1px solid var(--border-subtle)",
                    background: form.classification === cls ? classColors[cls].bg : "transparent",
                    color: form.classification === cls ? classColors[cls].text : "var(--text-quaternary)",
                    fontSize: 11, fontWeight: 700, cursor: editMode ? "pointer" : "default",
                    opacity: editMode ? 1 : 0.7, fontFamily: "'DM Sans', sans-serif",
                  }}>
                    {classColors[cls].icon} {cls.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Section 5: Risk Level */}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>{"\u26A0\uFE0F"} {fr ? "Niveau de risque" : "Risk Level"}</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
                {[
                  { key: "safe", label: "Safe \u2705", color: "var(--success)" },
                  { key: "caution", label: "Attention \u26A0\uFE0F", color: "var(--warning)" },
                  { key: "blocked", label: fr ? "Bloqu\u00E9 \u{1F6AB}" : "Blocked \u{1F6AB}", color: "var(--danger)" },
                ].map(r => (
                  <button key={r.key} onClick={() => editMode && updateForm("risk_level", r.key)} style={{
                    padding: "7px 16px", borderRadius: 12,
                    border: form.risk_level === r.key ? `2px solid ${r.color}` : "1px solid var(--border-subtle)",
                    background: form.risk_level === r.key ? `${r.color}20` : "transparent",
                    color: form.risk_level === r.key ? r.color : "var(--text-quaternary)",
                    fontSize: 11, fontWeight: 700, cursor: editMode ? "pointer" : "default",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Section 6: Contact Info */}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>{"\u{1F4DE}"} Contact</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Telegram</div>
                  {editMode ? (
                    <input value={form.telegram_username || ""} onChange={e => updateForm("telegram_username", e.target.value)} placeholder="@username" style={{
                      width: "100%", padding: "8px 12px", borderRadius: 10,
                      border: "1px solid var(--border-default)", background: "var(--bg-overlay)",
                      color: "var(--text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
                    }} />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, padding: "8px 0" }}>
                      {form.telegram_username ? (
                        <a href={/^[a-zA-Z0-9_]+$/.test(form.telegram_username)?`https://t.me/${encodeURIComponent(form.telegram_username)}`:"#"} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>@{form.telegram_username}</a>
                      ) : "\u2014"}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>WhatsApp</div>
                  {editMode ? (
                    <input value={form.whatsapp_phone || ""} onChange={e => updateForm("whatsapp_phone", e.target.value)} placeholder="+33..." style={{
                      width: "100%", padding: "8px 12px", borderRadius: 10,
                      border: "1px solid var(--border-default)", background: "var(--bg-overlay)",
                      color: "var(--text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
                    }} />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, padding: "8px 0" }}>{form.whatsapp_phone || "\u2014"}</div>
                  )}
                </div>
              </div>

              {/* Section 7: TX History */}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>{"\u{1F4CB}"} Transactions ({spenderTxs.length})</div>
              <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 20 }}>
                {spenderTxs.length === 0 && <div style={{ color: "var(--text-quaternary)", fontSize: 12, textAlign: "center", padding: 20 }}>{fr ? "Aucune transaction" : "No transactions"}</div>}
                {spenderTxs.slice(0, 15).map(tx => (
                  <div key={tx.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)",
                  }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 70 }}>{fmtDate(tx.date)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{fmtAmount(tx.amount, tx.currency)}</span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{tx.product || tx.tag || "\u2014"}</span>
                    <StatusPill status={tx.status} lang={lang} />
                  </div>
                ))}
                {spenderTxs.length > 15 && <div style={{ fontSize: 10, color: "var(--text-quaternary)", textAlign: "center", marginTop: 4 }}>+{spenderTxs.length - 15} {fr ? "autres" : "more"}</div>}
              </div>

              {/* Save button */}
              {editMode && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
                  <button onClick={() => { setEditMode(false); setForm({ ...selectedSpender }); }} style={{
                    padding: "8px 20px", borderRadius: 12, background: "var(--bg-overlay)",
                    border: "1px solid var(--border-default)", color: "var(--text-secondary)",
                    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  }}>{fr ? "Annuler" : "Cancel"}</button>
                  <button onClick={() => handleSaveSpender(form)} disabled={saving} style={{
                    padding: "8px 20px", borderRadius: 12, background: "var(--accent-muted)",
                    border: "1px solid var(--border-accent)", color: "var(--accent)",
                    fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif",
                  }}>{saving ? "..." : (fr ? "\u{1F4BE} Sauvegarder" : "\u{1F4BE} Save")}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

module.exports = { SpendersTab, MesSpendersTab };
