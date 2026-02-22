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
  ContentTaskManager,
  q_spender_profile, q_spender_transactions, q_spender_kpis,
  q_spender_breakdown_models, q_spender_breakdown_chatter, q_spender_breakdown_provider,
  _hashStr, tonightDate, tonightStatus,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, RechartsTooltip, Legend,
} = window.DadashShared;

const InvoicesTab = ({ user, lang, invoices, txs, profiles, providerPayouts, onRefresh }) => {
  const addToast = useToast();
  const { convertAmount, fmtAmount, currencySymbol } = useCurrency();
  const fr = lang === "fr";
  const dr = useDateRange("month");
  const [activeFilter, setActiveFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showEmail, setShowEmail] = useState(null);
  const [emailTo, setEmailTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [invSort, setInvSort] = useState({key: null, dir: null});
  const [invPage, setInvPage] = useState(0);
  const [createForm, setCreateForm] = useState({
    type: "outgoing_chatter",
    profile_id: "",
    provider_id: "",
    line_items: [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
    payment_method: "Virement",
    payment_reference: "",
    notes: "",
    due_date: "",
    period_from: "",
    period_to: "",
    currency: "EUR",
  });

  const allInvoices = invoices || [];
  const filteredByDate = dr.filterByDate(allInvoices, "created_at");

  // Apply type filter
  let filtered = filteredByDate;
  if (activeFilter === "outgoing") filtered = filtered.filter(i => i.type === "outgoing_chatter" || i.type === "outgoing_model");
  else if (activeFilter === "incoming") filtered = filtered.filter(i => i.type === "incoming_provider");
  else if (activeFilter === "drafts") filtered = filtered.filter(i => i.status === "draft");

  // Apply status filter
  if (statusFilter !== "all") filtered = filtered.filter(i => i.status === statusFilter);

  const invFilteredLen = filtered.length;
  useEffect(() => { setInvPage(0); }, [invFilteredLen, invSort.key, invSort.dir]);
  const invSortGetters = {created_at:i=>i.created_at,invoice_number:i=>i.invoice_number,type:i=>i.type,total:i=>Number(i.total||0),status:i=>i.status,to_name:i=>(i.from_name||"")+" "+(i.to_name||"")};
  const sortedInvoices = sortData(filtered, invSort, invSortGetters);
  const paginatedInvoices = paginate(sortedInvoices, invPage);

  // KPIs
  const totalFacture = filteredByDate.reduce((s, i) => s + Number(i.total || 0), 0);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = allInvoices.filter(i => new Date(i.created_at) >= monthStart);
  const countThisMonth = thisMonth.length;
  const outgoing = filteredByDate.filter(i => i.type === "outgoing_chatter" || i.type === "outgoing_model");
  const outgoingTotal = outgoing.reduce((s, i) => s + Number(i.total || 0), 0);
  const incoming = filteredByDate.filter(i => i.type === "incoming_provider");
  const incomingTotal = incoming.reduce((s, i) => s + Number(i.total || 0), 0);
  const pendingPayment = filteredByDate.filter(i => i.status === "sent" || i.status === "draft" || i.status === "overdue");
  const pendingTotal = pendingPayment.reduce((s, i) => s + Number(i.total || 0), 0);

  // Create manual invoice
  const handleCreate = async () => {
    setSaving(true);
    try {
      const invoiceNumber = await getNextInvoiceNumber();
      const agency = getAgencyDetails();
      const items = createForm.line_items.map(li => ({ ...li, total: li.quantity * li.unit_price }));
      const subtotal = items.reduce((s, i) => s + i.total, 0);
      const isOutgoing = createForm.type.startsWith("outgoing");

      let toName = "", toDetails = {}, profileId = null, providerId = null;
      if (isOutgoing) {
        const p = profiles.find(pr => pr.id === createForm.profile_id);
        toName = p?.name || "Inconnu";
        toDetails = { email: p?.email };
        profileId = createForm.profile_id;
      } else {
        const p = profiles.find(pr => pr.id === createForm.provider_id);
        toName = agency.name;
        toDetails = agency;
        providerId = createForm.provider_id;
      }

      const { error } = await sb.from("invoices").insert({
        invoice_number: invoiceNumber,
        type: createForm.type,
        from_name: isOutgoing ? agency.name : (profiles.find(pr => pr.id === createForm.provider_id)?.name || "Provider"),
        from_details: isOutgoing ? agency : {},
        to_name: toName,
        to_details: toDetails,
        subtotal: subtotal,
        tax_rate: 0, tax_amount: 0,
        total: subtotal,
        currency: createForm.currency,
        line_items: items,
        period_from: createForm.period_from || null,
        period_to: createForm.period_to || null,
        payment_method: createForm.payment_method,
        payment_reference: createForm.payment_reference,
        due_date: createForm.due_date || null,
        notes: createForm.notes,
        status: "draft",
        profile_id: profileId,
        provider_id: providerId,
        created_by: user.id,
      });
      if (error) { addToast("Erreur: " + error.message, "error"); setSaving(false); return; }
      addToast(fr ? "Facture créée ✓" : "Invoice created ✓", "success");
      setShowCreate(false);
      setCreateForm({ type: "outgoing_chatter", profile_id: "", provider_id: "", line_items: [{ description: "", quantity: 1, unit_price: 0, total: 0 }], payment_method: "Virement", payment_reference: "", notes: "", due_date: "", period_from: "", period_to: "", currency: "EUR" });
      if (onRefresh) await onRefresh();
    } catch (e) { addToast("Erreur: " + e.message, "error"); }
    setSaving(false);
  };

  // Cancel invoice
  const handleCancel = async (inv) => {
    if (inv.status !== "draft" && inv.status !== "sent") return;
    try {
      const { error } = await sb.from("invoices").update({ status: "cancelled" }).eq("id", inv.id);
      if (error) { addToast("Erreur: " + error.message, "error"); return; }
      addToast(fr ? "Facture annulée" : "Invoice cancelled", "success");
      if (onRefresh) await onRefresh();
    } catch (e) { addToast("Erreur: " + e.message, "error"); }
  };

  // Mark as sent
  const handleSendEmail = async () => {
    if (!showEmail || !emailTo) return;
    try {
      const { error } = await sb.from("invoices").update({ status: "sent", sent_at: new Date().toISOString(), sent_to_email: emailTo }).eq("id", showEmail.id);
      if (error) { addToast("Erreur: " + error.message, "error"); return; }
      addToast(fr ? "Facture marquée comme envoyée ✓" : "Invoice marked as sent ✓", "success");
      setShowEmail(null); setEmailTo("");
      if (onRefresh) await onRefresh();
    } catch (e) { addToast("Erreur: " + e.message, "error"); }
  };

  // Update line item in create form
  const updateLineItem = (idx, field, value) => {
    const items = [...createForm.line_items];
    items[idx] = { ...items[idx], [field]: field === "description" ? value : Number(value) };
    items[idx].total = items[idx].quantity * items[idx].unit_price;
    setCreateForm({ ...createForm, line_items: items });
  };
  const addLineItem = () => setCreateForm({ ...createForm, line_items: [...createForm.line_items, { description: "", quantity: 1, unit_price: 0, total: 0 }] });
  const removeLineItem = (idx) => { if (createForm.line_items.length > 1) setCreateForm({ ...createForm, line_items: createForm.line_items.filter((_, i) => i !== idx) }); };

  const chatters = profiles.filter(p => p.role === "chatter");
  const modeles = profiles.filter(p => p.role === "modele");
  const providers = profiles.filter(p => p.role === "provider");

  const tabs = [
    { id: "all", label: fr ? "Toutes" : "All", count: filteredByDate.length },
    { id: "outgoing", label: fr ? "Sortantes ↗" : "Outgoing ↗", count: outgoing.length },
    { id: "incoming", label: fr ? "Entrantes ↙" : "Incoming ↙", count: incoming.length },
    { id: "drafts", label: fr ? "Brouillons" : "Drafts", count: filteredByDate.filter(i => i.status === "draft").length },
  ];

  return React.createElement("div", null,
    // Header
    React.createElement(GlobalFilterBar, { lang, dr }),
    // KPIs
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 24 } },
      [
        { label: fr ? "Total facturé" : "Total invoiced", value: totalFacture.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + "€", icon: "🧾", color: "var(--text-primary)" },
        { label: fr ? "Factures ce mois" : "This month", value: countThisMonth, icon: "📅", color: "var(--accent)" },
        { label: fr ? "Sortantes" : "Outgoing", value: outgoingTotal.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + "€", icon: "↗", color: "var(--warning)" },
        { label: fr ? "Entrantes" : "Incoming", value: incomingTotal.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + "€", icon: "↙", color: "var(--success)" },
        { label: fr ? "En attente" : "Pending", value: pendingTotal.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + "€", icon: "⏳", color: pendingTotal > 0 ? "var(--warning)" : "var(--success)" },
      ].map((k, i) => React.createElement("div", { key: i, style: { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 18, padding: "14px 16px" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 } }, k.icon + " " + k.label),
        React.createElement("div", { style: { fontSize: 22, fontWeight: 800, color: k.color } }, k.value),
      ))
    ),

    // Actions bar
    React.createElement("div", { style: { display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" } },
      React.createElement("button", { className: "btn btn-primary", style: { width: "auto" }, onClick: () => setShowCreate(!showCreate) }, "+ " + (fr ? "Créer facture" : "Create invoice")),
      React.createElement("select", { className: "filter-select", value: statusFilter, onChange: e => setStatusFilter(e.target.value), style: { width: "auto", minWidth: 140 } },
        React.createElement("option", { value: "all" }, fr ? "Tous status" : "All statuses"),
        Object.entries(invoiceStatusConfig).map(([k, v]) => React.createElement("option", { key: k, value: k }, v.icon + " " + v.label))
      ),
    ),

    // Tab filter
    React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 20 } },
      tabs.map(tb => React.createElement("button", {
        key: tb.id,
        className: "btn",
        style: { padding: "6px 16px", fontSize: 12, fontWeight: activeFilter === tb.id ? 800 : 600, background: activeFilter === tb.id ? "var(--accent)" : "var(--card-bg)", color: activeFilter === tb.id ? "#fff" : "var(--text-secondary)", border: "1px solid " + (activeFilter === tb.id ? "var(--accent)" : "var(--border-subtle)"), borderRadius: 20 },
        onClick: () => setActiveFilter(tb.id)
      }, tb.label + " (" + tb.count + ")"))
    ),

    // Create modal
    showCreate && React.createElement("div", { className: "card", style: { marginBottom: 20 } },
      React.createElement("div", { style: { fontSize: 16, fontWeight: 800, marginBottom: 16 } }, fr ? "Nouvelle facture manuelle" : "New manual invoice"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 } },
        React.createElement("div", { className: "form-group-modal" },
          React.createElement("label", { className: "form-label" }, "Type"),
          React.createElement("select", { className: "filter-select", value: createForm.type, onChange: e => setCreateForm({ ...createForm, type: e.target.value }) },
            React.createElement("option", { value: "outgoing_chatter" }, fr ? "Sortante → Chatter" : "Outgoing → Chatter"),
            React.createElement("option", { value: "outgoing_model" }, fr ? "Sortante → Modèle" : "Outgoing → Model"),
            React.createElement("option", { value: "incoming_provider" }, fr ? "Entrante ← Provider" : "Incoming ← Provider"),
          )
        ),
        createForm.type.startsWith("outgoing") ? React.createElement("div", { className: "form-group-modal" },
          React.createElement("label", { className: "form-label" }, fr ? "Destinataire" : "Recipient"),
          React.createElement("select", { className: "filter-select", value: createForm.profile_id, onChange: e => setCreateForm({ ...createForm, profile_id: e.target.value }) },
            React.createElement("option", { value: "" }, "—"),
            (createForm.type === "outgoing_chatter" ? chatters : modeles).map(p => React.createElement("option", { key: p.id, value: p.id }, p.name))
          )
        ) : React.createElement("div", { className: "form-group-modal" },
          React.createElement("label", { className: "form-label" }, "Provider"),
          React.createElement("select", { className: "filter-select", value: createForm.provider_id, onChange: e => setCreateForm({ ...createForm, provider_id: e.target.value }) },
            React.createElement("option", { value: "" }, "—"),
            providers.map(p => React.createElement("option", { key: p.id, value: p.id }, p.name))
          )
        ),
        React.createElement("div", { className: "form-group-modal" },
          React.createElement("label", { className: "form-label" }, fr ? "Devise" : "Currency"),
          React.createElement("select", { className: "filter-select", value: createForm.currency, onChange: e => setCreateForm({ ...createForm, currency: e.target.value }) },
            React.createElement("option", { value: "EUR" }, "EUR"), React.createElement("option", { value: "CHF" }, "CHF")
          )
        ),
        React.createElement("div", { className: "form-group-modal" },
          React.createElement("label", { className: "form-label" }, fr ? "Méthode paiement" : "Payment method"),
          React.createElement("select", { className: "filter-select", value: createForm.payment_method, onChange: e => setCreateForm({ ...createForm, payment_method: e.target.value }) },
            ["Virement", "PayPal", "Revolut", "Twint", "Cash", "Crypto"].map(m => React.createElement("option", { key: m }, m))
          )
        ),
        React.createElement("div", { className: "form-group-modal" },
          React.createElement("label", { className: "form-label" }, fr ? "Référence" : "Reference"),
          React.createElement("input", { className: "form-input", value: createForm.payment_reference, onChange: e => setCreateForm({ ...createForm, payment_reference: e.target.value }) })
        ),
        React.createElement("div", { className: "form-group-modal" },
          React.createElement("label", { className: "form-label" }, fr ? "Échéance" : "Due date"),
          React.createElement("input", { className: "filter-date", type: "date", value: createForm.due_date, onChange: e => setCreateForm({ ...createForm, due_date: e.target.value }) })
        ),
        React.createElement("div", { className: "form-group-modal" },
          React.createElement("label", { className: "form-label" }, fr ? "Période du" : "Period from"),
          React.createElement("input", { className: "filter-date", type: "date", value: createForm.period_from, onChange: e => setCreateForm({ ...createForm, period_from: e.target.value }) })
        ),
        React.createElement("div", { className: "form-group-modal" },
          React.createElement("label", { className: "form-label" }, fr ? "Période au" : "Period to"),
          React.createElement("input", { className: "filter-date", type: "date", value: createForm.period_to, onChange: e => setCreateForm({ ...createForm, period_to: e.target.value }) })
        ),
      ),
      // Line items
      React.createElement("div", { style: { marginTop: 16 } },
        React.createElement("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 8 } }, fr ? "Lignes de détail" : "Line items"),
        createForm.line_items.map((li, idx) => React.createElement("div", { key: idx, style: { display: "grid", gridTemplateColumns: "3fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 6 } },
          React.createElement("input", { className: "form-input", placeholder: "Description", value: li.description, onChange: e => updateLineItem(idx, "description", e.target.value), style: { fontSize: 12 } }),
          React.createElement("input", { className: "form-input", type: "number", placeholder: "Qté", value: li.quantity, onChange: e => updateLineItem(idx, "quantity", e.target.value), style: { fontSize: 12 } }),
          React.createElement("input", { className: "form-input", type: "number", step: "0.01", placeholder: "Prix", value: li.unit_price, onChange: e => updateLineItem(idx, "unit_price", e.target.value), style: { fontSize: 12 } }),
          React.createElement("div", { style: { display: "flex", alignItems: "center", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" } }, (li.quantity * li.unit_price).toFixed(2) + " " + createForm.currency),
          React.createElement("button", { className: "btn btn-danger", style: { padding: "4px 8px", fontSize: 11 }, onClick: () => removeLineItem(idx) }, "×"),
        )),
        React.createElement("button", { className: "btn", style: { fontSize: 11, padding: "4px 12px", marginTop: 4 }, onClick: addLineItem }, "+ " + (fr ? "Ajouter ligne" : "Add line")),
      ),
      // Notes
      React.createElement("div", { className: "form-group-modal", style: { marginTop: 12 } },
        React.createElement("label", { className: "form-label" }, "Notes"),
        React.createElement("textarea", { className: "form-input", rows: 2, value: createForm.notes, onChange: e => setCreateForm({ ...createForm, notes: e.target.value }), style: { resize: "vertical" } })
      ),
      // Buttons
      React.createElement("div", { style: { display: "flex", gap: 12, marginTop: 16 } },
        React.createElement("button", { className: "btn btn-success", onClick: handleCreate, disabled: saving }, saving ? React.createElement("span",{className:"btn-spinner"}) : (fr ? "Créer facture" : "Create invoice")),
        React.createElement("button", { className: "btn btn-danger", onClick: () => setShowCreate(false) }, fr ? "Annuler" : "Cancel"),
      ),
    ),

    // Email modal
    showEmail && React.createElement("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }, onClick: () => setShowEmail(null) },
      React.createElement("div", { className: "card", style: { maxWidth: 500, width: "90%", maxHeight: "80vh", overflow: "auto" }, onClick: e => e.stopPropagation() },
        React.createElement("div", { style: { fontSize: 16, fontWeight: 800, marginBottom: 16 } }, fr ? "Envoyer facture par email" : "Send invoice by email"),
        React.createElement("div", { style: { marginBottom: 12 } },
          React.createElement("div", { style: { fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 } }, "Facture: " + showEmail.invoice_number),
          React.createElement("div", { style: { fontSize: 14, fontWeight: 700 } }, showEmail.to_name + " — " + Number(showEmail.total).toFixed(2) + " " + (showEmail.currency || "EUR")),
        ),
        React.createElement("div", { className: "form-group-modal" },
          React.createElement("label", { className: "form-label" }, "Email"),
          React.createElement("input", { className: "form-input", type: "email", value: emailTo, onChange: e => setEmailTo(e.target.value), placeholder: "email@example.com" })
        ),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text-tertiary)", marginTop: 8, padding: 12, background: "var(--bg-base)", borderRadius: 8 } },
          fr ? "Note : La facture sera marquée comme envoyée. L'envoi réel par email nécessite une intégration supplémentaire (SendGrid, etc.)." : "Note: Invoice will be marked as sent. Actual email sending requires additional integration."
        ),
        React.createElement("div", { style: { display: "flex", gap: 12, marginTop: 16 } },
          React.createElement("button", { className: "btn btn-primary", onClick: handleSendEmail, disabled: !emailTo }, fr ? "Marquer envoyée" : "Mark as sent"),
          React.createElement("button", { className: "btn", onClick: () => setShowEmail(null) }, fr ? "Fermer" : "Close"),
          React.createElement("button", { className: "btn btn-success", onClick: () => downloadInvoicePDF(showEmail) }, "📄 " + (fr ? "Télécharger PDF" : "Download PDF")),
        ),
      )
    ),

    // Table
    filtered.length === 0
      ? React.createElement("div", { className: "card", style: { textAlign: "center", padding: 40, color: "var(--text-tertiary)" } }, fr ? "Aucune facture trouvée" : "No invoices found")
      : React.createElement("div", null,
          React.createElement("div", { className: "table-wrap" },
            React.createElement("table", { className: "table", style: { fontSize: 12 } },
              React.createElement("thead", null,
                React.createElement("tr", null,
                  React.createElement(SortTh, { label: "N° Facture", sortKey: "invoice_number", sort: invSort, onSort: setInvSort }),
                  React.createElement(SortTh, { label: "Date", sortKey: "created_at", sort: invSort, onSort: setInvSort }),
                  React.createElement(SortTh, { label: "Type", sortKey: "type", sort: invSort, onSort: setInvSort }),
                  React.createElement("th", null, fr ? "De → À" : "From → To"),
                  React.createElement(SortTh, { label: fr ? "Montant" : "Amount", sortKey: "total", sort: invSort, onSort: setInvSort }),
                  React.createElement(SortTh, { label: "Status", sortKey: "status", sort: invSort, onSort: setInvSort }),
                  React.createElement("th", null, "Actions"),
                )
              ),
              React.createElement("tbody", null,
                paginatedInvoices.map(inv => {
                  const st = invoiceStatusConfig[inv.status] || invoiceStatusConfig.draft;
                  const tp = invoiceTypeLabels[inv.type] || { label: inv.type, icon: "•", color: "var(--text-secondary)" };
                  return React.createElement("tr", { key: inv.id },
                    React.createElement("td", { style: { fontFamily: "monospace", fontWeight: 700, fontSize: 11 } }, inv.invoice_number),
                    React.createElement("td", null, fmtDate(inv.created_at)),
                    React.createElement("td", null, React.createElement("span", { style: { padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, color: tp.color, background: tp.color + "18" } }, tp.icon + " " + tp.label)),
                    React.createElement("td", { style: { fontSize: 11 } }, inv.from_name + " → " + inv.to_name),
                    React.createElement("td", { style: { fontWeight: 800, whiteSpace: "nowrap" } }, Number(inv.total).toFixed(2) + " " + (inv.currency || "EUR")),
                    React.createElement("td", null, React.createElement("span", { style: { padding: "3px 10px", borderRadius: 12, background: st.bg, color: st.color, fontSize: 11, fontWeight: 700 } }, st.icon + " " + st.label)),
                    React.createElement("td", null,
                      React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
                        React.createElement("button", { className: "btn", style: { fontSize: 10, padding: "3px 8px" }, onClick: () => downloadInvoicePDF(inv), title: "PDF" }, "📄"),
                        React.createElement("button", { className: "btn", style: { fontSize: 10, padding: "3px 8px" }, onClick: () => { setShowEmail(inv); setEmailTo(inv.to_details?.email || inv.sent_to_email || ""); }, title: "Email" }, "📧"),
                        (inv.status === "draft" || inv.status === "sent") && React.createElement("button", { className: "btn", style: { fontSize: 10, padding: "3px 8px", color: "var(--danger)" }, onClick: () => setConfirmAction(inv), title: fr ? "Annuler" : "Cancel" }, "❌"),
                      )
                    ),
                  );
                }),
                paginatedInvoices.length === 0 && React.createElement("tr", null, React.createElement("td", { colSpan: 7 }, React.createElement(EmptyState, { icon: "🧾", text: fr ? "Aucune facture" : "No invoices", lang: lang })))
              )
            )
          ),
          React.createElement(Pagination, { currentPage: invPage, setPage: setInvPage, totalItems: sortedInvoices.length, lang: lang }),
          React.createElement(ConfirmDialog, { open: !!confirmAction, title: fr ? "Annuler la facture" : "Cancel invoice", message: fr ? "Cette facture sera annulée. Êtes-vous sûr ?" : "This invoice will be cancelled. Are you sure?", lang: lang, onCancel: () => setConfirmAction(null), onConfirm: () => { handleCancel(confirmAction); setConfirmAction(null); } })
        ),
  );
};

module.exports = InvoicesTab;
