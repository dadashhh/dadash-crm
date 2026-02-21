// =============================================
// COMPTA TAB (gerant only)
// =============================================
const ComptaTab = React.memo(({user, lang, txs, expenses, models, profiles, onRefresh}) => {
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const addToast = useToast();
  const dr = useDateRange("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({name:"",amount:"",category:"ops"});
  const comptaFiltered = useMemo(() => dr.filterByDate(txs, "date"), [txs, dr.startDate, dr.endDate, dr.activePreset]);
  const { validTxs, grossRev, totalProvFees, totalDadaFees, totalNet, totalComms, totalExpenses, netProfit } = useMemo(() => {
    const vTxs = comptaFiltered.filter(tx=>tx.status==="validated");
    const tNet = vTxs.reduce((s,tx)=>s+Number(tx.net_amount||0),0);
    const tComms = vTxs.reduce((s,tx)=>s+Number(tx.chatter_commission||0),0);
    const tExp = expenses.reduce((s,e)=>s+Number(e.amount),0);
    return {
      validTxs: vTxs,
      grossRev: vTxs.reduce((s,tx)=>s+Number(tx.amount),0),
      totalProvFees: vTxs.reduce((s,tx)=>s+Number(tx.provider_fee||0),0),
      totalDadaFees: vTxs.reduce((s,tx)=>s+Number(tx.dada_fee||0),0),
      totalNet: tNet, totalComms: tComms, totalExpenses: tExp,
      netProfit: tNet - tComms - tExp,
    };
  }, [comptaFiltered, expenses]);
  const handleAdd = async () => {
    if(!form.name || form.name.trim().length === 0) { addToast(lang==="fr"?"Nom requis":"Name required","error"); return; }
    if(!isValidAmount(form.amount)) { addToast(lang==="fr"?"Montant invalide (doit être > 0)":"Invalid amount (must be > 0)","error"); return; }
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
            {models.length === 0 ? <EmptyState icon="📊" text="Aucun revenu"/> : <table className="table"><thead><tr><th>Model</th><th>CA</th></tr></thead>
            <tbody>
              {models.map(m=>{
                const ca = validTxs.filter(tx=>tx.model_id===m.id).reduce((s,tx)=>s+Number(tx.amount),0);
                return <tr key={m.id}><td>{m.name}</td><td>{ca}</td></tr>;
              })}
            </tbody></table>}
          </div>
        </div>
        <div className="card">
          <div className="section-title"><div className="section-bar"></div>Commission Distribution</div>
          {profiles.filter(u=>u.role==="chatter").length === 0 ? <EmptyState icon="💬" text="Aucune commission"/> :
          <table className="table"><thead><tr><th>Chatter</th><th>Comm</th></tr></thead>
          <tbody>
            {profiles.filter(u=>u.role==="chatter").map(u=>{
              const comm = validTxs.filter(tx=>tx.chatter_id===u.id).reduce((s,tx)=>s+Number(tx.chatter_commission||0),0);
              return <tr key={u.id}><td><Tag type="chatter" label={u.name} id={u.id}/></td><td>{comm.toFixed(0)}</td></tr>;
            })}
          </tbody></table>}
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
              <button className="btn btn-success" onClick={handleAdd} disabled={saving} style={{flex:1}}>{saving?<><BtnSpinner/>{" "}</>:"Add"}</button>
              <button className="btn btn-danger" onClick={()=>setShowForm(false)} style={{flex:1}}>Cancel</button>
            </div>
          </div>
        )}
        {expenses.length === 0 ? <EmptyState icon="📋" text="Aucune dépense"/> :
        <table className="table"><thead><tr><th>Name</th><th>Category</th><th>Amount</th></tr></thead>
        <tbody>
          {expenses.map(e=>(
            <tr key={e.id}><td>{e.name}</td><td>{e.category}</td><td>{e.amount}</td></tr>
          ))}
        </tbody></table>}
      </div>
    </div>
  );
});

