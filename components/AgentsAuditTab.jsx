const AgentsAuditTab = ({lang, txs, models, profiles, onNavigate}) => {
  const fr = lang === "fr";
  const { currencySymbol, convertAmount, fmtAmount } = useCurrency();
  const addToast = useToast();
  const [todoDone, setTodoDone] = useState({});
  const toggleTodo = (i) => setTodoDone(prev => ({...prev,[i]:!prev[i]}));

  // ── SHARED STYLES ──
  const sectionTitle = (icon, title, sub) => (
    <div style={{marginBottom:20}}>
      <h3 style={{fontSize:16,fontWeight:800,margin:0}}>{icon} {title}</h3>
      {sub && <p style={{fontSize:11,color:"var(--text-tertiary)",margin:"4px 0 0"}}>{sub}</p>}
    </div>
  );
  const cardS = {background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:16,padding:"20px 22px"};
  const thS = {textAlign:"left",padding:"8px 12px",fontSize:10,textTransform:"uppercase",color:"var(--text-tertiary)",fontWeight:600,letterSpacing:0.5,borderBottom:"1px solid var(--border-subtle)"};
  const tdS = {padding:"10px 12px",fontSize:12,borderBottom:"1px solid var(--border-subtle)"};

  // ── DATE FILTERS ──
  const now = new Date();
  const last7d = useMemo(() => txs.filter(tx => (now - new Date(tx.date)) < 7*86400000), [txs]);
  const last30d = useMemo(() => txs.filter(tx => (now - new Date(tx.date)) < 30*86400000), [txs]);
  const pending = useMemo(() => txs.filter(tx => tx.status==="pending"||tx.status==="en_attente"), [txs]);
  const validated = useMemo(() => txs.filter(tx => tx.status==="validated"||tx.status==="confirmee"), [txs]);

  // ── SECTION 1: ALERTES & RECOMMANDATIONS ──
  const recommendations = useMemo(() => {
    const recs = [];
    // Old pending (>48h)
    const oldPending = pending.filter(tx => (now - new Date(tx.date)) > 48*3600000);
    if (oldPending.length > 0) {
      recs.push({level:"urgent",icon:"🔴",title:fr?`${oldPending.length} transaction(s) en attente depuis +48h`:`${oldPending.length} transaction(s) pending for 48h+`,desc:fr?"Ces transactions risquent d'expirer. Validez ou refusez-les rapidement.":"These transactions may expire. Validate or refuse them quickly.",action:fr?"Voir les transactions":"View transactions",actionTab:"transactions"});
    }
    // Inactive whales
    const spenderTotals30d = {};
    last30d.forEach(tx => { spenderTotals30d[tx.spender_handle] = (spenderTotals30d[tx.spender_handle]||0) + Number(tx.amount||0); });
    const topSpenders = Object.entries(spenderTotals30d).sort((a,b) => b[1]-a[1]).slice(0,5);
    const spender7d = new Set(last7d.map(tx => tx.spender_handle));
    const inactiveWhales = topSpenders.filter(([name]) => !spender7d.has(name));
    if (inactiveWhales.length > 0) {
      recs.push({level:"warning",icon:"🟡",title:fr?`${inactiveWhales.length} top spender(s) inactif(s) cette semaine`:`${inactiveWhales.length} top spender(s) inactive this week`,desc:`${inactiveWhales.map(([n])=>n).join(", ")} — ${fr?"relancez-les avant qu'ils partent.":"re-engage them before they leave."}`,action:fr?"Voir les spenders":"View spenders",actionTab:"spenders"});
    }
    // Best day of week
    const dayTotals = [0,0,0,0,0,0,0];
    const dayCounts = [0,0,0,0,0,0,0];
    last30d.forEach(tx => { const d = new Date(tx.date).getDay(); dayTotals[d]+=Number(tx.amount||0); dayCounts[d]++; });
    const bestDay = dayTotals.indexOf(Math.max(...dayTotals));
    const dayNamesFr = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
    const dayNamesEn = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const dn = fr?dayNamesFr:dayNamesEn;
    const avgBest = Math.round(dayTotals[bestDay]/Math.max(dayCounts[bestDay],1));
    if (last30d.length > 0) {
      recs.push({level:"info",icon:"🟢",title:fr?`Meilleur jour : ${dn[bestDay]}`:`Best day: ${dn[bestDay]}`,desc:fr?`Le ${dn[bestDay].toLowerCase()} génère en moyenne ${avgBest}${currencySymbol} de CA. Concentrez vos efforts ce jour-là.`:`${dn[bestDay]} generates an average of ${avgBest}${currencySymbol} revenue. Focus efforts on that day.`});
    }
    // Conversion rate
    const convRate = txs.length > 0 ? Math.round((validated.length/txs.length)*100) : 0;
    recs.push({level:convRate<50?"warning":"info",icon:convRate<50?"🟡":"🟢",title:fr?`Taux de validation : ${convRate}%`:`Validation rate: ${convRate}%`,desc:convRate<50?(fr?"Moins de la moitié des TX sont validées. Vérifiez la qualité des leads.":"Less than half of TX are validated. Check lead quality."):(fr?"Bon taux de validation. Continuez comme ça.":"Good validation rate. Keep it up.")});
    // Top model recommendation
    const modelPerf = {};
    validated.forEach(tx => { const mid = tx.model_id; if(!mid) return; if(!modelPerf[mid]) modelPerf[mid]={total:0,count:0}; modelPerf[mid].total+=Number(tx.amount||0); modelPerf[mid].count++; });
    const topModel = Object.entries(modelPerf).sort((a,b)=>b[1].total-a[1].total)[0];
    if (topModel) {
      const mName = (models||[]).find(m=>m.id===topModel[0])?.name||topModel[0];
      recs.push({level:"info",icon:"🟢",title:fr?`Top modèle : ${mName}`:`Top model: ${mName}`,desc:fr?`${Math.round(topModel[1].total)}${currencySymbol} de CA validé (${topModel[1].count} TX). Investissez plus sur ce profil.`:`${Math.round(topModel[1].total)}${currencySymbol} validated revenue (${topModel[1].count} TX). Invest more in this profile.`});
    }
    return recs;
  }, [txs, models, pending, validated, last7d, last30d, currencySymbol, fr]);

  // ── SECTION 2: ANALYSE SPENDERS ──
  const spenderAnalysis = useMemo(() => {
    const map = {};
    txs.forEach(tx => {
      const h = tx.spender_handle||"unknown";
      if(!map[h]) map[h] = {handle:h,total:0,count:0,last7d:0,byDay:{}};
      const amt = Number(tx.amount||0);
      map[h].total += amt;
      map[h].count++;
      if ((now - new Date(tx.date)) < 7*86400000) map[h].last7d += amt;
      const dayKey = new Date(tx.date).toISOString().slice(0,10);
      map[h].byDay[dayKey] = (map[h].byDay[dayKey]||0) + amt;
    });
    const all = Object.values(map);
    const whales = all.filter(s => s.total >= 500);
    const vips = all.filter(s => s.total >= 200 && s.total < 500);
    const regulars = all.filter(s => s.total < 200);
    const top5 = all.sort((a,b) => b.total - a.total).slice(0,5);
    const totalSpenders = all.length;
    const avgBasket = txs.length > 0 ? Math.round(txs.reduce((s,tx)=>s+Number(tx.amount||0),0)/txs.length) : 0;
    const avgLTV = totalSpenders > 0 ? Math.round(all.reduce((s,sp)=>s+sp.total,0)/totalSpenders) : 0;
    return {whales,vips,regulars,top5,totalSpenders,avgBasket,avgLTV,whaleTotal:whales.reduce((s,w)=>s+w.total,0),vipTotal:vips.reduce((s,v)=>s+v.total,0),regTotal:regulars.reduce((s,r)=>s+r.total,0)};
  }, [txs]);

  // ── SECTION 3: ANALYSE MODELES ──
  const modelAnalysis = useMemo(() => {
    const map = {};
    txs.forEach(tx => {
      const mid = tx.model_id; if(!mid) return;
      if(!map[mid]) map[mid]={id:mid,total:0,count:0,validated:0,last7dTotal:0,last30dTotal:0};
      map[mid].total += Number(tx.amount||0);
      map[mid].count++;
      if(tx.status==="validated"||tx.status==="confirmee") map[mid].validated++;
      if((now-new Date(tx.date))<7*86400000) map[mid].last7dTotal+=Number(tx.amount||0);
      if((now-new Date(tx.date))<30*86400000) map[mid].last30dTotal+=Number(tx.amount||0);
    });
    return Object.values(map).map(m => {
      const mod = (models||[]).find(x=>x.id===m.id);
      return {...m,name:mod?.name||m.id,validRate:m.count>0?Math.round(m.validated/m.count*100):0,avgBasket:m.count>0?Math.round(m.total/m.count):0};
    }).sort((a,b)=>b.total-a.total);
  }, [txs, models]);

  // ── SECTION 4: ANALYSE CHATTERS ──
  const chatterAnalysis = useMemo(() => {
    const chatters = (profiles||[]).filter(p=>p.role==="chatter");
    const map = {};
    txs.forEach(tx => {
      const cid = tx.chatter_id; if(!cid) return;
      if(!map[cid]) map[cid]={id:cid,total:0,count:0,validated:0,commission:0,pendingCount:0};
      map[cid].total += Number(tx.amount||0);
      map[cid].count++;
      map[cid].commission += Number(tx.chatter_commission||0);
      if(tx.status==="validated"||tx.status==="confirmee") map[cid].validated++;
      if(tx.status==="pending"||tx.status==="en_attente") map[cid].pendingCount++;
    });
    const maxCA = Math.max(...Object.values(map).map(c=>c.total),1);
    return chatters.map(c => {
      const d = map[c.id]||{total:0,count:0,validated:0,commission:0,pendingCount:0};
      return {...d,name:c.name||c.email,convRate:d.count>0?Math.round(d.validated/d.count*100):0,pct:Math.round(d.total/maxCA*100)};
    }).sort((a,b)=>b.total-a.total);
  }, [txs, profiles]);

  // ── SECTION 5: TODOS ──
  const todos = useMemo(() => {
    const list = [];
    const pendingCount = pending.length;
    if(pendingCount>0) list.push({priority:"high",text:fr?`Valider ${pendingCount} transaction(s) en attente`:`Validate ${pendingCount} pending transaction(s)`,tab:"transactions"});
    const spenderTotals30d = {};
    last30d.forEach(tx => { spenderTotals30d[tx.spender_handle]=(spenderTotals30d[tx.spender_handle]||0)+Number(tx.amount||0); });
    const topSp = Object.entries(spenderTotals30d).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const sp7d = new Set(last7d.map(tx=>tx.spender_handle));
    const inactiveW = topSp.filter(([n])=>!sp7d.has(n));
    if(inactiveW.length>0) list.push({priority:"medium",text:fr?`Relancer ${inactiveW.length} top spender(s) inactif(s)`:`Re-engage ${inactiveW.length} inactive top spender(s)`,tab:"spenders"});
    const zeroModels = modelAnalysis.filter(m=>m.last7dTotal===0);
    if(zeroModels.length>0) list.push({priority:"medium",text:fr?`${zeroModels.length} modèle(s) sans TX cette semaine`:`${zeroModels.length} model(s) with 0 TX this week`,tab:"modeles"});
    const lowConvChatters = chatterAnalysis.filter(c=>c.count>=5&&c.convRate<50);
    if(lowConvChatters.length>0) list.push({priority:"low",text:fr?`${lowConvChatters.length} chatter(s) sous 50% de conversion`:`${lowConvChatters.length} chatter(s) under 50% conversion`,tab:"chatters"});
    return list;
  }, [pending, last7d, last30d, modelAnalysis, chatterAnalysis, fr]);

  // ── SECTION 6: AGENTS & LOGS ──
  const agents = [
    {name:"Karim",initials:"K",role:fr?"Senior Dev · Claude Code":"Senior Dev · Claude Code",badge:fr?"ACTIF":"ACTIVE",badgeColor:"var(--success)",lastAction:fr?"il y a 3min":"3min ago",stat:"156 actions",statLabel:fr?"ce mois":"this month",statColor:"var(--success)"},
    {name:"Jean-Marie",initials:"JM",role:fr?"Manager · Prompts & UX":"Manager · Prompts & UX",badge:"MANAGER",badgeColor:"var(--accent)",lastAction:fr?"il y a 12min":"12min ago",stat:"89 prompts",statLabel:fr?"ce mois":"this month",statColor:"var(--accent)"},
    {name:"Telegram Bot",initials:"TB",role:fr?"Import auto · Scans":"Auto import · Scans",badge:"STANDBY",badgeColor:"var(--warning)",lastAction:fr?"il y a 2h":"2h ago",stat:"34 imports",statLabel:fr?"ce mois":"this month",statColor:"var(--warning)"},
  ];
  const logs = [
    {time:"14:32",agent:"Karim",agentColor:"var(--accent)",action:fr?"PR créée":"PR created",detail:"+370 lignes · immutable-transactions",status:"validated"},
    {time:"14:18",agent:"Jean-Marie",agentColor:"var(--accent)",action:fr?"Prompt envoyé":"Prompt sent",detail:"PROMPT_KARIM_DEFINITIF.md",status:"validated"},
    {time:"13:55",agent:"Telegram Bot",agentColor:"var(--warning)",action:"Import scan",detail:fr?"12 TX importées · Luna":"12 TX imported · Luna",status:"validated"},
    {time:"13:20",agent:"Karim",agentColor:"var(--accent)",action:"Bug fix",detail:"safeInsertTx — L4 fallback",status:"validated"},
    {time:"12:48",agent:"Karim",agentColor:"var(--accent)",action:fr?"Feature ajoutée":"Feature added",detail:fr?"ModelesTab — page complète":"ModelesTab — full page",status:"validated"},
  ];

  // ── COUNT-UP KPIs ──
  const animSpenders = useCountUp(spenderAnalysis.totalSpenders, 800);
  const animBasket = useCountUp(spenderAnalysis.avgBasket, 800);
  const animLTV = useCountUp(spenderAnalysis.avgLTV, 800);
  const animWhales = useCountUp(spenderAnalysis.whales.length, 600);

  // ── Sparkline helper (SVG) ──
  const Sparkline = ({data, color, width, height}) => {
    const w = width||80; const h = height||24;
    if(!data||data.length<2) return <svg width={w} height={h}/>;
    const max = Math.max(...data,1);
    const pts = data.map((v,i) => `${(i/(data.length-1))*w},${h - (v/max)*h}`).join(" ");
    return <svg width={w} height={h} style={{display:"block"}}><polyline points={pts} fill="none" stroke={color||"var(--accent)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  };

  // ── Bar helper ──
  const SegmentBar = ({pct, color, label, count, total}) => (
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
      <span style={{fontSize:16,width:24,textAlign:"center"}}>{label}</span>
      <div style={{flex:1,height:28,background:"var(--card-bg)",borderRadius:8,overflow:"hidden",position:"relative"}}>
        <div style={{height:"100%",width:`${Math.max(pct,2)}%`,background:`linear-gradient(90deg, ${color}44, ${color})`,borderRadius:8,transition:"width 0.8s ease"}}/>
        <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:10,fontWeight:600,color:"var(--text-secondary)"}}>{count} spenders</span>
      </div>
      <span style={{fontSize:12,fontWeight:700,minWidth:70,textAlign:"right"}}>{Math.round(total)}{currencySymbol}</span>
    </div>
  );

  // ── MODEL RECS ──
  const modelRecs = useMemo(() => {
    return modelAnalysis.slice(0,5).map(m => {
      const refuseRate = m.count>0?Math.round((m.count-m.validated)/m.count*100):0;
      if(m.last7dTotal===0) return {level:"urgent",icon:"🔴",name:m.name,text:fr?`0 TX cette semaine. Relancer ou créer du contenu frais.`:`0 TX this week. Re-engage or create fresh content.`};
      if(refuseRate>20) return {level:"warning",icon:"🟡",name:m.name,text:fr?`Taux de refus élevé (${refuseRate}%). Vérifier la qualité des contenus.`:`High refuse rate (${refuseRate}%). Check content quality.`};
      return {level:"info",icon:"🟢",name:m.name,text:fr?`CA: ${Math.round(m.total)}${currencySymbol}, ${m.validRate}% validé. Bonne performance.`:`Revenue: ${Math.round(m.total)}${currencySymbol}, ${m.validRate}% validated. Good performance.`};
    });
  }, [modelAnalysis, currencySymbol, fr]);

  // ── CHATTER RECS ──
  const chatterRecs = useMemo(() => {
    return chatterAnalysis.slice(0,5).map(c => {
      if(c.convRate>=80&&c.count>=5) return {icon:"🟢",name:c.name,text:fr?`Taux de conversion ${c.convRate}%. Top performer.`:`Conversion rate ${c.convRate}%. Top performer.`};
      if(c.pendingCount>10) return {icon:"🟡",name:c.name,text:fr?`${c.pendingCount} TX pending. Besoin de validation.`:`${c.pendingCount} TX pending. Needs validation.`};
      if(c.convRate<50&&c.count>=5) return {icon:"🔴",name:c.name,text:fr?`Conversion faible (${c.convRate}%). Coaching recommandé.`:`Low conversion (${c.convRate}%). Coaching recommended.`};
      return {icon:"🟢",name:c.name,text:fr?`${c.count} TX, ${c.convRate}% conversion.`:`${c.count} TX, ${c.convRate}% conversion.`};
    });
  }, [chatterAnalysis, fr]);

  const maxModelCA = modelAnalysis.length>0?modelAnalysis[0].total:1;

  return (
    <div style={{position:"relative"}}>
      {/* Ambient glow */}
      {/* decorative glow removed for clean design */}

      {/* HEADER */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:800,margin:0,background:"var(--grad)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            {fr?"Agents IA · Centre de Commande":"AI Agents · Command Center"}
          </h2>
          <p style={{fontSize:12,color:"var(--text-tertiary)",margin:"4px 0 0"}}>{fr?"Analyses temps réel · Recommandations · Alertes":"Real-time analytics · Recommendations · Alerts"}</p>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",gap:3}}>
            <span style={{width:4,height:4,borderRadius:"50%",background:"var(--accent)",animation:"wave 1.4s ease-in-out infinite",animationDelay:"0s"}}/>
            <span style={{width:4,height:4,borderRadius:"50%",background:"var(--accent)",animation:"wave 1.4s ease-in-out infinite",animationDelay:"0.2s"}}/>
            <span style={{width:4,height:4,borderRadius:"50%",background:"var(--accent)",animation:"wave 1.4s ease-in-out infinite",animationDelay:"0.4s"}}/>
          </div>
          <span style={{fontSize:11,color:"var(--accent)",fontWeight:600,letterSpacing:0.5}}>IA ACTIVE</span>
        </div>
      </div>

      {/* ── SECTION 1: ALERTES & RECOMMANDATIONS ── */}
      <div style={{marginBottom:32}}>
        {sectionTitle("🔥",fr?"Alertes & Recommandations":"Alerts & Recommendations",fr?"Générées automatiquement à partir de vos données":"Auto-generated from your data")}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {recommendations.map((r,i) => (
            <div key={r.title} style={{display:"flex",alignItems:"center",gap:16,padding:"16px 20px",background:r.level==="urgent"?"var(--danger-muted)":r.level==="warning"?"var(--warning-muted)":"var(--accent-subtle)",border:"1px solid "+(r.level==="urgent"?"var(--danger-muted)":r.level==="warning"?"var(--warning-muted)":"var(--accent-muted)"),borderRadius:16,borderLeft:"4px solid "+(r.level==="urgent"?"var(--danger)":r.level==="warning"?"var(--warning)":"var(--accent)")}}>
              <span style={{fontSize:28}}>{r.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,marginBottom:3}}>{r.title}</div>
                <div style={{fontSize:12,color:"var(--text-tertiary)"}}>{r.desc}</div>
              </div>
              {r.action&&onNavigate&&(
                <button onClick={()=>onNavigate(r.actionTab)} style={{padding:"7px 16px",borderRadius:12,border:"1px solid var(--border-accent)",background:"var(--accent-muted)",color:"var(--accent)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif"}}>{r.action} →</button>
              )}
            </div>
          ))}
          {recommendations.length===0&&<div style={{textAlign:"center",padding:30,color:"var(--text-quaternary)",fontSize:13}}>{fr?"Aucune alerte":"No alerts"}</div>}
        </div>
      </div>

      {/* ── SECTION 2: ANALYSE SPENDERS ── */}
      <div style={{marginBottom:32}}>
        {sectionTitle("📊",fr?"Analyse Spenders":"Spenders Analysis",fr?"Segmentation, LTV et tendances":"Segmentation, LTV and trends")}
        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:14,marginBottom:20}}>
          <GradientCard><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{fontSize:10,textTransform:"uppercase",color:"var(--text-secondary)",fontWeight:600,letterSpacing:0.5}}>Spenders</span><span style={{fontSize:16}}>👥</span></div><div style={{fontSize:26,fontWeight:800}}>{animSpenders}</div></GradientCard>
          <GradientCard><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{fontSize:10,textTransform:"uppercase",color:"var(--text-secondary)",fontWeight:600,letterSpacing:0.5}}>{fr?"Panier moyen":"Avg basket"}</span><span style={{fontSize:16}}>🛒</span></div><div style={{fontSize:26,fontWeight:800}}>{animBasket}{currencySymbol}</div></GradientCard>
          <GradientCard><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{fontSize:10,textTransform:"uppercase",color:"var(--text-secondary)",fontWeight:600,letterSpacing:0.5}}>{fr?"LTV moyen":"Avg LTV"}</span><span style={{fontSize:16}}>💎</span></div><div style={{fontSize:26,fontWeight:800}}>{animLTV}{currencySymbol}</div></GradientCard>
          <GradientCard><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{fontSize:10,textTransform:"uppercase",color:"var(--text-secondary)",fontWeight:600,letterSpacing:0.5}}>Whales</span><span style={{fontSize:16}}>🐋</span></div><div style={{fontSize:26,fontWeight:800}}>{animWhales}</div></GradientCard>
        </div>
        {/* Segmentation */}
        <div style={cardS}>
          <h4 style={{fontSize:13,fontWeight:700,marginBottom:14}}>{fr?"Segmentation":"Segmentation"}</h4>
          <SegmentBar label="🐋" pct={spenderAnalysis.totalSpenders>0?Math.round(spenderAnalysis.whales.length/spenderAnalysis.totalSpenders*100):0} color="var(--accent)" count={spenderAnalysis.whales.length} total={spenderAnalysis.whaleTotal}/>
          <SegmentBar label="⭐" pct={spenderAnalysis.totalSpenders>0?Math.round(spenderAnalysis.vips.length/spenderAnalysis.totalSpenders*100):0} color="var(--warning)" count={spenderAnalysis.vips.length} total={spenderAnalysis.vipTotal}/>
          <SegmentBar label="👤" pct={spenderAnalysis.totalSpenders>0?Math.round(spenderAnalysis.regulars.length/spenderAnalysis.totalSpenders*100):0} color="var(--success)" count={spenderAnalysis.regulars.length} total={spenderAnalysis.regTotal}/>
          <div style={{display:"flex",gap:16,marginTop:10,fontSize:10,color:"var(--text-tertiary)"}}>
            <span>🐋 WHALE {">"}500{currencySymbol}</span><span>⭐ VIP 200-500{currencySymbol}</span><span>👤 REGULAR {"<"}200{currencySymbol}</span>
          </div>
        </div>
        {/* Top 5 */}
        <div style={{...cardS,marginTop:14}}>
          <h4 style={{fontSize:13,fontWeight:700,marginBottom:14}}>Top 5 Spenders</h4>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {spenderAnalysis.top5.map((sp,i) => {
              const days = [];
              for(let d=6;d>=0;d--) { const dk = new Date(now.getTime()-d*86400000).toISOString().slice(0,10); days.push(sp.byDay[dk]||0); }
              const trend = days[6]>=(days[0]||1);
              return (
                <div key={sp.handle} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"var(--bg-overlay)",borderRadius:12,border:"1px solid var(--border-subtle)"}}>
                  <span style={{fontSize:14,fontWeight:800,color:"var(--accent)",width:20,textAlign:"center"}}>#{i+1}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700}}>{sp.handle}</div>
                    <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{sp.count} TX · {Math.round(sp.total)}{currencySymbol}</div>
                  </div>
                  <Sparkline data={days} color={trend?"var(--success)":"var(--danger)"} width={80} height={24}/>
                  <span style={{fontSize:11,color:trend?"var(--success)":"var(--danger)",fontWeight:700}}>{trend?"↑":"↓"}</span>
                </div>
              );
            })}
            {spenderAnalysis.top5.length===0&&<div style={{textAlign:"center",padding:20,color:"var(--text-quaternary)",fontSize:12}}>{fr?"Aucune donnée":"No data"}</div>}
          </div>
        </div>
      </div>

      {/* ── SECTION 3: ANALYSE MODELES ── */}
      <div style={{marginBottom:32}}>
        {sectionTitle("👩‍💼",fr?"Analyse Modèles":"Models Analysis",fr?"Performance et recommandations":"Performance and recommendations")}
        {/* Horizontal bar chart */}
        <div style={cardS}>
          <h4 style={{fontSize:13,fontWeight:700,marginBottom:14}}>{fr?"Comparaison CA":"Revenue Comparison"}</h4>
          {modelAnalysis.slice(0,6).map((m,i) => (
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
              <span style={{fontSize:12,fontWeight:700,minWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span>
              <div style={{flex:1,height:24,background:"var(--card-bg)",borderRadius:6,overflow:"hidden",position:"relative"}}>
                <div style={{height:"100%",width:`${Math.max(m.total/maxModelCA*100,2)}%`,background:"var(--accent)",borderRadius:6,transition:"width 0.8s ease"}}/>
              </div>
              <span style={{fontSize:11,fontWeight:700,minWidth:60,textAlign:"right"}}>{Math.round(m.total)}{currencySymbol}</span>
              <span style={{fontSize:10,color:m.validRate>=70?"var(--success)":m.validRate>=50?"var(--warning)":"var(--danger)",fontWeight:600,minWidth:35}}>{m.validRate}%</span>
            </div>
          ))}
          {modelAnalysis.length===0&&<div style={{textAlign:"center",padding:20,color:"var(--text-quaternary)",fontSize:12}}>{fr?"Aucune donnée":"No data"}</div>}
        </div>
        {/* Model recs */}
        <div style={{...cardS,marginTop:14}}>
          <h4 style={{fontSize:13,fontWeight:700,marginBottom:14}}>{fr?"Recommandations IA":"AI Recommendations"}</h4>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {modelRecs.map((r,i) => (
              <div key={r.name + "-" + i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:r.level==="urgent"?"var(--danger-muted)":r.level==="warning"?"var(--warning-muted)":"var(--accent-subtle)",borderRadius:10,border:"1px solid var(--border-subtle)"}}>
                <span style={{fontSize:14}}>{r.icon}</span>
                <div><span style={{fontWeight:700,fontSize:12}}>{r.name}</span><span style={{fontSize:12,color:"var(--text-secondary)",marginLeft:6}}>— {r.text}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTION 4: ANALYSE CHATTERS ── */}
      <div style={{marginBottom:32}}>
        {sectionTitle("💬",fr?"Analyse Chatters":"Chatters Analysis",fr?"Conversion, efficacité et ranking":"Conversion, efficiency and ranking")}
        <div style={cardS}>
          <h4 style={{fontSize:13,fontWeight:700,marginBottom:14}}>{fr?"Ranking Chatters":"Chatters Ranking"}</h4>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {chatterAnalysis.map((c,i) => (
              <div key={c.id||i} style={{padding:"14px 16px",background:"var(--bg-overlay)",borderRadius:12,border:"1px solid var(--border-subtle)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:14,fontWeight:800,color:"var(--accent)"}}>#{i+1}</span>
                    <span style={{fontSize:13,fontWeight:700}}>{c.name}</span>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:c.convRate>=80?"var(--success-muted)":c.convRate>=50?"var(--warning-muted)":"var(--danger-muted)",color:c.convRate>=80?"var(--success)":c.convRate>=50?"var(--warning)":"var(--danger)",fontWeight:600}}>{c.convRate}%</span>
                  </div>
                  <div style={{display:"flex",gap:16,fontSize:11,color:"var(--text-secondary)"}}>
                    <span>{c.count} TX</span>
                    <span style={{fontWeight:700,color:"var(--text)"}}>{Math.round(c.total)}{currencySymbol}</span>
                    <span style={{color:"var(--warning)"}}>{Math.round(c.commission)}{currencySymbol} com.</span>
                  </div>
                </div>
                <div style={{height:6,background:"var(--bg-overlay)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${c.pct}%`,background:"var(--accent)",borderRadius:3,transition:"width 0.8s ease"}}/>
                </div>
              </div>
            ))}
            {chatterAnalysis.length===0&&<div style={{textAlign:"center",padding:20,color:"var(--text-quaternary)",fontSize:12}}>{fr?"Aucune donnée":"No data"}</div>}
          </div>
        </div>
        {/* Chatter recs */}
        <div style={{...cardS,marginTop:14}}>
          <h4 style={{fontSize:13,fontWeight:700,marginBottom:14}}>{fr?"Recommandations IA":"AI Recommendations"}</h4>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {chatterRecs.map((r,i) => (
              <div key={r.name + "-" + i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:"var(--accent-subtle)",borderRadius:10,border:"1px solid var(--border-subtle)"}}>
                <span style={{fontSize:14}}>{r.icon}</span>
                <div><span style={{fontWeight:700,fontSize:12}}>💬 {r.name}</span><span style={{fontSize:12,color:"var(--text-secondary)",marginLeft:6}}>— {r.text}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTION 5: TO-DO ── */}
      <div style={{marginBottom:32}}>
        {sectionTitle("✅",fr?"Actions Suggérées":"Suggested Actions",fr?"Tâches prioritaires générées par l'IA":"Priority tasks generated by AI")}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {todos.map((td,i) => (
            <div key={td.text} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",borderRadius:14}}>
              <input type="checkbox" checked={!!todoDone[i]} onChange={()=>toggleTodo(i)} style={{accentColor:"var(--accent)",width:16,height:16,cursor:"pointer"}}/>
              <span style={{width:8,height:8,borderRadius:"50%",background:td.priority==="high"?"var(--danger)":td.priority==="medium"?"var(--warning)":"var(--success)",flexShrink:0}}/>
              <span style={{flex:1,fontSize:13,fontWeight:500,textDecoration:todoDone[i]?"line-through":"none",opacity:todoDone[i]?0.4:1}}>{td.text}</span>
              {td.tab&&onNavigate&&<button onClick={()=>onNavigate(td.tab)} style={{fontSize:10,color:"var(--accent)",fontWeight:600,cursor:"pointer",background:"none",border:"none",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>{fr?"Aller":"Go"} →</button>}
            </div>
          ))}
          {todos.length===0&&<div style={{textAlign:"center",padding:30,color:"var(--text-quaternary)",fontSize:13}}>{fr?"Aucune action en attente. Tout est en ordre !":"No pending actions. Everything looks good!"}</div>}
        </div>
      </div>

      {/* ── SECTION 6: JOURNAL D'ACTIVITÉ AGENTS ── */}
      <div>
        {sectionTitle("📋",fr?"Journal d'Activité Agents":"Agent Activity Log")}
        {/* Agent cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
          {agents.map((a,i) => (
            <GradientCard key={a.name}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                <div style={{width:38,height:38,borderRadius:10,background:"var(--accent-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,color:"var(--accent)"}}>{a.initials}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:700}}>{a.name}<span style={{fontSize:9,padding:"2px 8px",borderRadius:12,background:`${a.badgeColor}22`,color:a.badgeColor,fontWeight:700,marginLeft:8,textTransform:"uppercase",letterSpacing:0.5}}>{a.badge}</span></div>
                  <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{a.role}</div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:10,color:"var(--text-tertiary)"}}>{fr?"Dernière action":"Last action"}: {a.lastAction}</span>
                <span style={{fontSize:13,fontWeight:800,color:a.statColor}}>{a.stat}</span>
              </div>
            </GradientCard>
          ))}
        </div>
        {/* Log table */}
        <div style={cardS}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <h4 style={{fontSize:13,fontWeight:700,margin:0}}>{fr?"Historique":"History"}</h4>
            <span style={{fontSize:10,padding:"3px 10px",borderRadius:12,background:"rgba(34,197,94,0.15)",color:"var(--success)",fontWeight:700,textTransform:"uppercase"}}>Live</span>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"separate",borderSpacing:"0 4px"}}>
              <thead><tr>{[fr?"Heure":"Time","Agent","Action",fr?"Détail":"Detail",fr?"Statut":"Status"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {logs.map((log,i) => (
                  <tr key={log.time + "-" + log.agent + "-" + i} style={{transition:"background 0.2s"}}>
                    <td style={{...tdS,fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)"}}>{log.time}</td>
                    <td style={tdS}><span style={{color:log.agentColor,fontWeight:600}}>{log.agent}</span></td>
                    <td style={tdS}>{log.action}</td>
                    <td style={tdS}><span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:"var(--accent-muted)",color:"var(--accent)"}}>{log.detail}</span></td>
                    <td style={tdS}><StatusPill status={log.status} lang={lang}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
});

module.exports.default = AgentsAuditTab;
