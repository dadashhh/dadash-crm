// =============================================
// CHATTERS TAB (gerant only)
// =============================================
const ChattersTab = ({user, lang, txs, profiles, models}) => {
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const [selectedId, setSelectedId] = useState(null);
  const chatters = profiles.filter(u=>u.role==="chatter");
  const chatterStatsMap = useMemo(() => {
    const map = {};
    chatters.forEach(ch => {
      const chTx = txs.filter(tx=>tx.chatter_id===ch.id);
      const validTx = chTx.filter(tx=>tx.status==="validated");
      const validCA = validTx.reduce((s,tx)=>s+Number(tx.amount),0);
      const pendingCA = chTx.filter(tx=>tx.status==="pending").reduce((s,tx)=>s+Number(tx.amount),0);
      const refusedCount = chTx.filter(tx=>tx.status==="refused").length;
      const commDue = validTx.reduce((s,tx)=>s+Number(tx.chatter_commission||0),0);
      const avgTicket = validTx.length ? validCA/validTx.length : 0;
      const spenders = [...new Set(chTx.map(tx=>tx.spender_handle))];
      map[ch.id] = {validCA, validCount:validTx.length, pendingCA, pendingCount:chTx.filter(tx=>tx.status==="pending").length, refusedCount, commDue, avgTicket, spenders};
    });
    return map;
  }, [chatters, txs]);
  const getStats = (chatterId) => chatterStatsMap[chatterId] || {validCA:0,validCount:0,pendingCA:0,pendingCount:0,refusedCount:0,commDue:0,avgTicket:0,spenders:[]};
  const { totalValidCA, totalCommOwed, totalPendingCA } = useMemo(() => ({
    totalValidCA: chatters.reduce((s,ch)=>s+(chatterStatsMap[ch.id]?.validCA||0),0),
    totalCommOwed: chatters.reduce((s,ch)=>s+(chatterStatsMap[ch.id]?.commDue||0),0),
    totalPendingCA: chatters.reduce((s,ch)=>s+(chatterStatsMap[ch.id]?.pendingCA||0),0),
  }), [chatters, chatterStatsMap]);
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

module.exports.default = ChattersTab;
