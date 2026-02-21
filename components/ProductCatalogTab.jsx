// =============================================
// PRODUCT CATALOG TAB (Phase 2)
// =============================================
const ProductCatalogTab = React.memo(({user, lang, txs, models, profiles, products, productTags, modelPrices, onRefresh}) => {
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
                  ].map((k,i)=>(
                    <div key={k.label} style={{padding:"12px 14px",borderRadius:"var(--radius-sm)",background:"var(--bg-overlay)",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>{k.label}</div>
                      <div style={{fontSize:20,fontWeight:800,color:k.color||"var(--text-primary)"}}>{k.value}</div>
                    </div>
                  ))}
                </div>

                {/* Variantes table with model price overrides */}
                <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>{"\u{1F3F7}\uFE0F"} {fr?"Variantes & Prix":"Variants & Prices"}</div>
                {selectedProduct.tagStats.length === 0 ? <EmptyState icon="💲" text="Aucun tarif"/> :
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
                </div>}
                {Object.keys(priceEdits).length > 0 && (
                  <button className="btn btn-primary" onClick={handleSavePrices} disabled={savingPrices} style={{marginBottom:20}}>
                    {savingPrices ? <><BtnSpinner/>{" "}</> : fr ? `Sauvegarder ${Object.keys(priceEdits).length} prix` : `Save ${Object.keys(priceEdits).length} prices`}
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
          {productStats.length === 0 ? <EmptyState icon="🛍️" text="Aucun produit"/> :
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
          </div>}
        </div>

        {/* 2. Top 10 tags */}
        <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:"var(--radius)",overflow:"hidden",marginBottom:24}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border-subtle)",fontSize:13,fontWeight:700}}>
            {"\u{1F31F}"} Top 10 {fr?"variantes":"variants"}
          </div>
          {allTagStats.length === 0 ? <EmptyState icon="🏷️" text="Aucun tag"/> :
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
          </div>}
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
});

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

module.exports.default = ProductCatalogTab;
