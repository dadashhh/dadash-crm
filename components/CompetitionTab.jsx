// =============================================
// COMPETITION TAB
// =============================================
const CompetitionTab = ({user, lang, txs, profiles}) => {
  const { convertAmount, currencySymbol } = useCurrency();
  const fr = lang === "fr";
  const dr = useDateRange("7d");
  const [leaderMetric, setLeaderMetric] = useState("ca");
  const chatters = profiles.filter(u=>u.role==="chatter");
  const compFiltered = dr.filterByDate(txs, "date");

  const ranking = useMemo(() => {
    return chatters.map(ch => {
      const chTx = compFiltered.filter(tx => tx.chatter_id === ch.id && (tx.status === "validated" || tx.status === "confirmee"));
      const ca = chTx.reduce((s, tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);
      const allChTx = compFiltered.filter(tx => tx.chatter_id === ch.id);
      const convRate = allChTx.length > 0 ? Math.round((chTx.length / allChTx.length) * 100) : 0;
      const avgTicket = chTx.length > 0 ? Math.round(ca / chTx.length) : 0;
      const xp = calculateXP(ch.id, txs, convertAmount);
      const streak = calculateStreak(ch.id, txs);
      return { user: ch, ca, cnt: allChTx.length, validCnt: chTx.length, convRate, avgTicket, xp, streak };
    }).sort((a, b) => {
      if (leaderMetric === "ca") return b.ca - a.ca;
      if (leaderMetric === "txCount") return b.validCnt - a.validCnt;
      if (leaderMetric === "convRate") return b.convRate - a.convRate;
      if (leaderMetric === "avgTicket") return b.avgTicket - a.avgTicket;
      return b.ca - a.ca;
    });
  }, [compFiltered, chatters, leaderMetric, txs, convertAmount]);

  const top3 = ranking.slice(0, 3);
  const maxCA = top3.length > 0 ? top3[0].ca : 1;
  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

  const getMetricValue = (r) => {
    if (leaderMetric === "ca") return Math.round(r.ca).toLocaleString() + currencySymbol;
    if (leaderMetric === "txCount") return r.validCnt + " TX";
    if (leaderMetric === "convRate") return r.convRate + "%";
    if (leaderMetric === "avgTicket") return Math.round(r.avgTicket).toLocaleString() + currencySymbol;
    return Math.round(r.ca).toLocaleString() + currencySymbol;
  };

  return (
    <div>
      <GlobalFilterBar lang={lang} dr={dr} />

      {/* Metric selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[{k:"ca",l:"CA Brut"},{k:"txCount",l:"Nombre TX"},{k:"convRate",l:"Taux Conv."},{k:"avgTicket",l:"Panier Moyen"}].map(m => (
          <button key={m.k} onClick={() => setLeaderMetric(m.k)} className={`filter-chip ${leaderMetric===m.k?"active":""}`}>{m.l}</button>
        ))}
      </div>

      <div className="trophy">{"\u{1F3C6}"}</div>

      {/* Podium */}
      <div className="podium">
        {top3.map((r, idx) => (
          <div key={r.user.id} className="podium-step">
            <div className="podium-rank">{medals[idx]}</div>
            <LevelBadge xp={r.xp} />
            <div className="podium-bar" style={{ height: `${(r.ca / maxCA) * 200}px` }}></div>
            <div className="podium-name">{r.user.name}</div>
            <div className="podium-ca">{getMetricValue(r)}</div>
            <StreakBadge streak={r.streak} />
          </div>
        ))}
      </div>

      {/* Full table */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        {ranking.length === 0 ? <EmptyState icon="💬" text="Aucun chatter"/> :
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr>
              <th>#</th><th>Chatter</th><th>{fr ? "Niveau" : "Level"}</th><th>CA</th><th>TX</th><th>{fr ? "Taux Conv." : "Conv. Rate"}</th><th>{fr ? "Panier Moyen" : "Avg Ticket"}</th><th>Streak</th><th>XP</th>
            </tr></thead>
            <tbody>
              {ranking.map((r, idx) => (
                <tr key={r.user.id} style={{ background: user.id === r.user.id ? "var(--accent-subtle)" : "" }}>
                  <td style={{ fontWeight: 700 }}>{idx < 3 ? medals[idx] : (idx + 1)}</td>
                  <td><Tag type="chatter" label={r.user.name} id={r.user.id}/> {user.id === r.user.id && <span style={{ fontSize: 9, color: "var(--accent)" }}>({t(lang, "you")})</span>}</td>
                  <td><LevelBadge xp={r.xp} /></td>
                  <td style={{ fontWeight: 700 }}>{Math.round(r.ca).toLocaleString()}{currencySymbol}</td>
                  <td>{r.validCnt}</td>
                  <td>
                    <span style={{ padding: "2px 8px", borderRadius: 10, background: r.convRate >= 80 ? "var(--success-muted)" : r.convRate >= 50 ? "var(--warning-muted)" : "var(--danger-muted)", color: r.convRate >= 80 ? "var(--success)" : r.convRate >= 50 ? "var(--warning)" : "var(--danger)", fontSize: 11, fontWeight: 700 }}>{r.convRate}%</span>
                  </td>
                  <td>{Math.round(r.avgTicket).toLocaleString()}{currencySymbol}</td>
                  <td><StreakBadge streak={r.streak} /></td>
                  <td style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.xp.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  );
};

module.exports.default = CompetitionTab;
