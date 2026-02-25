/**
 * DADASH CRM — Edge Function: platform-health
 *
 * Payload (POST JSON):
 *   { platform_account_id: string }
 *
 * Flow:
 *   1. Authenticate the caller (JWT must belong to a gérant)
 *   2. Load platform_account + credentials via service role (bypasses RLS)
 *   3. Test credentials against platform API
 *   4. Update platform_accounts.status accordingly
 *   5. Return { isValid, platform, account_name, error? }
 *
 * Security:
 *   - Credentials are NEVER logged or returned in the response
 *   - Uses SERVICE_ROLE_KEY only server-side; anon key for auth check
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

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

// ── OF health check ────────────────────────────────────────────
async function checkOnlyFansHealth(credentials: Record<string, string>): Promise<{ isValid: boolean; error?: string }> {
  const { auth_id, sess } = credentials
  if (!auth_id || !sess) {
    return { isValid: false, error: "Missing credentials: auth_id and sess required" }
  }

  try {
    const timestamp = Math.round(Date.now() / 1000).toString()
    const path = `/api2/v2/users/me`

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

    if (response.status === 401 || response.status === 403) {
      return { isValid: false, error: "Invalid or expired credentials" }
    }
    if (!response.ok) {
      return { isValid: false, error: `API error: ${response.status}` }
    }

    return { isValid: true }
  } catch (err) {
    return { isValid: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── MYM health check ───────────────────────────────────────────
async function checkMYMHealth(credentials: Record<string, string>): Promise<{ isValid: boolean; error?: string }> {
  /**
   * MYM does not expose a public API.
   * Treat any stored credentials as "pending" (not invalid).
   * TODO: Implement once MYM provides an official connector.
   */
  void credentials
  return { isValid: false, error: "MYM integration pending — no public API available" }
}

// ── Telegram health check ──────────────────────────────────────
async function checkTelegramHealth(credentials: Record<string, string>): Promise<{ isValid: boolean; error?: string }> {
  const { bot_token } = credentials
  if (!bot_token) {
    return { isValid: false, error: "Missing credentials: bot_token required" }
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${bot_token}/getMe`)
    if (!response.ok) {
      return { isValid: false, error: `Telegram API error: ${response.status}` }
    }
    const data = await response.json()
    if (!data?.ok) {
      return { isValid: false, error: data?.description || "Invalid bot token" }
    }
    return { isValid: true }
  } catch (err) {
    return { isValid: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Main handler ───────────────────────────────────────────────
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
  let body: { platform_account_id?: string }
  try { body = await req.json() } catch { body = {} }
  const { platform_account_id } = body

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

  // 4. Test credentials (credentials used inside helpers, never returned)
  const creds = (account.credentials ?? {}) as Record<string, string>
  let result: { isValid: boolean; error?: string }

  if (account.platform === "onlyfans") {
    result = await checkOnlyFansHealth(creds)
  } else if (account.platform === "mym") {
    result = await checkMYMHealth(creds)
  } else if (account.platform === "telegram") {
    result = await checkTelegramHealth(creds)
  } else {
    result = { isValid: false, error: `Unknown platform: ${account.platform}` }
  }

  // 5. Update platform_accounts.status
  const newStatus = result.isValid ? "active" : "error"
  await svc.from("platform_accounts").update({
    status: newStatus,
    updated_at: new Date().toISOString(),
  }).eq("id", platform_account_id)

  return new Response(
    JSON.stringify({
      isValid: result.isValid,
      platform: account.platform,
      account_name: account.account_name,
      status: newStatus,
      ...(result.error ? { error: result.error } : {}),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  )
})
