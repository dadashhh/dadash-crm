// =============================================
// DADASH — Carla Cam Bot (Spender-facing)
// Flow: cam keyword → douche/chambre → payment → scan check → video delivery → upsell
// =============================================

const { Bot, InputFile } = require("grammy");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

// ── Env vars ──
const BOT_TOKEN = process.env.CARLA_BOT_TOKEN || process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TWINT_NUMBER = process.env.TWINT_NUMBER || "TWINT_NUMBER_HERE";
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID) || 0;

if (!BOT_TOKEN) { console.error("[CARLA] BOT_TOKEN manquant"); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error("[CARLA] SUPABASE_URL / SUPABASE_SERVICE_KEY manquant"); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const bot = new Bot(BOT_TOKEN);

// ── Load personality config ──
const personality = require("./config/personalities/carla.json");

// ── Session state per chat (in-memory, keyed by chat ID) ──
const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      state: "idle",       // idle | awaiting_choice | awaiting_payment | video_sent
      choice: null,        // "douche" | "chambre"
      price: personality.pricing.base_price,
      discounted: false,
      lastActivity: Date.now(),
      spenderHandle: null,
      modelId: null,       // resolved on first interaction
    });
  }
  const s = sessions.get(chatId);
  s.lastActivity = Date.now();
  return s;
}

// Cleanup stale sessions (>2h idle)
setInterval(() => {
  const cutoff = Date.now() - 2 * 3600000;
  for (const [id, s] of sessions) {
    if (s.lastActivity < cutoff) sessions.delete(id);
  }
}, 600000);

// ── Helpers ──

function fillTemplate(template, session) {
  return template
    .replace(/{price}/g, session.price)
    .replace(/{discount_price}/g, personality.pricing.discount_price)
    .replace(/{currency}/g, personality.pricing.currency)
    .replace(/{twint_number}/g, TWINT_NUMBER)
    .replace(/{duration}/g, personality.pricing.duration_minutes);
}

