// =============================================
// MODEL ROLE — MA CHECKLIST DU JOUR
// =============================================
const ModelChecklistTab = ({user, lang}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const [instances, setInstances] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [tplR, instR] = await Promise.all([
        sb.from("checklist_templates").select("*").eq("active", true),
        sb.from("checklist_instances").select("*").eq("model_id", user.id).eq("date", today),
      ]);
      if (cancelled) return;
      const tpls = tplR.data || [];
      let insts = instR.data || [];
      setTemplates(tpls);
      // Auto-generate missing instances
      for (const tpl of tpls) {
        if (cancelled) return;
        if (!insts.find(i => i.template_id === tpl.id)) {
          const items = (tpl.items || []).map(it => ({title: it.title, checked: false}));
          const {data} = await sb.from("checklist_instances").insert({model_id: user.id, template_id: tpl.id, date: today, items}).select().single();
          if (data) insts = [...insts, data];
        }
      }
      if (cancelled) return;
      setInstances(insts);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user.id, today]);

  const toggleItem = async (instanceId, itemIdx) => {
    const inst = instances.find(ci => ci.id === instanceId);
    if (!inst) return;
    const updatedItems = inst.items.map((it, i) => i === itemIdx ? {...it, checked: !it.checked} : it);
    await sb.from("checklist_instances").update({items: updatedItems}).eq("id", instanceId);
    setInstances(prev => prev.map(ci => ci.id === instanceId ? {...ci, items: updatedItems} : ci));
  };

  const totalItems = instances.reduce((s, ci) => s + (ci.items || []).length, 0);
  const totalChecked = instances.reduce((s, ci) => s + (ci.items || []).filter(i => i.checked).length, 0);
  const globalPct = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h2 style={{fontSize:18,fontWeight:800,margin:0}}>{"\u2705"} {fr?"Ma Checklist du Jour":"My Daily Checklist"}</h2>
        <p style={{fontSize:12,color:"var(--text-tertiary)",margin:"3px 0 0"}}>{today}</p>
      </div>

      {/* Global progress */}
      <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:18,padding:"18px 20px",marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:700}}>{fr?"Progression globale":"Overall progress"}</span>
          <span style={{fontSize:15,fontWeight:800,color:globalPct===100?"var(--success)":globalPct>=50?"var(--accent)":"var(--warning)"}}>{globalPct}%</span>
        </div>
        <div style={{height:8,borderRadius:4,background:"var(--bg-overlay)"}}>
          <div style={{height:8,borderRadius:4,background:globalPct===100?"var(--success)":globalPct>=50?"var(--accent)":"var(--warning)",width:globalPct+"%",transition:"width 0.3s"}}/>
        </div>
        <div style={{fontSize:11,color:"var(--text-tertiary)",marginTop:6}}>{totalChecked}/{totalItems} {fr?"complétés":"completed"}</div>
      </div>

      {loading && <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>Chargement...</div>}

      {!loading && instances.map(inst => {
        const tpl = templates.find(t => t.id === inst.template_id);
        const items = inst.items || [];
        const checked = items.filter(i => i.checked).length;
        const pct = items.length > 0 ? Math.round((checked / items.length) * 100) : 0;
        return (
          <div key={inst.id} style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:16,padding:20,marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <span style={{fontSize:14,fontWeight:700}}>{tpl?.name || "Checklist"}</span>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {pct===100&&<span style={{fontSize:12}}>{"\u{1F389}"}</span>}
                <span style={{fontSize:12,fontWeight:700,color:pct===100?"var(--success)":pct>=50?"var(--accent)":"var(--warning)"}}>{checked}/{items.length}</span>
              </div>
            </div>
            <div style={{height:5,borderRadius:3,background:"var(--bg-overlay)",marginBottom:16}}>
              <div style={{height:5,borderRadius:3,background:pct===100?"var(--success)":pct>=50?"var(--accent)":"var(--warning)",width:pct+"%",transition:"width 0.3s"}}/>
            </div>
            {items.map((item, idx) => (
              <div key={idx} onClick={() => toggleItem(inst.id, idx)} style={{
                display:"flex",alignItems:"center",gap:14,padding:"12px 16px",cursor:"pointer",
                borderRadius:12,marginBottom:4,background:item.checked?"var(--accent-subtle)":"transparent",transition:"background 0.2s",
              }}>
                <div style={{width:22,height:22,borderRadius:7,border:"2px solid "+(item.checked?"var(--success)":"var(--border-default)"),background:item.checked?"var(--success)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s"}}>
                  {item.checked&&<span style={{color:"#fff",fontSize:13,fontWeight:800}}>{"\u2713"}</span>}
                </div>
                <span style={{fontSize:14,fontWeight:500,textDecoration:item.checked?"line-through":"none",opacity:item.checked?0.5:1,transition:"all 0.2s"}}>{item.title}</span>
              </div>
            ))}
          </div>
        );
      })}

      {!loading && instances.length === 0 && (
        <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>
          {fr?"Aucune checklist configurée. Contacte ton gérant.":"No checklist configured. Contact your manager."}
        </div>
      )}
    </div>
  );
};

module.exports.default = ModelChecklistTab;
