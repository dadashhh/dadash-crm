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
    const { bot_name, config_updates } = await req.json()

    if (!bot_name || !config_updates || typeof config_updates !== "object") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid bot_name or config_updates" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get current config
    const { data: currentData, error: fetchError } = await supabase
      .from("bot_configs")
      .select("config")
      .eq("bot_name", bot_name)
      .single()

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: `Bot '${bot_name}' not found` }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    // Merge configs (shallow merge)
    const newConfig = { ...currentData.config, ...config_updates }

    // Update
    const { data, error } = await supabase
      .from("bot_configs")
      .update({
        config: newConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("bot_name", bot_name)
      .select()

    if (error) throw error

    // Log the config change
    await supabase.from("bot_logs").insert({
      bot_name,
      event: "config_updated",
      data: { config_updates, timestamp: new Date().toISOString() },
    })

    return new Response(
      JSON.stringify({
        success: true,
        bot_name,
        config: newConfig,
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