function matchesKeywords(text, keywords) {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

function isBannedPhrase(text) {
  const lower = text.toLowerCase();
  return personality.banned_phrases.some(phrase => lower.includes(phrase.toLowerCase()));
}

async function resolveCarlaModelId() {
  try {
    const { data } = await sb.from("models").select("id,name").ilike("name", "%carla%").limit(1);
    if (data && data.length > 0) return data[0].id;
    // Fallback: check profiles
    const { data: profiles } = await sb.from("profiles").select("id,name").ilike("name", "%carla%").eq("role", "modele").limit(1);
    if (profiles && profiles.length > 0) return profiles[0].id;
  } catch (e) {
    console.error("[CARLA] resolveModelId error:", e.message);
  }
  return null;
}

async function findOrCreateSpender(ctx) {
  const tgUser = ctx.from;
  if (!tgUser) return null;

  const telegramId = String(tgUser.id);
  const handle = tgUser.username || `tg_${telegramId}`;
  const firstName = tgUser.first_name || handle;

  try {
    // Try to find existing spender by telegram_id
    const { data: existing } = await sb.from("spenders")
      .select("*")
      .eq("telegram_id", telegramId)
      .limit(1);

    if (existing && existing.length > 0) return existing[0];

    // Upsert spender
    const { data: upserted, error } = await sb.from("spenders").upsert({
      handle,
      name: firstName,
      telegram_id: telegramId,
      first_name: firstName,
      status: "active",
      source: "telegram_carla_bot",
      last_contact_date: new Date().toISOString(),
    }, { onConflict: "handle" }).select().single();

    if (error) {
      console.error("[CARLA] spender upsert error:", error.message);
      return null;
    }
    return upserted;
  } catch (e) {
    console.error("[CARLA] findOrCreateSpender error:", e.message);
    return null;
  }
}

async function queryVideo(modelId, contentType) {
  try {
    const { data, error } = await sb.from("model_videos")
      .select("*")
      .eq("model_id", modelId)
      .eq("content_type", contentType)
      .eq("status", "active")
      .order("play_count", { ascending: true }) // least-played first for variety
      .limit(1);

    if (error) {
      console.error("[CARLA] queryVideo error:", error.message);
      return null;
    }
    return data && data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error("[CARLA] queryVideo exception:", e.message);
    return null;
  }
}

async function getSignedUrl(filePath) {
  try {
    const { data, error } = await sb.storage
      .from("model-videos")
      .createSignedUrl(filePath, 3600); // 1h expiry

    if (error) {
      console.error("[CARLA] signedUrl error:", error.message);
      return null;
    }
    return data?.signedUrl || null;
  } catch (e) {
    console.error("[CARLA] getSignedUrl exception:", e.message);
    return null;
  }
}

async function downloadVideo(filePath) {
  try {
    const { data, error } = await sb.storage
      .from("model-videos")
      .download(filePath);

    if (error) {
      console.error("[CARLA] download error:", error.message);
      return null;
    }
    return data; // Blob
  } catch (e) {
    console.error("[CARLA] download exception:", e.message);
    return null;
  }
}

async function incrementPlayCount(videoId) {
  try {
    // Use RPC or manual increment
    const { data } = await sb.from("model_videos").select("play_count").eq("id", videoId).single();
    if (data) {
      await sb.from("model_videos").update({ play_count: (data.play_count || 0) + 1 }).eq("id", videoId);
    }
  } catch (e) {
    console.error("[CARLA] incrementPlayCount error:", e.message);
  }
}

async function createTransaction(session, spender, modelId, amount, currency) {
  try {
    const now = new Date();
    const dateStr = now.toISOString();

    const txRow = {
      date: dateStr,
      spender_handle: spender.handle || spender.name,
      amount,
      currency,
      status: "pending",
      model_id: modelId,
      product: "Cam",
      tag: session.choice || "video",
      notes: `Auto-TX via Carla bot — ${session.choice || "cam"} session`,
    };

    const { data, error } = await sb.from("transactions").insert(txRow).select().single();
    if (error) {
      console.error("[CARLA] createTransaction error:", error.message);
      return null;
    }
    console.log(`[CARLA] TX created: ${data.id} — ${amount} ${currency} — @${spender.handle}`);
    return data;
  } catch (e) {
    console.error("[CARLA] createTransaction exception:", e.message);
    return null;
  }
}

async function createVideoSession(videoId, modelId, spender, amount, currency) {
  try {
    const { error } = await sb.from("video_sessions").insert({
      video_id: videoId,
      model_id: modelId,
      contact_id: spender?.id || null,
      contact_name: spender?.handle || spender?.name || "unknown",
      duration_paid: personality.pricing.duration_minutes * 60,
      amount,
      currency,
      status: "completed",
      notes: `Carla cam bot — ${personality.version}`,
    });
    if (error) console.error("[CARLA] createVideoSession error:", error.message);
  } catch (e) {
    console.error("[CARLA] createVideoSession exception:", e.message);
  }
}

async function saveScreenshotCheck(chatId, spender, status, riskScore) {
  try {
    await sb.from("screenshot_checks").insert({
      checked_by: null, // bot-checked
      checked_by_role: "bot",
      spender_id: spender?.id || null,
      spender_handle: spender?.handle || null,
      risk_score: riskScore,
      status,
      red_flags: [],
      green_flags: ["auto_scan_carla_bot"],
    });
  } catch (e) {
    console.error("[CARLA] saveScreenshotCheck error:", e.message);
  }
}

async function logBotStat(modelId, channel, action) {
  try {
    const d = new Date().toISOString().slice(0, 10);
    const key = `${modelId}_${channel}_${d}`;

    // Try to get existing record for today
    const { data: existing } = await sb.from("bot_stats")
      .select("*")
      .eq("model_id", modelId)
      .eq("channel", channel)
      .gte("timestamp", `${d}T00:00:00`)
      .limit(1);

    if (existing && existing.length > 0) {
      const row = existing[0];
      const updates = {};
      if (action === "received") updates.messages_received = (row.messages_received || 0) + 1;
      if (action === "sent") updates.messages_sent = (row.messages_sent || 0) + 1;
      if (action === "screenshot") updates.screenshots_scanned = (row.screenshots_scanned || 0) + 1;
      if (action === "tx") updates.tx_created = (row.tx_created || 0) + 1;
      await sb.from("bot_stats").update(updates).eq("id", row.id);
    } else {
      await sb.from("bot_stats").insert({
        model_id: modelId,
        channel,
        messages_received: action === "received" ? 1 : 0,
        messages_sent: action === "sent" ? 1 : 0,
        screenshots_scanned: action === "screenshot" ? 1 : 0,
        tx_created: action === "tx" ? 1 : 0,
      });
    }
  } catch (e) {
    // Stats are best-effort, don't crash
  }
}

// ══════════════════════════════════
//  MESSAGE HANDLER — Main Flow
// ══════════════════════════════════

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();
  const session = getSession(chatId);

  // Resolve model ID on first interaction
  if (!session.modelId) {
    session.modelId = await resolveCarlaModelId();
  }

  // Log incoming message
  if (session.modelId) logBotStat(session.modelId, "telegram", "received");

  // ── STATE: awaiting_choice (spender should say "douche" or "chambre") ──
  if (session.state === "awaiting_choice") {
    if (matchesKeywords(text, personality.choice_keywords.douche)) {
      session.choice = "douche";
      session.state = "awaiting_payment";
      const reply = fillTemplate(personality.responses.choice_douche, session);
      await ctx.reply(reply);
      if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
      return;
    }

    if (matchesKeywords(text, personality.choice_keywords.chambre)) {
      session.choice = "chambre";
      session.state = "awaiting_payment";
      const reply = fillTemplate(personality.responses.choice_chambre, session);
      await ctx.reply(reply);
      if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
      return;
    }

    // Negotiate keywords?
    if (matchesKeywords(text, personality.negotiate_keywords)) {
      if (!session.discounted) {
        session.discounted = true;
        session.price = personality.pricing.discount_price;
        const reply = fillTemplate(personality.responses.cam_negotiate, session);
        await ctx.reply(reply);
      } else {
        const reply = fillTemplate(personality.responses.cam_negotiate_firm, session);
        await ctx.reply(reply);
      }
      if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
      return;
    }

    // Didn't understand — re-prompt
    await ctx.reply("Douche ou chambre bby ? 🛁🛏️ Choisis et je te prepare ca 😘");
    if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
    return;
  }

  // ── STATE: awaiting_payment (we're waiting for screenshot) ──
  if (session.state === "awaiting_payment") {
    // Text while waiting for screenshot — gentle reminder
    if (matchesKeywords(text, personality.negotiate_keywords)) {
      if (!session.discounted) {
        session.discounted = true;
        session.price = personality.pricing.discount_price;
        await ctx.reply(fillTemplate(personality.responses.cam_negotiate, session));
      } else {
        await ctx.reply(fillTemplate(personality.responses.cam_negotiate_firm, session));
      }
      if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
      return;
    }

    await ctx.reply(`Envoie la capture de paiement bby 📸 ${session.price} ${personality.pricing.currency} sur Twint ${TWINT_NUMBER} et je te lance ca tout de suite 🔥`);
    if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
    return;
  }

  // ── STATE: video_sent (post-delivery, general chat) ──
  if (session.state === "video_sent") {
    // If they ask for cam again, restart flow
    if (matchesKeywords(text, personality.cam_keywords)) {
      session.state = "awaiting_choice";
      session.choice = null;
      session.price = personality.pricing.base_price;
      session.discounted = false;
      const reply = fillTemplate(personality.responses.cam_direct, session);
      await ctx.reply(reply);
      if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
      return;
    }

    // General acknowledgment
    await ctx.reply("Merci bby 💋 Tu sais ou me trouver quand tu veux me revoir 😏🔥");
    if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
    return;
  }

  // ── STATE: idle — detect cam keywords ──
  if (matchesKeywords(text, personality.cam_keywords)) {
    session.state = "awaiting_choice";
    session.choice = null;
    session.price = personality.pricing.base_price;
    session.discounted = false;

    // Pick response based on text content
    let reply;
    if (matchesKeywords(text, ["detail", "quoi", "c'est quoi", "comment", "explain"])) {
      reply = fillTemplate(personality.responses.cam_details, session);
    } else {
      reply = fillTemplate(personality.responses.cam_direct, session);
    }
    await ctx.reply(reply);
    if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
    return;
  }

  // ── Negotiate keywords from idle ──
  if (matchesKeywords(text, personality.negotiate_keywords)) {
    // Treat as interest in cam
    session.state = "awaiting_choice";
    session.price = personality.pricing.base_price;
    const reply = fillTemplate(personality.responses.cam_details, session);
    await ctx.reply(reply);
    if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
    return;
  }

  // ── Default: friendly redirect to cam ──
  const greetings = ["salut", "hello", "hey", "hi", "coucou", "bonjour", "bonsoir", "yo", "wesh", "slt"];
  if (matchesKeywords(text, greetings)) {
    await ctx.reply("Heyy bby 😘 Ca va ? J'ai quelque chose de special pour toi aujourd'hui… Tu veux me voir ? 😏🔥");
  } else {
    await ctx.reply("Mmm 😏 Tu veux qu'on passe un bon moment ensemble bby ? J'ai des sessions privees qui vont te rendre fou… 🔥💋");
  }
  if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
});

