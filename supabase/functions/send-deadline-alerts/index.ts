import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PagoRow {
  placa: string;
  subasta: string | null;
  total_pagos: number | null;
  fecha_limite_pago: string | null;
}

interface DocRow {
  placas: string[];
  valor_soporte: number;
}

// Get today's date in Colombia timezone (YYYY-MM-DD)
function todayColombia(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // en-CA -> YYYY-MM-DD
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = todayColombia();

    // 1. Pagos vencen hoy
    const { data: pagos, error: pagosErr } = await supabase
      .from("pagos")
      .select("placa, subasta, total_pagos, fecha_limite_pago")
      .eq("fecha_limite_pago", today);
    if (pagosErr) throw new Error(`pagos: ${pagosErr.message}`);

    if (!pagos || pagos.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No deadlines today", today }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Soportes para esas placas
    const placas = (pagos as PagoRow[]).map((p) => p.placa.toUpperCase());
    const { data: docs, error: docsErr } = await supabase
      .from("documentos")
      .select("placas, valor_soporte")
      .overlaps("placas", placas);
    if (docsErr) throw new Error(`documentos: ${docsErr.message}`);

    const soportesByPlaca = new Map<string, number>();
    for (const d of (docs ?? []) as DocRow[]) {
      const valor = Number(d.valor_soporte) || 0;
      for (const p of d.placas ?? []) {
        const key = p.toUpperCase();
        if (!placas.includes(key)) continue;
        soportesByPlaca.set(key, (soportesByPlaca.get(key) ?? 0) + valor);
      }
    }

    // 3. Filter incomplete: soportes < total_pagos
    const incompletos = (pagos as PagoRow[]).filter((p) => {
      const totalEsperado = Number(p.total_pagos) || 0;
      const totalSoporte = soportesByPlaca.get(p.placa.toUpperCase()) ?? 0;
      // Vence hoy y NO está completo
      return !(totalEsperado > 0 && totalSoporte >= totalEsperado);
    });

    if (incompletos.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "All today's deadlines are complete", today }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Recipients
    const { data: recipients, error: recErr } = await supabase.rpc("get_notification_recipients");
    if (recErr) throw new Error(`recipients: ${recErr.message}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      throw new Error("LOVABLE_API_KEY or RESEND_API_KEY not configured");
    }

    const fmtCop = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
    const rows = incompletos
      .map((p) => {
        const esperado = Number(p.total_pagos) || 0;
        const soporte = soportesByPlaca.get(p.placa.toUpperCase()) ?? 0;
        const faltante = Math.max(esperado - soporte, 0);
        return `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#111;font-weight:600;">${p.placa}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;">${p.subasta ?? "-"}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;text-align:right;">$ ${fmtCop.format(esperado)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;text-align:right;">$ ${fmtCop.format(soporte)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#b91c1c;text-align:right;font-weight:600;">$ ${fmtCop.format(faltante)}</td>
          </tr>`;
      })
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:820px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a2e;margin:0 0 8px;">⏰ Vencimientos de pago — hoy ${today}</h2>
        <p style="color:#555;margin:0 0 16px;">
          Las siguientes <strong>${incompletos.length}</strong> placa(s) vencen hoy y aún no tienen los soportes cargados en su totalidad:
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

    const validRecipients = (recipients ?? []).filter((r: { email: string | null }) => r.email);
    let emailsSent = 0;
    const errors: string[] = [];

    for (const r of validRecipients) {
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
            to: [r.email],
            subject: `Vencimientos hoy: ${incompletos.length} placa(s) sin soportes completos`,
            html,
          }),
        });
        if (!res.ok) {
          errors.push(`${r.email}: ${res.status} ${await res.text()}`);
          continue;
        }
        emailsSent++;
      } catch (e) {
        errors.push(`${r.email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        today,
        deadlines_incomplete: incompletos.length,
        emails_sent: emailsSent,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("send-deadline-alerts error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
