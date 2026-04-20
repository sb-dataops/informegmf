import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all unsent email notifications
    const { data: pending, error: fetchErr } = await supabase
      .from("notifications")
      .select("id, user_id, title, message, created_at")
      .is("email_notified_at", null)
      .order("created_at", { ascending: true });

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No pending notifications" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by user
    const byUser = new Map<string, NotificationRow[]>();
    for (const n of pending as NotificationRow[]) {
      if (!byUser.has(n.user_id)) byUser.set(n.user_id, []);
      byUser.get(n.user_id)!.push(n);
    }

    // Get profiles
    const userIds = Array.from(byUser.keys());
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, display_name")
      .in("user_id", userIds);

    const profileMap = new Map<string, ProfileRow>(
      (profiles ?? []).map((p) => [p.user_id, p as ProfileRow])
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      throw new Error("LOVABLE_API_KEY or RESEND_API_KEY not configured");
    }

    const sentIds: string[] = [];
    let emailsSent = 0;
    const errors: string[] = [];

    for (const [userId, notifs] of byUser.entries()) {
      const profile = profileMap.get(userId);
      if (!profile?.email) {
        // No email -> mark as notified anyway to avoid re-processing forever
        sentIds.push(...notifs.map((n) => n.id));
        continue;
      }

      const rows = notifs
        .map(
          (n) => `
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#333;">${new Date(n.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#111;font-weight:600;">${n.title}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;">${n.message}</td>
            </tr>`
        )
        .join("");

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px;">
          <h2 style="color:#1a1a2e;margin:0 0 8px;">📬 Resumen diario de soportes cargados</h2>
          <p style="color:#555;margin:0 0 16px;">Hola ${profile.display_name ?? ""}, estos son los soportes cargados desde el último resumen (${notifs.length} en total):</p>
          <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#1a1a2e;color:#fff;text-align:left;">
                <th style="padding:10px 12px;font-size:13px;">Fecha</th>
                <th style="padding:10px 12px;font-size:13px;">Título</th>
                <th style="padding:10px 12px;font-size:13px;">Detalle</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="color:#666;font-size:13px;margin-top:16px;">Ingresa al dashboard para revisar los soportes pendientes.</p>
        </div>
      `;

      try {
        const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": RESEND_API_KEY,
          },
          body: JSON.stringify({
            from: "Superbid Exchange <informes@superbidcolombia.com>",
            to: [profile.email],
            subject: `Resumen diario: ${notifs.length} soporte(s) cargado(s)`,
            html,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          errors.push(`User ${userId}: ${res.status} ${errBody}`);
          continue;
        }

        emailsSent++;
        sentIds.push(...notifs.map((n) => n.id));
      } catch (e) {
        errors.push(`User ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Mark notifications as email-notified
    if (sentIds.length > 0) {
      const { error: updErr } = await supabase
        .from("notifications")
        .update({ email_notified_at: new Date().toISOString() })
        .in("id", sentIds);
      if (updErr) console.error("Update error:", updErr.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        emails_sent: emailsSent,
        notifications_marked: sentIds.length,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Daily digest error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
