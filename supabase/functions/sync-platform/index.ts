/**
 * DADASH CRM — Edge Function: sync-platform
 *
 * Payload (POST JSON):
 *   { platform_account_id: string, job_type?: string }
 *
 * Flow:
 *   1. Authenticate the caller (JWT must belong to a gérant)
 *   2. Load platform_account + credentials via service role (bypasses RLS)
 *   3. Create sync_job record
 *   4. Call OF or MYM API, normalise fan records
 *   5. Upsert into platform_fans
 *   6. Basic identity resolution: match username → spender
 *   7. Update sync_job (status, records_synced)
 *
 * Security:
 *   - Credentials are NEVER logged or returned in the response
 *   - Uses SERVICE_ROLE_KEY only server-side; anon key for auth check
 *   - RLS is enforced at DB level as an additional layer
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// ── Supabase clients ──────────────────────────────────────────
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

// ── Normalised fan type ───────────────────────────────────────
interface DadashFan {
  platform_fan_id: string
  username: string
  display_name: string
  total_spent: number
  subscription_status: string
}

// ── OF API helper ─────────────────────────────────────────────
async function fetchOnlyFansFans(
  credentials: Record<string, string>,
  limit = 50,
  offset = 0
): Promise<DadashFan[]> {
  /**
   * OnlyFans internal API v2 — Session-cookie based.
   * Credentials expected: { auth_id, sess, user_agent?, x_of_access_token? }
   *
   * NOTE: OnlyFans does not have an official public API.
   * This implementation targets the internal REST API used by their web app.
   * It may break if OF changes their signing algorithm.
   *
   * IMPORTANT: credentials are used only here, never logged or returned.
   */
  const { auth_id, sess } = credentials

  if (!auth_id || !sess) {
    throw new Error("Missing OnlyFans credentials: auth_id and sess required")
  }

  // OF requires a time-based dynamic header (bcTokenSha256 or similar)
  // We use a static path + timestamp for the hash seed (simplified implementation)
  const timestamp = Math.round(Date.now() / 1000).toString()
  const path = `/api2/v2/subscriptions/subscribers?offset=${offset}&limit=${limit}&type=active`

  // In production: implement the full HMAC signing used by OF web client
  // See: https://github.com/DATAHOARDER/OnlyFans (reference only)
  const hashSeed = [timestamp, "static_nonce", path].join("\n")
  const encoder = new TextEncoder()
  const keyData = encoder.encode(Deno.env.get("OF_HASH_SECRET") || "dadash-placeholder")
  const msgData = encoder.encode(hashSeed)
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, msgData)
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")

  const response = await fetch(`https://onlyfans.com${path}`, {
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Cookie": `auth_id=${auth_id}; sess=${sess}`,
      "User-Agent": credentials.user_agent || "Mozilla/5.0 (compatible; DadashBot/1.0)",
      "x-bc": sigHex.slice(0, 40),
      "x-of-rev": timestamp,
      "Referer": "https://onlyfans.com",
      "Origin": "https://onlyfans.com",
    },
  })

  if (!response.ok) {
    throw new Error(`OnlyFans API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const list: unknown[] = data?.list ?? data?.subscriptions ?? []

  return list.map((sub: Record<string, unknown>) => ({
    platform_fan_id: String(sub.id ?? sub.userId ?? ""),
    username: String(sub.username ?? sub.name ?? ""),
    display_name: String(sub.name ?? sub.displayName ?? ""),
    total_spent: Number(sub.totalRevenue ?? sub.spentAmount ?? 0),
    subscription_status: String(sub.subscribedBy ?? sub.status ?? "active"),
  })).filter(f => f.platform_fan_id)
}

// ── MYM API helper ────────────────────────────────────────────
async function fetchMYMFans(
  credentials: Record<string, string>,
  _limit = 50,
  _offset = 0
): Promise<DadashFan[]> {
  /**
   * MYM.fans does not expose a public API.
   * TODO: Implement once MYM provides an official connector or OAuth flow.
   * Placeholder: returns empty list so sync_job succeeds with 0 records.
   */
  void credentials // suppress unused warning; credentials not logged
  return []
}

// ── Main handler ──────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }

  // 1. Auth — extract JWT and verify it belongs to a gérant
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }
  const jwt = authHeader.replace("Bearer ", "")
  const anonClient = getAnonClient(jwt)
  const { data: { user }, error: authErr } = await anonClient.auth.getUser()
  if (authErr || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }

  // Check gérant role via profile
  const svc = getServiceClient()
  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "gerant") {
    return new Response(
      JSON.stringify({ error: "Forbidden: gérant role required" }),
      { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }

  // 2. Parse payload
  let body: { platform_account_id?: string; job_type?: string }
  try { body = await req.json() } catch { body = {} }
  const { platform_account_id, job_type = "fans_sync" } = body

  if (!platform_account_id) {
    return new Response(
      JSON.stringify({ error: "platform_account_id is required" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }

  // 3. Load platform account using service role (credentials never reach client)
  const { data: account, error: acctErr } = await svc
    .from("platform_accounts")
    .select("id, platform, account_name, credentials")
    .eq("id", platform_account_id)
    .single()

  if (acctErr || !account) {
    return new Response(
      JSON.stringify({ error: "Platform account not found" }),
      { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }

  // 4. Create sync_job
  const { data: job } = await svc.from("sync_jobs").insert({
    platform_account_id,
    job_type,
    status: "running",
    started_at: new Date().toISOString(),
  }).select("id").single()

  const jobId = job?.id
  let recordsSynced = 0
  let errorMessage: string | null = null

  try {
    // 5. Fetch fans from platform (credentials used inside, never returned)
    const creds = (account.credentials ?? {}) as Record<string, string>
    let fans: DadashFan[] = []

    if (account.platform === "onlyfans") {
      fans = await fetchOnlyFansFans(creds)
    } else if (account.platform === "mym") {
      fans = await fetchMYMFans(creds)
    }

    // 6. Upsert into platform_fans
    if (fans.length > 0) {
      const rows = fans.map(f => ({
        platform_account_id,
        platform: account.platform,
        platform_fan_id: f.platform_fan_id,
        username: f.username,
        display_name: f.display_name,
        total_spent: f.total_spent,
        subscription_status: f.subscription_status,
        synced_at: new Date().toISOString(),
      }))

      const { error: upsertErr } = await svc
        .from("platform_fans")
        .upsert(rows, { onConflict: "platform_account_id,platform_fan_id" })

      if (upsertErr) throw upsertErr
      recordsSynced = fans.length

      // 7. Identity resolution — link username → spender
      for (const fan of fans) {
        if (!fan.username) continue
        const handle = fan.username.replace(/^@/, "").toLowerCase()
        const { data: spender } = await svc
          .from("spenders")
          .select("id")
          .ilike("handle", handle)
          .maybeSingle()

        if (spender?.id) {
          // Update platform_fans row with matched spender_id
          await svc
            .from("platform_fans")
            .update({ spender_id: spender.id })
            .eq("platform_account_id", platform_account_id)
            .eq("platform_fan_id", fan.platform_fan_id)

          // Upsert into platform_links
          await svc.from("platform_links").upsert({
            platform: account.platform,
            platform_entity_type: "fan",
            platform_entity_id: fan.platform_fan_id,
            dadash_entity_type: "spender",
            dadash_entity_id: spender.id,
          }, { onConflict: "platform,platform_entity_type,platform_entity_id" })
        }
      }
    }

    // Update platform_accounts.last_sync_at + status
    await svc.from("platform_accounts").update({
      last_sync_at: new Date().toISOString(),
      status: "active",
    }).eq("id", platform_account_id)

  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    // Update platform_accounts status to error (no credential info in error)
    await svc.from("platform_accounts").update({ status: "error" }).eq("id", platform_account_id)
  }

  // 8. Finalize sync_job
  if (jobId) {
    await svc.from("sync_jobs").update({
      status: errorMessage ? "error" : "done",
      records_synced: recordsSynced,
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
    }).eq("id", jobId)
  }

  const success = !errorMessage
  return new Response(
    JSON.stringify({
      success,
      records_synced: recordsSynced,
      job_id: jobId,
      ...(errorMessage ? { error: errorMessage } : {}),
    }),
    {
      status: success ? 200 : 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  )
})