// =============================================
// SPENDER PROFILE ENGINE (computed from transactions)
// =============================================
const computeSpenderProfile = (handle, txs, models, profiles, spenders) => {
  const sTxs = txs.filter(tx=>tx.spender_handle===handle).sort((a,b)=>new Date(b.date)-new Date(a.date));
  // Also find spender record for OFM metadata (resume, info, contenu, tw)
  const spenderRecord = (spenders||[]).find(s=>(s.handle||s.name||"").toLowerCase()===handle.toLowerCase());
  if(sTxs.length===0 && !spenderRecord) return null;
  const now = new Date();
  const ltv = sTxs.reduce((s,tx)=>s+Number(tx.amount),0);
  const validatedCA = sTxs.filter(tx=>tx.status==="validated").reduce((s,tx)=>s+Number(tx.amount),0);
  const pendingCA = sTxs.filter(tx=>tx.status==="pending").reduce((s,tx)=>s+Number(tx.amount),0);
  const cnt = sTxs.length;
  const aov = ltv/cnt;
  const maxTicket = Math.max(...sTxs.map(tx=>Number(tx.amount)));
  const lastPurchase = sTxs[0]?.date;
  const firstPurchase = sTxs[sTxs.length-1]?.date;
  const recencyDays = lastPurchase ? Math.floor((now-new Date(lastPurchase))/(86400000)) : 999;

  // 7d/30d/90d splits
  const d7 = new Date(now.getTime()-7*86400000);
  const d30 = new Date(now.getTime()-30*86400000);
  const d90 = new Date(now.getTime()-90*86400000);
  const ca7d = sTxs.filter(tx=>new Date(tx.date)>=d7).reduce((s,tx)=>s+Number(tx.amount),0);
  const ca30d = sTxs.filter(tx=>new Date(tx.date)>=d30).reduce((s,tx)=>s+Number(tx.amount),0);
  const ca90d = sTxs.filter(tx=>new Date(tx.date)>=d90).reduce((s,tx)=>s+Number(tx.amount),0);

  // Trend 30d vs previous 30d
  const d60 = new Date(now.getTime()-60*86400000);
  const caPrev30d = sTxs.filter(tx=>{const d=new Date(tx.date);return d>=d60&&d<d30;}).reduce((s,tx)=>s+Number(tx.amount),0);
  const trend = caPrev30d>0 ? ((ca30d-caPrev30d)/caPrev30d*100).toFixed(0) : ca30d>0?"new":0;

  // Top models (rank + montant)
  const modelMap = {};
  sTxs.forEach(tx=>{
    if(!tx.model_id) return;
    if(!modelMap[tx.model_id]) modelMap[tx.model_id]={id:tx.model_id, ca:0, cnt:0};
    modelMap[tx.model_id].ca += Number(tx.amount);
    modelMap[tx.model_id].cnt++;
  });
  const topModels = Object.values(modelMap).map(m=>({...m, name:models.find(x=>x.id===m.id)?.name||"?", pct:ltv>0?((m.ca/ltv)*100):0})).sort((a,b)=>b.ca-a.ca);

  // Top content types
  const typeMap = {};
  sTxs.forEach(tx=>{
    const tp = tx.type||tx.product||tx.tag||"autre";
    if(!typeMap[tp]) typeMap[tp]={type:tp, ca:0, cnt:0};
    typeMap[tp].ca += Number(tx.amount);
    typeMap[tp].cnt++;
  });
  const topTypes = Object.values(typeMap).sort((a,b)=>b.ca-a.ca);

  // Time-of-day pattern (hour buckets)
  const hourMap = {};
  sTxs.forEach(tx=>{
    if(!tx.date) return;
    const h = new Date(tx.date).getHours();
    hourMap[h] = (hourMap[h]||0) + 1;
  });

  // Day-of-week pattern
  const dayMap = {};
  sTxs.forEach(tx=>{
    if(!tx.date) return;
    const d = new Date(tx.date).getDay();
    dayMap[d] = (dayMap[d]||0) + 1;
  });

  // Purchase cadence (avg days between purchases)
  const dates = sTxs.map(tx=>new Date(tx.date).getTime()).sort((a,b)=>a-b);
  let cadence = 0;
  if(dates.length>1){
    const gaps = [];
    for(let i=1;i<dates.length;i++) gaps.push((dates[i]-dates[i-1])/86400000);
    cadence = gaps.reduce((s,g)=>s+g,0)/gaps.length;
  }

  // Segment + tags
  const segment = getSpenderSegment(ltv);
  const tags = [segment];
  if(ltv>2000) tags.push("whale");
  if(recencyDays>30) tags.push("cold");
  else if(recencyDays<=3) tags.push("hot");
  if(ca7d>ca30d*0.7 && ca30d>0) tags.push("accelerating");
  if(trend<-30) tags.push("declining");
  if(cnt>=10) tags.push("loyal");

  // Next best action
  let nextAction = "";
  if(recencyDays>14) nextAction = "relance";
  else if(ltv>1000 && topModels.length===1) nextAction = "upsell (nouveau modèle)";
  else if(ltv>500 && recencyDays<=3) nextAction = "VIP handling";
  else if(cnt===1) nextAction = "follow-up 1st purchase";
  else nextAction = "maintenir engagement";

  // OFM metadata from spender record
  const resume = spenderRecord?.resume || "";
  const prenom = spenderRecord?.prenom || "?";
  const age = spenderRecord?.age || "?";
  const metier = spenderRecord?.metier || "?";
  const contenu = spenderRecord?.contenu || "";
  const isTW = spenderRecord?.is_timewaster || false;
  const telegramId = spenderRecord?.telegram_id || "";
  if(isTW && !tags.includes("timewaster")) tags.push("timewaster");

  return {
    handle, ltv, validatedCA, pendingCA, cnt, aov, maxTicket,
    lastPurchase, firstPurchase, recencyDays,
    ca7d, ca30d, ca90d, trend, caPrev30d,
    topModels, topTypes, hourMap, dayMap, cadence,
    segment, tags, nextAction,
    txs: sTxs,
    // OFM metadata
    resume, prenom, age, metier, contenu, isTW, telegramId,
  };
};

