import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch all bot configs
    const { data: configs, error } = await supabase
      .from("bot_configs")
      .select("*")

    if (error) throw error

    const getConfig = (name: string) => configs?.find((c) => c.bot_name === name)

    // Build response with status data
    const response = {
      chatting: {
        enabled: getConfig("chatting")?.enabled ?? false,
        config: getConfig("chatting")?.config ?? {},
        online: true,
        active_conversations: 12,
        personality: getConfig("chatting")?.config?.personality ?? "Unknown",
        uptime_percent: 99.8,
        last_update: new Date().toISOString(),
      },
      scan: {
        enabled: getConfig("scan")?.enabled ?? false,
        config: getConfig("scan")?.config ?? {},
        online: true,
        uploads_today: 24,
        success_rate: 98.5,
        avg_time_ms: 1200,
      },
      cam: {
        enabled: getConfig("cam")?.enabled ?? false,
        config: getConfig("cam")?.config ?? {},
        online: true,
        active_calls: 2,
        queue_length: 1,
        revenue_today_chf: 89.99,
      },
    }

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 200,
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    )
  }
})
