// === Shared dependencies ===
const { useState, useEffect, useMemo, useCallback, useRef } = React;
const {
  sb, t, i18n, escapeHTML, sanitizeURL, paginate,
  useDebounce, useDateRange, useSortable,
  useToast, useCurrency, useNav, useTimezone,
  SortTh, Pagination, BadgeBar, DateRangeFilter, EditTxModal, FilterBar, ConfirmDialog,
  KPICard, Tag, StatusPill,
  PAGE_SIZE, DADA_FEE_PCT, DEFAULT_EXCHANGE_RATE, TOAST_TIMEOUT_MS,
  PRODUCTS, TAGS, TIMEZONES, ANTHROPIC_API_URL,
  safeInsertTx, safeUpsertSpender,
  filterByModel, filterByProvider, filterByChatter, filterByStatus,
  fmtDate, getSpenderSegment, _tz,
  computeSpenderProfile, SpenderQuickCard, SpenderFullProfile,
  getAgencyDetails, saveAgencyDetails, getNextInvoiceNumber,
  invoiceStatusConfig, invoiceTypeLabels,
  generateInvoiceHTML, downloadInvoicePDF,
  generateChatterInvoice, generateModelInvoice, generateProviderInvoice,
  MyInvoicesPanel,
  XP_LEVELS, getLevel, calculateXP, calculateStreak, STREAK_BADGES,
  getStreakBadges, getDailyProgress, getWeeklyProgress, launchConfetti,
  AGENCY_ACHIEVEMENTS, LevelBadge, XPProgressBar, StreakBadge,
  AgencyHealthScore, AgencyAchievements, ActivityHeatmap, ChallengesSection,
  q_spender_profile, q_spender_transactions, q_spender_kpis,
  q_spender_breakdown_models, q_spender_breakdown_chatter, q_spender_breakdown_provider,
  _hashStr, tonightDate, tonightStatus,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, RechartsTooltip, Legend,
} = window.DadashShared;

