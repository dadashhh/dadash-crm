// =============================================
// MODELES TAB (gerant only) — Gamified + Expenses
// =============================================
const EXPENSE_CATS = [
  {id:"contenu",label:"Contenu",icon:"📸"},
  {id:"marketing",label:"Marketing",icon:"📢"},
  {id:"logiciel",label:"Logiciel",icon:"💻"},
  {id:"materiel",label:"Matériel",icon:"🔧"},
  {id:"autre",label:"Autre",icon:"📦"},
];

const ModelesTab = React.memo(({user, lang, txs, models, profiles, expenses, onRefresh, onNotify}) => {
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
  const [confirmRefuse, setConfirmRefuse] = useState(null);
  const modelSort = useSortable("ca","desc");
  const expSort = useSortable("date","desc");
  const [expPage, setExpPage] = useState(0);
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

  const { globalCA, globalExp, globalBenef, globalMargin, totalTxCount, globalAvgTicket } = useMemo(() => {
    const gCA = modelStats.reduce((s,m)=>s+m.ca,0);
    const gExp = modelStats.reduce((s,m)=>s+m.totalExp,0) + (expenses||[]).filter(e=>!e.model_id).reduce((s,e)=>s+convertAmount(Number(e.amount),e.currency),0);
    const gBenef = gCA - gExp;
    const validCount = modelStats.reduce((s,m)=>s+m.validatedCount,0);
    return {
      globalCA: gCA, globalExp: gExp, globalBenef: gBenef,
      globalMargin: gCA>0?Math.round((gBenef/gCA)*100):0,
      totalTxCount: modelStats.reduce((s,m)=>s+m.txCount,0),
      globalAvgTicket: validCount>0?Math.round(gCA/validCount):0,
    };
  }, [modelStats, expenses, convertAmount]);

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
    if(!isValidAmount(expForm.amount)) { addToast(fr?"Montant invalide":"Invalid amount","error"); return; }
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
          {modelStats.length === 0 ? <EmptyState icon="👩" text="Aucun modèle"/> :
          <div className="table-wrap">
            <table className="table">
              <thead><tr><SortTh label={t(lang,"model")} sortKey="name" sort={modelSort.sort} onSort={modelSort.onSort}/><SortTh label="CA" sortKey="ca" sort={modelSort.sort} onSort={modelSort.onSort}/><SortTh label={fr?"Dépenses":"Expenses"} sortKey="totalExp" sort={modelSort.sort} onSort={modelSort.onSort}/><SortTh label={fr?"Bénéf":"Profit"} sortKey="benefice" sort={modelSort.sort} onSort={modelSort.onSort}/><SortTh label="Marge" sortKey="margin" sort={modelSort.sort} onSort={modelSort.onSort}/><SortTh label="TX" sortKey="txCount" sort={modelSort.sort} onSort={modelSort.onSort}/><SortTh label="Conv %" sortKey="convRate" sort={modelSort.sort} onSort={modelSort.onSort}/><th>Badges</th></tr></thead>
              <tbody>
                {modelSort.doSort(modelStats, {name:x=>(x.name||"").toLowerCase(),ca:x=>x.ca,totalExp:x=>x.totalExp,benefice:x=>x.benefice,margin:x=>x.margin,txCount:x=>x.txCount,convRate:x=>x.convRate}).map(m => (
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
              </tbody>
            </table>
          </div>}
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
              {sel.mTxs.length === 0 ? <EmptyState icon="💸" text="Aucune transaction"/> :
              <div className="table-wrap" style={{maxHeight:400,overflowY:"auto"}}>
                <table className="table">
                  <thead><tr><th>{t(lang,"date")}</th><th>Spender</th><th>{t(lang,"amount")}</th><th>{t(lang,"product")}</th><th>Tag</th><th>Chatter</th><th>Provider</th><th>{t(lang,"status")}</th><th>{t(lang,"actions")}</th></tr></thead>
                  <tbody>
                    {sel.mTxs.slice(0,30).map(tx => (
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
                          <button className="btn btn-danger btn-small" onClick={()=>setConfirmRefuse(tx.id)}>✗</button>
                        </>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
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
            <button className="btn btn-success" onClick={handleAddExpense} disabled={saving} style={{flex:1}}>{saving?<><BtnSpinner/>{" "}</>:fr?"Ajouter":"Add"}</button>
          </div>
        </div>
      </div>}

      {/* ── GLOBAL EXPENSE SECTION ── */}
      <div className="card" style={{marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div className="section-title" style={{marginBottom:0}}><div className="section-bar"></div>💸 {fr?"Espace Dépenses":"Expenses Space"}</div>
          <button onClick={()=>{setExpForm({model_id:"",amount:"",currency:"EUR",category:"contenu",description:"",date:new Date().toISOString().slice(0,10)});setShowExpenseForm(true);}} style={{padding:"7px 20px",borderRadius:14,border:"none",background:"var(--danger)",color:"var(--text-primary)",fontSize:12,fontWeight:700,cursor:"pointer",boxShadow:"var(--shadow-md)",fontFamily:"'DM Sans',sans-serif"}}>+ {fr?"Ajouter une dépense":"Add an expense"}</button>
        </div>
        {(()=>{
          const allExp = expenses||[];
          const sortedExp = expSort.doSort(allExp, {
            date: x => new Date(x.date||x.created_at||0).getTime(),
            model: x => (models.find(m=>m.id===x.model_id)?.name||"").toLowerCase(),
            category: x => (x.category||"").toLowerCase(),
            description: x => (x.name||x.description||"").toLowerCase(),
            amount: x => Number(x.amount)||0,
          });
          const expPages = Math.max(1, Math.ceil(sortedExp.length / ROWS_PER_PAGE));
          const pagedExp = sortedExp.slice(expPage * ROWS_PER_PAGE, (expPage+1) * ROWS_PER_PAGE);
          return <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><SortTh label="Date" sortKey="date" sort={expSort.sort} onSort={expSort.onSort}/><SortTh label={t(lang,"model")} sortKey="model" sort={expSort.sort} onSort={expSort.onSort}/><SortTh label={fr?"Catégorie":"Category"} sortKey="category" sort={expSort.sort} onSort={expSort.onSort}/><SortTh label="Description" sortKey="description" sort={expSort.sort} onSort={expSort.onSort}/><SortTh label={t(lang,"amount")} sortKey="amount" sort={expSort.sort} onSort={expSort.onSort}/></tr></thead>
              <tbody>
                {pagedExp.map((e,i) => {
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
                {allExp.length===0&&<tr><td colSpan={5} style={{textAlign:"center",color:"var(--text-quaternary)",padding:20}}>{fr?"Aucune dépense":"No expenses"}</td></tr>}
              </tbody>
            </table>
          </div>
          <PaginationBar page={expPage} totalPages={expPages} totalItems={sortedExp.length} lang={lang} onPageChange={setExpPage}/>
          </>;
        })()}
      </div>

      {editingTx && <EditTxModal tx={editingTx} lang={lang} onSave={handleEditSave} onCancel={()=>setEditingTx(null)} saving={saving} models={models} profiles={profiles} products={products} productTags={productTags} modelPrices={modelPrices} />}
      <ConfirmDialog open={!!confirmRefuse} icon={"\u26A0\uFE0F"} title={fr?"Refuser cette transaction ?":"Refuse this transaction?"} message={fr?"Cette action est irréversible. La transaction sera marquée comme refusée.":"This action is irreversible. The transaction will be marked as refused."} confirmLabel={fr?"Refuser":"Refuse"} cancelLabel={fr?"Annuler":"Cancel"} danger onConfirm={()=>{handleStatus(confirmRefuse,"refused");setConfirmRefuse(null);}} onCancel={()=>setConfirmRefuse(null)}/>
    </div>
  );
});

module.exports.default = ModelesTab;