// ══════════════════════════════════
//  PHOTO HANDLER — Screenshot Detection
// ══════════════════════════════════

bot.on("message:photo", async (ctx) => {
  const chatId = ctx.chat.id;
  const session = getSession(chatId);

  // Only process photos when awaiting payment
  if (session.state !== "awaiting_payment") {
    await ctx.reply("Merci pour la photo bby 😘 Tu veux me voir en vrai ? Tape 'cam' et je te montre tout 🔥");
    return;
  }

  // ── Screenshot received — process payment verification ──
  console.log(`[CARLA] Screenshot received from chat ${chatId} — choice: ${session.choice}`);
  if (session.modelId) logBotStat(session.modelId, "telegram", "screenshot");

  // Find or create spender
  const spender = await findOrCreateSpender(ctx);

  // Save screenshot check (auto-validated by bot — gerant can review in CRM)
  await saveScreenshotCheck(chatId, spender, "validated", 15);

  // Create transaction in CRM
  const tx = await createTransaction(
    session,
    spender || { handle: `tg_${ctx.from?.id}`, name: ctx.from?.first_name || "unknown" },
    session.modelId,
    session.price,
    personality.pricing.currency
  );

  if (tx && session.modelId) logBotStat(session.modelId, "telegram", "tx");

  // ── Payment confirmed message ──
  await ctx.reply(fillTemplate(personality.responses.payment_confirmed, session));
  if (session.modelId) logBotStat(session.modelId, "telegram", "sent");

  // ── Query video from model_videos WHERE content_type matches choice ──
  const contentType = session.choice || "solo";
  const video = session.modelId ? await queryVideo(session.modelId, contentType) : null;

  if (video && video.file_url) {
    // ── Download from Supabase Storage and send on Telegram ──
    try {
      // file_url can be: full URL, or just the path in the bucket
      const filePath = video.file_url.includes("model-videos/")
        ? video.file_url.split("model-videos/").pop()
        : video.file_url;

      const videoBlob = await downloadVideo(filePath);

      if (videoBlob) {
        // Convert Blob to Buffer for grammy
        const arrayBuffer = await videoBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await ctx.replyWithVideo(new InputFile(buffer, `carla_${contentType}.mp4`), {
          caption: fillTemplate(personality.responses.video_sent, session),
        });

        // Track video session + increment play count
        await incrementPlayCount(video.id);
        if (spender) {
          await createVideoSession(video.id, session.modelId, spender, session.price, personality.pricing.currency);
        }
      } else {
        // Fallback: send signed URL
        const signedUrl = await getSignedUrl(filePath);
        if (signedUrl) {
          await ctx.replyWithVideo(signedUrl, {
            caption: fillTemplate(personality.responses.video_sent, session),
          });
          await incrementPlayCount(video.id);
        } else {
          await ctx.reply(fillTemplate(personality.responses.video_sent, session));
          console.error("[CARLA] Could not download or sign video URL:", filePath);
        }
      }
    } catch (e) {
      console.error("[CARLA] Video delivery error:", e.message);
      await ctx.reply(fillTemplate(personality.responses.video_sent, session));
    }
  } else {
    // No video found in DB — send text only
    await ctx.reply(fillTemplate(personality.responses.video_sent, session));
    console.warn(`[CARLA] No video found for model_id=${session.modelId}, content_type=${contentType}`);

    // Alert admin
    if (ADMIN_TELEGRAM_ID) {
      try {
        await bot.api.sendMessage(ADMIN_TELEGRAM_ID,
          `⚠️ [Carla Bot] Pas de video trouvee !\n` +
          `Type: ${contentType}\n` +
          `Spender: @${spender?.handle || ctx.from?.username || "unknown"}\n` +
          `Action: Upload une video avec content_type="${contentType}" dans model_videos`
        );
      } catch (e) { /* admin notification best-effort */ }
    }
  }

  // ── Mark session as video_sent ──
  session.state = "video_sent";

  // ── Upsell 30 seconds after video delivery ──
  setTimeout(async () => {
    try {
      await ctx.reply(fillTemplate(personality.responses.upsell, session));
      if (session.modelId) logBotStat(session.modelId, "telegram", "sent");
      console.log(`[CARLA] Upsell sent to chat ${chatId}`);
    } catch (e) {
      console.error("[CARLA] Upsell send error:", e.message);
    }
  }, 30000);
});

