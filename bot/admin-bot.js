// =============================================
// DADASH CRM — Admin Telegram Bot
// Commandes gérant via DM Telegram
// =============================================

const { Bot } = require("grammy");
const { createClient } = require("@supabase/supabase-js");

// ── Env vars ──
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key for full access

if (!BOT_TOKEN) { console.error("❌ BOT_TOKEN manquant"); process.exit(1); }
if (!ADMIN_TELEGRAM_ID) { console.error("❌ ADMIN_TELEGRAM_ID manquant"); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_KEY manquant"); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const bot = new Bot(BOT_TOKEN);

// ── Runtime state ──
const startTime = Date.now();
const errors = [];
const pausedModels = new Set(); // noms en minuscule

// ── Helpers ──
const fmtEUR = (v) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v || 0);
const fmtDuration = (s) => { if (!s) return "0:00"; const m = Math.floor(s / 60); const sec = s % 60; return `${m}:${sec < 10 ? "0" : ""}${sec}`; };
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const uptime = () => {
  const ms = Date.now() - startTime;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
};

function logError(context, err) {
  const entry = { ts: new Date().toISOString(), context, message: err?.message || String(err) };
  errors.push(entry);
  if (errors.length > 50) errors.shift();
  console.error(`[ERROR] ${context}:`, err?.message || err);
}

// ── Admin-only middleware ──
function adminOnly(handler) {
  return async (ctx) => {
    if (ctx.from?.id !== ADMIN_TELEGRAM_ID) {
      return ctx.reply("⛔ Accès refusé. Ce bot est réservé au gérant.");
    }
    try {
      await handler(ctx);
    } catch (err) {
      logError(ctx.message?.text || "unknown", err);
      await ctx.reply(`❌ Erreur: ${err.message}`);
    }
  };
}

// Helper: find model by name (case-insensitive partial match)
async function findModel(name) {
  const { data: models } = await sb.from("models").select("*");
  if (!models || !models.length) return null;
  const q = name.toLowerCase().trim();
  return models.find(m => m.name?.toLowerCase() === q)
    || models.find(m => m.name?.toLowerCase().startsWith(q))
    || null;
}

// ══════════════════════════════════
//  /start — Welcome
// ══════════════════════════════════
bot.command("start", adminOnly(async (ctx) => {
  await ctx.reply(
    `🏠 *Dadash Admin Bot*\n\n` +
    `Commandes disponibles :\n` +
    `/stats — KPIs du jour\n` +
    `/models — Modèles actifs\n` +
    `/pause <modèle> — Pause bot pour un modèle\n` +
    `/resume <modèle> — Reprend le bot\n` +
    `/broadcast <modèle> <message> — Mass relance\n` +
    `/topspenders <modèle> — Top 5 spenders\n` +
    `/health — Status technique`,
    { parse_mode: "Markdown" }
  );
}));

// ══════════════════════════════════
//  /stats — KPIs du jour
// ══════════════════════════════════
bot.command("stats", adminOnly(async (ctx) => {
  const d = today();
  const m = thisMonth();

  // Messages bot today
  const { data: botStats } = await sb.from("bot_stats")
    .select("*")
    .gte("timestamp", `${d}T00:00:00`);
  const msgReceived = (botStats || []).reduce((s, x) => s + (x.messages_received || 0), 0);
  const msgSent = (botStats || []).reduce((s, x) => s + (x.messages_sent || 0), 0);

  // TX scanned today
  const { data: txToday } = await sb.from("transactions")
    .select("id,amount")
    .gte("date", d);
  const txCount = (txToday || []).length;
  const txTotal = (txToday || []).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);

  // Video sessions today
  const { data: vidSess } = await sb.from("video_sessions")
    .select("id,amount")
    .gte("created_at", `${d}T00:00:00`)
    .catch(() => ({ data: [] }));
  const sessCount = (vidSess || []).length;
  const sessCA = (vidSess || []).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);

  // CA du mois
  const { data: txMonth } = await sb.from("transactions")
    .select("amount")
    .gte("date", `${m}-01`);
  const monthCA = (txMonth || []).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);

  await ctx.reply(
    `📊 *KPIs du jour — ${d}*\n\n` +
    `📩 Messages reçus: *${msgReceived}*\n` +
    `📤 Messages envoyés: *${msgSent}*\n` +
    `💸 TX scannées: *${txCount}* (${fmtEUR(txTotal)})\n` +
    `🎬 Sessions vidéo: *${sessCount}* (${fmtEUR(sessCA)})\n` +
    `📅 CA estimé ce mois: *${fmtEUR(monthCA)}*\n\n` +
    `${pausedModels.size > 0 ? `⏸ Modèles en pause: ${[...pausedModels].join(", ")}` : "✅ Tous les modèles actifs"}`,
    { parse_mode: "Markdown" }
  );
}));