const ProductCatalogTab = ({user, lang, txs, models, profiles, products, productTags, modelPrices, onRefresh}) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const fr = lang === "fr";
  const dr = useDateRange("all");
  const [view, setView] = useState("catalogue");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [priceEdits, setPriceEdits] = useState({});
  const [savingPrices, setSavingPrices] = useState(false);

  const activeProducts = products.filter(p => p.active !== false);
  const activeTags = productTags.filter(t => t.active !== false);
  const filteredTxs = dr.filterByDate(txs, "date");
  const activeModels = models.filter(m => m.active !== false);

  // Build product stats from TX data
  const productStats = useMemo(() => {
    return activeProducts.map(prod => {
      const tags = activeTags.filter(t => t.product_id === prod.id);
      const tagIds = tags.map(t => t.id);
      // Match TXs by product_id FK or by product text field
      const pTxs = filteredTxs.filter(tx =>
        tx.product_id === prod.id ||
        (tx.product && tx.product.toLowerCase().includes(prod.name.toLowerCase()))
      );
      const validTxs = pTxs.filter(tx => tx.status === "validated" || tx.status === "confirmee");
      const ca = validTxs.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
      const sales = validTxs.length;
      const avgPrice = sales > 0 ? Math.round(ca / sales) : 0;
      // Top tags by CA
      const tagStats = tags.map(tag => {
        const tTxs = pTxs.filter(tx =>
          tx.product_tag_id === tag.id ||
          (tx.tag && tx.tag.toLowerCase().includes(tag.name.toLowerCase()))
        );
        const tValid = tTxs.filter(tx => tx.status === "validated" || tx.status === "confirmee");
        const tCA = tValid.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
        return { tag, txCount: tTxs.length, validCount: tValid.length, ca: tCA };
      }).sort((a, b) => b.ca - a.ca);
      return { product: prod, tags, pTxs, validTxs, ca, sales, avgPrice, tagStats };
    }).sort((a, b) => b.ca - a.ca);
  }, [activeProducts, activeTags, filteredTxs, convertAmount]);

  // Global KPIs
  const totalActiveProducts = activeProducts.length;
  const totalActiveTags = activeTags.length;
  const totalCA = productStats.reduce((s, ps) => s + ps.ca, 0);
  const topProduct = productStats[0];
  const allTagStats = productStats.flatMap(ps => ps.tagStats).sort((a, b) => b.ca - a.ca);
  const topTag = allTagStats[0];
  const totalSales = productStats.reduce((s, ps) => s + ps.sales, 0);
  const avgBasket = totalSales > 0 ? Math.round(totalCA / totalSales) : 0;

  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

  // Save model price overrides
  const handleSavePrices = async () => {
    const entries = Object.entries(priceEdits);
    if (entries.length === 0) return;
    setSavingPrices(true);
    try {
      for (const [key, price] of entries) {
        const [modelId, tagId] = key.split("__");
        if (!price && price !== 0) {
          await sb.from("model_prices").delete().eq("model_id", modelId).eq("product_tag_id", tagId);
        } else {
          await sb.from("model_prices").upsert({ model_id: modelId, product_tag_id: tagId, price: parseFloat(price), currency: "EUR" }, { onConflict: "model_id,product_tag_id" });
        }
      }
      setPriceEdits({});
      await onRefresh();
      addToast(fr ? "Prix sauvegard\u00E9s" : "Prices saved", "success");
    } catch(e) { addToast("Erreur: " + e.message, "error"); }
    setSavingPrices(false);
  };

  const getModelPrice = (modelId, tagId) => {
    const mp = modelPrices.find(p => p.model_id === modelId && p.product_tag_id === tagId);
    return mp ? Number(mp.price) : null;
  };

  return (
    <div>
      <GlobalFilterBar lang={lang} dr={dr} />

      {/* KPIs */}
      <div className="kpi-grid" style={{marginBottom: 20}}>
        <KPICard label={fr ? "Produits actifs" : "Active Products"} value={totalActiveProducts} icon="\u{1F6CD}\uFE0F" />
        <KPICard label={fr ? "Tags actifs" : "Active Tags"} value={totalActiveTags} icon="\u{1F3F7}\uFE0F" />
        <KPICard label="CA Total" value={`${totalCA.toLocaleString("fr-FR",{maximumFractionDigits:0})}${currencySymbol}`} icon="\u{1F4B0}" />
        <KPICard label={fr ? "Top produit" : "Top Product"} value={topProduct ? `${topProduct.product.icon} ${topProduct.product.name}` : "\u2014"} icon="\u{1F947}" />
        <KPICard label={fr ? "Top tag" : "Top Tag"} value={topTag ? topTag.tag.name : "\u2014"} icon="\u{1F31F}" />
        <KPICard label={fr ? "Panier moyen" : "Avg Basket"} value={`${avgBasket}${currencySymbol}`} icon="\u{1F6D2}" />
      </div>

      {/* Toggle */}
      <div style={{display:"flex",gap:0,marginBottom:20,borderRadius:"var(--radius-sm)",border:"1px solid var(--border-default)",overflow:"hidden",width:"fit-content"}}>
        {[{id:"catalogue",label:fr?"Catalogue":"Catalog",icon:"\u{1F6CD}\uFE0F"},{id:"analytics",label:"Analytics",icon:"\u{1F4CA}"}].map(v=>(
          <button key={v.id} onClick={()=>setView(v.id)} style={{padding:"8px 20px",border:"none",background:view===v.id?"var(--accent-muted)":"transparent",color:view===v.id?"var(--accent)":"var(--text-tertiary)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:6}}>{v.icon} {v.label}</button>
        ))}
      </div>

      {/* ═══ CATALOGUE VIEW ═══ */}
      {view === "catalogue" && (<>
        {/* Product Cards Grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14,marginBottom:28}}>
          {productStats.map((ps, idx) => (
            <div key={ps.product.id} onClick={()=>setSelectedProduct(ps)} style={{
              background:"var(--card-bg)",border:"1px solid var(--border-subtle)",
              borderRadius:"var(--radius)",padding:20,cursor:"pointer",transition:"border-color 0.2s",
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:28}}>{ps.product.icon}</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:"var(--weight-bold)",color:"var(--text-primary)"}}>{ps.product.name}</div>
                    <div style={{fontSize:11,color:"var(--text-tertiary)"}}>{ps.tags.length} {fr?"variantes":"variants"}{ps.product.has_duration?" \u00B7 \u23F1":""}
                    </div>
                  </div>
                </div>
                {idx < 3 && <span style={{fontSize:18}}>{medals[idx]}</span>}
              </div>
              {/* Metrics */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                <div style={{padding:"6px 8px",borderRadius:"var(--radius-sm)",background:"var(--bg-overlay)"}}>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.3,marginBottom:2}}>CA</div>
                  <div style={{fontSize:15,fontWeight:800,color:"var(--success)"}}>{ps.ca.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</div>
                </div>
                <div style={{padding:"6px 8px",borderRadius:"var(--radius-sm)",background:"var(--bg-overlay)"}}>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.3,marginBottom:2}}>{fr?"Ventes":"Sales"}</div>
                  <div style={{fontSize:15,fontWeight:800}}>{ps.sales}</div>
                </div>
                <div style={{padding:"6px 8px",borderRadius:"var(--radius-sm)",background:"var(--bg-overlay)"}}>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.3,marginBottom:2}}>{fr?"Prix moy.":"Avg Price"}</div>
                  <div style={{fontSize:15,fontWeight:800}}>{ps.avgPrice}{currencySymbol}</div>
                </div>
              </div>
              {/* Top 3 tags */}
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {ps.tagStats.slice(0,3).map((ts, ti) => (
                  <div key={ts.tag.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
                    <span style={{width:16,textAlign:"center",fontWeight:700,color:"var(--text-tertiary)"}}>{ti < 3 ? medals[ti] : `#${ti+1}`}</span>
                    <span style={{flex:1,color:"var(--text-secondary)"}}>{ts.tag.name}</span>
                    <span style={{fontWeight:700,color:"var(--text-primary)"}}>{ts.ca.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</span>
                    <span style={{color:"var(--text-tertiary)",fontSize:10}}>{ts.validCount} {fr?"ventes":"sales"}</span>
                  </div>
                ))}
                {ps.tagStats.length === 0 && <div style={{fontSize:11,color:"var(--text-quaternary)",textAlign:"center",padding:8}}>{fr?"Aucune vente":"No sales"}</div>}
              </div>
            </div>
          ))}
        </div>
        {activeProducts.length === 0 && <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>{fr?"Aucun produit":"No products"}</div>}

        {/* ═══ DETAIL PANEL (modal) ═══ */}
        {selectedProduct && (
          <div style={{position:"fixed",inset:0,background:"var(--modal-backdrop)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:5000}} onClick={()=>{setSelectedProduct(null);setPriceEdits({});}}>
            <div style={{width:800,maxHeight:"90vh",overflowY:"auto",background:"var(--modal-bg)",border:"1px solid var(--border-default)",borderRadius:"var(--radius)",boxShadow:"var(--shadow-lg)"}} onClick={e=>e.stopPropagation()}>
              {/* Header */}
              <div style={{padding:"20px 24px",borderBottom:"1px solid var(--border-subtle)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:32}}>{selectedProduct.product.icon}</span>
                  <div>
                    <h2 style={{fontSize:18,fontWeight:800,margin:0}}>{selectedProduct.product.name}</h2>
                    <p style={{fontSize:11,color:"var(--text-tertiary)",margin:"2px 0 0"}}>{selectedProduct.tags.length} {fr?"variantes":"variants"} {"\u00B7"} {selectedProduct.sales} {fr?"ventes":"sales"} {"\u00B7"} {selectedProduct.ca.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol} CA</p>
                  </div>
                </div>
                <button onClick={()=>{setSelectedProduct(null);setPriceEdits({});}} style={{width:32,height:32,borderRadius:"var(--radius-sm)",background:"var(--bg-overlay)",border:"1px solid var(--border-default)",color:"var(--text-tertiary)",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2715"}</button>
              </div>
              <div style={{padding:"20px 24px"}}>
                {/* KPIs */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:24}}>
                  {[
                    {label:"CA Valid\u00E9",value:selectedProduct.ca.toLocaleString("fr-FR",{maximumFractionDigits:0})+currencySymbol,color:"var(--success)"},
                    {label:fr?"Ventes":"Sales",value:selectedProduct.sales},
                    {label:fr?"Prix moyen":"Avg Price",value:selectedProduct.avgPrice+currencySymbol},
                    {label:fr?"Variantes":"Variants",value:selectedProduct.tags.length},
                  ].map((k)=>(
                    <div key={k.label} style={{padding:"12px 14px",borderRadius:"var(--radius-sm)",background:"var(--bg-overlay)",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>{k.label}</div>
                      <div style={{fontSize:20,fontWeight:800,color:k.color||"var(--text-primary)"}}>{k.value}</div>
                    </div>
                  ))}
                </div>

                {/* Variantes table with model price overrides */}
                <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>{"\u{1F3F7}\uFE0F"} {fr?"Variantes & Prix":"Variants & Prices"}</div>
                <div style={{overflowX:"auto",marginBottom:20}}>
                  <table className="table" style={{fontSize:11}}>
                    <thead><tr>
                      <th>{fr?"Variante":"Variant"}</th>
                      {selectedProduct.product.has_duration && <th>{fr?"Dur\u00E9e":"Duration"}</th>}
                      <th>{fr?"Prix d\u00E9faut":"Default Price"}</th>
                      {activeModels.map(m=><th key={m.id} style={{textAlign:"center",minWidth:80}}>{m.name}</th>)}
                      <th>CA</th>
                      <th>{fr?"Ventes":"Sales"}</th>
                    </tr></thead>
                    <tbody>
                      {selectedProduct.tagStats.map(ts => (
                        <tr key={ts.tag.id}>
                          <td style={{fontWeight:600}}>{ts.tag.name}</td>
                          {selectedProduct.product.has_duration && <td>{ts.tag.duration_minutes ? ts.tag.duration_minutes+"min" : "\u2014"}</td>}
                          <td>{Number(ts.tag.default_price).toFixed(0)}{currencySymbol}</td>
                          {activeModels.map(m => {
                            const key = `${m.id}__${ts.tag.id}`;
                            const existingPrice = getModelPrice(m.id, ts.tag.id);
                            const editVal = priceEdits[key];
                            const displayVal = editVal !== undefined ? editVal : (existingPrice !== null ? existingPrice : "");
                            const diffPct = existingPrice !== null && Number(ts.tag.default_price) > 0
                              ? Math.round(((existingPrice - Number(ts.tag.default_price)) / Number(ts.tag.default_price)) * 100)
                              : null;
                            return (
                              <td key={m.id} style={{textAlign:"center"}}>
                                <input type="number" value={displayVal} placeholder={Number(ts.tag.default_price).toFixed(0)}
                                  onChange={e => setPriceEdits(prev => ({...prev, [key]: e.target.value}))}
                                  style={{width:60,padding:"3px 6px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border-default)",background:"var(--input-bg)",color:"var(--text-primary)",fontSize:11,textAlign:"center"}} />
                                {diffPct !== null && diffPct !== 0 && <div style={{fontSize:9,color:diffPct>0?"var(--success)":"var(--danger)",fontWeight:600}}>{diffPct>0?"+":""}{diffPct}%</div>}
                              </td>
                            );
                          })}
                          <td style={{fontWeight:700}}>{ts.ca.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</td>
                          <td>{ts.validCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Object.keys(priceEdits).length > 0 && (
                  <button className="btn btn-primary" onClick={handleSavePrices} disabled={savingPrices} style={{marginBottom:20}}>
                    {savingPrices ? <span className="btn-spinner"/> : fr ? `Sauvegarder ${Object.keys(priceEdits).length} prix` : `Save ${Object.keys(priceEdits).length} prices`}
                  </button>
                )}

                {/* Analytics per product */}
                <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>{"\u{1F4CA}"} {fr?"R\u00E9partition par mod\u00E8le":"Breakdown by Model"}</div>
                <div style={{marginBottom:20}}>
                  {(() => {
                    const modelBreak = activeModels.map(m => {
                      const mTxs = selectedProduct.validTxs.filter(tx => tx.model_id === m.id);
                      const mCA = mTxs.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
                      return { model: m, ca: mCA, count: mTxs.length };
                    }).filter(mb => mb.count > 0).sort((a, b) => b.ca - a.ca);
                    const maxCA = modelBreak[0]?.ca || 1;
                    return modelBreak.map(mb => (
                      <div key={mb.model.id} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:"1px solid var(--border-subtle)"}}>
                        <span style={{flex:1,fontSize:13,fontWeight:600}}>{mb.model.name}</span>
                        <span style={{fontSize:13,fontWeight:700}}>{mb.ca.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</span>
                        <span style={{fontSize:11,color:"var(--text-tertiary)",width:50,textAlign:"right"}}>{mb.count} TX</span>
                        <div style={{width:80,height:4,borderRadius:2,background:"var(--bg-overlay)"}}>
                          <div style={{width:maxCA>0?(mb.ca/maxCA*100)+"%":"0%",height:"100%",borderRadius:2,background:"var(--accent)"}} />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ═══ ANALYTICS VIEW ═══ */}
      {view === "analytics" && (<>
        {/* 1. Product ranking by CA */}
        <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:"var(--radius)",overflow:"hidden",marginBottom:24}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border-subtle)",fontSize:13,fontWeight:700}}>
            {"\u{1F3C6}"} {fr?"Classement produits par CA":"Product Ranking by Revenue"}
          </div>
          <div style={{overflowX:"auto"}}>
            <table className="table" style={{fontSize:12}}>
              <thead><tr>
                <th>#</th><th>{fr?"Produit":"Product"}</th><th>{fr?"Ventes":"Sales"}</th><th>{fr?"Prix moy.":"Avg Price"}</th><th>CA</th><th>% CA</th><th></th>
              </tr></thead>
              <tbody>
                {productStats.map((ps, i) => {
                  const pct = totalCA > 0 ? ((ps.ca / totalCA) * 100) : 0;
                  return (
                    <tr key={ps.product.id}>
                      <td style={{fontWeight:700}}>{i<3?medals[i]:`#${i+1}`}</td>
                      <td><span style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>{ps.product.icon}</span><span style={{fontWeight:700}}>{ps.product.name}</span></span></td>
                      <td>{ps.sales}</td>
                      <td>{ps.avgPrice}{currencySymbol}</td>
                      <td style={{fontWeight:700}}>{ps.ca.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</td>
                      <td>{pct.toFixed(1)}%</td>
                      <td style={{width:120}}>
                        <div style={{height:6,borderRadius:3,background:"var(--bg-overlay)",overflow:"hidden"}}>
                          <div style={{width:pct+"%",height:"100%",borderRadius:3,background:"var(--accent)"}} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Top 10 tags */}
        <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:"var(--radius)",overflow:"hidden",marginBottom:24}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border-subtle)",fontSize:13,fontWeight:700}}>
            {"\u{1F31F}"} Top 10 {fr?"variantes":"variants"}
          </div>
          <div style={{overflowX:"auto"}}>
            <table className="table" style={{fontSize:12}}>
              <thead><tr>
                <th>#</th><th>{fr?"Variante":"Variant"}</th><th>{fr?"Produit":"Product"}</th><th>{fr?"Ventes":"Sales"}</th><th>{fr?"Dur\u00E9e":"Duration"}</th><th>CA</th>
              </tr></thead>
              <tbody>
                {allTagStats.slice(0, 10).map((ts, i) => {
                  const parentProd = activeProducts.find(p => p.id === ts.tag.product_id);
                  return (
                    <tr key={ts.tag.id}>
                      <td style={{fontWeight:700}}>{i<3?medals[i]:`#${i+1}`}</td>
                      <td style={{fontWeight:600}}>{ts.tag.name}</td>
                      <td><span style={{display:"flex",alignItems:"center",gap:4}}><span>{parentProd?.icon}</span><span style={{color:"var(--text-secondary)"}}>{parentProd?.name}</span></span></td>
                      <td>{ts.validCount}</td>
                      <td>{ts.tag.duration_minutes ? ts.tag.duration_minutes+"min" : "\u2014"}</td>
                      <td style={{fontWeight:700}}>{ts.ca.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Heatmap Product × Model */}
        <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:"var(--radius)",overflow:"hidden",marginBottom:24}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border-subtle)",fontSize:13,fontWeight:700}}>
            {"\u{1F525}"} {fr?"Heatmap Produit \u00D7 Mod\u00E8le":"Heatmap Product \u00D7 Model"}
          </div>
          <div style={{overflowX:"auto",padding:16}}>
            {(() => {
              const heatData = {};
              let maxVal = 0;
              activeProducts.forEach(prod => {
                heatData[prod.id] = {};
                activeModels.forEach(m => {
                  const mTxs = filteredTxs.filter(tx =>
                    tx.model_id === m.id &&
                    (tx.product_id === prod.id || (tx.product && tx.product.toLowerCase().includes(prod.name.toLowerCase())))
                  );
                  const ca = mTxs.filter(tx => tx.status === "validated" || tx.status === "confirmee")
                    .reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
                  heatData[prod.id][m.id] = ca;
                  if (ca > maxVal) maxVal = ca;
                });
              });
              return (
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:"left",padding:"6px 10px",color:"var(--text-tertiary)",fontWeight:600}}></th>
                      {activeModels.map(m => <th key={m.id} style={{textAlign:"center",padding:"6px 8px",color:"var(--text-secondary)",fontWeight:600,fontSize:10}}>{m.name}</th>)}
                      <th style={{textAlign:"center",padding:"6px 8px",color:"var(--text-primary)",fontWeight:700,fontSize:10}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProducts.map(prod => {
                      const rowTotal = activeModels.reduce((s, m) => s + (heatData[prod.id]?.[m.id] || 0), 0);
                      return (
                        <tr key={prod.id}>
                          <td style={{padding:"6px 10px",fontWeight:600,whiteSpace:"nowrap"}}>{prod.icon} {prod.name}</td>
                          {activeModels.map(m => {
                            const val = heatData[prod.id]?.[m.id] || 0;
                            const intensity = maxVal > 0 ? val / maxVal : 0;
                            return (
                              <td key={m.id} style={{
                                textAlign:"center",padding:"6px 8px",fontWeight:600,fontSize:11,
                                background: val > 0 ? `var(--accent-subtle)` : "transparent",
                                color: val > 0 ? "var(--accent)" : "var(--text-quaternary)",
                                borderRadius:4,
                                opacity: val > 0 ? (0.4 + intensity * 0.6) : 1,
                              }}>{val > 0 ? val.toLocaleString("fr-FR",{maximumFractionDigits:0})+currencySymbol : "\u2014"}</td>
                            );
                          })}
                          <td style={{textAlign:"center",padding:"6px 8px",fontWeight:800,color:"var(--text-primary)"}}>{rowTotal.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    <tr style={{borderTop:"2px solid var(--border-default)"}}>
                      <td style={{padding:"8px 10px",fontWeight:800}}>Total</td>
                      {activeModels.map(m => {
                        const colTotal = activeProducts.reduce((s, prod) => s + (heatData[prod.id]?.[m.id] || 0), 0);
                        return <td key={m.id} style={{textAlign:"center",padding:"8px",fontWeight:800,color:"var(--text-primary)"}}>{colTotal > 0 ? colTotal.toLocaleString("fr-FR",{maximumFractionDigits:0})+currencySymbol : "\u2014"}</td>;
                      })}
                      <td style={{textAlign:"center",padding:"8px",fontWeight:800,color:"var(--accent)"}}>{totalCA.toLocaleString("fr-FR",{maximumFractionDigits:0})}{currencySymbol}</td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      </>)}
    </div>
  );
};

// =============================================
// AGENTS IA · CENTRE DE COMMANDE
// =============================================
function useCountUp(target, duration) {
  const d = duration || 1000;
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target === prev.current) return;
    prev.current = target;
    let start = 0;
    const step = target / (d / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(timer); }
      else setValue(Math.round(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, d]);
  return value;
}

const GradientCard = ({children, style}) => (
  <div style={{background:"var(--accent-muted)",borderRadius:21,padding:1,...(style||{})}}>
    <div style={{background:"var(--bg-surface)",borderRadius:12,padding:"20px 24px",height:"100%"}}>
      {children}
    </div>
  </div>
);

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
            <div key={i} style={{display:"flex",alignItems:"center",gap:16,padding:"16px 20px",background:r.level==="urgent"?"var(--danger-muted)":r.level==="warning"?"var(--warning-muted)":"var(--accent-subtle)",border:"1px solid "+(r.level==="urgent"?"var(--danger-muted)":r.level==="warning"?"var(--warning-muted)":"var(--accent-muted)"),borderRadius:16,borderLeft:"4px solid "+(r.level==="urgent"?"var(--danger)":r.level==="warning"?"var(--warning)":"var(--accent)")}}>
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
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:r.level==="urgent"?"var(--danger-muted)":r.level==="warning"?"var(--warning-muted)":"var(--accent-subtle)",borderRadius:10,border:"1px solid var(--border-subtle)"}}>
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
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:"var(--accent-subtle)",borderRadius:10,border:"1px solid var(--border-subtle)"}}>
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
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"var(--bg-overlay)",border:"1px solid var(--border-subtle)",borderRadius:14}}>
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
            <GradientCard key={i}>
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
                  <tr key={i} style={{transition:"background 0.2s"}}>
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
};

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
          <table className="table" style={{fontSize:12}}>
            <thead><tr><th>Name</th><th>{t(lang,"role")}</th><th>Models</th><th>Comm %</th><th>Action</th></tr></thead>
            <tbody>
              {profiles.map(u=>(
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.role}</td>
                  <td>{u.role==="chatter"?(u.assigned_models||[]).map(mid=>models.find(m=>m.id===mid)?.name).filter(Boolean).join(", ")||"none":"—"}</td>
                  <td>{u.commission_pct}%</td>
                  <td><button className="btn btn-primary btn-small" onClick={()=>startEdit(u)}>{t(lang,"edit")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {selectedUser&&(
            <div style={{marginTop:16,padding:12,background:"rgba(99,102,241,0.1)",borderRadius:8}}>
              <div className="form-group-modal">
                <label className="form-label">{t(lang,"role")}</label>
                <select className="filter-select" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                  <option value="gerant">gerant</option>
                  <option value="chatter">chatter</option>
                  <option value="provider">provider</option>
                </select>
              </div>
              {form.role==="chatter"&&(
                <div className="form-group-modal">
                  <label className="form-label">Assigned Models</label>
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
                <button className="btn btn-success" onClick={saveEdit} disabled={saving}>{saving?<span className="btn-spinner"/>:t(lang,"save")}</button>
                <button className="btn btn-danger" onClick={()=>setSelectedUser(null)}>{t(lang,"cancel")}</button>
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="card" style={{marginBottom:20}}>
            <div className="section-title"><div className="section-bar"></div>{t(lang,"models")}</div>
            <table className="table"><thead><tr><th>Name</th><th>Platform</th><th>Cost</th></tr></thead>
            <tbody>
              {models.map(m=>(<tr key={m.id}><td>{m.name}</td><td>{m.platform}</td><td>{m.monthly_cost}</td></tr>))}
            </tbody></table>
          </div>
          <div className="card">
            <div className="section-title"><div className="section-bar"></div>{t(lang,"providers")}</div>
            <table className="table"><thead><tr><th>Name</th><th>Commission %</th><th>Email</th></tr></thead>
            <tbody>
              {profiles.filter(u=>u.role==="provider").map(p=>(<tr key={p.id}><td>{p.name}</td><td>{p.commission_pct||0}%</td><td>{p.email||""}</td></tr>))}
            </tbody></table>
          </div>
        </div>
      </div>
      {/* Exchange Rate Config */}
      <div className="card" style={{marginTop:20}}>
        <div className="section-title"><div className="section-bar"></div>{lang==="fr"?"Taux de change":"Exchange Rate"}</div>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0"}}>
          <span style={{fontSize:13,fontWeight:600}}>1 EUR =</span>
          <input type="number" step="0.01" value={exchangeRate||DEFAULT_EXCHANGE_RATE} onChange={(e)=>setExchangeRate&&setExchangeRate(Number(e.target.value))} style={{width:80,padding:"6px 10px",borderRadius:8,border:"1px solid var(--border-default)",background:"var(--bg-overlay)",color:"var(--text)",fontSize:14,fontWeight:700,textAlign:"center"}} />
          <span style={{fontSize:13,fontWeight:600}}>CHF</span>
          <span style={{fontSize:11,color:"var(--text2)",marginLeft:8}}>{lang==="fr"?"(modifiable en temps réel)":"(live editable)"}</span>
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

module.exports = { AdminTab, AgencyConfigSection, ProductCatalogTab, AgentsAuditTab };