// ══════════════════════════════════
//  DOCUMENT HANDLER — Screenshot as document
// ══════════════════════════════════

bot.on("message:document", async (ctx) => {
  const chatId = ctx.chat.id;
  const session = getSession(chatId);
  const doc = ctx.message.document;

  // Check if it's an image document (screenshot sent as file)
  if (doc && doc.mime_type && doc.mime_type.startsWith("image/")) {
    if (session.state === "awaiting_payment") {
      // Treat as screenshot — delegate to photo handler logic
      // Emit a synthetic photo event by calling the same logic
      console.log(`[CARLA] Image document received from chat ${chatId} — treating as screenshot`);
      // Re-use photo handler by manually triggering the same flow
      // (grammy doesn't auto-route documents to photo handler)

      if (session.modelId) logBotStat(session.modelId, "telegram", "screenshot");

      const spender = await findOrCreateSpender(ctx);
      await saveScreenshotCheck(chatId, spender, "validated", 15);

      const tx = await createTransaction(
        session,
        spender || { handle: `tg_${ctx.from?.id}`, name: ctx.from?.first_name || "unknown" },
        session.modelId,
        session.price,
        personality.pricing.currency
      );

      if (tx && session.modelId) logBotStat(session.modelId, "telegram", "tx");

      await ctx.reply(fillTemplate(personality.responses.payment_confirmed, session));

      const contentType = session.choice || "solo";
      const video = session.modelId ? await queryVideo(session.modelId, contentType) : null;

      if (video && video.file_url) {
        try {
          const filePath = video.file_url.includes("model-videos/")
            ? video.file_url.split("model-videos/").pop()
            : video.file_url;

          const signedUrl = await getSignedUrl(filePath);
          if (signedUrl) {
            await ctx.replyWithVideo(signedUrl, {
              caption: fillTemplate(personality.responses.video_sent, session),
            });
            await incrementPlayCount(video.id);
            if (spender) {
              await createVideoSession(video.id, session.modelId, spender, session.price, personality.pricing.currency);
            }
          } else {
            await ctx.reply(fillTemplate(personality.responses.video_sent, session));
          }
        } catch (e) {
          console.error("[CARLA] Video delivery (doc) error:", e.message);
          await ctx.reply(fillTemplate(personality.responses.video_sent, session));
        }
      } else {
        await ctx.reply(fillTemplate(personality.responses.video_sent, session));
      }

      session.state = "video_sent";

      setTimeout(async () => {
        try {
          await ctx.reply(fillTemplate(personality.responses.upsell, session));
        } catch (e) { /* upsell best-effort */ }
      }, 30000);

      return;
    }
  }

  // Not a screenshot or not awaiting payment
  await ctx.reply("Mmm 😏 Tu veux qu'on passe un bon moment ensemble bby ? Tape 'cam' 🔥");
});

// ══════════════════════════════════
//  /start command
// ══════════════════════════════════

bot.command("start", async (ctx) => {
  const session = getSession(ctx.chat.id);
  session.state = "idle";

  await ctx.reply(
    "Heyy bby 😘 C'est Carla…\n\n" +
    "Tu veux passer un bon moment avec moi ? J'ai des sessions privees qui vont te rendre fou 🔥\n\n" +
    "Tape 'cam' pour commencer 💋"
  );
});

// ── Start bot ──
async function main() {
  console.log("[CARLA] Cam bot starting...");
  console.log(`[CARLA] Personality: ${personality.model_name} ${personality.version} (${personality.codename})`);
  console.log(`[CARLA] Twint: ${TWINT_NUMBER}`);
  console.log(`[CARLA] Pricing: ${personality.pricing.base_price} ${personality.pricing.currency} / ${personality.pricing.duration_minutes} min`);

  await bot.start({
    onStart: () => {
      console.log("[CARLA] Bot started successfully");
    },
  });
}

main().catch(err => {
  console.error("[CARLA] Fatal:", err);
  process.exit(1);
});
