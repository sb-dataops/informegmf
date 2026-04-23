import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      throw new Error("LOVABLE_API_KEY or RESEND_API_KEY not configured");
    }

    const { data: recipients, error: recErr } = await supabase.rpc("get_notification_recipients");
    if (recErr) throw new Error(`recipients: ${recErr.message}`);
    const validRecipients = (recipients ?? []).filter((r: { email: string | null }) => r.email);

    if (validRecipients.length === 0) {
      return new Response(JSON.stringify({ error: "No recipients with role lector_con_notificacion" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fmtCop = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

    // ============ 1. AUCTION COMPLETE (ficticio) ============
    const fakeSubasta = "GM Financial 69 (PRUEBA)";
    const fakeTotalLotes = 12;
    const auctionHtml = `
      <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px;">
        <div style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:16px;">
          ⚠️ ESTE ES UN CORREO DE PRUEBA — datos ficticios
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 8px;">✅ Subasta completa: ${fakeSubasta}</h2>
        <p style="color:#444;font-size:14px;line-height:1.5;">
          La subasta <strong>${fakeSubasta}</strong> ya cuenta con la totalidad de soportes cargados
          (${fakeTotalLotes} lotes). Todos los valores han sido pagados en su totalidad.
        </p>
        <p style="color:#666;font-size:13px;margin-top:16px;">Ingresa al dashboard para revisar el detalle.</p>
      </div>
    `;

    // ============ 2. DEADLINE ALERTS (ficticio) ============
    const fakePlacas = [
      { placa: "ABC123", subasta: "GM Financial 70", esperado: 25_000_000, soporte: 15_000_000 },
      { placa: "XYZ789", subasta: "GM Financial 70", esperado: 18_500_000, soporte: 0 },
      { placa: "JKL456", subasta: "Superbid 145", esperado: 32_750_000, soporte: 20_000_000 },
    ];
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());

    const rows = fakePlacas.map((p) => {
      const faltante = Math.max(p.esperado - p.soporte, 0);
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#111;font-weight:600;">${p.placa}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;">${p.subasta}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;text-align:right;">$ ${fmtCop.format(p.esperado)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;text-align:right;">$ ${fmtCop.format(p.soporte)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#b91c1c;text-align:right;font-weight:600;">$ ${fmtCop.format(faltante)}</td>
        </tr>`;
    }).join("");

    const deadlineHtml = `
      <div style="font-family:Arial,sans-serif;max-width:820px;margin:0 auto;padding:24px;">
        <div style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:16px;">
          ⚠️ ESTE ES UN CORREO DE PRUEBA — datos ficticios
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 8px;">⏰ Vencimientos de pago — hoy ${today}</h2>
        <p style="color:#555;margin:0 0 16px;">
          Las siguientes <strong>${fakePlacas.length}</strong> placa(s) vencen hoy y aún no tienen los soportes cargados en su totalidad:
        </p>
        <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#1a1a2e;color:#fff;text-align:left;">
              <th style="padding:10px 12px;font-size:13px;">Placa</th>
              <th style="padding:10px 12px;font-size:13px;">Subasta</th>
              <th style="padding:10px 12px;font-size:13px;text-align:right;">Total a pagar</th>
              <th style="padding:10px 12px;font-size:13px;text-align:right;">Soportes</th>
              <th style="padding:10px 12px;font-size:13px;text-align:right;">Faltante</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#666;font-size:13px;margin-top:16px;">Ingresa al dashboard para gestionar estos pagos.</p>
      </div>
    `;

    let sent = 0;
    const errors: string[] = [];

    const sendEmail = async (to: string, subject: string, html: string) => {
      const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": RESEND_API_KEY,
        },
        body: JSON.stringify({
          from: "Superbid Exchange <informes@superbidcolombia.com>",
          to: [to],
          subject,
          html,
        }),
      });
      if (!res.ok) {
        errors.push(`${to} (${subject}): ${res.status} ${await res.text()}`);
        return false;
      }
      sent++;
      return true;
    };

    for (const r of validRecipients) {
      await sendEmail(r.email, `[PRUEBA] Subasta ${fakeSubasta} - soportes completos`, auctionHtml);
      await sendEmail(r.email, `[PRUEBA] Vencimientos hoy: ${fakePlacas.length} placa(s) sin soportes completos`, deadlineHtml);
    }

    return new Response(JSON.stringify({
      success: true,
      recipients: validRecipients.length,
      emails_sent: sent,
      errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
