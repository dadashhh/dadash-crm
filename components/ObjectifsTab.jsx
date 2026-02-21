// =============================================
// OBJECTIFS TAB
// =============================================
const ObjectifsTab = ({user, lang, txs, profiles, onRefresh}) => {
  const { convertAmount, currencySymbol } = useCurrency();
  const addToast = useToast();
  const fr = lang === "fr";
  const [confettiShown, setConfettiShown] = useState({});

  const renderChatterObjectifs = (ch, isOwn) => {
    const xp = calculateXP(ch.id, txs, convertAmount);
    const level = getLevel(xp);
    const streak = calculateStreak(ch.id, txs);
    const streakBadges = getStreakBadges(streak);
    const dailyCA = getDailyProgress(ch.id, txs, convertAmount);
    const weeklyCA = getWeeklyProgress(ch.id, txs, convertAmount);
    const dGoal = Number(ch.daily_goal) || 500;
    const wGoal = Number(ch.weekly_goal) || 3000;
    const dailyPct = Math.min(Math.round((dailyCA / dGoal) * 100), 200);
    const weeklyPct = Math.min(Math.round((weeklyCA / wGoal) * 100), 200);
    const isMultiplier = dailyCA >= dGoal * 1.5;

    // Confetti on goal reached
    if (dailyCA >= dGoal && !confettiShown[ch.id]) {
      setConfettiShown(prev => ({ ...prev, [ch.id]: true }));
      if (isOwn) setTimeout(launchConfetti, 300);
    }

    return (
      <div key={ch.id} style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20, marginBottom: 14 }}>
        {/* Header: name + level + streak */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {!isOwn && <Tag type="chatter" label={ch.name} id={ch.id}/>}
            {isOwn && <span style={{ fontSize: 15, fontWeight: 800 }}>{ch.name}</span>}
            <LevelBadge xp={xp} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StreakBadge streak={streak} />
            {isMultiplier && (
              <div style={{ padding: "4px 12px", borderRadius: 12, background: "var(--warning-muted)", border: "1px solid var(--warning-muted)", animation: "glowPulse 2s infinite" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--warning)" }}>{"\u26A1"} XP x2</span>
              </div>
            )}
          </div>
        </div>
        {/* XP Progress */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>
            <span>{level.icon} {level.name}</span>
            <span>{level.nextLevel ? `${xp.toLocaleString()} / ${level.nextLevel.min.toLocaleString()} XP` : "MAX LEVEL"}</span>
          </div>
          <XPProgressBar xp={xp} />
        </div>
        {/* Daily Goal */}
        <div style={{ background: "var(--bg-overlay)", borderRadius: 14, padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>
              {fr ? "OBJECTIF DAILY" : "DAILY GOAL"} {isMultiplier && "\u26A1 BONUS x2 ACTIF"}
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: dailyPct >= 100 ? "var(--success)" : "var(--text-primary)" }}>
              {Math.round(dailyCA).toLocaleString()} / {dGoal.toLocaleString()}{currencySymbol}
            </span>
          </div>
          <div style={{ width: "100%", height: 10, borderRadius: 10, background: "var(--bg-hover)", overflow: "hidden" }}>
            <div style={{
              width: Math.min(dailyPct, 100) + "%", height: "100%", borderRadius: 10,
              background: dailyPct >= 150 ? "linear-gradient(90deg, var(--success), var(--warning), var(--pink))" : dailyPct >= 100 ? "linear-gradient(90deg, var(--success), var(--accent))" : "var(--accent)",
              transition: "width 0.8s ease",
              boxShadow: dailyPct >= 100 ? "none" : "none",
            }} />
          </div>
          <div style={{ fontSize: 10, color: "var(--text-quaternary)", marginTop: 4 }}>
            {dailyPct}% \u2014 {dailyPct >= 150 ? "\u{1F525} BONUS MULTIPLICATEUR x2 !" : dailyPct >= 100 ? "\u2705 Objectif atteint !" : `${fr ? "Encore" : "Still"} ${Math.round(dGoal - dailyCA).toLocaleString()}${currencySymbol}`}
          </div>
        </div>
        {/* Weekly Goal */}
        <div style={{ background: "var(--bg-overlay)", borderRadius: 14, padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>{fr ? "OBJECTIF WEEKLY" : "WEEKLY GOAL"}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: weeklyPct >= 100 ? "var(--success)" : "var(--text-primary)" }}>
              {Math.round(weeklyCA).toLocaleString()} / {wGoal.toLocaleString()}{currencySymbol}
            </span>
          </div>
          <div style={{ width: "100%", height: 10, borderRadius: 10, background: "var(--bg-hover)", overflow: "hidden" }}>
            <div style={{ width: Math.min(weeklyPct, 100) + "%", height: "100%", borderRadius: 10, background: weeklyPct >= 100 ? "linear-gradient(90deg, var(--success), var(--accent))" : "var(--accent)", transition: "width 0.8s ease" }} />
          </div>
          <div style={{ fontSize: 10, color: "var(--text-quaternary)", marginTop: 4 }}>{weeklyPct}%</div>
        </div>
        {/* Streak badges */}
        {streakBadges.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {streakBadges.map(b => (
              <span key={b.name} style={{ padding: "3px 10px", borderRadius: 10, background: b.color + "15", border: "1px solid " + b.color + "30", color: b.color, fontSize: 10, fontWeight: 700 }}>{b.icon} {b.name}</span>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (user.role === "chatter") {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{"\u{1F3AF}"} {fr ? "Mes Objectifs" : "My Goals"}</h2>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "3px 0 0" }}>{fr ? "XP, niveaux, streaks et objectifs" : "XP, levels, streaks and goals"}</p>
        </div>
        {renderChatterObjectifs(user, true)}
      </div>
    );
  }

  // Gérant view: all chatters + goal config
  const chatters = profiles.filter(u => u.role === "chatter");
  const [editGoals, setEditGoals] = useState(null);
  const [goalForm, setGoalForm] = useState({ daily_goal: 0, weekly_goal: 0 });
  const saveGoals = async () => {
    if (!editGoals) return;
    await sb.from("profiles").update({ daily_goal: Number(goalForm.daily_goal), weekly_goal: Number(goalForm.weekly_goal) }).eq("id", editGoals);
    addToast(fr ? "Objectifs mis \u00E0 jour" : "Goals updated", "success");
    setEditGoals(null);
    if (onRefresh) await onRefresh();
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{"\u{1F3AF}"} {fr ? "Objectifs \u00E9quipe" : "Team Goals"}</h2>
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "3px 0 0" }}>{fr ? "Suivi des objectifs de chaque chatter" : "Track each chatter's goals"}</p>
      </div>
      {chatters.map(ch => (
        <div key={ch.id}>
          {renderChatterObjectifs(ch, false)}
          {/* Goal edit button */}
          <div style={{ display: "flex", gap: 8, marginTop: -8, marginBottom: 14, paddingLeft: 8 }}>
            {editGoals === ch.id ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Daily:</span>
                <input type="number" value={goalForm.daily_goal} onChange={e => setGoalForm({ ...goalForm, daily_goal: e.target.value })} className="input" style={{ width: 80, fontSize: 11, padding: "4px 8px" }} />
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Weekly:</span>
                <input type="number" value={goalForm.weekly_goal} onChange={e => setGoalForm({ ...goalForm, weekly_goal: e.target.value })} className="input" style={{ width: 80, fontSize: 11, padding: "4px 8px" }} />
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{currencySymbol}</span>
                <button onClick={saveGoals} className="btn btn-primary" style={{ fontSize: 10, padding: "4px 10px" }}>{"\u2705"}</button>
                <button onClick={() => setEditGoals(null)} style={{ fontSize: 10, color: "var(--text-quaternary)", background: "none", border: "none", cursor: "pointer" }}>{"\u2715"}</button>
              </div>
            ) : (
              <button onClick={() => { setEditGoals(ch.id); setGoalForm({ daily_goal: ch.daily_goal || 0, weekly_goal: ch.weekly_goal || 0 }); }}
                style={{ fontSize: 10, color: "var(--text-quaternary)", background: "none", border: "1px solid var(--border-default)", borderRadius: 8, padding: "3px 10px", cursor: "pointer" }}>
                {"\u2699\uFE0F"} {fr ? "Configurer objectifs" : "Configure goals"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

module.exports.default = ObjectifsTab;
