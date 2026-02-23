import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }

  try {
    const { bot_name, enabled } = await req.json()

    if (!bot_name || typeof enabled !== "boolean") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid bot_name or enabled" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Update bot config
    const { data, error } = await supabase
      .from("bot_configs")
      .update({
        enabled,
        last_status: enabled ? "online" : "offline",
        last_status_update: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("bot_name", bot_name)
      .select()

    if (error) throw error

    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({ error: `Bot '${bot_name}' not found` }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    // Log the action
    await supabase.from("bot_logs").insert({
      bot_name,
      event: "bot_toggled",
      data: { enabled, timestamp: new Date().toISOString() },
    })

    return new Response(
      JSON.stringify({
        success: true,
        bot_name,
        enabled,
        timestamp: new Date().toISOString(),
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }
})
