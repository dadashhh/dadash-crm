// =============================================
// PROVIDER COMPTA TAB — Full Provider Dashboard
// =============================================
const ProviderComptaTab = ({user, lang, txs, providerPayouts: ppData, profiles, models, onRefresh, onNotify, invoices}) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const fr = lang === "fr";
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provSubTab, setProvSubTab] = useState("paiements");
  const [form, setForm] = useState({amount:"",currency:"EUR",period_from:"",period_to:"",payment_method:"virement",reference:"",notes:""});

  // TX stats
  const providerTxs = txs.filter(tx=>tx.provider_id===user.id);
  const validTxs = providerTxs.filter(tx=>tx.status==="validated"||tx.status==="confirmee");
  const pendingTxs = providerTxs.filter(tx=>tx.status==="pending");
  const totalCA = validTxs.reduce((s,tx)=>s+convertAmount(Number(tx.amount),tx.currency),0);
  const totalPending = pendingTxs.reduce((s,tx)=>s+convertAmount(Number(tx.amount),tx.currency),0);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(),now.getMonth(),1);
  const thisMonthTxs = validTxs.filter(tx=>new Date(tx.date)>=monthStart);
  const thisMonthCA = thisMonthTxs.reduce((s,tx)=>s+convertAmount(Number(tx.amount),tx.currency),0);

  // Provider payouts from provider_payouts table
  const myPayouts = (ppData||[]).filter(p=>p.provider_id===user.id||p.declared_by===user.id);
  const validatedPayouts = myPayouts.filter(p=>p.status==="validated");
  const pendingPayouts = myPayouts.filter(p=>p.status==="pending");
  const totalPaid = validatedPayouts.reduce((s,p)=>s+Number(p.amount),0);
  const totalPendingPayout = pendingPayouts.reduce((s,p)=>s+Number(p.amount),0);
  const balance = totalCA - totalPaid - totalPendingPayout;

  const handleDeclare = async () => {
    if(!isValidAmount(form.amount)){addToast(fr?"Montant invalide (doit être > 0)":"Invalid amount (must be > 0)","error");return;}
    if(!isValidDate(form.period_from)||!isValidDate(form.period_to)){addToast(fr?"Dates invalides":"Invalid dates","error");return;}
    setSaving(true);
    try {
      const {error} = await sb.from("provider_payouts").insert({
        provider_id:user.id, declared_by:user.id,
        amount:parseFloat(form.amount), currency:form.currency,
        period_from:form.period_from, period_to:form.period_to,
        payment_method:form.payment_method, reference:form.reference,
        notes:form.notes, status:"pending"
      });
      if(error){addToast("Erreur: "+error.message,"error");setSaving(false);return;}
      // Notify gérant
      const gerants = profiles.filter(p=>p.role==="gerant");
      for(const g of gerants){
        if(onNotify) await onNotify(g.id,"payment","\u{1F4B3} Paiement déclaré",`${user.name} a déclaré un paiement de ${form.amount}${form.currency==="EUR"?"€":"CHF"}`);
      }
      setForm({amount:"",currency:"EUR",period_from:"",period_to:"",payment_method:"virement",reference:"",notes:""});
      setShowForm(false);
      if(onRefresh) await onRefresh();
      addToast(fr?"Paiement déclaré ✓":"Payment declared ✓","success");
    } catch(e){addToast("Erreur: "+e.message,"error");}
    setSaving(false);
  };

  const statusBadge = (s) => {
    const map = {pending:{bg:"var(--warning-muted)",color:"var(--warning)",icon:"⏳"},validated:{bg:"var(--success-muted)",color:"var(--success)",icon:"✅"},rejected:{bg:"var(--danger-muted)",color:"var(--danger)",icon:"❌"}};
    const st = map[s]||map.pending;
    return React.createElement("span",{style:{padding:"3px 10px",borderRadius:12,background:st.bg,color:st.color,fontSize:11,fontWeight:700}},st.icon+" "+s);
  };

  const myProviderInvoices = (invoices||[]).filter(inv => inv.type === "incoming_provider" && inv.provider_id === user.id);

  return (
    <div>
      {/* Header */}
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:20,fontWeight:800,margin:0}}>{fr?"Bonjour":"Hello"} {user.name} {"\u{1F44B}"}</h2>
        <p style={{fontSize:11,color:"var(--text-tertiary)",margin:"3px 0 0",fontStyle:"italic"}}>{fr?"Votre espace prestataire":"Your provider space"}</p>
      </div>

      {/* Sub-tabs: Paiements / Factures */}
      <div style={{display:"flex",gap:4,marginBottom:20}}>
        {[{id:"paiements",label:fr?"Mes Paiements":"My Payments"},{id:"factures",label:fr?"Mes Factures":"My Invoices"}].map(tb=>(
          <button key={tb.id} className="btn" style={{padding:"6px 16px",fontSize:12,fontWeight:provSubTab===tb.id?800:600,background:provSubTab===tb.id?"var(--accent)":"var(--card-bg)",color:provSubTab===tb.id?"#fff":"var(--text-secondary)",border:"1px solid "+(provSubTab===tb.id?"var(--accent)":"var(--border-subtle)"),borderRadius:20}} onClick={()=>setProvSubTab(tb.id)}>{tb.label}</button>
        ))}
      </div>

      {provSubTab === "factures" ? (
        <MyInvoicesPanel invoices={myProviderInvoices} lang={lang} />
      ) : (
      <>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:24}}>
        {[
          {label:fr?"CA Total Traité":"Total Revenue",value:totalCA.toLocaleString("fr-FR",{maximumFractionDigits:0})+currencySymbol,icon:"\u{1F4B0}",color:"var(--success)"},
          {label:"TX Total",value:providerTxs.length,icon:"\u{1F4CB}"},
          {label:fr?"Ce mois":"This month",value:thisMonthCA.toLocaleString("fr-FR",{maximumFractionDigits:0})+currencySymbol,icon:"\u{1F4C5}",color:"var(--accent)"},
          {label:fr?"Paiements validés":"Validated payments",value:totalPaid.toLocaleString("fr-FR",{maximumFractionDigits:0})+currencySymbol,icon:"\u2705",color:"var(--success)"},
          {label:fr?"Solde en attente":"Pending balance",value:balance.toLocaleString("fr-FR",{maximumFractionDigits:0})+currencySymbol,icon:balance>0?"\u26A0\uFE0F":"\u2705",color:balance>0?"var(--warning)":"var(--success)"},
        ].map((k,i)=>(
          <div key={k.label} style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:18,padding:"14px 16px"}}>
            <div style={{fontSize:10,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>{k.icon} {k.label}</div>
            <div style={{fontSize:22,fontWeight:800,color:k.color||"var(--text-primary)"}}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Declare payment button */}
      <button className="btn btn-primary" style={{marginBottom:20,width:"auto"}} onClick={()=>setShowForm(!showForm)}>
        + {fr?"Déclarer un paiement":"Declare a payment"}
      </button>

      {/* Declare form */}
      {showForm&&(
        <div className="card" style={{marginBottom:20}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>{fr?"Nouveau paiement":"New payment"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
            <div className="form-group-modal">
              <label className="form-label">{fr?"Montant versé *":"Amount paid *"}</label>
              <input className="form-input" type="number" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00"/>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{fr?"Devise":"Currency"}</label>
              <select className="filter-select" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>
                <option value="EUR">EUR</option><option value="CHF">CHF</option><option value="USD">USD</option>
              </select>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{fr?"Période du *":"Period from *"}</label>
              <input className="filter-date" type="date" value={form.period_from} onChange={e=>setForm({...form,period_from:e.target.value})}/>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{fr?"Période au *":"Period to *"}</label>
              <input className="filter-date" type="date" value={form.period_to} onChange={e=>setForm({...form,period_to:e.target.value})}/>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{fr?"Méthode de paiement":"Payment method"}</label>
              <select className="filter-select" value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}>
                <option value="virement">Virement</option><option value="crypto">Crypto</option><option value="paypal">PayPal</option><option value="revolut">Revolut</option><option value="wise">Wise</option>
              </select>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{fr?"Référence / IBAN ref":"Reference / IBAN ref"}</label>
              <input className="form-input" value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder={fr?"Numéro de virement...":"Transfer number..."}/>
            </div>
            <div className="form-group-modal" style={{gridColumn:"1/-1"}}>
              <label className="form-label">Notes</label>
              <input className="form-input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder={fr?"Notes optionnelles...":"Optional notes..."}/>
            </div>
          </div>
          <div style={{display:"flex",gap:12,marginTop:16}}>
            <button className="btn btn-success" onClick={handleDeclare} disabled={saving}>{saving?<><BtnSpinner/>{" "}</>:(fr?"Déclarer":"Declare")}</button>
            <button className="btn btn-danger" onClick={()=>setShowForm(false)}>{fr?"Annuler":"Cancel"}</button>
          </div>
        </div>
      )}

      {/* Payment history */}
      <div className="card" style={{marginBottom:20}}>
        <div className="section-title"><div className="section-bar"></div>{fr?"Historique de mes paiements":"My payment history"}</div>
        {myPayouts.length===0?(
          <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:30,fontSize:13}}>{fr?"Aucun paiement déclaré":"No payments declared"}</div>
        ):(
          <div className="table-wrap">
            <table className="table" style={{fontSize:12}}>
              <thead><tr>
                <th>{t(lang,"date")}</th><th>{t(lang,"amount")}</th><th>{fr?"Période":"Period"}</th>
                <th>{fr?"Méthode":"Method"}</th><th>{fr?"Référence":"Reference"}</th><th>{t(lang,"status")}</th><th>Notes</th>
              </tr></thead>
              <tbody>
                {myPayouts.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(p=>(
                  <tr key={p.id}>
                    <td>{fmtDate(p.created_at)}</td>
                    <td style={{fontWeight:700}}>{Number(p.amount).toLocaleString("fr-FR",{maximumFractionDigits:0})}{p.currency==="EUR"?"€":"CHF"}</td>
                    <td style={{fontSize:10}}>{fmtDate(p.period_from)} → {fmtDate(p.period_to)}</td>
                    <td>{p.payment_method||"—"}</td>
                    <td style={{fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis"}}>{p.reference||"—"}</td>
                    <td>{statusBadge(p.status)}</td>
                    <td style={{fontSize:10,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis"}}>{p.notes||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TX list */}
      <div className="card">
        <div className="section-title"><div className="section-bar"></div>{fr?"Mes transactions":"My transactions"}</div>
        {providerTxs.length === 0 ? <EmptyState icon="💸" text="Aucune transaction"/> :
        <div className="table-wrap">
          <table className="table" style={{fontSize:12}}>
            <thead><tr><th>{t(lang,"date")}</th><th>Spender</th><th>Model</th><th>{t(lang,"amount")}</th><th>{t(lang,"status")}</th></tr></thead>
            <tbody>
              {providerTxs.slice(0,30).map(tx=>(
                <tr key={tx.id}>
                  <td>{fmtDate(tx.date)}</td>
                  <td><Tag type="spender" label={tx.spender_handle} id={tx.spender_handle}/></td>
                  <td><Tag type="model" label={models.find(m=>m.id===tx.model_id)?.name||"?"} id={tx.model_id}/></td>
                  <td style={{fontWeight:700}}>{fmtAmount(tx.amount,tx.currency)}</td>
                  <td><StatusPill status={tx.status} lang={lang}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>
      </>
      )}
    </div>
  );
});

module.exports.default = ProviderComptaTab;
