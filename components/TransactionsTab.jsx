// =============================================
// TRANSACTIONS TAB
// =============================================
const TransactionsTab = React.memo(({user, lang, txs, models, profiles, dbSpenders, onRefresh, onNotify, products, productTags, modelPrices}) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const dr = useDateRange("7d");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [chatter, setChatter] = useState("");
  const [txProvider, setTxProvider] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({spender_handle:"",amount:"",currency:"EUR",model_id:"",chatter_id:user.id,provider_id:"",product:"",tag:"",product_id:"",product_tag_id:"",notes:""});
  const [editingTx, setEditingTx] = useState(null);
  const [processingTxId, setProcessingTxId] = useState(null);
  const [confirmRefuse, setConfirmRefuse] = useState(null);
  const [txPage, setTxPage] = useState(0);
  const {sort, onSort, doSort} = useSortable("date","desc");
  const activeProducts = (products||[]).filter(p => p.active !== false);
  const activeTags = (productTags||[]).filter(t => t.active !== false);
  let filtered = filterByStatus(filterByChatter(filterByProvider(filterByModel(dr.filterByDate(txs, "date"), model), txProvider), chatter), status);

  // Sort + paginate
  const sorted = doSort(filtered, {
    date: x => new Date(x.date||0).getTime(),
    spender_handle: x => (x.spender_handle||"").toLowerCase(),
    amount: x => Number(x.amount)||0,
    currency: x => x.currency||"EUR",
    model: x => (models.find(m=>m.id===x.model_id)?.name||"").toLowerCase(),
    provider: x => (profiles.find(p=>p.id===x.provider_id)?.name||"").toLowerCase(),
    chatter: x => (profiles.find(p=>p.id===x.chatter_id)?.name||"").toLowerCase(),
    status: x => x.status||"",
    product: x => (x.product||"").toLowerCase(),
  });

  // Reset page when filters change
  const filteredLen = filtered.length;
  useEffect(() => { setTxPage(0); }, [filteredLen]);

  const totalTxPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));
  const paginatedTxs = sorted.slice(txPage * ROWS_PER_PAGE, (txPage + 1) * ROWS_PER_PAGE);

  // Build spender list for autocomplete
  const spenderOptions = React.useMemo(() => {
    const set = new Set();
    (dbSpenders || []).forEach(s => set.add(s.handle || s.name));
    txs.forEach(tx => { if(tx.spender_handle) set.add(tx.spender_handle); });
    return [...set].sort();
  }, [dbSpenders, txs]);

  const handleCreate = async () => {
    if(!isValidHandle(form.spender_handle)) { addToast(lang==="fr"?"Nom du spender requis":"Spender name required","error"); return; }
    if(!isValidAmount(form.amount)) { addToast(lang==="fr"?"Montant invalide (doit être > 0)":"Invalid amount (must be > 0)","error"); return; }
    setSaving(true);
    try {
      // Step 1: UPSERT le Spender en DB
      const handle = sanitizeHandle(form.spender_handle);
      try {
        await safeUpsertSpender({handle, name: handle, status: "active", last_seen: new Date().toISOString()});
      } catch(e) { /* Spender upsert best-effort */ }

      // Step 2: INSERT transaction — only include FK fields if they look like valid UUIDs
      // Store date in UTC+1 (Europe/Paris) reference timezone
      const now = new Date();
      const dateUTC1 = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
      const isUUID = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      const txRow = {
        date: dateUTC1.toISOString(),
        spender_handle: handle,
        amount: parseFloat(form.amount),
        status: "pending",
        notes: form.notes || null,
      };
      if(isUUID(form.model_id)) txRow.model_id = form.model_id;
      if(isUUID(form.provider_id)) txRow.provider_id = form.provider_id;
      if(isUUID(form.chatter_id)) txRow.chatter_id = form.chatter_id;
      if(form.currency && form.currency !== "EUR") txRow.currency = form.currency;
      if(form.product) txRow.product = form.product;
      if(form.tag) txRow.tag = form.tag;
      if(isUUID(form.product_id)) txRow.product_id = form.product_id;
      if(isUUID(form.product_tag_id)) txRow.product_tag_id = form.product_tag_id;
      const res = await safeInsertTx(txRow);

      if(!res.error) {
        setForm({spender_handle:"",amount:"",currency:"EUR",model_id:"",chatter_id:user.id,provider_id:"",product:"",tag:"",product_id:"",product_tag_id:"",notes:""});
        setShowForm(false);
        setSaving(false);
        await onRefresh();
        addToast(t(lang,"tx_created")||"Transaction créée ✓","success");
        // ── Send notifications ──
        if(onNotify&&res.data&&res.data[0]) {
          const tx = res.data[0];
          const cur = currencySymbol;
          const modelName = models.find(m=>m.id===tx.model_id)?.name||"";
          const providerName = profiles.find(p=>p.id===tx.provider_id)?.name||"";
          // Notify gerants
          profiles.filter(p=>p.role==="gerant").forEach(g=>onNotify(g.id,"tx_created","Nouvelle transaction",`${tx.amount}${cur} de @${tx.spender_handle}${modelName?" sur #"+modelName:""}${providerName?" par @"+providerName:""}`,tx.id));
          // Notify provider
          if(tx.provider_id){const prov=profiles.find(p=>p.id===tx.provider_id);if(prov)onNotify(prov.id,"tx_created","Nouvelle vente",`${tx.amount}${cur} de @${tx.spender_handle}`,tx.id);}
        }
      } else {
        setSaving(false);
        // TX insert failed
        addToast("Erreur: " + (res.error.message || "insert failed"),"error");
      }
    } catch(e) {
      setSaving(false);
      // handleCreate error
      addToast("Erreur: " + e.message, "error");
    }
  };
  const handleStatus = async (txId, newStatus) => {
    if (processingTxId) return; // double-click guard
    setProcessingTxId(txId);
    try {
      // Immutability guard: only pending transactions can change status
      const currentTx = txs.find(tx => tx.id === txId);
      if (currentTx && currentTx.status !== "pending") {
        addToast(t(lang,"tx_immutable"), "error");
        setProcessingTxId(null);
        return;
      }
      const {error} = await sb.from("transactions").update({status:newStatus}).eq("id",txId);
      if(error) { addToast("Erreur: " + error.message, "error"); setProcessingTxId(null); return; }
      // ── Notify on validate/refuse ──
      if(onNotify&&currentTx) {
        const cur = currencySymbol;
        const modelName = models.find(m=>m.id===currentTx.model_id)?.name||"";
        if(newStatus==="validated") {
          if(currentTx.chatter_id) onNotify(currentTx.chatter_id,"tx_validated","TX validée ✅",`${currentTx.amount}${cur} de @${currentTx.spender_handle} — commission ${(currentTx.chatter_commission||0).toFixed(0)}${cur}`,txId);
          profiles.filter(p=>p.role==="gerant").forEach(g=>onNotify(g.id,"tx_validated","TX validée",`${currentTx.amount}${cur} @${currentTx.spender_handle}${modelName?" #"+modelName:""}`,txId));
        } else {
          if(currentTx.chatter_id) onNotify(currentTx.chatter_id,"tx_refused","TX refusée ❌",`${currentTx.amount}${cur} de @${currentTx.spender_handle} — motif à vérifier`,txId);
          profiles.filter(p=>p.role==="gerant").forEach(g=>onNotify(g.id,"tx_refused","TX refusée",`${currentTx.amount}${cur} @${currentTx.spender_handle}${modelName?" #"+modelName:""}`,txId));
        }
      }
      await onRefresh();
      addToast(newStatus==="validated"?(t(lang,"tx_validated")||"Validée ✓"):(t(lang,"tx_refused")||"Refusée"), newStatus==="validated"?"success":"error");
    } catch(e) { addToast("Erreur: " + e.message, "error"); }
    setProcessingTxId(null);
  };
  const handleEditSave = async (updates) => {
    if (!editingTx || editingTx.status !== "pending") {
      addToast(t(lang,"tx_immutable"), "error");
      setEditingTx(null);
      return;
    }
    setSaving(true);
    try {
      const {error} = await sb.from("transactions").update({
        spender_handle:updates.spender_handle, amount:updates.amount, currency:updates.currency,
        model_id:updates.model_id, provider_id:updates.provider_id, chatter_id:updates.chatter_id,
        product:updates.product, tag:updates.tag, product_id:updates.product_id||null, product_tag_id:updates.product_tag_id||null, notes:updates.notes,
      }).eq("id", editingTx.id).eq("status","pending");
      setSaving(false);
      if (error) { addToast("Erreur: " + error.message, "error"); return; }
      // ── Notify on edit ──
      if(onNotify&&editingTx) {
        const cur = (updates.currency||editingTx.currency)==="EUR"?"€":" CHF";
        const msg = editingTx.amount!==updates.amount?`montant ${editingTx.amount}→${updates.amount}${cur}`:"TX modifiée";
        if(editingTx.provider_id) onNotify(editingTx.provider_id,"tx_modified","TX modifiée",msg,editingTx.id);
        if(editingTx.chatter_id) onNotify(editingTx.chatter_id,"tx_modified","TX modifiée",msg,editingTx.id);
        profiles.filter(p=>p.role==="gerant").forEach(g=>onNotify(g.id,"tx_modified","TX modifiée",`par @${user.name}: ${msg}`,editingTx.id));
      }
      setEditingTx(null);
      await onRefresh();
      addToast(t(lang,"tx_updated")||"Transaction modifiée ✓","success");
    } catch(e) {
      setSaving(false);
      addToast("Erreur: " + e.message, "error");
    }
  };
  return (
    <div>
      <GlobalFilterBar lang={lang} dr={dr} models={models} profiles={profiles}
        model={model} setModel={setModel} showModelFilter
        provider={txProvider} setProvider={setTxProvider} showProviderFilter={user.role==="gerant"}
        chatter={chatter} setChatter={setChatter} showChatterFilter={user.role==="gerant"}
        status={status} setStatus={setStatus} showStatusFilter />
      {(user.role==="gerant"||user.role==="chatter")&&(
        <button className="btn btn-primary" style={{marginBottom:20,width:"auto"}} onClick={()=>setShowForm(!showForm)}>+ {t(lang,"new_tx")}</button>
      )}
      {showForm&&(
        <div className="card" style={{marginBottom:20}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
            <div className="form-group-modal">
              <label className="form-label">{t(lang,"spender")}</label>
              <input className="form-input" list="spender-list" value={form.spender_handle} onChange={e=>setForm({...form,spender_handle:e.target.value})} placeholder="@handle ou choisir existant" autoComplete="off" />
              <datalist id="spender-list">{spenderOptions.map(s=><option key={s} value={s}/>)}</datalist>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{t(lang,"amount")}</label>
              <input className="form-input" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} />
            </div>
            <div className="form-group-modal">
              <label className="form-label">{t(lang,"currency")}</label>
              <select className="filter-select" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>
                <option>EUR</option><option>CHF</option><option>USD</option>
              </select>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{t(lang,"model")}</label>
              <select className="filter-select" value={form.model_id} onChange={e=>setForm({...form,model_id:e.target.value})}>
                <option value="">Select</option>
                {models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{t(lang,"provider")}</label>
              <select className="filter-select" value={form.provider_id} onChange={e=>setForm({...form,provider_id:e.target.value})}>
                <option value="">Select</option>
                {profiles.filter(u=>u.role==="provider").map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {user.role==="gerant"&&(
              <div className="form-group-modal">
                <label className="form-label">Chatter</label>
                <select className="filter-select" value={form.chatter_id} onChange={e=>setForm({...form,chatter_id:e.target.value})}>
                  {profiles.filter(u=>u.role==="chatter").map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
            <div className="form-group-modal">
              <label className="form-label">{t(lang,"product")}</label>
              <select className="filter-select" value={form.product_id} onChange={e=>{
                const pid = e.target.value;
                const prod = activeProducts.find(p=>p.id===pid);
                setForm({...form, product_id:pid, product:prod?.name||"", product_tag_id:"", tag:""});
              }}>
                <option value="">Select</option>
                {activeProducts.map(p=><option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
              </select>
            </div>
            <div className="form-group-modal">
              <label className="form-label">{t(lang,"tag")}</label>
              <select className="filter-select" value={form.product_tag_id} onChange={e=>{
                const tid = e.target.value;
                const tag = activeTags.find(t=>t.id===tid);
                if(tag) {
                  const mp = (modelPrices||[]).find(p=>p.model_id===form.model_id&&p.product_tag_id===tid);
                  const price = mp ? Number(mp.price) : Number(tag.default_price);
                  setForm({...form, product_tag_id:tid, tag:tag.name, amount: price > 0 ? String(price) : form.amount});
                } else {
                  setForm({...form, product_tag_id:tid, tag:""});
                }
              }}>
                <option value="">Select</option>
                {activeTags.filter(t=>!form.product_id||t.product_id===form.product_id).map(t=>{
                  const dur = t.duration_minutes ? ` (${t.duration_minutes}min)` : "";
                  const price = Number(t.default_price);
                  return <option key={t.id} value={t.id}>{t.name}{dur}{price>0?` — ${price}\u20AC`:""}</option>;
                })}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:12,marginTop:16}}>
            <button className="btn btn-success" onClick={handleCreate} disabled={saving}>{saving?<><BtnSpinner/>{" "}</>:t(lang,"create")}</button>
            <button className="btn btn-danger" onClick={()=>setShowForm(false)}>{t(lang,"cancel")}</button>
          </div>
        </div>
      )}
      <div className="card">
        {paginatedTxs.length === 0 ? <EmptyState icon="💸" text="Aucune transaction" sub="Créez votre première transaction"/> :
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><SortTh label={t(lang,"date")} sortKey="date" sort={sort} onSort={onSort}/><th>{t(lang,"hour")}</th><SortTh label="Spender" sortKey="spender_handle" sort={sort} onSort={onSort}/><SortTh label={t(lang,"amount")} sortKey="amount" sort={sort} onSort={onSort}/><SortTh label={t(lang,"cur")} sortKey="currency" sort={sort} onSort={onSort}/><SortTh label="Model" sortKey="model" sort={sort} onSort={onSort}/><SortTh label="Provider" sortKey="provider" sort={sort} onSort={onSort}/><SortTh label="Chatter" sortKey="chatter" sort={sort} onSort={onSort}/><SortTh label={t(lang,"product")} sortKey="product" sort={sort} onSort={onSort}/><th>{t(lang,"notes")}</th><SortTh label={t(lang,"status")} sortKey="status" sort={sort} onSort={onSort}/>{(user.role==="gerant"||user.role==="chatter"||user.role==="provider")&&<th>{t(lang,"actions")}</th>}</tr>
            </thead>
            <tbody>
              {paginatedTxs.map(tx=>{
                const chName = profiles.find(u=>u.id===tx.chatter_id)?.name||"?";
                const provName = profiles.find(u=>u.id===tx.provider_id)?.name||"?";
                const canEdit = tx.status === "pending" && (user.role === "gerant" || user.role === "chatter" || (user.role === "provider" && tx.provider_id === user.id));
                return (
                  <tr key={tx.id} className={tx.status==="pending"?"pending-row":""}>
                    <td style={{fontFamily:"monospace",fontSize:12,color:"var(--text-secondary)"}}>{fmtDate(tx.date)}</td>
                    <td style={{fontSize:11,whiteSpace:"nowrap",color:"var(--text-secondary)"}}>{fmtDayTime(tx.date)}</td>
                    <td><Tag type="spender" label={tx.spender_handle} id={tx.spender_handle}/></td>
                    <td style={{fontSize:14,fontWeight:800,color:"var(--text-primary)"}}>{fmtAmount(tx.amount,tx.currency)}{(tx.currency||"EUR")!==currencySymbol.replace("€","EUR").replace(" CHF","CHF")&&<span style={{fontSize:9,color:"var(--text-quaternary)",marginLeft:4}}>({tx.amount}{(tx.currency||"EUR")==="CHF"?" CHF":"€"})</span>}</td>
                    <td style={{fontSize:11}}>{tx.currency||"EUR"}</td>
                    <td><Tag type="model" label={models.find(m=>m.id===tx.model_id)?.name||"?"} id={tx.model_id}/></td>
                    <td><Tag type="provider" label={provName} id={tx.provider_id}/></td>
                    <td><Tag type="chatter" label={chName} id={tx.chatter_id}/></td>
                    <td style={{fontSize:11}}>{tx.product||"-"}</td>
                    <td style={{fontSize:11}}>{tx.notes||"-"}</td>
                    <td><StatusPill status={tx.status} lang={lang}/></td>
                    {(user.role==="gerant"||user.role==="chatter"||user.role==="provider")&&(
                      <td style={{whiteSpace:"nowrap"}}>
                        {canEdit && (
                          <button className="btn-edit" style={{marginRight:4}} onClick={()=>setEditingTx(tx)}>✏️ Modifier</button>
                        )}
                        {tx.status==="pending"&&(user.role==="gerant"||(user.role==="provider"&&tx.provider_id===user.id))&&(
                          <>
                            <button className="btn btn-success btn-small" onClick={()=>handleStatus(tx.id,"validated")} disabled={!!processingTxId}>{processingTxId===tx.id?<><BtnSpinner/>{" "}</>:t(lang,"validate")}</button>{" "}
                            <button className="btn btn-danger btn-small" onClick={()=>setConfirmRefuse(tx.id)} disabled={!!processingTxId}>{t(lang,"refuse")}</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
        <PaginationBar page={txPage} totalPages={totalTxPages} totalItems={sorted.length} lang={lang} onPageChange={setTxPage}/>
      </div>
      {editingTx && <EditTxModal tx={editingTx} lang={lang} onSave={handleEditSave} onCancel={() => setEditingTx(null)} saving={saving} models={models} profiles={profiles} />}
      <ConfirmDialog open={!!confirmRefuse} icon={"\u26A0\uFE0F"} title={lang==="fr"?"Refuser cette transaction ?":"Refuse this transaction?"} message={lang==="fr"?"Cette action est irréversible. La transaction sera marquée comme refusée.":"This action is irreversible. The transaction will be marked as refused."} confirmLabel={lang==="fr"?"Refuser":"Refuse"} cancelLabel={lang==="fr"?"Annuler":"Cancel"} danger onConfirm={()=>{handleStatus(confirmRefuse,"refused");setConfirmRefuse(null);}} onCancel={()=>setConfirmRefuse(null)}/>
    </div>
  );
});

module.exports.default = TransactionsTab;
