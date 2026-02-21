// =============================================
// PAIES TAB
// =============================================
const PayesTab = ({user, lang, txs, payouts, profiles, onRefresh, invoices}) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const dr = useDateRange("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payesSubTab, setPayesSubTab] = useState("paies");
  const chatters = user.role==="chatter" ? profiles.filter(u=>u.id===user.id) : profiles.filter(u=>u.role==="chatter");
  const [form, setForm] = useState({user_id:chatters[0]?.id||"",amount:"",method:"Virement",date:""});
  const payFilteredTxs = dr.filterByDate(txs, "date");
  const getChatterData = (chatterId) => {
    const chTx = payFilteredTxs.filter(tx=>tx.chatter_id===chatterId && tx.status==="validated");
    const totalComm = chTx.reduce((s,tx)=>s+Number(tx.chatter_commission||0),0);
    const paidAmount = payouts.filter(p=>p.user_id===chatterId && p.status==="done").reduce((s,p)=>s+Number(p.amount),0);
    return {totalEarned:totalComm, paidAmount, balance:totalComm-paidAmount};
  };
  const handleAddPayout = async () => {
    if(!isValidAmount(form.amount)) { addToast(lang==="fr"?"Montant invalide (doit être > 0)":"Invalid amount (must be > 0)","error"); return; }
    if(!isValidDate(form.date)) { addToast(lang==="fr"?"Date invalide":"Invalid date","error"); return; }
    setSaving(true);
    try {
      const {data:inserted, error} = await sb.from("payouts").insert({user_id:form.user_id, amount:parseFloat(form.amount), method:form.method, date:form.date, status:"pending"}).select().single();
      if(error) { addToast("Erreur payout: " + error.message, "error"); setSaving(false); return; }
      // Auto-generate invoice for chatter payout
      const chatterProfile = profiles.find(p=>p.id===form.user_id);
      if(inserted && user.role==="gerant") {
        try { await generateChatterInvoice({id:inserted.id, user_id:form.user_id, amount:parseFloat(form.amount), method:form.method, date:form.date}, txs, profiles, user.id); } catch(e) { /* invoice gen error */ }
      }
      setForm({user_id:chatters[0]?.id||"",amount:"",method:"Virement",date:""});
      setShowForm(false);
      await onRefresh();
      addToast(t(lang,"payout_added")||"Payout ajouté ✓","success");
    } catch(e) { addToast("Erreur payout: " + e.message, "error"); }
    setSaving(false);
  };
  const myInvoices = (invoices||[]).filter(inv => {
    if (user.role === "chatter") return inv.profile_id === user.id && inv.type === "outgoing_chatter";
    if (user.role === "gerant") return inv.type === "outgoing_chatter";
    return false;
  });
  const fr = lang === "fr";
  return (
    <div>
      {/* Sub-tab selector */}
      <div style={{display:"flex",gap:4,marginBottom:20}}>
        {[{id:"paies",label:fr?"Mes Paies":"My Payouts"},{id:"factures",label:fr?"Mes Factures":"My Invoices"}].map(tb=>(
          <button key={tb.id} className="btn" style={{padding:"6px 16px",fontSize:12,fontWeight:payesSubTab===tb.id?800:600,background:payesSubTab===tb.id?"var(--accent)":"var(--card-bg)",color:payesSubTab===tb.id?"#fff":"var(--text-secondary)",border:"1px solid "+(payesSubTab===tb.id?"var(--accent)":"var(--border-subtle)"),borderRadius:20}} onClick={()=>setPayesSubTab(tb.id)}>{tb.label}</button>
        ))}
      </div>
      {payesSubTab==="factures" ? (
        <MyInvoicesPanel invoices={myInvoices} lang={lang} />
      ) : (
      <>
      <GlobalFilterBar lang={lang} dr={dr} />
      {chatters.map(ch=>{
        const data = getChatterData(ch.id);
        const chPayouts = payouts.filter(p=>p.user_id===ch.id);
        return (
          <div key={ch.id} className="card" style={{marginBottom:20}}>
            <div className="profile-header"><div className="profile-name"><Tag type="chatter" label={ch.name} id={ch.id}/></div></div>
            <div className="profile-section">
              <div className="profile-row"><span>{t(lang,"total_earned")}</span><span>{data.totalEarned.toFixed(0)}</span></div>
              <div className="profile-row"><span>{t(lang,"already_paid")}</span><span>{data.paidAmount.toFixed(0)}</span></div>
              <div className="profile-row"><span>{t(lang,"balance_due")}</span><span style={{color:data.balance>0?"var(--warning)":"var(--success)",fontWeight:700}}>{data.balance.toFixed(0)}</span></div>
            </div>
            <div style={{marginTop:16}}>
              <div className="section-title"><div className="section-bar"></div>{t(lang,"payment_history")}</div>
              {chPayouts.length === 0 ? <EmptyState icon="💰" text="Aucun paiement"/> :
              <div className="table-wrap">
                <table className="table" style={{fontSize:12}}>
                  <thead><tr><th>{t(lang,"date")}</th><th>{t(lang,"amount")}</th><th>{t(lang,"method")}</th><th>{t(lang,"status")}</th></tr></thead>
                  <tbody>
                    {chPayouts.map(p=>(
                      <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{p.amount}</td><td>{p.method}</td><td><span className={`badge ${p.status==="done"?"badge-done":"badge-pending"}`}>{p.status}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>}
            </div>
          </div>
        );
      })}
      {user.role==="gerant"&&(
        <>
          <button className="btn btn-primary" style={{marginBottom:20,width:"auto"}} onClick={()=>setShowForm(!showForm)}>+ {t(lang,"add_payout")}</button>
          {showForm&&(
            <div className="card" style={{marginBottom:20}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
                <div className="form-group-modal">
                  <label className="form-label">Chatter</label>
                  <select className="filter-select" value={form.user_id} onChange={e=>setForm({...form,user_id:e.target.value})}>
                    {chatters.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="form-group-modal">
                  <label className="form-label">{t(lang,"amount")}</label>
                  <input className="form-input" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} />
                </div>
                <div className="form-group-modal">
                  <label className="form-label">{t(lang,"method")}</label>
                  <select className="filter-select" value={form.method} onChange={e=>setForm({...form,method:e.target.value})}>
                    <option>Virement</option><option>PayPal</option><option>Revolut</option><option>Twint</option><option>Cash</option>
                  </select>
                </div>
                <div className="form-group-modal">
                  <label className="form-label">{t(lang,"date")}</label>
                  <input className="filter-date" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
                </div>
              </div>
              <div style={{display:"flex",gap:12,marginTop:16}}>
                <button className="btn btn-success" onClick={handleAddPayout} disabled={saving}>{saving?<><BtnSpinner/>{" "}</>:t(lang,"create")}</button>
                <button className="btn btn-danger" onClick={()=>setShowForm(false)}>{t(lang,"cancel")}</button>
              </div>
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
};

module.exports.default = PayesTab;
