// =============================================
// SPENDERS TAB (v2 — with chatter/provider breakdowns + cross-page nav)
// =============================================
const SpendersTab = React.memo(({user, lang, txs, models, profiles, dbSpenders, selectedSpenderKey, setSelectedSpenderKey, onRefresh, onNotify}) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const fr = lang === "fr";
  const dr = useDateRange("all");
  const [sortBy, setSortBy] = useState("ltv");
  const [filterModel, setFilterModel] = useState("");
  const [selected, setSelected] = useState(null);
  const [spPage, setSpPage] = useState(0);
  const [detailModel, setDetailModel] = useState("");
  const [detailTab, setDetailTab] = useState("models");
  const [editingTx, setEditingTx] = useState(null);
  const [spSaving, setSpSaving] = useState(false);
  const [processingSpTxId, setProcessingSpTxId] = useState(null);
  const [confirmRefuse, setConfirmRefuse] = useState(null);
  const handleSpStatus = async (txId, newStatus) => {
    setProcessingSpTxId(txId);
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
    } catch(e) { addToast("Erreur: " + e.message, "error"); } finally { setProcessingSpTxId(null); }
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
      try { contactInfo = typeof dbSp.contact_info === "string" ? JSON.parse(dbSp.contact_info) : (dbSp.contact_info || {}); } catch(e) { /* malformed JSON in contact_info — use empty object */ }
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

  // Reset page on filter/sort change
  const spSortedLen = sorted.length;
  useEffect(() => { setSpPage(0); }, [spSortedLen, sortBy, filterModel]);

  const spTotalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));
  const pagedSpenders = sorted.slice(spPage * ROWS_PER_PAGE, (spPage + 1) * ROWS_PER_PAGE);

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
          {pagedSpenders.map(s=>(
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
          <PaginationBar page={spPage} totalPages={spTotalPages} totalItems={sorted.length} lang={lang} onPageChange={setSpPage}/>
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
                {selected.txs.length === 0 ? <EmptyState icon="💸" text="Aucune transaction"/> :
                <div className="table-wrap">
                  <table className="table" style={{fontSize:10}}>
                    <thead><tr><th>Date</th><th>{t(lang,"amount")}</th><th>{fr?"Produit":"Product"}</th><th>Tag</th><th>{fr?"Modele":"Model"}</th><th>Chatter</th><th>Provider</th><th>{t(lang,"status")}</th><th>{t(lang,"actions")}</th></tr></thead>
                    <tbody>
                      {selected.txs.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,20).map((tx,idx)=>{
                        const mName = models.find(m=>m.id===tx.model_id)?.name||"?";
                        const cName = profiles.find(p=>p.id===tx.chatter_id)?.name||"?";
                        const pName = profiles.find(p=>p.id===tx.provider_id)?.name||"?";
                        const canEdit = tx.status==="pending"&&(user.role==="gerant"||user.role==="chatter"||(user.role==="provider"&&tx.provider_id===user.id));
                        return (
                          <tr key={idx}>
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
                                <><button className="btn btn-success btn-small" style={{fontSize:9}} onClick={()=>handleSpStatus(tx.id,"validated")} disabled={!!processingSpTxId}>{processingSpTxId===tx.id?<><BtnSpinner/>{" "}</>:t(lang,"validate")}</button>{" "}<button className="btn btn-danger btn-small" style={{fontSize:9}} onClick={()=>setConfirmRefuse(tx.id)} disabled={!!processingSpTxId}>{t(lang,"refuse")}</button></>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {selected.cnt>20 && <div style={{fontSize:10,color:"var(--text2)",textAlign:"center",marginTop:4}}>+{selected.cnt-20} {fr?"autres":"more"}</div>}
                </div>}
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
      <ConfirmDialog open={!!confirmRefuse} icon={"\u26A0\uFE0F"} title={fr?"Refuser cette transaction ?":"Refuse this transaction?"} message={fr?"Cette action est irréversible. La transaction sera marquée comme refusée.":"This action is irreversible. The transaction will be marked as refused."} confirmLabel={fr?"Refuser":"Refuse"} cancelLabel={fr?"Annuler":"Cancel"} danger onConfirm={()=>{handleSpStatus(confirmRefuse,"refused");setConfirmRefuse(null);}} onCancel={()=>setConfirmRefuse(null)}/>
    </div>
  );
});

module.exports.default = SpendersTab;
