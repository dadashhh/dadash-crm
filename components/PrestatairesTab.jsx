// =============================================
// PRESTATAIRES TAB — Gérant only
// =============================================
const PrestatairesTab = React.memo(({user, lang, txs, models, profiles, onRefresh, providerPayouts: ppData, onNotify}) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const fr = lang === "fr";
  const dr = useDateRange("all");
  const [pfModel, setPfModel] = useState("");
  const [selectedProv, setSelectedProv] = useState(null);
  const [subTab, setSubTab] = useState("stats");
  const [rejectId, setRejectId] = useState(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const provSort = useSortable("totalCA","desc");
  const [provPage, setProvPage] = useState(0);
  const ppSort = useSortable("created_at","desc");
  const [ppPage, setPpPage] = useState(0);

  const providers = profiles.filter(p => p.role === "provider");
  const filteredTxs = useMemo(() => {
    return filterByModel(dr.filterByDate(txs, "date"), pfModel);
  }, [txs, dr.startDate, dr.endDate, dr.activePreset, pfModel]);

  const providerStats = useMemo(() => {
    return providers.map(prov => {
      const pTxs = filteredTxs.filter(tx => tx.provider_id === prov.id);
      const validatedTxs = pTxs.filter(tx => tx.status === "validated" || tx.status === "confirmee");
      const pendingTxs = pTxs.filter(tx => tx.status === "pending");
      const refusedTxs = pTxs.filter(tx => tx.status === "refused" || tx.status === "refusee");
      const totalCA = validatedTxs.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
      const pendingAmount = pendingTxs.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
      const avgTicket = validatedTxs.length > 0 ? Math.round(totalCA / validatedTxs.length) : 0;
      const validationRate = pTxs.length > 0 ? Math.round((validatedTxs.length / pTxs.length) * 100) : 0;
      const modelIds = [...new Set(pTxs.map(tx => tx.model_id).filter(Boolean))];
      const modelNames = modelIds.map(mid => models.find(m => m.id === mid)?.name || "?");
      // Model breakdown for detail
      const modelBreakdown = modelIds.map(mid => {
        const mTxs = pTxs.filter(tx => tx.model_id === mid);
        const mValid = mTxs.filter(tx => tx.status === "validated" || tx.status === "confirmee");
        return { modelId: mid, modelName: models.find(m => m.id === mid)?.name || "?", ca: mValid.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0), txCount: mTxs.length };
      }).sort((a, b) => b.ca - a.ca);
      return { provider: prov, pTxs, totalCA, pendingAmount, avgTicket, validationRate, validatedCount: validatedTxs.length, pendingCount: pendingTxs.length, refusedCount: refusedTxs.length, txCount: pTxs.length, modelIds, modelNames, modelBreakdown };
    }).sort((a, b) => b.totalCA - a.totalCA);
  }, [filteredTxs, providers, models, convertAmount]);

  // Global KPIs
  const { totalProviders, globalCA, globalTxCount, globalPendingCount, globalValidationRate, globalPendingAmount } = useMemo(() => {
    const gCA = providerStats.reduce((s, ps) => s + ps.totalCA, 0);
    const gTx = providerStats.reduce((s, ps) => s + ps.txCount, 0);
    const gValid = providerStats.reduce((s, ps) => s + ps.validatedCount, 0);
    return {
      totalProviders: providers.length,
      globalCA: gCA, globalTxCount: gTx,
      globalPendingCount: providerStats.reduce((s, ps) => s + ps.pendingCount, 0),
      globalValidationRate: gTx > 0 ? Math.round(gValid / gTx * 100) : 0,
      globalPendingAmount: providerStats.reduce((s, ps) => s + ps.pendingAmount, 0),
    };
  }, [providerStats, providers.length]);

  const metricSt = { padding: "8px 10px", borderRadius: 10, background: "var(--bg-overlay)" };
  const metricLbl = { fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 };
  const metricVal = { fontSize: 16, fontWeight: 800 };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{"\u{1F3E6}"} {fr ? "Prestataires" : "Providers"}</h2>
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "3px 0 0", fontStyle: "italic" }}>{fr ? "Vue complète sur vos prestataires de paiement" : "Complete view of your payment providers"}</p>
      </div>

      {/* Sub-tab toggle */}
      <div style={{display:"flex",gap:0,marginBottom:20,borderRadius:12,border:"1px solid var(--border-default)",overflow:"hidden",width:"fit-content"}}>
        {[{id:"stats",label:fr?"Statistiques":"Statistics",icon:"\u{1F4CA}"},{id:"paiements",label:fr?"Paiements":"Payments",icon:"\u{1F4B3}"}].map(st=>(
          <button key={st.id} onClick={()=>setSubTab(st.id)} style={{padding:"8px 20px",border:"none",background:subTab===st.id?"var(--accent-muted)":"transparent",color:subTab===st.id?"var(--accent)":"var(--text-tertiary)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:6}}>
            {st.icon} {st.label}
            {st.id==="paiements"&&(ppData||[]).filter(p=>p.status==="pending").length>0&&(
              <span style={{background:"var(--danger)",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:800,marginLeft:4}}>{(ppData||[]).filter(p=>p.status==="pending").length}</span>
            )}
          </button>
        ))}
      </div>

      {subTab==="stats"&&(<>
      <GlobalFilterBar lang={lang} dr={dr} models={models} profiles={null}
        model={pfModel} setModel={setPfModel} showModelFilter />

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: fr ? "Prestataires" : "Providers", value: totalProviders, icon: "\u{1F4B3}" },
          { label: "CA Trait\u00E9", value: globalCA.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + currencySymbol, icon: "\u{1F4B0}", color: "var(--success)" },
          { label: "TX Total", value: globalTxCount, icon: "\u{1F4CB}" },
          { label: fr ? "TX En Attente" : "TX Pending", value: globalPendingCount, icon: "\u23F3", color: globalPendingCount > 0 ? "var(--warning)" : undefined },
          { label: fr ? "Taux Validation" : "Valid. Rate", value: globalValidationRate + "%", icon: "\u2705", color: globalValidationRate > 80 ? "var(--success)" : "var(--danger)" },
          { label: fr ? "Montant Pending" : "Pending Amount", value: globalPendingAmount.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + currencySymbol, icon: "\u26A0\uFE0F", color: "var(--warning)" },
        ].map((k, i) => (
          <div key={k.label} style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 18, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{k.icon} {k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color || "var(--text-primary)" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Provider Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14, marginBottom: 28 }}>
        {providerStats.map(ps => (
          <div key={ps.provider.id} onClick={() => setSelectedProv(ps)} style={{
            background: "var(--card-bg)", border: "1px solid var(--border-subtle)",
            borderRadius: 12, padding: 20, cursor: "pointer", transition: "all 0.2s",
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, background: "var(--accent-subtle)",
                  border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800, color: "var(--accent)",
                }}>
                  {ps.provider.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{ps.provider.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {ps.modelIds.length} {fr ? "mod\u00E8le" : "model"}{ps.modelIds.length > 1 ? "s" : ""} {"\u00B7"} {ps.txCount} TX
                  </div>
                </div>
              </div>
              {ps.pendingCount > 0 && (
                <span style={{ padding: "3px 10px", borderRadius: 12, background: "var(--warning-muted)", border: "1px solid var(--warning-muted)", color: "var(--warning)", fontSize: 10, fontWeight: 700 }}>
                  {ps.pendingCount} {fr ? "en attente" : "pending"}
                </span>
              )}
            </div>
            {/* Metrics 2x2 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div style={metricSt}><div style={metricLbl}>CA Trait\u00E9</div><div style={{ ...metricVal, color: "var(--success)" }}>{ps.totalCA.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{currencySymbol}</div></div>
              <div style={metricSt}><div style={metricLbl}>{fr ? "En Attente" : "Pending"}</div><div style={{ ...metricVal, color: ps.pendingAmount > 0 ? "var(--warning)" : "var(--text-primary)" }}>{ps.pendingAmount.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{currencySymbol}</div></div>
              <div style={metricSt}><div style={metricLbl}>{fr ? "Panier Moyen" : "Avg Ticket"}</div><div style={metricVal}>{ps.avgTicket.toLocaleString()}{currencySymbol}</div></div>
              <div style={metricSt}><div style={metricLbl}>{fr ? "Taux Valid." : "Valid. Rate"}</div><div style={{ ...metricVal, color: ps.validationRate >= 80 ? "var(--success)" : ps.validationRate >= 50 ? "var(--warning)" : "var(--danger)" }}>{ps.validationRate}%</div></div>
            </div>
            {/* Status bar */}
            <div style={{ display: "flex", height: 4, borderRadius: 4, overflow: "hidden", gap: 1 }}>
              {ps.validatedCount > 0 && <div style={{ flex: ps.validatedCount, background: "var(--success)", borderRadius: 2 }} />}
              {ps.pendingCount > 0 && <div style={{ flex: ps.pendingCount, background: "var(--warning)", borderRadius: 2 }} />}
              {ps.refusedCount > 0 && <div style={{ flex: ps.refusedCount, background: "var(--danger)", borderRadius: 2 }} />}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <span style={{ fontSize: 10, color: "var(--success)" }}>{"\u2705"} {ps.validatedCount}</span>
              <span style={{ fontSize: 10, color: "var(--warning)" }}>{"\u23F3"} {ps.pendingCount}</span>
              <span style={{ fontSize: 10, color: "var(--danger)" }}>{"\u274C"} {ps.refusedCount}</span>
            </div>
          </div>
        ))}
      </div>
      {providers.length === 0 && <div style={{ textAlign: "center", color: "var(--text-quaternary)", padding: 40 }}>{fr ? "Aucun prestataire" : "No providers"}</div>}


      {/* Comparative Table */}
      {providerStats.length > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)", fontSize: 13, fontWeight: 700 }}>
            {"\u{1F4CA}"} {fr ? "Tableau comparatif" : "Comparative Table"}
          </div>
          {(()=>{
            const sortedProvs = provSort.doSort(providerStats, {
              name: x=>(x.provider.name||"").toLowerCase(), totalCA:x=>x.totalCA, txCount:x=>x.txCount,
              validatedCount:x=>x.validatedCount, pendingCount:x=>x.pendingCount, refusedCount:x=>x.refusedCount,
              validationRate:x=>x.validationRate, avgTicket:x=>x.avgTicket, pendingAmount:x=>x.pendingAmount,
            });
            const provPages = Math.max(1, Math.ceil(sortedProvs.length / ROWS_PER_PAGE));
            const pagedProvs = sortedProvs.slice(provPage * ROWS_PER_PAGE, (provPage+1) * ROWS_PER_PAGE);
            return <>
          {pagedProvs.length === 0 ? <EmptyState icon="📊" text="Aucune donnée"/> :
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead><tr>
                <SortTh label={fr ? "Prestataire" : "Provider"} sortKey="name" sort={provSort.sort} onSort={provSort.onSort}/>
                <SortTh label={"CA Trait\u00E9"} sortKey="totalCA" sort={provSort.sort} onSort={provSort.onSort}/>
                <SortTh label="TX Total" sortKey="txCount" sort={provSort.sort} onSort={provSort.onSort}/>
                <SortTh label={fr ? "Valid\u00E9es" : "Validated"} sortKey="validatedCount" sort={provSort.sort} onSort={provSort.onSort}/>
                <SortTh label={fr ? "En attente" : "Pending"} sortKey="pendingCount" sort={provSort.sort} onSort={provSort.onSort}/>
                <SortTh label={fr ? "Refus\u00E9es" : "Refused"} sortKey="refusedCount" sort={provSort.sort} onSort={provSort.onSort}/>
                <SortTh label={fr ? "Taux Valid." : "Valid. Rate"} sortKey="validationRate" sort={provSort.sort} onSort={provSort.onSort}/>
                <SortTh label={fr ? "Panier Moyen" : "Avg Ticket"} sortKey="avgTicket" sort={provSort.sort} onSort={provSort.onSort}/>
                <SortTh label={fr ? "Montant Pending" : "Pending Amount"} sortKey="pendingAmount" sort={provSort.sort} onSort={provSort.onSort}/>
                <th>{fr ? "Mod\u00E8les" : "Models"}</th>
              </tr></thead>
              <tbody>
                {pagedProvs.map((ps, i) => (
                  <tr key={ps.provider.id} style={{ cursor: "pointer" }} onClick={() => setSelectedProv(ps)}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>{ps.provider.name?.[0]}</div>
                        <span style={{ fontWeight: 700 }}>{ps.provider.name}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700 }}>{ps.totalCA.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{currencySymbol}</td>
                    <td>{ps.txCount}</td>
                    <td style={{ color: "var(--success)" }}>{ps.validatedCount}</td>
                    <td style={{ color: "var(--warning)" }}>{ps.pendingCount}</td>
                    <td style={{ color: "var(--danger)" }}>{ps.refusedCount}</td>
                    <td>
                      <span style={{
                        padding: "2px 8px", borderRadius: 12,
                        background: ps.validationRate >= 80 ? "var(--success-muted)" : ps.validationRate >= 50 ? "var(--warning-muted)" : "var(--danger-muted)",
                        color: ps.validationRate >= 80 ? "var(--success)" : ps.validationRate >= 50 ? "var(--warning)" : "var(--danger)",
                        fontSize: 11, fontWeight: 700,
                      }}>{ps.validationRate}%</span>
                    </td>
                    <td>{ps.avgTicket.toLocaleString()}{currencySymbol}</td>
                    <td style={{ color: ps.pendingAmount > 0 ? "var(--warning)" : "var(--text-tertiary)" }}>{ps.pendingAmount.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{currencySymbol}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {ps.modelNames.map(name => (
                          <span key={name} style={{ padding: "1px 6px", borderRadius: 6, background: "var(--accent-subtle)", color: "var(--accent)", fontSize: 10, fontWeight: 600 }}>{name}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
          <PaginationBar page={provPage} totalPages={provPages} totalItems={sortedProvs.length} lang={lang} onPageChange={setProvPage}/>
          </>;
          })()}
        </div>
      )}

      {/* Detail Modal — stats sub-tab */}
      {selectedProv && (
        <div style={{ position: "fixed", inset: 0, background: "var(--modal-backdrop)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5000 }} onClick={() => setSelectedProv(null)}>
          <div style={{ width: 700, maxHeight: "90vh", overflowY: "auto", background: "var(--modal-bg)", border: "1px solid var(--border-default)", borderRadius: 24, boxShadow: "var(--shadow-lg)" }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{selectedProv.provider.name}</h2>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "4px 0 0" }}>{fr ? "D\u00E9tail du prestataire" : "Provider detail"} {"\u00B7"} {selectedProv.txCount} transactions</p>
              </div>
              <button onClick={() => setSelectedProv(null)} style={{ width: 32, height: 32, borderRadius: 10, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-tertiary)", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
                {[
                  { label: "CA Valid\u00E9", value: selectedProv.totalCA.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + currencySymbol, color: "var(--success)" },
                  { label: fr ? "En Attente" : "Pending", value: selectedProv.pendingAmount.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + currencySymbol, color: "var(--warning)" },
                  { label: fr ? "Panier Moyen" : "Avg Ticket", value: selectedProv.avgTicket.toLocaleString() + currencySymbol },
                  { label: fr ? "Taux Valid." : "Valid. Rate", value: selectedProv.validationRate + "%", color: selectedProv.validationRate >= 80 ? "var(--success)" : "var(--danger)" },
                ].map((k, i) => (
                  <div key={k.label} style={{ padding: "12px 14px", borderRadius: 14, background: "var(--bg-overlay)", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{k.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: k.color || "var(--text-primary)" }}>{k.value}</div>
                  </div>
                ))}
              </div>
              {/* Model breakdown */}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>{"\u{1F4CA}"} {fr ? "R\u00E9partition par mod\u00E8le" : "Breakdown by model"}</div>
              <div style={{ marginBottom: 20 }}>
                {selectedProv.modelBreakdown.map(mb => {
                  const maxCA = selectedProv.modelBreakdown.length > 0 ? selectedProv.modelBreakdown[0].ca : 1;
                  return (
                    <div key={mb.modelId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{mb.modelName}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{mb.ca.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{currencySymbol}</span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", width: 50, textAlign: "right" }}>{mb.txCount} TX</span>
                      <div style={{ width: 80, height: 4, borderRadius: 2, background: "var(--bg-overlay)" }}>
                        <div style={{ width: (maxCA > 0 ? (mb.ca / maxCA * 100) : 0) + "%", height: "100%", borderRadius: 2, background: "var(--accent)" }} />
                      </div>
                    </div>
                  );
                })}
                {selectedProv.modelBreakdown.length === 0 && <div style={{ color: "var(--text-quaternary)", fontSize: 12, textAlign: "center", padding: 16 }}>{fr ? "Aucun mod\u00E8le" : "No models"}</div>}
              </div>
              {/* Last TXs */}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>{"\u{1F4CB}"} {fr ? "Derni\u00E8res transactions" : "Recent transactions"}</div>
              {selectedProv.pTxs.length === 0 ? <EmptyState icon="💸" text="Aucune transaction"/> :
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                <table className="table" style={{ fontSize: 11 }}>
                  <thead><tr>
                    <th>Date</th><th>Spender</th><th>{t(lang, "amount")}</th><th>{fr ? "Produit" : "Product"}</th><th>Tag</th><th>{fr ? "Mod\u00E8le" : "Model"}</th><th>Chatter</th><th>{t(lang, "status")}</th>
                  </tr></thead>
                  <tbody>
                    {selectedProv.pTxs.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20).map(tx => {
                      const mName = models.find(m => m.id === tx.model_id)?.name || "\u2014";
                      const chName = profiles.find(p => p.id === tx.chatter_id)?.name || "\u2014";
                      return (
                        <tr key={tx.id}>
                          <td>{fmtDate(tx.date)}</td>
                          <td><Tag type="spender" label={tx.spender_handle} id={tx.spender_handle}/></td>
                          <td style={{ fontWeight: 700 }}>{fmtAmount(tx.amount, tx.currency)}</td>
                          <td>{tx.product || "\u2014"}</td>
                          <td>{tx.tag || "\u2014"}</td>
                          <td>{mName}</td>
                          <td>{chName}</td>
                          <td><StatusPill status={tx.status} lang={lang} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {selectedProv.pTxs.length > 20 && <div style={{ fontSize: 10, color: "var(--text-quaternary)", textAlign: "center", marginTop: 4 }}>+{selectedProv.pTxs.length - 20} {fr ? "autres" : "more"}</div>}
              </div>}
            </div>
          </div>
        </div>
      )}
      </>)}

      {/* ═══ PAIEMENTS SUB-TAB ═══ */}
      {subTab==="paiements"&&(()=>{
        const allPP = ppData||[];
        const pendingPP = allPP.filter(p=>p.status==="pending");
        const validatedPP = allPP.filter(p=>p.status==="validated");
        const rejectedPP = allPP.filter(p=>p.status==="rejected");
        const totalPendingAmt = pendingPP.reduce((s,p)=>s+Number(p.amount),0);
        const now = new Date();
        const mStart = new Date(now.getFullYear(),now.getMonth(),1);
        const thisMonthValidated = validatedPP.filter(p=>p.validated_at&&new Date(p.validated_at)>=mStart);
        const thisMonthAmt = thisMonthValidated.reduce((s,p)=>s+Number(p.amount),0);

        // Solde par provider: CA validé (TX) − Paiements validés (provider_payouts)
        const providerBalances = providers.map(prov=>{
          const pTxs = txs.filter(tx=>tx.provider_id===prov.id&&(tx.status==="validated"||tx.status==="confirmee"));
          const caValide = pTxs.reduce((s,tx)=>s+convertAmount(Number(tx.amount),tx.currency),0);
          const paidPP = validatedPP.filter(p=>p.provider_id===prov.id).reduce((s,p)=>s+Number(p.amount),0);
          const pendPP = pendingPP.filter(p=>p.provider_id===prov.id).reduce((s,p)=>s+Number(p.amount),0);
          return {provider:prov,caValide,paid:paidPP,pending:pendPP,solde:caValide-paidPP};
        });
        const lateProviders = providerBalances.filter(pb=>pb.solde>100);

        const handleValidate = async (ppId) => {
          setActionLoading(ppId);
          try{
            const {error}=await sb.from("provider_payouts").update({status:"validated",validated_by:user.id,validated_at:new Date().toISOString()}).eq("id",ppId);
            if(error){addToast("Erreur: "+error.message,"error");}else{
              const pp=allPP.find(p=>p.id===ppId);
              const provName=profiles.find(p=>p.id===pp?.provider_id)?.name||"Provider";
              if(onNotify&&pp) await onNotify(pp.declared_by,"payment","\u2705 Paiement validé",`Votre paiement de ${pp.amount}${pp.currency==="EUR"?"€":"CHF"} a été validé`);
              // Auto-generate provider invoice
              if(pp) { try { await generateProviderInvoice(pp, profiles, user.id); } catch(e) { /* provider invoice gen error */ } }
              addToast(fr?"Paiement validé ✓":"Payment validated ✓","success");
              if(onRefresh) await onRefresh();
            }
          }catch(e){addToast("Erreur: "+e.message,"error");}
          setActionLoading(null);
        };
        const handleReject = async (ppId) => {
          if(!rejectNotes.trim()){addToast(fr?"Raison obligatoire":"Reason required","error");return;}
          setActionLoading(ppId);
          try{
            const {error}=await sb.from("provider_payouts").update({status:"rejected",validated_by:user.id,validated_at:new Date().toISOString(),notes:rejectNotes}).eq("id",ppId);
            if(error){addToast("Erreur: "+error.message,"error");}else{
              const pp=allPP.find(p=>p.id===ppId);
              if(onNotify&&pp) await onNotify(pp.declared_by,"payment","\u274C Paiement refusé",`Votre paiement de ${pp.amount}${pp.currency==="EUR"?"€":"CHF"} a été refusé: ${rejectNotes}`);
              setRejectId(null);setRejectNotes("");
              addToast(fr?"Paiement refusé":"Payment rejected","error");
              if(onRefresh) await onRefresh();
            }
          }catch(e){addToast("Erreur: "+e.message,"error");}
          setActionLoading(null);
        };

        return (<div>
          {/* KPIs paiements */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
            {[
              {label:fr?"En attente de validation":"Pending validation",value:totalPendingAmt.toLocaleString("fr-FR",{maximumFractionDigits:0})+currencySymbol,icon:"\u23F3",color:"var(--warning)",sub:pendingPP.length+" "+( fr?"paiements":"payments")},
              {label:fr?"Reçu ce mois":"Received this month",value:thisMonthAmt.toLocaleString("fr-FR",{maximumFractionDigits:0})+currencySymbol,icon:"\u2705",color:"var(--success)",sub:thisMonthValidated.length+" "+( fr?"validés":"validated")},
              {label:fr?"Providers en retard":"Late providers",value:lateProviders.length,icon:"\u26A0\uFE0F",color:lateProviders.length>0?"var(--danger)":"var(--success)",sub:lateProviders.length>0?lateProviders.map(l=>l.provider.name).join(", "):fr?"Aucun":"None"},
              {label:fr?"Total validé (all-time)":"Total validated (all-time)",value:validatedPP.reduce((s,p)=>s+Number(p.amount),0).toLocaleString("fr-FR",{maximumFractionDigits:0})+currencySymbol,icon:"\u{1F4B0}",color:"var(--success)",sub:validatedPP.length+" paiements"},
            ].map((k,i)=>(
              <div key={k.label} style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:18,padding:"14px 16px"}}>
                <div style={{fontSize:10,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>{k.icon} {k.label}</div>
                <div style={{fontSize:22,fontWeight:800,color:k.color||"var(--text-primary)"}}>{k.value}</div>
                {k.sub&&<div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:4}}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Solde par provider */}
          <div className="card" style={{marginBottom:20}}>
            <div className="section-title"><div className="section-bar"></div>{fr?"Solde par prestataire":"Balance per provider"}</div>
            {providerBalances.length === 0 ? <EmptyState icon="💰" text="Aucun solde"/> :
            <div className="table-wrap">
              <table className="table" style={{fontSize:12}}>
                <thead><tr>
                  <th>{fr?"Prestataire":"Provider"}</th>
                  <th>CA {fr?"Validé":"Validated"}</th>
                  <th>{fr?"Payé (validé)":"Paid (validated)"}</th>
                  <th>{fr?"En attente":"Pending"}</th>
                  <th>{fr?"Solde dû":"Balance due"}</th>
                </tr></thead>
                <tbody>
                  {providerBalances.map(pb=>(
                    <tr key={pb.provider.id}>
                      <td style={{fontWeight:700}}>{pb.provider.name}</td>
                      <td>{pb.caValide.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</td>
                      <td style={{color:"var(--success)"}}>{pb.paid.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</td>
                      <td style={{color:"var(--warning)"}}>{pb.pending.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</td>
                      <td>
                        <span style={{fontWeight:800,color:pb.solde>100?"var(--danger)":pb.solde>0?"var(--warning)":"var(--success)"}}>
                          {pb.solde>100&&"\u26A0\uFE0F "}{pb.solde.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </div>

          {/* Pending payouts — validate/reject */}
          {pendingPP.length>0&&(
            <div className="card" style={{marginBottom:20}}>
              <div className="section-title"><div className="section-bar"></div>{"\u23F3"} {fr?"Paiements en attente de validation":"Pending payments"} ({pendingPP.length})</div>
              {pendingPP.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(pp=>{
                const provName=profiles.find(p=>p.id===pp.provider_id)?.name||"?";
                return (
                  <div key={pp.id} style={{padding:16,borderBottom:"1px solid var(--border-subtle)",display:"flex",alignItems:"center",gap:16}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:14}}>{provName} — {Number(pp.amount).toLocaleString("fr-FR",{maximumFractionDigits:0})}{pp.currency==="EUR"?"€":"CHF"}</div>
                      <div style={{fontSize:11,color:"var(--text-tertiary)",marginTop:4}}>
                        {fr?"Période":"Period"}: {fmtDate(pp.period_from)} → {fmtDate(pp.period_to)} {"\u00B7"} {pp.payment_method||"—"} {pp.reference?`· Réf: ${pp.reference}`:""}
                      </div>
                      {pp.notes&&<div style={{fontSize:11,color:"var(--text-secondary)",marginTop:2,fontStyle:"italic"}}>{pp.notes}</div>}
                      <div style={{fontSize:10,color:"var(--text-quaternary)",marginTop:4}}>{fr?"Déclaré le":"Declared"} {fmtDate(pp.created_at)}</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {rejectId===pp.id?(
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <input className="form-input" style={{width:200,fontSize:11}} placeholder={fr?"Raison du refus *":"Rejection reason *"} value={rejectNotes} onChange={e=>setRejectNotes(e.target.value)}/>
                          <button className="btn btn-danger" style={{padding:"6px 12px",fontSize:11}} onClick={()=>handleReject(pp.id)} disabled={actionLoading===pp.id}>{actionLoading===pp.id?<><BtnSpinner/>{" "}</>:"\u274C"}</button>
                          <button style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",fontSize:12}} onClick={()=>{setRejectId(null);setRejectNotes("");}}>Annuler</button>
                        </div>
                      ):(
                        <>
                          <button className="btn btn-success" style={{padding:"6px 14px",fontSize:12}} onClick={()=>handleValidate(pp.id)} disabled={actionLoading===pp.id}>{actionLoading===pp.id?<><BtnSpinner/>{" "}</>:"\u2705 Valider"}</button>
                          <button className="btn btn-danger" style={{padding:"6px 14px",fontSize:12}} onClick={()=>setRejectId(pp.id)}>{"\u274C Refuser"}</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full history table */}
          <div className="card">
            <div className="section-title"><div className="section-bar"></div>{fr?"Historique complet":"Full history"} ({allPP.length})</div>
            {allPP.length===0?(
              <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:30}}>{fr?"Aucun paiement":"No payments"}</div>
            ):(()=>{
              const sortedPP = ppSort.doSort(allPP, {
                created_at: x=>new Date(x.created_at||0).getTime(),
                provider: x=>(profiles.find(p=>p.id===x.provider_id)?.name||"").toLowerCase(),
                amount: x=>Number(x.amount)||0,
                status: x=>x.status||"",
                payment_method: x=>(x.payment_method||"").toLowerCase(),
              });
              const ppPages = Math.max(1, Math.ceil(sortedPP.length / ROWS_PER_PAGE));
              const pagedPP = sortedPP.slice(ppPage * ROWS_PER_PAGE, (ppPage+1) * ROWS_PER_PAGE);
              return <>
              <div className="table-wrap">
                <table className="table" style={{fontSize:12}}>
                  <thead><tr>
                    <SortTh label={t(lang,"date")} sortKey="created_at" sort={ppSort.sort} onSort={ppSort.onSort}/>
                    <SortTh label={fr?"Prestataire":"Provider"} sortKey="provider" sort={ppSort.sort} onSort={ppSort.onSort}/>
                    <SortTh label={t(lang,"amount")} sortKey="amount" sort={ppSort.sort} onSort={ppSort.onSort}/>
                    <th>{fr?"Période":"Period"}</th>
                    <SortTh label={fr?"Méthode":"Method"} sortKey="payment_method" sort={ppSort.sort} onSort={ppSort.onSort}/>
                    <th>{fr?"Référence":"Ref"}</th>
                    <SortTh label={t(lang,"status")} sortKey="status" sort={ppSort.sort} onSort={ppSort.onSort}/>
                    <th>{fr?"Validé par":"Validated by"}</th><th>Notes</th>
                  </tr></thead>
                  <tbody>
                    {pagedPP.map(pp=>{
                      const provName=profiles.find(p=>p.id===pp.provider_id)?.name||"?";
                      const validatorName=pp.validated_by?profiles.find(p=>p.id===pp.validated_by)?.name||"?":"—";
                      const stMap={pending:{bg:"var(--warning-muted)",color:"var(--warning)",icon:"⏳"},validated:{bg:"var(--success-muted)",color:"var(--success)",icon:"✅"},rejected:{bg:"var(--danger-muted)",color:"var(--danger)",icon:"❌"}};
                      const st=stMap[pp.status]||stMap.pending;
                      return (
                        <tr key={pp.id}>
                          <td>{fmtDate(pp.created_at)}</td>
                          <td style={{fontWeight:600}}>{provName}</td>
                          <td style={{fontWeight:700}}>{Number(pp.amount).toLocaleString("fr-FR",{maximumFractionDigits:0})}{pp.currency==="EUR"?"€":"CHF"}</td>
                          <td style={{fontSize:10}}>{fmtDate(pp.period_from)} → {fmtDate(pp.period_to)}</td>
                          <td>{pp.payment_method||"—"}</td>
                          <td style={{fontSize:10,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}}>{pp.reference||"—"}</td>
                          <td><span style={{padding:"3px 10px",borderRadius:12,background:st.bg,color:st.color,fontSize:11,fontWeight:700}}>{st.icon} {pp.status}</span></td>
                          <td>{validatorName}</td>
                          <td style={{fontSize:10,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis"}}>{pp.notes||"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PaginationBar page={ppPage} totalPages={ppPages} totalItems={sortedPP.length} lang={lang} onPageChange={setPpPage}/>
              </>;
            })()}
          </div>
        </div>);
      })()}
    </div>
  );
});

module.exports.default = PrestatairesTab;
