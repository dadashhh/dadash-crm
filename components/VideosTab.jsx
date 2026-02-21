// =============================================
// VIDEOS TAB (Gérant only)
// =============================================
const VideosTab = React.memo(({user, lang, models, modelVideos, videoSessions, dbSpenders, onRefresh}) => {
  const addToast = useToast();
  const [subTab, setSubTab] = useState("library");
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterModel, setFilterModel] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("30d");
  const [searchQ, setSearchQ] = useState("");
  const debouncedSearchQ = useDebounce(searchQ);
  const {sort, onSort, doSort} = useSortable("created_at","desc");

  // ── Form state for Add Video modal ──
  const [formModel, setFormModel] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("solo");
  const [formMood, setFormMood] = useState("sexy");
  const [formTags, setFormTags] = useState("");
  const [formFile, setFormFile] = useState(null);
  const [formDuration, setFormDuration] = useState(0);
  const [uploading, setUploading] = useState(false);

  const contentTypes = ["douche","chambre","lingerie","custom","solo"];
  const moods = ["sexy","cute","wild","romantic","playful","intense"];

  const modelName = (id) => {const m = models.find(x=>x.id===id); return m?m.name:"—";};
  const spenderName = (id) => {const s = (dbSpenders||[]).find(x=>x.id===id); return s?(s.handle||s.name):"—";};
  const fmtDuration = (s) => {if(!s) return "0:00"; const m=Math.floor(s/60); const sec=s%60; return `${m}:${sec<10?"0":""}${sec}`;};
  const fmtEUR = (v) => new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(v||0);

  // ── Period filter helper ──
  const periodStart = useMemo(()=>{
    const now = new Date();
    if(filterPeriod==="7d") return new Date(now-7*86400000);
    if(filterPeriod==="30d") return new Date(now-30*86400000);
    if(filterPeriod==="90d") return new Date(now-90*86400000);
    return new Date(0);
  },[filterPeriod]);

  // ══════════════════════════════════
  //  ONGLET 1 — BIBLIOTHÈQUE
  // ══════════════════════════════════

  const filteredVideos = useMemo(()=>{
    let list = [...modelVideos];
    if(filterModel) list = list.filter(v=>v.model_id===filterModel);
    if(filterType) list = list.filter(v=>v.content_type===filterType);
    if(debouncedSearchQ) {const q=debouncedSearchQ.toLowerCase(); list = list.filter(v=>(v.title||"").toLowerCase().includes(q)||(v.tags||[]).some(t=>t.toLowerCase().includes(q)));}
    return doSort(list);
  },[modelVideos, filterModel, filterType, debouncedSearchQ, sort]);

  // KPIs Bibliothèque
  const libKPIs = useMemo(()=>{
    const total = modelVideos.length;
    const modelsWithVids = {};
    modelVideos.forEach(v=>{modelsWithVids[v.model_id]=(modelsWithVids[v.model_id]||0)+1;});
    const modelCount = Object.keys(modelsWithVids).length;
    const avgPerModel = modelCount?Math.round(total/modelCount*10)/10:0;
    const totalSessions = videoSessions.length;
    const totalCA = videoSessions.reduce((s,x)=>s+(parseFloat(x.amount)||0),0);
    return {total, avgPerModel, totalSessions, totalCA};
  },[modelVideos, videoSessions]);

  // Stock bas par modèle
  const lowStockModels = useMemo(()=>{
    const counts = {};
    modelVideos.filter(v=>v.status==="active").forEach(v=>{counts[v.model_id]=(counts[v.model_id]||0)+1;});
    return models.filter(m=>(counts[m.id]||0)<5).map(m=>({...m, videoCount: counts[m.id]||0}));
  },[modelVideos, models]);

  // Toggle active/inactive
  const toggleVideoStatus = async (video) => {
    const newStatus = video.status==="active"?"inactive":"active";
    await sb.from("model_videos").update({status:newStatus}).eq("id",video.id);
    onRefresh();
  };

  // ── Upload & add video ──
  const handleAddVideo = async () => {
    if(!formModel||!formTitle) return;
    setUploading(true);
    let fileUrl = null;
    try {
      if(formFile) {
        const ext = formFile.name.split(".").pop();
        const path = `${formModel}/${Date.now()}.${ext}`;
        const {data:upData, error:upErr} = await sb.storage.from("model-videos").upload(path, formFile, {cacheControl:"3600",upsert:false});
        if(upErr) throw upErr;
        const {data:urlData} = sb.storage.from("model-videos").getPublicUrl(path);
        fileUrl = urlData?.publicUrl || null;
      }
      const {error} = await sb.from("model_videos").insert({
        model_id: formModel,
        title: formTitle,
        description: formDesc,
        content_type: formType,
        mood: formMood,
        tags: formTags?formTags.split(",").map(t=>t.trim()).filter(Boolean):[],
        duration: parseInt(formDuration, 10)||0,
        file_url: fileUrl,
        uploaded_by: user.id,
        status: "active"
      });
      if(error) throw error;
      setShowAddModal(false);
      setFormModel(""); setFormTitle(""); setFormDesc(""); setFormType("solo"); setFormMood("sexy"); setFormTags(""); setFormFile(null); setFormDuration(0);
      onRefresh();
    } catch(e) { addToast("Erreur ajout vidéo: " + (e.message||e), "error"); }
    setUploading(false);
  };

  // Auto-detect duration from video file
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    setFormFile(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { setFormDuration(Math.round(video.duration)); URL.revokeObjectURL(video.src); };
    video.src = URL.createObjectURL(file);
  };

  // ══════════════════════════════════
  //  ONGLET 2 — SESSIONS
  // ══════════════════════════════════

  const filteredSessions = useMemo(()=>{
    let list = [...videoSessions];
    if(filterModel) list = list.filter(s=>s.model_id===filterModel);
    if(filterStatus) list = list.filter(s=>s.status===filterStatus);
    list = list.filter(s=>new Date(s.created_at)>=periodStart);
    return doSort(list, {date:(r)=>r.created_at, amount:(r)=>parseFloat(r.amount)||0});
  },[videoSessions, filterModel, filterStatus, periodStart, sort]);

  // KPIs Sessions
  const sessKPIs = useMemo(()=>{
    const today = new Date().toISOString().slice(0,10);
    const month = new Date().toISOString().slice(0,7);
    const todaySess = videoSessions.filter(s=>s.created_at?.startsWith(today)).length;
    const monthSess = videoSessions.filter(s=>s.created_at?.startsWith(month));
    const monthCA = monthSess.reduce((s,x)=>s+(parseFloat(x.amount)||0),0);
    const avgDur = videoSessions.length?Math.round(videoSessions.reduce((s,x)=>s+(x.duration_real||0),0)/videoSessions.length):0;
    const completed = videoSessions.filter(s=>s.status==="completed").length;
    const successRate = videoSessions.length?Math.round(completed/videoSessions.length*100):0;
    return {todaySess, monthCA, avgDur, successRate};
  },[videoSessions]);

  // Most played videos
  const topPlayed = useMemo(()=>{
    const counts = {};
    videoSessions.forEach(s=>{if(s.video_id) counts[s.video_id]=(counts[s.video_id]||0)+1;});
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([vid,count])=>{
      const v = modelVideos.find(x=>x.id===vid);
      return {title: v?.title||"—", model: modelName(v?.model_id), count};
    });
  },[videoSessions, modelVideos, models]);

  // Most active clients
  const topClients = useMemo(()=>{
    const counts = {};
    videoSessions.forEach(s=>{const key=s.contact_id||s.contact_name||"unknown"; counts[key]=(counts[key]||0)+1;});
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([key,count])=>({name: spenderName(key)||key, count}));
  },[videoSessions, dbSpenders]);

  // ══════════════════════════════════
  //  ONGLET 3 — ANALYTICS
  // ══════════════════════════════════

  // Top vidéos par play_count
  const topVideosByPlay = useMemo(()=>{
    return [...modelVideos].sort((a,b)=>(b.play_count||0)-(a.play_count||0)).slice(0,10);
  },[modelVideos]);

  // Répartition par type de contenu (pie)
  const typeDistribution = useMemo(()=>{
    const counts = {};
    modelVideos.forEach(v=>{counts[v.content_type]=(counts[v.content_type]||0)+1;});
    return Object.entries(counts).map(([name,value])=>({name,value}));
  },[modelVideos]);

  // CA vidéo par modèle (bar)
  const caByModel = useMemo(()=>{
    const sums = {};
    videoSessions.forEach(s=>{sums[s.model_id]=(sums[s.model_id]||0)+(parseFloat(s.amount)||0);});
    return Object.entries(sums).map(([id,total])=>({name:modelName(id),total:Math.round(total*100)/100})).sort((a,b)=>b.total-a.total);
  },[videoSessions, models]);

  // Alert: clients who've seen all videos of a model
  const contentAlerts = useMemo(()=>{
    const modelVidSets = {};
    modelVideos.filter(v=>v.status==="active").forEach(v=>{
      if(!modelVidSets[v.model_id]) modelVidSets[v.model_id]=new Set();
      modelVidSets[v.model_id].add(v.id);
    });
    const clientViews = {};
    videoSessions.forEach(s=>{
      if(!s.contact_id||!s.video_id) return;
      const key=`${s.contact_id}__${s.model_id}`;
      if(!clientViews[key]) clientViews[key]=new Set();
      clientViews[key].add(s.video_id);
    });
    const alerts = [];
    Object.entries(clientViews).forEach(([key,viewedSet])=>{
      const [contactId,modelId]=key.split("__");
      const totalVids = modelVidSets[modelId];
      if(totalVids && viewedSet.size>=totalVids.size && totalVids.size>0){
        alerts.push({client:spenderName(contactId)||contactId,model:modelName(modelId),viewed:viewedSet.size});
      }
    });
    return alerts;
  },[modelVideos, videoSessions, models, dbSpenders]);

  // Heatmap: content_type × mood
  const heatmapData = useMemo(()=>{
    const map = {};
    videoSessions.forEach(s=>{
      const v = modelVideos.find(x=>x.id===s.video_id);
      if(!v) return;
      const key = `${v.content_type}__${v.mood}`;
      map[key] = (map[key]||0)+(parseFloat(s.amount)||0);
    });
    return {map, types: contentTypes, moods};
  },[videoSessions, modelVideos]);

  const heatmapMax = useMemo(()=>Math.max(1,...Object.values(heatmapData.map)),[heatmapData]);

  const COLORS = ["var(--accent)","var(--success)","var(--pink)","var(--warning)","var(--danger)","#8b5cf6","#06b6d4","#f97316"];

  const subTabs = [
    {id:"library", label:t(lang,"library"), icon:"📚"},
    {id:"sessions", label:"Sessions", icon:"🎬"},
    {id:"analytics", label:"Analytics", icon:"📊"},
  ];

  return React.createElement("div",{className:"tab-content"},
    // ── Header ──
    React.createElement("div",{className:"tab-header",style:{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}},
      React.createElement("h2",{className:"tab-title",style:{margin:0}},"\u{1F4F9} ",t(lang,"videos")),
      React.createElement("div",{style:{display:"flex",gap:8}},
        subTabs.map(st=>React.createElement("button",{key:st.id,className:`btn ${subTab===st.id?"btn-primary":"btn-ghost"}`,onClick:()=>setSubTab(st.id),style:{fontSize:13}},st.icon," ",st.label))
      )
    ),

    // ══════════════════════════════════
    //  ONGLET 1 — BIBLIOTHÈQUE
    // ══════════════════════════════════
    subTab==="library" && React.createElement(React.Fragment,null,
      // KPIs
      React.createElement("div",{className:"kpi-row",style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,margin:"20px 0"}},
        [{label:t(lang,"total_videos"),value:libKPIs.total,icon:"🎥"},{label:t(lang,"videos_per_model"),value:libKPIs.avgPerModel,icon:"📊"},{label:"Sessions totales",value:libKPIs.totalSessions,icon:"🎬"},{label:t(lang,"revenue_generated"),value:fmtEUR(libKPIs.totalCA),icon:"💰"}].map((k,i)=>
          React.createElement("div",{key:i,className:"card",style:{padding:16,display:"flex",alignItems:"center",gap:12}},
            React.createElement("div",{style:{fontSize:28}},k.icon),
            React.createElement("div",null,
              React.createElement("div",{style:{color:"var(--text-tertiary)",fontSize:12,marginBottom:2}},k.label),
              React.createElement("div",{style:{fontSize:22,fontWeight:700,color:"var(--text-primary)"}},k.value)
            )
          )
        )
      ),

      // Low stock alerts
      lowStockModels.length>0 && React.createElement("div",{style:{background:"var(--accent-subtle)",border:"1px solid var(--border-accent)",borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}},
        React.createElement("span",{style:{fontWeight:600,color:"var(--warning)"}},"⚠️ Stock bas : "),
        lowStockModels.map(m=>React.createElement("span",{key:m.id,className:"badge",style:{background:"var(--warning)",color:"#000",fontSize:11}},m.name," — ",m.videoCount," vidéo",m.videoCount!==1?"s":""))
      ),

      // Filters + Add button
      React.createElement("div",{style:{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:16}},
        React.createElement("select",{className:"input",value:filterModel,onChange:e=>setFilterModel(e.target.value),style:{maxWidth:180}},
          React.createElement("option",{value:""},t(lang,"all_models")),
          models.map(m=>React.createElement("option",{key:m.id,value:m.id},m.name))
        ),
        React.createElement("select",{className:"input",value:filterType,onChange:e=>setFilterType(e.target.value),style:{maxWidth:160}},
          React.createElement("option",{value:""},t(lang,"all_types")),
          contentTypes.map(t=>React.createElement("option",{key:t,value:t},t.charAt(0).toUpperCase()+t.slice(1)))
        ),
        React.createElement("input",{className:"input",placeholder:t(lang,"search_placeholder"),value:searchQ,onChange:e=>setSearchQ(e.target.value),style:{maxWidth:200}}),
        React.createElement("div",{style:{flex:1}}),
        React.createElement("button",{className:"btn btn-primary",onClick:()=>setShowAddModal(true)},"➕ ",t(lang,"add_video"))
      ),

      // Video cards grid
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}},
        filteredVideos.map(v=>React.createElement("div",{key:v.id,className:"card",style:{padding:0,overflow:"hidden",position:"relative"}},
          // Thumbnail
          React.createElement("div",{style:{height:160,background:"var(--bg-overlay)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}},
            v.thumbnail_url
              ? React.createElement("img",{src:v.thumbnail_url,alt:v.title,style:{width:"100%",height:"100%",objectFit:"cover"}})
              : React.createElement("div",{style:{fontSize:48,opacity:.3}},"🎥"),
            // Status badge
            React.createElement("span",{style:{position:"absolute",top:8,right:8,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:600,background:v.status==="active"?"var(--success)":"var(--text-quaternary)",color:"#fff"}},v.status),
            // Duration badge
            v.duration>0 && React.createElement("span",{style:{position:"absolute",bottom:8,right:8,fontSize:11,padding:"2px 8px",borderRadius:6,background:"rgba(0,0,0,0.7)",color:"#fff",fontWeight:500}},fmtDuration(v.duration))
          ),
          // Card body
          React.createElement("div",{style:{padding:"12px 14px"}},
            React.createElement("div",{style:{fontWeight:600,fontSize:14,color:"var(--text-primary)",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},v.title),
            React.createElement("div",{style:{fontSize:12,color:"var(--text-secondary)",marginBottom:8}},modelName(v.model_id)),
            // Tags row
            React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}},
              React.createElement("span",{className:"badge",style:{background:"var(--accent-muted)",color:"var(--accent)",fontSize:10}},v.content_type),
              v.mood && React.createElement("span",{className:"badge",style:{background:"var(--pink)",color:"#fff",fontSize:10,opacity:.85}},v.mood),
              (v.tags||[]).map((tg,i)=>React.createElement("span",{key:i,className:"badge",style:{background:"var(--bg-overlay)",color:"var(--text-secondary)",fontSize:10}},tg))
            ),
            // Bottom row
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
              React.createElement("span",{style:{fontSize:12,color:"var(--text-tertiary)"}},"▶ ",v.play_count||0," plays"),
              React.createElement("button",{
                className:"btn btn-ghost",
                style:{fontSize:11,padding:"4px 10px"},
                onClick:()=>toggleVideoStatus(v)
              },v.status==="active"?"Désactiver":"Activer")
            )
          )
        ))
      ),
      filteredVideos.length===0 && React.createElement("div",{style:{textAlign:"center",padding:40,color:"var(--text-tertiary)"}},t(lang,"no_videos_found"))
    ),

    // ══════════════════════════════════
    //  ONGLET 2 — SESSIONS
    // ══════════════════════════════════
    subTab==="sessions" && React.createElement(React.Fragment,null,
      // KPIs
      React.createElement("div",{className:"kpi-row",style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,margin:"20px 0"}},
        [{label:t(lang,"sessions_today"),value:sessKPIs.todaySess,icon:"📅"},{label:t(lang,"video_revenue_month"),value:fmtEUR(sessKPIs.monthCA),icon:"💰"},{label:t(lang,"avg_duration"),value:fmtDuration(sessKPIs.avgDur),icon:"⏱"},{label:t(lang,"success_rate"),value:sessKPIs.successRate+"%",icon:"✅"}].map((k,i)=>
          React.createElement("div",{key:i,className:"card",style:{padding:16,display:"flex",alignItems:"center",gap:12}},
            React.createElement("div",{style:{fontSize:28}},k.icon),
            React.createElement("div",null,
              React.createElement("div",{style:{color:"var(--text-tertiary)",fontSize:12,marginBottom:2}},k.label),
              React.createElement("div",{style:{fontSize:22,fontWeight:700,color:"var(--text-primary)"}},k.value)
            )
          )
        )
      ),

      // Filters
      React.createElement("div",{style:{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:16}},
        React.createElement("select",{className:"input",value:filterPeriod,onChange:e=>setFilterPeriod(e.target.value),style:{maxWidth:140}},
          React.createElement("option",{value:"7d"},"7 jours"),
          React.createElement("option",{value:"30d"},"30 jours"),
          React.createElement("option",{value:"90d"},"90 jours"),
          React.createElement("option",{value:"all"},t(lang,"all"))
        ),
        React.createElement("select",{className:"input",value:filterModel,onChange:e=>setFilterModel(e.target.value),style:{maxWidth:180}},
          React.createElement("option",{value:""},t(lang,"all_models")),
          models.map(m=>React.createElement("option",{key:m.id,value:m.id},m.name))
        ),
        React.createElement("select",{className:"input",value:filterStatus,onChange:e=>setFilterStatus(e.target.value),style:{maxWidth:160}},
          React.createElement("option",{value:""},t(lang,"all_status")),
          ["completed","cancelled","refunded","in_progress"].map(s=>React.createElement("option",{key:s,value:s},s))
        )
      ),

      // Indicateurs: top played + top clients
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}},
        // Top played
        React.createElement("div",{className:"card",style:{padding:16}},
          React.createElement("h4",{style:{margin:"0 0 12px",color:"var(--text-primary)",fontSize:14}},"🔥 ",t(lang,"most_played_videos")),
          topPlayed.length===0
            ? React.createElement("div",{style:{color:"var(--text-tertiary)",fontSize:13}},t(lang,"no_data"))
            : topPlayed.map((v,i)=>React.createElement("div",{key:i,style:{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--border-subtle)",fontSize:13}},
                React.createElement("span",{style:{color:"var(--text-primary)"}},v.title," ",React.createElement("span",{style:{color:"var(--text-tertiary)"}},"(",v.model,")")),
                React.createElement("span",{style:{fontWeight:600,color:"var(--accent)"}},v.count," plays")
              ))
        ),
        // Top clients
        React.createElement("div",{className:"card",style:{padding:16}},
          React.createElement("h4",{style:{margin:"0 0 12px",color:"var(--text-primary)",fontSize:14}},"👥 ",t(lang,"most_active_clients")),
          topClients.length===0
            ? React.createElement("div",{style:{color:"var(--text-tertiary)",fontSize:13}},t(lang,"no_data"))
            : topClients.map((c,i)=>React.createElement("div",{key:i,style:{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--border-subtle)",fontSize:13}},
                React.createElement("span",{style:{color:"var(--text-primary)"}},c.name),
                React.createElement("span",{style:{fontWeight:600,color:"var(--success)"}},c.count," sessions")
              ))
        )
      ),

      // Sessions table
      React.createElement("div",{className:"card",style:{overflow:"auto"}},
        React.createElement("table",{className:"data-table",style:{width:"100%"}},
          React.createElement("thead",null,
            React.createElement("tr",null,
              React.createElement(SortTh,{label:"Date",sortKey:"created_at",sort,onSort}),
              React.createElement("th",null,t(lang,"model")),
              React.createElement("th",null,"Client"),
              React.createElement("th",null,t(lang,"video")),
              React.createElement(SortTh,{label:t(lang,"paid_duration"),sortKey:"duration_paid",sort,onSort}),
              React.createElement(SortTh,{label:t(lang,"real_duration"),sortKey:"duration_real",sort,onSort}),
              React.createElement(SortTh,{label:t(lang,"amount"),sortKey:"amount",sort,onSort}),
              React.createElement("th",null,"Status")
            )
          ),
          React.createElement("tbody",null,
            filteredSessions.map(s=>{
              const video = modelVideos.find(v=>v.id===s.video_id);
              const statusColor = s.status==="completed"?"var(--success)":s.status==="cancelled"?"var(--danger)":s.status==="refunded"?"var(--warning)":"var(--accent)";
              return React.createElement("tr",{key:s.id},
                React.createElement("td",null,s.created_at?new Date(s.created_at).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}):"—"),
                React.createElement("td",null,React.createElement("span",{className:"tag-click tag-model"},modelName(s.model_id))),
                React.createElement("td",null,s.contact_name||spenderName(s.contact_id)),
                React.createElement("td",{style:{maxWidth:150,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},video?.title||"—"),
                React.createElement("td",null,fmtDuration(s.duration_paid)),
                React.createElement("td",null,fmtDuration(s.duration_real)),
                React.createElement("td",{style:{fontWeight:600}},fmtEUR(s.amount)),
                React.createElement("td",null,React.createElement("span",{style:{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:600,background:statusColor,color:"#fff"}},s.status))
              );
            })
          )
        ),
        filteredSessions.length===0 && React.createElement("div",{style:{textAlign:"center",padding:32,color:"var(--text-tertiary)"}},t(lang,"no_sessions_found"))
      )
    ),

    // ══════════════════════════════════
    //  ONGLET 3 — ANALYTICS
    // ══════════════════════════════════
    subTab==="analytics" && React.createElement(React.Fragment,null,
      React.createElement("div",{style:{marginTop:20}},

        // Content alerts
        contentAlerts.length>0 && React.createElement("div",{style:{background:"var(--danger)",borderRadius:10,padding:"12px 16px",marginBottom:20,color:"#fff"}},
          React.createElement("strong",null,"🚨 ",t(lang,"content_alerts")),
          contentAlerts.map((a,i)=>React.createElement("div",{key:i,style:{marginTop:6,fontSize:13}},"• ",a.client," ",t(lang,"watched_all_from")," ",React.createElement("strong",null,a.model)," → ",t(lang,"needs_new_content")))
        ),

        // Top videos by play_count
        React.createElement("div",{className:"card",style:{padding:16,marginBottom:20}},
          React.createElement("h4",{style:{margin:"0 0 16px",color:"var(--text-primary)"}},"🏆 Top vidéos par play_count"),
          topVideosByPlay.length===0
            ? React.createElement("div",{style:{color:"var(--text-tertiary)"}},t(lang,"no_data"))
            : topVideosByPlay.map((v,i)=>React.createElement("div",{key:v.id,style:{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:i<topVideosByPlay.length-1?"1px solid var(--border-subtle)":"none"}},
                React.createElement("span",{style:{fontWeight:700,color:"var(--text-tertiary)",width:24,textAlign:"right",fontSize:13}},"#",i+1),
                React.createElement("div",{style:{flex:1}},
                  React.createElement("div",{style:{fontWeight:600,color:"var(--text-primary)",fontSize:13}},v.title),
                  React.createElement("div",{style:{fontSize:11,color:"var(--text-tertiary)"}},modelName(v.model_id)," • ",v.content_type," • ",v.mood)
                ),
                React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8}},
                  React.createElement("div",{style:{width:100,height:6,borderRadius:3,background:"var(--bg-overlay)",overflow:"hidden"}},
                    React.createElement("div",{style:{width:`${Math.min(100,(v.play_count||0)/Math.max(1,topVideosByPlay[0]?.play_count||1)*100)}%`,height:"100%",background:"var(--accent)",borderRadius:3}})
                  ),
                  React.createElement("span",{style:{fontWeight:700,color:"var(--accent)",fontSize:13,minWidth:40,textAlign:"right"}},v.play_count||0)
                )
              ))
        ),

        // Charts row
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}},

          // Pie: répartition par type
          React.createElement("div",{className:"card",style:{padding:16}},
            React.createElement("h4",{style:{margin:"0 0 16px",color:"var(--text-primary)"}},"📊 ",t(lang,"distribution_by_type")),
            rechartsReady && PieChart && typeDistribution.length>0
              ? React.createElement(ResponsiveContainer,{width:"100%",height:260},
                  React.createElement(PieChart,null,
                    React.createElement(Pie,{data:typeDistribution,dataKey:"value",nameKey:"name",cx:"50%",cy:"50%",outerRadius:90,innerRadius:45,paddingAngle:2,label:({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`},
                      typeDistribution.map((_,i)=>React.createElement(Cell,{key:i,fill:COLORS[i%COLORS.length]}))
                    ),
                    React.createElement(RechartsTooltip,{contentStyle:{background:"var(--bg-overlay)",border:"1px solid var(--border-default)",borderRadius:8,color:"var(--text-primary)"}})
                  )
                )
              : React.createElement("div",{style:{height:260,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-tertiary)"}},t(lang,"no_data"))
          ),

          // Bar: CA par modèle
          React.createElement("div",{className:"card",style:{padding:16}},
            React.createElement("h4",{style:{margin:"0 0 16px",color:"var(--text-primary)"}},"💰 CA vidéo par modèle"),
            rechartsReady && BarChart && caByModel.length>0
              ? React.createElement(ResponsiveContainer,{width:"100%",height:260},
                  React.createElement(BarChart,{data:caByModel,layout:"vertical",margin:{left:60,right:20,top:5,bottom:5}},
                    React.createElement(CartesianGrid,{strokeDasharray:"3 3",stroke:"var(--border-subtle)"}),
                    React.createElement(XAxis,{type:"number",tick:{fill:"var(--text-tertiary)",fontSize:11}}),
                    React.createElement(YAxis,{type:"category",dataKey:"name",tick:{fill:"var(--text-secondary)",fontSize:12},width:55}),
                    React.createElement(RechartsTooltip,{contentStyle:{background:"var(--bg-overlay)",border:"1px solid var(--border-default)",borderRadius:8,color:"var(--text-primary)"},formatter:(v)=>fmtEUR(v)}),
                    React.createElement(Bar,{dataKey:"total",radius:[0,4,4,0]},
                      caByModel.map((_,i)=>React.createElement(Cell,{key:i,fill:COLORS[i%COLORS.length]}))
                    )
                  )
                )
              : React.createElement("div",{style:{height:260,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-tertiary)"}},t(lang,"no_data"))
          )
        ),

        // Heatmap: content_type × mood
        React.createElement("div",{className:"card",style:{padding:16}},
          React.createElement("h4",{style:{margin:"0 0 16px",color:"var(--text-primary)"}},"🔥 Heatmap — Type × Mood (CA)"),
          React.createElement("div",{style:{overflowX:"auto"}},
            React.createElement("table",{style:{width:"100%",borderCollapse:"separate",borderSpacing:3}},
              React.createElement("thead",null,
                React.createElement("tr",null,
                  React.createElement("th",{style:{fontSize:12,color:"var(--text-tertiary)",textAlign:"left",padding:"6px 8px"}}),
                  moods.map(mood=>React.createElement("th",{key:mood,style:{fontSize:11,color:"var(--text-secondary)",textAlign:"center",padding:"6px 8px",fontWeight:500}},mood))
                )
              ),
              React.createElement("tbody",null,
                contentTypes.map(type=>React.createElement("tr",{key:type},
                  React.createElement("td",{style:{fontSize:12,color:"var(--text-secondary)",fontWeight:500,padding:"6px 8px"}},type),
                  moods.map(mood=>{
                    const val = heatmapData.map[`${type}__${mood}`]||0;
                    const intensity = val/heatmapMax;
                    const bg = intensity>0?`rgba(99,102,241,${0.1+intensity*0.8})`:"var(--bg-overlay)";
                    return React.createElement("td",{key:mood,style:{textAlign:"center",padding:"10px 8px",borderRadius:6,background:bg,color:intensity>0.5?"#fff":"var(--text-tertiary)",fontSize:12,fontWeight:intensity>0.3?600:400,transition:"all .2s"}},val>0?fmtEUR(val):"—");
                  })
                ))
              )
            )
          )
        )
      )
    ),

    // ══════════════════════════════════
    //  MODAL — Ajouter une vidéo
    // ══════════════════════════════════
    showAddModal && React.createElement("div",{className:"modal-overlay",onClick:()=>setShowAddModal(false)},
      React.createElement("div",{className:"modal",onClick:e=>e.stopPropagation(),style:{maxWidth:520}},
        React.createElement("div",{className:"modal-header"},
          React.createElement("h3",{style:{margin:0}},"➕ ",t(lang,"add_video")),
          React.createElement("button",{className:"btn btn-ghost",onClick:()=>setShowAddModal(false)},"✕")
        ),
        React.createElement("div",{className:"modal-body",style:{display:"flex",flexDirection:"column",gap:14}},
          // Select modèle
          React.createElement("div",null,
            React.createElement("label",{style:{fontSize:12,color:"var(--text-secondary)",marginBottom:4,display:"block"}},t(lang,"model_star")),
            React.createElement("select",{className:"input",value:formModel,onChange:e=>setFormModel(e.target.value),style:{width:"100%"}},
              React.createElement("option",{value:""},t(lang,"choose_model")),
              models.map(m=>React.createElement("option",{key:m.id,value:m.id},m.name))
            )
          ),
          // Titre
          React.createElement("div",null,
            React.createElement("label",{style:{fontSize:12,color:"var(--text-secondary)",marginBottom:4,display:"block"}},t(lang,"title_star")),
            React.createElement("input",{className:"input",value:formTitle,onChange:e=>setFormTitle(e.target.value),placeholder:t(lang,"video_name"),style:{width:"100%"}})
          ),
          // Upload fichier
          React.createElement("div",null,
            React.createElement("label",{style:{fontSize:12,color:"var(--text-secondary)",marginBottom:4,display:"block"}},t(lang,"video_file")),
            React.createElement("input",{type:"file",accept:"video/*",onChange:handleFileSelect,style:{fontSize:13,color:"var(--text-primary)"}}),
            formDuration>0 && React.createElement("span",{style:{fontSize:12,color:"var(--text-tertiary)",marginLeft:8}},t(lang,"detected_duration"),fmtDuration(formDuration))
          ),
          // Type de contenu
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}},
            React.createElement("div",null,
              React.createElement("label",{style:{fontSize:12,color:"var(--text-secondary)",marginBottom:4,display:"block"}},"Content Type"),
              React.createElement("select",{className:"input",value:formType,onChange:e=>setFormType(e.target.value),style:{width:"100%"}},
                contentTypes.map(t=>React.createElement("option",{key:t,value:t},t.charAt(0).toUpperCase()+t.slice(1)))
              )
            ),
            React.createElement("div",null,
              React.createElement("label",{style:{fontSize:12,color:"var(--text-secondary)",marginBottom:4,display:"block"}},"Mood"),
              React.createElement("select",{className:"input",value:formMood,onChange:e=>setFormMood(e.target.value),style:{width:"100%"}},
                moods.map(m=>React.createElement("option",{key:m,value:m},m.charAt(0).toUpperCase()+m.slice(1)))
              )
            )
          ),
          // Tags
          React.createElement("div",null,
            React.createElement("label",{style:{fontSize:12,color:"var(--text-secondary)",marginBottom:4,display:"block"}},"Tags ",React.createElement("span",{style:{color:"var(--text-quaternary)"}},"(séparés par virgule)")),
            React.createElement("input",{className:"input",value:formTags,onChange:e=>setFormTags(e.target.value),placeholder:"ex: blonde, pov, asmr",style:{width:"100%"}})
          ),
          // Description
          React.createElement("div",null,
            React.createElement("label",{style:{fontSize:12,color:"var(--text-secondary)",marginBottom:4,display:"block"}},"Description"),
            React.createElement("textarea",{className:"input",value:formDesc,onChange:e=>setFormDesc(e.target.value),rows:3,placeholder:t(lang,"optional_desc"),style:{width:"100%",resize:"vertical"}})
          )
        ),
        React.createElement("div",{className:"modal-footer",style:{display:"flex",justifyContent:"flex-end",gap:8,paddingTop:12}},
          React.createElement("button",{className:"btn btn-ghost",onClick:()=>setShowAddModal(false)},t(lang,"cancel")),
          React.createElement("button",{className:"btn btn-primary",onClick:handleAddVideo,disabled:uploading||!formModel||!formTitle},uploading?(t(lang,"uploading")):(t(lang,"add")))
        )
      )
    )
  );
};

module.exports.default = VideosTab;