// SpenderQuickCard - mini card for Telegram page
const SpenderQuickCard = ({handle, txs, models, profiles, lang, onOpenFull, spenders}) => {
  const { currencySymbol } = useCurrency();
  const profile = useMemo(()=>computeSpenderProfile(handle, txs, models, profiles, spenders),[handle, txs, models, profiles, spenders]);
  if(!profile) return null;
  return (
    <div style={{background:"var(--accent-subtle)",borderRadius:12,padding:14,border:"1px solid var(--accent-muted)",marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Tag type="spender" label={handle} id={handle}/>
          {profile.tags.slice(0,3).map(tag=>(
            <span key={tag} style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:tag==="whale"?"rgba(236,72,153,0.15)":tag==="hot"?"rgba(16,185,129,0.15)":tag==="cold"?"var(--danger-muted)":"var(--accent-subtle)",color:tag==="whale"?"var(--pink)":tag==="hot"?"var(--success)":tag==="cold"?"var(--danger)":"var(--accent)",fontWeight:600,textTransform:"uppercase"}}>{tag}</span>
          ))}
        </div>
        <button onClick={()=>onOpenFull(handle)} style={{fontSize:10,background:"var(--accent-subtle)",color:"var(--accent)",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:600}}>
          {t(lang,"view_profile")} →
        </button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,fontSize:11}}>
        <div><span style={{color:"var(--text2)"}}>LTV</span><br/><strong>{profile.ltv.toFixed(0)}{currencySymbol}</strong></div>
        <div><span style={{color:"var(--text2)"}}>{t(lang,"last_buy")}</span><br/><strong>{profile.recencyDays}j</strong></div>
        <div><span style={{color:"var(--text2)"}}>Top model</span><br/><strong style={{color:"var(--accent)"}}>{profile.topModels[0]?.name||"-"}</strong></div>
        <div><span style={{color:"var(--text2)"}}>{t(lang,"action")}</span><br/><strong style={{color:profile.nextAction.includes("relance")?"var(--warning)":"var(--success)"}}>{profile.nextAction}</strong></div>
      </div>
    </div>
  );
};

