// =============================================
// ADMIN TAB (gerant only)
// =============================================
const AdminTab = ({lang, profiles, models, onRefresh, exchangeRate, setExchangeRate}) => {
  const addToast = useToast();
  const { currencySymbol } = useCurrency();
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const startEdit = (u) => {
    setSelectedUser(u.id);
    setForm({
      commission_pct:u.commission_pct||0,
      daily_goal:u.daily_goal||0,
      weekly_goal:u.weekly_goal||0,
      role: u.role||"chatter",
      assigned_models: u.assigned_models||[]
    });
  };
  const saveEdit = async () => {
    setSaving(true);
    try {
      const {error} = await sb.from("profiles").update({
        commission_pct: parseFloat(form.commission_pct),
        daily_goal: parseFloat(form.daily_goal),
        weekly_goal: parseFloat(form.weekly_goal),
        role: form.role,
        assigned_models: form.assigned_models
      }).eq("id", selectedUser);
      if(error) { addToast("Erreur profil: " + error.message, "error"); setSaving(false); return; }
      setSelectedUser(null);
      await onRefresh();
      addToast(t(lang,"settings_saved")||"Sauvegardé ✓","success");
    } catch(e) { addToast("Erreur profil: " + e.message, "error"); }
    setSaving(false);
  };
  const handleModelToggle = (modelId) => {
    const current = form.assigned_models || [];
    if(current.includes(modelId)) {
      setForm({...form, assigned_models: current.filter(m=>m!==modelId)});
    } else {
      setForm({...form, assigned_models: [...current, modelId]});
    }
  };
  return (
    <div>
      <div className="info-box">
        Pour ajouter un membre, va dans le dashboard Supabase &gt; Authentication &gt; Users &gt; Add User.
        Remplis l'email et un mot de passe. Le profil sera cree automatiquement.
        Tu peux ensuite modifier le role et la commission ici.
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="section-title"><div className="section-bar"></div>{t(lang,"users")}</div>
          {profiles.length === 0 ? <EmptyState icon="👤" text="Aucun utilisateur"/> :
          <table className="table" style={{fontSize:12}}>
            <thead><tr><th>Name</th><th>{t(lang,"role")}</th><th>Models</th><th>Comm %</th><th>Action</th></tr></thead>
            <tbody>
              {profiles.map(u=>(
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.role}</td>
                  <td>{(u.role==="chatter"||u.role==="model")?(u.assigned_models||[]).map(mid=>models.find(m=>m.id===mid)?.name).filter(Boolean).join(", ")||"none":"—"}</td>
                  <td>{u.commission_pct}%</td>
                  <td><button className="btn btn-primary btn-small" onClick={()=>startEdit(u)}>{t(lang,"edit")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>}
          {selectedUser&&(
            <div style={{marginTop:16,padding:12,background:"rgba(99,102,241,0.1)",borderRadius:8}}>
              <div className="form-group-modal">
                <label className="form-label">{t(lang,"role")}</label>
                <select className="filter-select" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                  <option value="gerant">gerant</option>
                  <option value="model">model</option>
                  <option value="chatter">chatter</option>
                  <option value="provider">provider</option>
                </select>
              </div>
              {(form.role==="chatter"||form.role==="model")&&(
                <div className="form-group-modal">
                  <label className="form-label">{form.role==="model"?"Model Profile (select 1)":"Assigned Models"}</label>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {models.map(m=>(
                      <label key={m.id} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                        <input type="checkbox" checked={(form.assigned_models||[]).includes(m.id)} onChange={()=>handleModelToggle(m.id)} />
                        {m.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="form-group-modal">
                <label className="form-label">Commission %</label>
                <input className="form-input" type="number" value={form.commission_pct} onChange={e=>setForm({...form,commission_pct:e.target.value})} />
              </div>
              <div className="form-group-modal">
                <label className="form-label">{t(lang,"daily_goal")}</label>
                <input className="form-input" type="number" value={form.daily_goal} onChange={e=>setForm({...form,daily_goal:e.target.value})} />
              </div>
              <div className="form-group-modal">
                <label className="form-label">{t(lang,"weekly_goal")}</label>
                <input className="form-input" type="number" value={form.weekly_goal} onChange={e=>setForm({...form,weekly_goal:e.target.value})} />
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-success" onClick={saveEdit} disabled={saving}>{saving?<><BtnSpinner/>{" "}</>:t(lang,"save")}</button>
                <button className="btn btn-danger" onClick={()=>setSelectedUser(null)}>{t(lang,"cancel")}</button>
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="card" style={{marginBottom:20}}>
            <div className="section-title"><div className="section-bar"></div>{t(lang,"models")}</div>
            {models.length === 0 ? <EmptyState icon="👩" text="Aucun modèle"/> :
            <table className="table"><thead><tr><th>Name</th><th>Platform</th><th>Cost</th></tr></thead>
            <tbody>
              {models.map(m=>(<tr key={m.id}><td>{m.name}</td><td>{m.platform}</td><td>{m.monthly_cost}</td></tr>))}
            </tbody></table>}
          </div>
          <div className="card">
            <div className="section-title"><div className="section-bar"></div>{t(lang,"providers")}</div>
            {profiles.filter(u=>u.role==="provider").length === 0 ? <EmptyState icon="🏢" text="Aucun prestataire"/> :
            <table className="table"><thead><tr><th>Name</th><th>Commission %</th><th>Email</th></tr></thead>
            <tbody>
              {profiles.filter(u=>u.role==="provider").map(p=>(<tr key={p.id}><td>{p.name}</td><td>{p.commission_pct||0}%</td><td>{p.email||""}</td></tr>))}
            </tbody></table>}
          </div>
        </div>
      </div>
      {/* Exchange Rate Config */}
      <div className="card" style={{marginTop:20}}>
        <div className="section-title"><div className="section-bar"></div>{t(lang,"exchange_rate")}</div>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0"}}>
          <span style={{fontSize:13,fontWeight:600}}>1 EUR =</span>
          <input type="number" step="0.01" value={exchangeRate||DEFAULT_EXCHANGE_RATE} onChange={(e)=>setExchangeRate&&setExchangeRate(Number(e.target.value))} style={{width:80,padding:"6px 10px",borderRadius:8,border:"1px solid var(--border-default)",background:"var(--bg-overlay)",color:"var(--text)",fontSize:14,fontWeight:700,textAlign:"center"}} />
          <span style={{fontSize:13,fontWeight:600}}>CHF</span>
          <span style={{fontSize:11,color:"var(--text2)",marginLeft:8}}>{t(lang,"exchange_rate_desc")}</span>
        </div>
      </div>
      {/* Agency Details Config for Invoicing */}
      <AgencyConfigSection lang={lang} />
    </div>
  );
};

// ── AGENCY CONFIG SECTION (for AdminTab) ──
const AgencyConfigSection = ({ lang }) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const [agencyForm, setAgencyForm] = useState(() => getAgencyDetails());
  const [saved, setSaved] = useState(false);
  const handleSave = () => {
    saveAgencyDetails(agencyForm);
    setSaved(true);
    addToast(fr ? "Informations agence sauvegardées ✓" : "Agency details saved ✓", "success");
    setTimeout(() => setSaved(false), 2000);
  };
  const fields = [
    { key: "name", label: fr ? "Nom de l'agence" : "Agency name", placeholder: "DADASH Agency" },
    { key: "address", label: fr ? "Adresse" : "Address", placeholder: fr ? "123 rue Example, 75001 Paris" : "123 Example St" },
    { key: "email", label: "Email", placeholder: "contact@agency.com" },
    { key: "phone", label: fr ? "Téléphone" : "Phone", placeholder: "+33 1 23 45 67 89" },
    { key: "company_id", label: "SIRET / RC", placeholder: "123 456 789 00012" },
    { key: "vat_number", label: fr ? "N° TVA" : "VAT Number", placeholder: "FR12345678901" },
    { key: "bank_iban", label: "IBAN", placeholder: "FR76 1234 5678 9012 3456 7890 123" },
    { key: "bank_bic", label: "BIC / SWIFT", placeholder: "BNPAFRPP" },
    { key: "logo_url", label: fr ? "URL du logo" : "Logo URL", placeholder: "https://..." },
  ];
  return React.createElement("div", { className: "card", style: { marginTop: 20 } },
    React.createElement("div", { className: "section-title" },
      React.createElement("div", { className: "section-bar" }),
      fr ? "Informations Agence (Factures)" : "Agency Details (Invoices)"
    ),
    React.createElement("p", { style: { fontSize: 11, color: "var(--text-tertiary)", marginBottom: 16 } },
      fr ? "Ces informations apparaissent sur toutes les factures générées." : "This information appears on all generated invoices."
    ),
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 } },
      fields.map(f => React.createElement("div", { key: f.key, className: "form-group-modal" },
        React.createElement("label", { className: "form-label" }, f.label),
        React.createElement("input", {
          className: "form-input",
          value: agencyForm[f.key] || "",
          onChange: e => setAgencyForm({ ...agencyForm, [f.key]: e.target.value }),
          placeholder: f.placeholder,
        })
      ))
    ),
    React.createElement("div", { style: { marginTop: 16 } },
      React.createElement("button", { className: "btn btn-success", onClick: handleSave },
        saved ? (fr ? "Sauvegardé ✓" : "Saved ✓") : (fr ? "Sauvegarder" : "Save")
      )
    )
  );
};

module.exports.default = AdminTab;
