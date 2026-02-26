/**
 * DADASH CRM — Edge Function: send-push-campaign
 *
 * Payload (POST JSON):
 *   { campaign_id: string }
 *
 * Flow:
 *   1. Auth JWT → vérifier que l'appelant a accès au modèle
 *   2. Charger la campagne depuis push_campaigns
 *   3. Récupérer les recipients depuis model_spenders JOIN spenders
 *      WHERE tg_user_id IS NOT NULL
 *   4. Si 0 recipients → retourner NO_RECIPIENTS (ne pas envoyer)
 *   5. Envoyer via le bot Carla (CARLA_BOT_TOKEN)
 *   6. Mettre à jour push_campaigns + push_recipients
 *
 * Env vars requis:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   CARLA_BOT_TOKEN  (ou TELEGRAM_BOT_TOKEN comme fallback)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// ── Clients Supabase ─────────────────────────────────────────
function getAnonClient(jwt: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  )
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

// ── Helpers ──────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

// Envoyer un message Telegram simple
async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; description?: string }> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      }
    )
    return await res.json()
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : String(e) }
  }
}

// ── Handler principal ─────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  // ── 1. Authentification ──────────────────────────────────────
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401)
  }

  const jwt = authHeader.replace("Bearer ", "")
  const anonClient = getAnonClient(jwt)
  const { data: { user }, error: authErr } = await anonClient.auth.getUser()

  if (authErr || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401)
  }

  // ── 2. Parse body ─────────────────────────────────────────────
  let body: { campaign_id?: string }
  try { body = await req.json() } catch { body = {} }

  const { campaign_id } = body
  if (!campaign_id) {
    return jsonResponse({ error: "campaign_id is required" }, 400)
  }

  const svc = getServiceClient()

  // ── 3. Charger la campagne ────────────────────────────────────
  const { data: campaign, error: campErr } = await svc
    .from("push_campaigns")
    .select("*")
    .eq("id", campaign_id)
    .single()

  if (campErr || !campaign) {
    return jsonResponse({ error: "Campaign not found" }, 404)
  }

  // ── 4. Vérification d'accès (fn_has_model_access) ────────────
  // On vérifie : gérant OU modèle qui se gère lui-même OU member
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  const isGerant = profile?.role === "gerant"
  const isOwnerModel = user.id === campaign.model_id
  const isCreator = user.id === campaign.created_by

  if (!isGerant && !isOwnerModel && !isCreator) {
    // Vérifier model_members
    const { data: member } = await svc
      .from("model_members")
      .select("id")
      .eq("model_id", campaign.model_id)
      .eq("profile_id", user.id)
      .maybeSingle()

    if (!member) {
      return jsonResponse({ error: "Access denied to this model" }, 403)
    }
  }

  // ── 5. Récupérer les recipients Telegram ─────────────────────
  // model_spenders JOIN spenders WHERE tg_user_id IS NOT NULL
  // Note: quel que soit le modèle sélectionné, on utilise le bot Carla
  const { data: recipientsRaw, error: recErr } = await svc
    .from("model_spenders")
    .select(`
      spender_id,
      spenders!inner (
        id,
        tg_user_id,
        handle,
        name,
        display_name
      )
    `)
    .eq("model_id", campaign.model_id)

  if (recErr) {
    return jsonResponse(
      { error: "Failed to fetch recipients: " + recErr.message },
      500
    )
  }

  // Filtrer uniquement ceux avec un tg_user_id valide
  type Recipient = {
    spender_id: string
    spenders: { id: string; tg_user_id: string; handle?: string; name?: string; display_name?: string }
  }

  const recipients: Recipient[] = (recipientsRaw || []).filter(
    (r: Record<string, unknown>) => {
      const sp = r.spenders as Record<string, unknown> | null
      return sp?.tg_user_id && String(sp.tg_user_id).trim() !== "" && String(sp.tg_user_id) !== "0"
    }
  ) as Recipient[]

  // ── 6. Aucun recipient Telegram → bloquer l'envoi ────────────
  if (recipients.length === 0) {
    await svc.from("push_campaigns").update({
      status: "failed",
      total_targets: 0,
      sent_count: 0,
      error_log: [{ error: "No reachable Telegram users for this model" }],
    }).eq("id", campaign_id)

    return jsonResponse({
      success: false,
      error: "NO_RECIPIENTS",
      message: "No reachable Telegram users for this model",
    })
  }

  // ── 7. Vérifier le token bot Carla ────────────────────────────
  // Toujours le bot Carla, même si le modèle = Sophie
  const CARLA_BOT_TOKEN = (
    Deno.env.get("CARLA_BOT_TOKEN") ||
    Deno.env.get("TELEGRAM_BOT_TOKEN") ||
    ""
  ).trim()

  if (!CARLA_BOT_TOKEN) {
    await svc.from("push_campaigns").update({
      status: "failed",
      error_log: [{ error: "CARLA_BOT_TOKEN not configured in Edge Function secrets" }],
    }).eq("id", campaign_id)

    return jsonResponse({ error: "Telegram bot token not configured" }, 500)
  }

  // ── 8. Préparer l'envoi ───────────────────────────────────────
  const totalTargets = recipients.length
  let sentCount = 0
  const errorLog: Array<{ tg_user_id: string; error: string }> = []

  // Marquer la campagne "sending"
  await svc.from("push_campaigns").update({
    status: "sending",
    total_targets: totalTargets,
    sent_count: 0,
  }).eq("id", campaign_id)

  // Insérer les lignes push_recipients (pending)
  const recipientRows = recipients.map((r) => ({
    campaign_id,
    spender_id: r.spender_id,
    tg_user_id: String(r.spenders.tg_user_id),
    status: "pending",
  }))

  await svc.from("push_recipients").insert(recipientRows)

  // ── 9. Envoi message par message ─────────────────────────────
  for (const r of recipients) {
    const tgUserId = String(r.spenders.tg_user_id)
    const spenderName =
      r.spenders.display_name ||
      r.spenders.name ||
      r.spenders.handle ||
      ""

    // Remplacer les variables dans le message
    const rawText = (campaign.message || "").trim()
    const text = rawText
      .replace(/\{prenom\}/g, spenderName)
      .replace(/\{modele\}/g, campaign.model_name || "Carla")

    const result = await sendTelegramMessage(CARLA_BOT_TOKEN, tgUserId, text || "(push)")

    if (result.ok) {
      sentCount++
      await svc.from("push_recipients")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("campaign_id", campaign_id)
        .eq("tg_user_id", tgUserId)
    } else {
      const errMsg = result.description || "Unknown Telegram error"
      errorLog.push({ tg_user_id: tgUserId, error: errMsg })
      await svc.from("push_recipients")
        .update({ status: "failed", error: errMsg })
        .eq("campaign_id", campaign_id)
        .eq("tg_user_id", tgUserId)
    }

    // Rate limit 50ms entre envois (évite le flood Telegram)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  // ── 10. Finaliser le statut de la campagne ───────────────────
  const finalStatus =
    sentCount === totalTargets ? "sent" :
    sentCount > 0             ? "partial" :
                                "failed"

  await svc.from("push_campaigns").update({
    status: finalStatus,
    total_targets: totalTargets,
    sent_count: sentCount,
    error_log: errorLog.length > 0 ? errorLog : [],
  }).eq("id", campaign_id)

  // Logger dans bot_logs pour audit
  await svc.from("bot_logs").insert({
    bot_name: "carla_push",
    event: "push_campaign_sent",
    data: {
      campaign_id,
      model_id: campaign.model_id,
      total_targets: totalTargets,
      sent_count: sentCount,
      status: finalStatus,
      triggered_by: user.id,
      timestamp: new Date().toISOString(),
    },
  }).catch(() => { /* non-bloquant */ })

  return jsonResponse({
    success: sentCount > 0,
    total_targets: totalTargets,
    sent_count: sentCount,
    failed_count: totalTargets - sentCount,
    status: finalStatus,
  })
})