// ══════════════════════════════════
//  /models — Liste modèles actifs
// ══════════════════════════════════
bot.command("models", adminOnly(async (ctx) => {
  const { data: models } = await sb.from("models").select("*");
  if (!models || !models.length) return ctx.reply("Aucun modèle trouvé.");

  // Get last activity per model from transactions
  const { data: txs } = await sb.from("transactions")
    .select("model,date")
    .order("date", { ascending: false })
    .limit(500);

  const lastActivity = {};
  (txs || []).forEach(tx => {
    if (tx.model && !lastActivity[tx.model]) lastActivity[tx.model] = tx.date;
  });

  // Get bot_stats for today to determine "online" status
  const { data: todayStats } = await sb.from("bot_stats")
    .select("model_id,messages_received")
    .gte("timestamp", `${today()}T00:00:00`);
  const activeToday = new Set((todayStats || []).filter(s => s.messages_received > 0).map(s => s.model_id));

  let msg = `👩 *Modèles — ${models.length} total*\n\n`;
  models.forEach(m => {
    const paused = pausedModels.has(m.name?.toLowerCase());
    const online = activeToday.has(m.id);
    const status = paused ? "⏸ Pause" : online ? "🟢 En ligne" : "⚪ Offline";
    const last = lastActivity[m.name] || "—";
    msg += `${paused ? "⏸" : online ? "🟢" : "⚪"} *${m.name}* — ${status}\n`;
    msg += `    Dernière activité: ${last}\n`;
  });

  await ctx.reply(msg, { parse_mode: "Markdown" });
}));

// ══════════════════════════════════
//  /pause <modèle> — Pause bot
// ══════════════════════════════════
bot.command("pause", adminOnly(async (ctx) => {
  const name = ctx.match?.trim();
  if (!name) return ctx.reply("Usage: /pause <nom_modele>");

  const model = await findModel(name);
  if (!model) return ctx.reply(`❌ Modèle "${name}" introuvable.`);

  pausedModels.add(model.name.toLowerCase());

  // Persist in DB
  await sb.from("bot_config").upsert({
    key: `paused_${model.id}`,
    value: "true",
    updated_at: new Date().toISOString()
  }, { onConflict: "key" }).catch(() => {});

  await ctx.reply(`⏸ Bot en pause pour *${model.name}*.\nUtilise /resume ${model.name.toLowerCase()} pour reprendre.`, { parse_mode: "Markdown" });
}));

// ══════════════════════════════════
//  /resume <modèle> — Resume bot
// ══════════════════════════════════
bot.command("resume", adminOnly(async (ctx) => {
  const name = ctx.match?.trim();
  if (!name) return ctx.reply("Usage: /resume <nom_modele>");

  const model = await findModel(name);
  if (!model) return ctx.reply(`❌ Modèle "${name}" introuvable.`);

  pausedModels.delete(model.name.toLowerCase());

  // Remove from DB
  await sb.from("bot_config").delete().eq("key", `paused_${model.id}`).catch(() => {});

  await ctx.reply(`▶️ Bot repris pour *${model.name}* !`, { parse_mode: "Markdown" });
}));

// ══════════════════════════════════
//  /broadcast <modèle> <message>
// ══════════════════════════════════
bot.command("broadcast", adminOnly(async (ctx) => {
  const args = ctx.match?.trim();
  if (!args) return ctx.reply("Usage: /broadcast <modele> <message>\nEx: /broadcast sophie Hey bb 💕");

  const spaceIdx = args.indexOf(" ");
  if (spaceIdx === -1) return ctx.reply("❌ Spécifie un message après le nom du modèle.\nEx: /broadcast sophie Hey bb 💕");

  const modelName = args.slice(0, spaceIdx).trim();
  const message = args.slice(spaceIdx + 1).trim();

  const model = await findModel(modelName);
  if (!model) return ctx.reply(`❌ Modèle "${modelName}" introuvable.`);

  // Get recent contacts (spenders with telegram_id who had activity in last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: recentTxs } = await sb.from("transactions")
    .select("spender")
    .eq("model", model.name)
    .gte("date", thirtyDaysAgo);

  const spenderNames = [...new Set((recentTxs || []).map(t => t.spender).filter(Boolean))];

  if (!spenderNames.length) return ctx.reply(`⚠️ Aucun contact récent trouvé pour ${model.name}.`);

  // Get spenders with telegram_id
  const { data: spenders } = await sb.from("spenders").select("*");
  const targets = (spenders || []).filter(s =>
    s.telegram_id && spenderNames.some(n =>
      n.toLowerCase() === (s.handle || s.name || "").toLowerCase()
    )
  );

  if (!targets.length) {
    return ctx.reply(
      `⚠️ ${spenderNames.length} contacts trouvés pour ${model.name}, mais aucun n'a de telegram_id.\n` +
      `Contacts: ${spenderNames.slice(0, 10).join(", ")}${spenderNames.length > 10 ? "..." : ""}`
    );
  }

  // Confirm before sending
  await ctx.reply(
    `📢 *Broadcast pour ${model.name}*\n\n` +
    `📝 Message: "${message}"\n` +
    `👥 Cibles: ${targets.length} contacts avec Telegram\n` +
    `(sur ${spenderNames.length} contacts récents)\n\n` +
    `Envoi en cours...`,
    { parse_mode: "Markdown" }
  );

  // Send messages
  let sent = 0, failed = 0;
  for (const target of targets) {
    try {
      await bot.api.sendMessage(Number(target.telegram_id), message);
      sent++;
      // Rate limit: 30 msgs/sec max for Telegram
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      failed++;
      logError(`broadcast:${target.handle || target.name}`, err);
    }
  }

  await ctx.reply(
    `✅ Broadcast terminé !\n` +
    `📤 Envoyés: ${sent}\n` +
    `${failed > 0 ? `❌ Échoués: ${failed}\n` : ""}` +
    `📊 Total: ${sent + failed}`
  );
}));