// SpenderFullProfile - full CRM view
const SpenderFullProfile = ({handle, txs, models, profiles, lang, onClose, spenders}) => {
  const p = useMemo(()=>computeSpenderProfile(handle, txs, models, profiles, spenders),[handle, txs, models, profiles, spenders]);
  if(!p) return <div style={{padding:40,textAlign:"center",color:"var(--text2)"}}>{t(lang,"no_data")}</div>;
  const fr = lang==="fr";
  const dayNames = fr?["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"]:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <Tag type="spender" label={handle} id={handle}/>
          {p.tags.map(tag=>(
            <span key={tag} style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:tag==="whale"?"rgba(236,72,153,0.15)":tag==="hot"?"rgba(16,185,129,0.15)":tag==="cold"?"var(--danger-muted)":"var(--accent-subtle)",color:tag==="whale"?"var(--pink)":tag==="hot"?"var(--success)":tag==="cold"?"var(--danger)":"var(--accent)",fontWeight:600,textTransform:"uppercase"}}>{tag}</span>
          ))}
        </div>
        {onClose && <button onClick={onClose} style={{background:"var(--accent-subtle)",color:"var(--accent)",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:600}}>✕</button>}
      </div>

      {/* OFM Info Card (if imported from scan) */}
      {(p.resume || p.contenu || p.isTW) && (
        <div className="card" style={{marginBottom:16,background:p.isTW?"var(--danger-muted)":"var(--accent-subtle)",border:p.isTW?"1px solid var(--danger-muted)":"1px solid var(--accent-muted)"}}>
          <div style={{display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
            {p.isTW && <span style={{fontSize:10,padding:"3px 8px",borderRadius:6,background:"var(--danger-muted)",color:"var(--danger)",fontWeight:700}}>⚠️ TIMEWASTER</span>}
            {p.prenom && p.prenom !== "?" && <span style={{fontSize:11}}><strong>{fr?"Prénom":"Name"}:</strong> {p.prenom}</span>}
            {p.age && p.age !== "?" && <span style={{fontSize:11}}><strong>Age:</strong> {p.age}</span>}
            {p.metier && p.metier !== "?" && <span style={{fontSize:11}}><strong>{fr?"Métier":"Job"}:</strong> {p.metier}</span>}
            {p.telegramId && <span style={{fontSize:10,color:"var(--text2)"}}>TG: #{p.telegramId}</span>}
          </div>
          {p.contenu && <div style={{fontSize:11,marginTop:6,color:"var(--text2)"}}><strong>{fr?"Contenu acheté":"Purchased content"}:</strong> {p.contenu}</div>}
          {p.resume && <div style={{fontSize:11,marginTop:6,color:"var(--text2)",fontStyle:"italic",lineHeight:1.5}}>"{p.resume}"</div>}
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-grid">
        <KPICard label="LTV" value={`${p.ltv.toFixed(0)}${currencySymbol}`} icon="💎"/>
        <KPICard label={fr?"Panier moyen":"AOV"} value={`${p.aov.toFixed(0)}${currencySymbol}`} icon="🛒"/>
        <KPICard label={fr?"Récence":"Recency"} value={`${p.recencyDays}j`} icon="📅"/>
        <KPICard label="TX" value={`${p.cnt}`} icon="📋"/>
      </div>

      {/* Periods + Trend */}
      <div className="card" style={{marginBottom:16}}>
        <div className="section-title"><div className="section-bar"></div>{fr?"KPIs par période":"KPIs by period"}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,fontSize:12}}>
          <div><span style={{color:"var(--text2)"}}>7j</span><br/><strong>{p.ca7d.toFixed(0)}{currencySymbol}</strong></div>
          <div><span style={{color:"var(--text2)"}}>30j</span><br/><strong>{p.ca30d.toFixed(0)}{currencySymbol}</strong></div>
          <div><span style={{color:"var(--text2)"}}>90j</span><br/><strong>{p.ca90d.toFixed(0)}{currencySymbol}</strong></div>
          <div><span style={{color:"var(--text2)"}}>Trend</span><br/><strong style={{color:Number(p.trend)>0?"var(--success)":Number(p.trend)<0?"var(--danger)":"var(--text)"}}>{p.trend==="new"?"NEW":p.trend>0?"+"+p.trend+"%":p.trend+"%"}</strong></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,fontSize:12,marginTop:12}}>
          <div><span style={{color:"var(--text2)"}}>{fr?"Validé":"Validated"}</span><br/><strong style={{color:"var(--success)"}}>{p.validatedCA.toFixed(0)}{currencySymbol}</strong></div>
          <div><span style={{color:"var(--text2)"}}>Pending</span><br/><strong style={{color:"var(--warning)"}}>{p.pendingCA.toFixed(0)}{currencySymbol}</strong></div>
          <div><span style={{color:"var(--text2)"}}>Max ticket</span><br/><strong>{p.maxTicket.toFixed(0)}{currencySymbol}</strong></div>
        </div>
      </div>

      <div className="grid-2">
        {/* Top Models */}
        <div className="card">
          <div className="section-title"><div className="section-bar"></div>{fr?"Modèles préférés":"Favorite Models"}</div>
          {p.topModels.map(m=>(
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <Tag type="model" label={m.name} id={m.id}/>
              <div style={{flex:1,background:"var(--accent-subtle)",borderRadius:4,height:14,overflow:"hidden"}}>
                <div style={{background:"var(--accent)",height:"100%",width:`${m.pct}%`,borderRadius:4}}></div>
              </div>
              <span style={{fontSize:11,fontWeight:600,minWidth:60,textAlign:"right"}}>{m.ca.toFixed(0)}{currencySymbol} ({m.pct.toFixed(0)}%)</span>
            </div>
          ))}
        </div>

        {/* Top Content Types */}
        <div className="card">
          <div className="section-title"><div className="section-bar"></div>{fr?"Types de contenu":"Content Types"}</div>
          {p.topTypes.slice(0,6).map(tp=>(
            <div key={tp.type} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:12,borderBottom:"1px solid var(--border-subtle)"}}>
              <span>{tp.type}</span>
              <span style={{fontWeight:600}}>{tp.ca.toFixed(0)}{currencySymbol} <span style={{color:"var(--text2)",fontWeight:400}}>({tp.cnt}x)</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{marginTop:16}}>
        {/* Hour heatmap */}
        <div className="card">
          <div className="section-title"><div className="section-bar"></div>{fr?"Heures d'achat":"Purchase Hours"}</div>
          {[9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2].filter(h=>p.hourMap[h]).map(h=>{
            const maxH = Math.max(...Object.values(p.hourMap),1);
            return (
              <div key={h} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                <span style={{width:28,fontSize:10,fontWeight:600}}>{String(h).padStart(2,"0")}h</span>
                <div style={{flex:1,background:"rgba(236,72,153,0.1)",borderRadius:3,height:12,overflow:"hidden"}}>
                  <div style={{background:"var(--pink)",height:"100%",width:`${(p.hourMap[h]/maxH)*100}%`,borderRadius:3}}></div>
                </div>
                <span style={{fontSize:10,minWidth:20}}>{p.hourMap[h]}</span>
              </div>
            );
          })}
        </div>

        {/* Day pattern */}
        <div className="card">
          <div className="section-title"><div className="section-bar"></div>{fr?"Jours d'achat":"Purchase Days"}</div>
          {[1,2,3,4,5,6,0].map(d=>{
            const maxD = Math.max(...Object.values(p.dayMap),1);
            const cnt = p.dayMap[d]||0;
            return (
              <div key={d} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{width:28,fontSize:11,fontWeight:600}}>{dayNames[d]}</span>
                <div style={{flex:1,background:"var(--accent-subtle)",borderRadius:3,height:14,overflow:"hidden"}}>
                  <div style={{background:"var(--accent)",height:"100%",width:`${(cnt/maxD)*100}%`,borderRadius:3}}></div>
                </div>
                <span style={{fontSize:10,minWidth:20}}>{cnt}</span>
              </div>
            );
          })}
          <div style={{fontSize:11,color:"var(--text2)",marginTop:8}}>{fr?"Cadence":"Cadence"}: <strong>1 {fr?"achat":"purchase"} / {p.cadence.toFixed(1)} {fr?"jours":"days"}</strong></div>
        </div>
      </div>

      {/* Next Best Action */}
      <div className="card" style={{marginTop:16,background:"rgba(16,185,129,0.05)",border:"1px solid rgba(16,185,129,0.15)"}}>
        <div className="section-title"><div className="section-bar" style={{background:"var(--success)"}}></div>{fr?"Action recommandée":"Recommended Action"}</div>
        <div style={{fontSize:14,fontWeight:600,color:"var(--success)"}}>{p.nextAction}</div>
        <div style={{fontSize:12,color:"var(--text2)",marginTop:4}}>
          {p.nextAction==="relance" && (fr?`Pas d'achat depuis ${p.recencyDays} jours. Envoyer message personnalisé.`:`No purchase in ${p.recencyDays} days. Send personalized message.`)}
          {p.nextAction.includes("upsell") && (fr?`Spender fidèle sur 1 seul modèle (${p.topModels[0]?.name}). Proposer un autre modèle.`:`Loyal spender on 1 model (${p.topModels[0]?.name}). Suggest another model.`)}
          {p.nextAction==="VIP handling" && (fr?"Gros spender très actif. Traitement prioritaire.":`High spender, very active. Priority handling.`)}
          {p.nextAction.includes("follow-up") && (fr?"Premier achat. Engager la conversation pour fidéliser.":"First purchase. Engage to build loyalty.")}
          {p.nextAction.includes("maintenir") && (fr?"Spender régulier. Continuer le bon travail.":"Regular spender. Keep it up.")}
        </div>
      </div>

      {/* Transaction History */}
      <div className="card" style={{marginTop:16}}>
        <div className="section-title"><div className="section-bar"></div>{fr?"Historique complet":"Full History"} ({p.txs.length} TX)</div>
        {p.txs.length === 0 ? <EmptyState icon="💸" text="Aucune transaction"/> :
        <div className="table-wrap">
          <table className="table" style={{fontSize:11}}>
            <thead><tr><th>{fr?"Date":"Date"}</th><th>Spender</th><th>{fr?"Montant":"Amount"}</th><th>{fr?"Produit":"Product"}</th><th>Tag</th><th>{fr?"Modèle":"Model"}</th><th>Chatter</th><th>Provider</th><th>{fr?"Statut":"Status"}</th></tr></thead>
            <tbody>
              {p.txs.map((tx,i)=>(
                <tr key={tx.id || ("tx-" + i)}>
                  <td>{fmtDate(tx.date)}</td>
                  <td><Tag type="spender" label={tx.spender_handle} id={tx.spender_handle}/></td>
                  <td style={{fontWeight:600}}>{fmtAmount(tx.amount,tx.currency)}</td>
                  <td>{tx.product||"—"}</td>
                  <td>{tx.tag||"—"}</td>
                  <td><Tag type="model" label={models.find(m=>m.id===tx.model_id)?.name||"?"} id={tx.model_id}/></td>
                  <td><Tag type="chatter" label={profiles.find(p2=>p2.id===tx.chatter_id)?.name||"?"} id={tx.chatter_id}/></td>
                  <td><Tag type="provider" label={profiles.find(p2=>p2.id===tx.provider_id)?.name||"?"} id={tx.provider_id}/></td>
                  <td><StatusPill status={tx.status} lang={lang}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  );
});

module.exports.default = ComptaTab;
