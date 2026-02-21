// =============================================
// GÉRANT — MODÈLES MANAGEMENT TAB
// =============================================
const ModelManagementTab = ({user, lang, models, profiles, modelTasks, contentList, checklistTemplates, checklistInstances, onRefresh}) => {
  const addToast = useToast();
  const fr = lang === "fr";
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [subView, setSubView] = useState("tasks");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showContentModal, setShowContentModal] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [taskForm, setTaskForm] = useState({title:"",description:"",category:"general",priority:"medium",due_date:""});
  const [contentForm, setContentForm] = useState({title:"",description:"",content_type:"photo",platform:"onlyfans",due_date:"",bonus_amount:0});
  const [templateForm, setTemplateForm] = useState({name:"",items:[]});
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const modeleProfiles = profiles.filter(p => p.role === "model");
  const today = new Date().toISOString().slice(0, 10);

  // Ensure today's checklist instances exist for all models
  const ensureInstances = async (modelId) => {
    const activeTemplates = checklistTemplates.filter(t => t.active);
    for (const tpl of activeTemplates) {
      const exists = checklistInstances.find(ci => ci.model_id === modelId && ci.template_id === tpl.id && ci.date === today);
      if (!exists) {
        const items = (tpl.items || []).map(it => ({title: it.title, checked: false}));
        await sb.from("checklist_instances").insert({model_id: modelId, template_id: tpl.id, date: today, items});
      }
    }
  };

  // Model health: checklist completion %
  const getModelHealth = (modelId) => {
    const todayInstances = checklistInstances.filter(ci => ci.model_id === modelId && ci.date === today);
    if (todayInstances.length === 0) return null;
    const allItems = todayInstances.flatMap(ci => ci.items || []);
    if (allItems.length === 0) return null;
    const checked = allItems.filter(i => i.checked).length;
    return Math.round((checked / allItems.length) * 100);
  };

  // Model card stats
  const modelCards = modeleProfiles.map(m => {
    const tasks = modelTasks.filter(t => t.model_id === m.id);
    const todoCount = tasks.filter(t => t.status === "todo").length;
    const inProgressCount = tasks.filter(t => t.status === "in_progress").length;
    const urgentCount = tasks.filter(t => t.priority === "urgent" && t.status !== "done").length;
    const contents = contentList.filter(c => c.model_id === m.id);
    const pendingContent = contents.filter(c => c.status !== "published").length;
    const health = getModelHealth(m.id);
    return {...m, tasks, todoCount, inProgressCount, urgentCount, contents, pendingContent, health};
  });

  const sel = selectedModelId ? modelCards.find(m => m.id === selectedModelId) : null;

  // ── TASK CRUD ──
  const handleAddTask = async () => {
    if (!taskForm.title || !selectedModelId) return;
    setSaving(true);
    const {error} = await sb.from("model_tasks").insert({
      model_id: selectedModelId, assigned_by: user.id,
      title: taskForm.title, description: taskForm.description,
      category: taskForm.category, priority: taskForm.priority,
      due_date: taskForm.due_date || null,
    });
    setSaving(false);
    if (error) { addToast("Erreur: " + error.message, "error"); return; }
    setTaskForm({title:"",description:"",category:"general",priority:"medium",due_date:""});
    setShowTaskModal(false);
    await onRefresh();
    addToast(fr ? "Tâche ajoutée" : "Task added", "success");
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    const updates = {status: newStatus};
    if (newStatus === "done") updates.completed_at = new Date().toISOString();
    else updates.completed_at = null;
    await sb.from("model_tasks").update(updates).eq("id", taskId);
    await onRefresh();
  };

  const deleteTask = async (taskId) => {
    await sb.from("model_tasks").delete().eq("id", taskId);
    await onRefresh();
    addToast(fr ? "Tâche supprimée" : "Task deleted", "success");
  };

  // ── CONTENT CRUD ──
  const handleAddContent = async () => {
    if (!contentForm.title || !selectedModelId) return;
    setSaving(true);
    const {error} = await sb.from("content_list").insert({
      model_id: selectedModelId, assigned_by: user.id,
      title: contentForm.title, description: contentForm.description,
      content_type: contentForm.content_type, platform: contentForm.platform,
      due_date: contentForm.due_date || null, bonus_amount: Number(contentForm.bonus_amount) || 0,
    });
    setSaving(false);
    if (error) { addToast("Erreur: " + error.message, "error"); return; }
    setContentForm({title:"",description:"",content_type:"photo",platform:"onlyfans",due_date:"",bonus_amount:0});
    setShowContentModal(false);
    await onRefresh();
    addToast(fr ? "Contenu ajouté" : "Content added", "success");
  };

  const updateContentStatus = async (contentId, newStatus) => {
    const updates = {status: newStatus};
    if (newStatus === "published") updates.completed_at = new Date().toISOString();
    else updates.completed_at = null;
    await sb.from("content_list").update(updates).eq("id", contentId);
    await onRefresh();
  };

  const deleteContent = async (contentId) => {
    await sb.from("content_list").delete().eq("id", contentId);
    await onRefresh();
    addToast(fr ? "Contenu supprimé" : "Content deleted", "success");
  };

  // ── CHECKLIST TEMPLATE CRUD ──
  const handleSaveTemplate = async () => {
    if (!templateForm.name) return;
    setSaving(true);
    const items = templateForm.items.map((t, i) => ({title: t, sort_order: i}));
    if (templateForm.id) {
      await sb.from("checklist_templates").update({name: templateForm.name, items}).eq("id", templateForm.id);
    } else {
      await sb.from("checklist_templates").insert({name: templateForm.name, items});
    }
    setSaving(false);
    setShowTemplateEditor(false);
    setTemplateForm({name:"",items:[]});
    await onRefresh();
    addToast(fr ? "Template sauvegardé" : "Template saved", "success");
  };

  const toggleChecklistItem = async (instanceId, itemIdx) => {
    const inst = checklistInstances.find(ci => ci.id === instanceId);
    if (!inst) return;
    const updatedItems = inst.items.map((it, i) => i === itemIdx ? {...it, checked: !it.checked} : it);
    await sb.from("checklist_instances").update({items: updatedItems}).eq("id", instanceId);
    await onRefresh();
  };

  const catIcon = (c) => c === "social" ? "\u{1F4F1}" : c === "admin" ? "\u{1F4CB}" : c === "content" ? "\u{1F4F8}" : c === "communication" ? "\u{1F4AC}" : "\u{1F4CC}";
  const contentTypeIcon = (t) => t === "photo" ? "\u{1F4F8}" : t === "video" ? "\u{1F3A5}" : t === "live" ? "\u{1F534}" : "\u{1F4E6}";
  const priorityColor = (p) => p === "urgent" ? "var(--danger)" : p === "high" ? "var(--warning)" : p === "medium" ? "var(--accent)" : "var(--text-tertiary)";
  const statusColor = (s) => s === "done" || s === "published" ? "var(--success)" : s === "in_progress" || s === "shooting" || s === "editing" ? "var(--accent)" : s === "ready" ? "var(--pink)" : "var(--warning)";
  const healthColor = (h) => h === null ? "var(--text-quaternary)" : h >= 70 ? "var(--success)" : h >= 40 ? "var(--warning)" : "var(--danger)";

  // ── OVERVIEW (no model selected) ──
  if (!selectedModelId) {
    const totalTasks = modelTasks.filter(t => t.status !== "done").length;
    const urgentTasks = modelTasks.filter(t => t.priority === "urgent" && t.status !== "done").length;
    const pendingContents = contentList.filter(c => c.status !== "published").length;

    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800,margin:0}}>{"\u{1F469}"} {fr?"Modèles Management":"Models Management"}</h2>
            <p style={{fontSize:11,color:"var(--text-tertiary)",margin:"3px 0 0"}}>{fr?"Tâches, contenu et checklists":"Tasks, content and checklists"}</p>
          </div>
          <button onClick={()=>setShowTemplateEditor(true)} className="btn btn-primary" style={{fontSize:11,padding:"7px 16px"}}>
            {"\u2699\uFE0F"} {fr?"Templates Checklist":"Checklist Templates"}
          </button>
        </div>

        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
          {[
            {label:fr?"Modèles":"Models",value:modeleProfiles.length,icon:"\u{1F469}",color:"var(--accent)"},
            {label:fr?"Tâches actives":"Active tasks",value:totalTasks,icon:"\u{1F4CB}",color:"var(--warning)"},
            {label:fr?"Urgentes":"Urgent",value:urgentTasks,icon:"\u{1F6A8}",color:"var(--danger)"},
            {label:fr?"Contenus en cours":"Pending content",value:pendingContents,icon:"\u{1F4F8}",color:"var(--pink)"},
          ].map((k,i)=>(
            <div key={k.label} style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:18,padding:"14px 16px"}}>
              <div style={{fontSize:10,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>{k.icon} {k.label}</div>
              <div style={{fontSize:22,fontWeight:800,color:k.color}}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Model cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280,1fr))",gap:16}}>
          {modelCards.map(m => (
            <div key={m.id} onClick={async()=>{await ensureInstances(m.id);setSelectedModelId(m.id);setSubView("tasks");}} style={{
              background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:18,padding:"20px",cursor:"pointer",
              transition:"all 0.2s",borderLeft:"4px solid "+healthColor(m.health),
            }}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{width:44,height:44,borderRadius:14,background:"var(--accent-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,color:"var(--accent)"}}>{m.name?m.name[0]:"?"}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700}}>{m.name}</div>
                  <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{m.email||""}</div>
                </div>
                {m.health !== null && (
                  <div style={{width:36,height:36,borderRadius:"50%",background:`conic-gradient(${healthColor(m.health)} ${m.health*3.6}deg, var(--bg-overlay) ${m.health*3.6}deg)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:"var(--card-bg)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:healthColor(m.health)}}>{m.health}%</div>
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {m.todoCount > 0 && <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,background:"var(--warning-muted)",color:"var(--warning)",fontWeight:700}}>{"\u{1F4CB}"} {m.todoCount} {fr?"à faire":"todo"}</span>}
                {m.inProgressCount > 0 && <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,background:"var(--accent-subtle)",color:"var(--accent)",fontWeight:700}}>{"\u{1F504}"} {m.inProgressCount} {fr?"en cours":"ongoing"}</span>}
                {m.urgentCount > 0 && <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,background:"var(--danger-muted)",color:"var(--danger)",fontWeight:700}}>{"\u{1F6A8}"} {m.urgentCount} {fr?"urgent":"urgent"}</span>}
                {m.pendingContent > 0 && <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,background:"var(--pink-muted,var(--accent-subtle))",color:"var(--pink)",fontWeight:700}}>{"\u{1F4F8}"} {m.pendingContent} {fr?"contenus":"content"}</span>}
              </div>
            </div>
          ))}
          {modeleProfiles.length === 0 && <div style={{gridColumn:"1/-1",textAlign:"center",color:"var(--text-quaternary)",padding:40}}>{fr?"Aucun modèle trouvé":"No models found"}</div>}
        </div>

        {/* Template Editor Modal */}
        {showTemplateEditor && (
          <div style={{position:"fixed",inset:0,background:"var(--modal-backdrop)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setShowTemplateEditor(false)}>
            <div style={{background:"var(--modal-bg)",borderRadius:20,padding:28,width:520,maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
              <h3 style={{fontSize:16,fontWeight:800,marginBottom:16}}>{"\u2699\uFE0F"} {fr?"Templates Checklists":"Checklist Templates"}</h3>
              {checklistTemplates.map(tpl => (
                <div key={tpl.id} style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:14,padding:16,marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:700}}>{tpl.name}</span>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{setTemplateForm({id:tpl.id,name:tpl.name,items:(tpl.items||[]).map(i=>i.title)});}} className="btn" style={{fontSize:10,padding:"3px 10px"}}>{fr?"Modifier":"Edit"}</button>
                      <span style={{fontSize:9,padding:"3px 8px",borderRadius:8,background:tpl.active?"var(--success-muted,var(--accent-subtle))":"var(--bg-overlay)",color:tpl.active?"var(--success)":"var(--text-quaternary)",fontWeight:700}}>{tpl.active?(fr?"Actif":"Active"):(fr?"Inactif":"Inactive")}</span>
                    </div>
                  </div>
                  <div style={{fontSize:11,color:"var(--text-secondary)"}}>
                    {(tpl.items||[]).map((it,i) => <div key={it.title + "-" + i} style={{padding:"3px 0"}}>{"\u2022"} {it.title}</div>)}
                  </div>
                </div>
              ))}
              {/* Edit/Create form */}
              {templateForm.name !== undefined && (
                <div style={{background:"var(--bg-overlay)",borderRadius:14,padding:16,marginTop:12}}>
                  <input placeholder={fr?"Nom du template":"Template name"} value={templateForm.name} onChange={e=>setTemplateForm({...templateForm,name:e.target.value})} className="input" style={{marginBottom:8,width:"100%"}} />
                  {(templateForm.items||[]).map((it,i)=>(
                    <div key={it + "-" + i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                      <span style={{flex:1,fontSize:12}}>{i+1}. {it}</span>
                      <button onClick={()=>setTemplateForm({...templateForm,items:templateForm.items.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:14}}>{"\u{1F5D1}"}</button>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    <input placeholder={fr?"Nouvel item...":"New item..."} value={newItem} onChange={e=>setNewItem(e.target.value)} className="input" style={{flex:1}} onKeyDown={e=>{if(e.key==="Enter"&&newItem){setTemplateForm({...templateForm,items:[...templateForm.items,newItem]});setNewItem("");}}} />
                    <button onClick={()=>{if(newItem){setTemplateForm({...templateForm,items:[...templateForm.items,newItem]});setNewItem("");}}} className="btn btn-primary" style={{fontSize:11}}>+</button>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:12}}>
                    <button onClick={handleSaveTemplate} disabled={saving} className="btn btn-primary" style={{fontSize:11}}>{saving?<><BtnSpinner/>{" "}</>:(fr?"Sauvegarder":"Save")}</button>
                    <button onClick={()=>setTemplateForm({name:"",items:[]})} className="btn" style={{fontSize:11}}>{fr?"Nouveau":"New"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW (model selected) ──
  const mTasks = modelTasks.filter(t => t.model_id === selectedModelId);
  const mContents = contentList.filter(c => c.model_id === selectedModelId);
  const todayInstances = checklistInstances.filter(ci => ci.model_id === selectedModelId && ci.date === today);

  const tasksByStatus = (status) => mTasks.filter(t => t.status === status);
  const isOverdue = (d) => d && new Date(d) < new Date(today);

  const CONTENT_STATUSES = [
    {value:"pending",label:fr?"En attente":"Pending",color:"var(--warning)"},
    {value:"shooting",label:fr?"Shooting":"Shooting",color:"var(--accent)"},
    {value:"editing",label:fr?"Montage":"Editing",color:"var(--pink)"},
    {value:"ready",label:fr?"Prêt":"Ready",color:"var(--success)"},
    {value:"published",label:fr?"Publié":"Published",color:"var(--success)"},
  ];

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={()=>setSelectedModelId(null)} className="btn" style={{fontSize:12,padding:"6px 14px"}}>{"\u2190"} {fr?"Retour":"Back"}</button>
        <div style={{width:40,height:40,borderRadius:12,background:"var(--accent-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,color:"var(--accent)"}}>{sel?.name?.[0]||"?"}</div>
        <div>
          <h2 style={{fontSize:17,fontWeight:800,margin:0}}>{sel?.name}</h2>
          <p style={{fontSize:11,color:"var(--text-tertiary)",margin:0}}>{sel?.email||""}</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:0,borderRadius:14,border:"1px solid var(--border-default)",overflow:"hidden",marginBottom:20}}>
        {[
          {id:"tasks",label:fr?"Tâches":"Tasks",icon:"\u{1F4CB}",count:mTasks.filter(t=>t.status!=="done").length},
          {id:"content",label:fr?"Contenu":"Content",icon:"\u{1F4F8}",count:mContents.filter(c=>c.status!=="published").length},
          {id:"checklist",label:"Checklist",icon:"\u2705",count:null},
        ].map(st=>(
          <button key={st.id} onClick={()=>setSubView(st.id)} style={{
            padding:"8px 18px",border:"none",background:subView===st.id?"var(--accent-muted)":"transparent",
            color:subView===st.id?"var(--accent)":"var(--text-tertiary)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
            display:"flex",alignItems:"center",gap:6,
          }}>
            {st.icon} {st.label} {st.count!==null&&st.count>0&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:"var(--danger-muted)",color:"var(--danger)",fontWeight:800}}>{st.count}</span>}
          </button>
        ))}
      </div>

      {/* ── TASKS SUB-VIEW: Kanban ── */}
      {subView==="tasks"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontSize:14,fontWeight:700}}>{"\u{1F4CB}"} {fr?"Tâches assignées":"Assigned tasks"} ({mTasks.length})</span>
            <button onClick={()=>setShowTaskModal(true)} className="btn btn-primary" style={{fontSize:11,padding:"6px 14px"}}>+ {fr?"Nouvelle tâche":"New task"}</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
            {[
              {status:"todo",label:fr?"À faire":"To do",color:"var(--warning)",icon:"\u{1F4DD}"},
              {status:"in_progress",label:fr?"En cours":"In progress",color:"var(--accent)",icon:"\u{1F504}"},
              {status:"done",label:fr?"Terminé":"Done",color:"var(--success)",icon:"\u2705"},
            ].map(col=>(
              <div key={col.status} style={{background:"var(--bg-overlay)",borderRadius:16,padding:14,minHeight:200}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
                  <span style={{fontSize:14}}>{col.icon}</span>
                  <span style={{fontSize:12,fontWeight:700,color:col.color}}>{col.label}</span>
                  <span style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:"var(--bg-overlay)",color:"var(--text-quaternary)",fontWeight:700}}>{tasksByStatus(col.status).length}</span>
                </div>
                {tasksByStatus(col.status).map(task=>(
                  <div key={task.id} style={{
                    background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:14,padding:"12px 14px",marginBottom:8,
                    borderLeft:"3px solid "+priorityColor(task.priority),
                  }}>
                    <div style={{fontSize:12,fontWeight:700,marginBottom:4}}>{task.title}</div>
                    {task.description && <div style={{fontSize:10,color:"var(--text-tertiary)",marginBottom:6}}>{task.description}</div>}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                      <span style={{fontSize:9,padding:"2px 6px",borderRadius:6,background:"var(--accent-subtle)",color:"var(--accent)",fontWeight:600}}>{catIcon(task.category)} {task.category}</span>
                      {task.due_date && <span style={{fontSize:9,color:isOverdue(task.due_date)&&task.status!=="done"?"var(--danger)":"var(--text-quaternary)"}}>{"\u{1F4C5}"} {fmtDate(task.due_date)}</span>}
                      {task.priority==="urgent"&&<span style={{fontSize:9,color:"var(--danger)",fontWeight:700}}>{"\u{1F6A8}"}</span>}
                    </div>
                    <div style={{display:"flex",gap:4,justifyContent:"space-between",alignItems:"center"}}>
                      <select value={task.status} onChange={e=>updateTaskStatus(task.id,e.target.value)} className="filter-select" style={{fontSize:10,padding:"3px 6px"}}>
                        <option value="todo">{fr?"À faire":"Todo"}</option>
                        <option value="in_progress">{fr?"En cours":"In progress"}</option>
                        <option value="done">{fr?"Terminé":"Done"}</option>
                      </select>
                      <button onClick={()=>setConfirmDelete({type:"task",id:task.id})} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:12,opacity:0.6}}>{"\u{1F5D1}"}</button>
                    </div>
                  </div>
                ))}
                {tasksByStatus(col.status).length===0&&<div style={{textAlign:"center",color:"var(--text-quaternary)",fontSize:10,padding:20}}>{fr?"Aucune tâche":"No tasks"}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CONTENT SUB-VIEW: Table ── */}
      {subView==="content"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontSize:14,fontWeight:700}}>{"\u{1F4F8}"} {fr?"Contenu à produire":"Content to produce"} ({mContents.length})</span>
            <button onClick={()=>setShowContentModal(true)} className="btn btn-primary" style={{fontSize:11,padding:"6px 14px"}}>+ {fr?"Nouveau contenu":"New content"}</button>
          </div>
          {mContents.length === 0 && <div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>{fr?"Aucun contenu":"No content"}</div>}
          {mContents.length > 0 && (
            <div style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:14,overflow:"hidden"}}>
              <table className="table" style={{fontSize:12}}>
                <thead><tr>
                  <th>{fr?"Titre":"Title"}</th><th>Type</th><th>{fr?"Plateforme":"Platform"}</th><th>{fr?"Statut":"Status"}</th><th>{fr?"Échéance":"Due"}</th><th>Bonus</th><th></th>
                </tr></thead>
                <tbody>
                  {mContents.map(c=>(
                    <tr key={c.id}>
                      <td>
                        <div style={{fontWeight:600}}>{c.title}</div>
                        {c.description&&<div style={{fontSize:10,color:"var(--text-tertiary)"}}>{c.description}</div>}
                      </td>
                      <td><span style={{fontSize:10}}>{contentTypeIcon(c.content_type)} {c.content_type}</span></td>
                      <td><span style={{fontSize:10,textTransform:"capitalize"}}>{c.platform||"\u2014"}</span></td>
                      <td>
                        <select value={c.status} onChange={e=>updateContentStatus(c.id,e.target.value)} className="filter-select" style={{fontSize:10,padding:"3px 6px"}}>
                          {CONTENT_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td style={{fontSize:10,color:isOverdue(c.due_date)&&c.status!=="published"?"var(--danger)":"var(--text-secondary)"}}>{c.due_date?fmtDate(c.due_date):"\u2014"}</td>
                      <td style={{fontWeight:600,color:"var(--success)"}}>{c.bonus_amount>0?`+${c.bonus_amount}\u20AC`:"\u2014"}</td>
                      <td><button onClick={()=>setConfirmDelete({type:"content",id:c.id})} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:12,opacity:0.6}}>{"\u{1F5D1}"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CHECKLIST SUB-VIEW ── */}
      {subView==="checklist"&&(
        <div>
          <div style={{marginBottom:16}}>
            <span style={{fontSize:14,fontWeight:700}}>{"\u2705"} Checklist du {today}</span>
          </div>
          {todayInstances.length===0&&<div style={{textAlign:"center",color:"var(--text-quaternary)",padding:40}}>{fr?"Aucune checklist pour aujourd'hui. Créez un template d'abord.":"No checklist for today. Create a template first."}</div>}
          {todayInstances.map(inst=>{
            const tpl = checklistTemplates.find(t=>t.id===inst.template_id);
            const items = inst.items||[];
            const checked = items.filter(i=>i.checked).length;
            const pct = items.length>0?Math.round((checked/items.length)*100):0;
            return (
              <div key={inst.id} style={{background:"var(--card-bg)",border:"1px solid var(--border-subtle)",borderRadius:16,padding:20,marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <span style={{fontSize:13,fontWeight:700}}>{tpl?.name||"Checklist"}</span>
                  <span style={{fontSize:11,fontWeight:700,color:pct===100?"var(--success)":pct>=50?"var(--accent)":"var(--warning)"}}>{checked}/{items.length} ({pct}%)</span>
                </div>
                {/* Progress bar */}
                <div style={{height:6,borderRadius:3,background:"var(--bg-overlay)",marginBottom:14}}>
                  <div style={{height:6,borderRadius:3,background:pct===100?"var(--success)":pct>=50?"var(--accent)":"var(--warning)",width:pct+"%",transition:"width 0.3s"}}/>
                </div>
                {items.map((item,idx)=>(
                  <div key={idx} onClick={()=>toggleChecklistItem(inst.id,idx)} style={{
                    display:"flex",alignItems:"center",gap:12,padding:"10px 14px",cursor:"pointer",
                    borderRadius:10,marginBottom:4,background:item.checked?"var(--accent-subtle)":"transparent",
                    transition:"background 0.2s",
                  }}>
                    <div style={{width:20,height:20,borderRadius:6,border:"2px solid "+(item.checked?"var(--success)":"var(--border-default)"),background:item.checked?"var(--success)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s"}}>
                      {item.checked&&<span style={{color:"#fff",fontSize:12,fontWeight:800}}>{"\u2713"}</span>}
                    </div>
                    <span style={{fontSize:13,fontWeight:500,textDecoration:item.checked?"line-through":"none",opacity:item.checked?0.5:1,transition:"all 0.2s"}}>{item.title}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ADD TASK MODAL ── */}
      {showTaskModal&&(
        <div style={{position:"fixed",inset:0,background:"var(--modal-backdrop)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setShowTaskModal(false)}>
          <div style={{background:"var(--modal-bg)",borderRadius:20,padding:28,width:480}} onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:16,fontWeight:800,marginBottom:16}}>{"\u{1F4CB}"} {fr?"Nouvelle tâche":"New task"}</h3>
            <input placeholder={fr?"Titre":"Title"} value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})} className="input" style={{marginBottom:8,width:"100%"}} />
            <input placeholder="Description" value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})} className="input" style={{marginBottom:8,width:"100%"}} />
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <select value={taskForm.category} onChange={e=>setTaskForm({...taskForm,category:e.target.value})} className="filter-select">
                <option value="general">{"\u{1F4CC}"} {fr?"Général":"General"}</option>
                <option value="social">{"\u{1F4F1}"} Social</option>
                <option value="admin">{"\u{1F4CB}"} Admin</option>
                <option value="content">{"\u{1F4F8}"} {fr?"Contenu":"Content"}</option>
                <option value="communication">{"\u{1F4AC}"} Com</option>
              </select>
              <select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value})} className="filter-select">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
              <input type="date" value={taskForm.due_date} onChange={e=>setTaskForm({...taskForm,due_date:e.target.value})} className="filter-date" />
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleAddTask} disabled={saving} className="btn btn-primary" style={{fontSize:12}}>{saving?<><BtnSpinner/>{" "}</>:(fr?"Ajouter":"Add")}</button>
              <button onClick={()=>setShowTaskModal(false)} className="btn" style={{fontSize:12}}>{fr?"Annuler":"Cancel"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD CONTENT MODAL ── */}
      {showContentModal&&(
        <div style={{position:"fixed",inset:0,background:"var(--modal-backdrop)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setShowContentModal(false)}>
          <div style={{background:"var(--modal-bg)",borderRadius:20,padding:28,width:480}} onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:16,fontWeight:800,marginBottom:16}}>{"\u{1F4F8}"} {fr?"Nouveau contenu":"New content"}</h3>
            <input placeholder={fr?"Titre":"Title"} value={contentForm.title} onChange={e=>setContentForm({...contentForm,title:e.target.value})} className="input" style={{marginBottom:8,width:"100%"}} />
            <input placeholder="Description" value={contentForm.description} onChange={e=>setContentForm({...contentForm,description:e.target.value})} className="input" style={{marginBottom:8,width:"100%"}} />
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <select value={contentForm.content_type} onChange={e=>setContentForm({...contentForm,content_type:e.target.value})} className="filter-select">
                <option value="photo">{"\u{1F4F8}"} Photo</option><option value="video">{"\u{1F3A5}"} {fr?"Vidéo":"Video"}</option><option value="live">{"\u{1F534}"} Live</option><option value="custom">{"\u{1F4E6}"} Custom</option>
              </select>
              <select value={contentForm.platform} onChange={e=>setContentForm({...contentForm,platform:e.target.value})} className="filter-select">
                <option value="onlyfans">OnlyFans</option><option value="fansly">Fansly</option><option value="mym">MYM</option><option value="other">{fr?"Autre":"Other"}</option>
              </select>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input type="date" value={contentForm.due_date} onChange={e=>setContentForm({...contentForm,due_date:e.target.value})} className="filter-date" />
              <input type="number" placeholder={fr?"Bonus \u20AC":"Bonus \u20AC"} value={contentForm.bonus_amount} onChange={e=>setContentForm({...contentForm,bonus_amount:e.target.value})} className="input" style={{width:100}} />
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleAddContent} disabled={saving} className="btn btn-primary" style={{fontSize:12}}>{saving?<><BtnSpinner/>{" "}</>:(fr?"Ajouter":"Add")}</button>
              <button onClick={()=>setShowContentModal(false)} className="btn" style={{fontSize:12}}>{fr?"Annuler":"Cancel"}</button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={!!confirmDelete} icon={"\u{1F5D1}\uFE0F"} title={confirmDelete?.type==="task"?(fr?"Supprimer cette tâche ?":"Delete this task?"):(fr?"Supprimer ce contenu ?":"Delete this content?")} message={fr?"Cette action est irréversible.":"This action is irreversible."} confirmLabel={fr?"Supprimer":"Delete"} cancelLabel={fr?"Annuler":"Cancel"} danger onConfirm={()=>{if(confirmDelete?.type==="task")deleteTask(confirmDelete.id);else deleteContent(confirmDelete.id);setConfirmDelete(null);}} onCancel={()=>setConfirmDelete(null)}/>
    </div>
  );
};

module.exports.default = ModelManagementTab;