// ══════════════════════════════════
//  /topspenders <modèle> — Top 5
// ══════════════════════════════════
bot.command("topspenders", adminOnly(async (ctx) => {
  const name = ctx.match?.trim();
  if (!name) return ctx.reply("Usage: /topspenders <nom_modele>");

  const model = await findModel(name);
  if (!model) return ctx.reply(`❌ Modèle "${name}" introuvable.`);

  // Get all transactions for this model
  const { data: txs } = await sb.from("transactions")
    .select("spender,amount")
    .eq("model", model.name);

  if (!txs || !txs.length) return ctx.reply(`Aucune transaction pour ${model.name}.`);

  // Aggregate by spender
  const sums = {};
  txs.forEach(tx => {
    if (!tx.spender) return;
    sums[tx.spender] = (sums[tx.spender] || 0) + (parseFloat(tx.amount) || 0);
  });

  const top = Object.entries(sums)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalCA = Object.values(sums).reduce((s, v) => s + v, 0);
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

  let msg = `💰 *Top Spenders — ${model.name}*\n`;
  msg += `CA total: ${fmtEUR(totalCA)} (${Object.keys(sums).length} spenders)\n\n`;

  top.forEach(([name, amount], i) => {
    const pct = totalCA > 0 ? Math.round(amount / totalCA * 100) : 0;
    msg += `${medals[i]} *${name}* — ${fmtEUR(amount)} (${pct}%)\n`;
  });

  await ctx.reply(msg, { parse_mode: "Markdown" });
}));

// ══════════════════════════════════
//  /health — Status technique
// ══════════════════════════════════
bot.command("health", adminOnly(async (ctx) => {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1048576);
  const rssMB = Math.round(mem.rss / 1048576);

  // Test Supabase connection
  let dbStatus = "🟢 OK";
  try {
    const { error } = await sb.from("models").select("id").limit(1);
    if (error) dbStatus = `🔴 ${error.message}`;
  } catch (e) {
    dbStatus = `🔴 ${e.message}`;
  }

  // Recent errors
  const recentErrors = errors.slice(-5).reverse();
  let errMsg = recentErrors.length
    ? recentErrors.map(e => `  • ${e.ts.slice(11, 19)} ${e.context}: ${e.message.slice(0, 60)}`).join("\n")
    : "  Aucune erreur récente ✅";

  await ctx.reply(
    `🏥 *Health Check*\n\n` +
    `⏱ Uptime: *${uptime()}*\n` +
    `🧠 Mémoire: ${heapMB} MB heap / ${rssMB} MB RSS\n` +
    `🗄 Supabase: ${dbStatus}\n` +
    `⏸ Modèles en pause: ${pausedModels.size > 0 ? [...pausedModels].join(", ") : "aucun"}\n` +
    `📊 Node: ${process.version}\n\n` +
    `🚨 *Erreurs récentes (${errors.length} total):*\n${errMsg}`,
    { parse_mode: "Markdown" }
  );
}));

// ── Unknown commands from admin ──
bot.on("message:text", adminOnly(async (ctx) => {
  if (ctx.message.text.startsWith("/")) {
    await ctx.reply(
      `❓ Commande inconnue.\n\n` +
      `Commandes: /stats /models /pause /resume /broadcast /topspenders /health`
    );
  }
}));

// ── Load paused models from DB on startup ──
async function loadPausedModels() {
  try {
    const { data } = await sb.from("bot_config").select("*").like("key", "paused_%").catch(() => ({ data: [] }));
    if (data) {
      const { data: models } = await sb.from("models").select("id,name");
      const modelMap = {};
      (models || []).forEach(m => { modelMap[m.id] = m.name; });
      data.forEach(row => {
        const modelId = row.key.replace("paused_", "");
        const name = modelMap[modelId];
        if (name) pausedModels.add(name.toLowerCase());
      });
    }
    console.log(`📋 Loaded ${pausedModels.size} paused model(s)`);
  } catch (e) {
    console.warn("⚠️ Could not load paused models (bot_config table may not exist yet)");
  }
}

// ── Start bot ──
async function main() {
  console.log("🚀 Dadash Admin Bot starting...");
  await loadPausedModels();
  await bot.start({
    onStart: () => {
      console.log(`✅ Bot started — Admin ID: ${ADMIN_TELEGRAM_ID}`);
      console.log(`📊 Supabase: ${SUPABASE_URL}`);
    },
  });
}

main().catch(err => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
