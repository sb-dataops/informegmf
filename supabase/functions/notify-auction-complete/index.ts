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
}

interface DocRow {
  placas: string[];
  valor_soporte: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Load all pagos with subasta
    const { data: pagos, error: pagosErr } = await supabase
      .from("pagos")
      .select("placa, subasta, total_pagos")
      .not("subasta", "is", null);
    if (pagosErr) throw new Error(`pagos: ${pagosErr.message}`);

    // 2. Load all documentos
    const { data: docs, error: docsErr } = await supabase
      .from("documentos")
      .select("placas, valor_soporte");
    if (docsErr) throw new Error(`documentos: ${docsErr.message}`);

    // Build placa -> total soportes map
    const soportesByPlaca = new Map<string, number>();
    for (const d of (docs ?? []) as DocRow[]) {
      const valor = Number(d.valor_soporte) || 0;
      for (const p of d.placas ?? []) {
        const key = p.toUpperCase();
        soportesByPlaca.set(key, (soportesByPlaca.get(key) ?? 0) + valor);
      }
    }

    // Group pagos by subasta
    const bySubasta = new Map<string, PagoRow[]>();
    for (const p of (pagos ?? []) as PagoRow[]) {
      const s = (p.subasta ?? "").trim();
      if (!s) continue;
      if (!bySubasta.has(s)) bySubasta.set(s, []);
      bySubasta.get(s)!.push(p);
    }

    // 3. Determine which subastas are fully complete
    const completeSubastas: { subasta: string; total: number }[] = [];
    for (const [subasta, lotes] of bySubasta.entries()) {
      const allComplete = lotes.every((l) => {
        const totalEsperado = Number(l.total_pagos) || 0;
        if (totalEsperado <= 0) return false;
        const totalSoporte = soportesByPlaca.get(l.placa.toUpperCase()) ?? 0;
        return totalSoporte > 0 && totalSoporte >= totalEsperado;
      });
      if (allComplete && lotes.length > 0) {
        completeSubastas.push({ subasta, total: lotes.length });
      }
    }

    if (completeSubastas.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, message: "No complete auctions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Filter out already-notified subastas
    const subastaNames = completeSubastas.map((c) => c.subasta);
    const { data: alreadyNotified } = await supabase
      .from("subasta_notificada")
      .select("subasta")
      .in("subasta", subastaNames);

    const notifiedSet = new Set((alreadyNotified ?? []).map((n: { subasta: string }) => n.subasta));
    const newlyComplete = completeSubastas.filter((c) => !notifiedSet.has(c.subasta));

    if (newlyComplete.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, message: "All complete auctions already notified" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Get recipients (lector_con_notificacion)
    const { data: recipients, error: recErr } = await supabase.rpc("get_notification_recipients");
    if (recErr) throw new Error(`recipients: ${recErr.message}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      throw new Error("LOVABLE_API_KEY or RESEND_API_KEY not configured");
    }

    const validRecipients = (recipients ?? []).filter((r: { email: string | null }) => r.email);
    let emailsSent = 0;
    const errors: string[] = [];

    for (const sub of newlyComplete) {
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px;">
          <h2 style="color:#1a1a2e;margin:0 0 8px;">✅ Subasta completa: ${sub.subasta}</h2>
          <p style="color:#444;font-size:14px;line-height:1.5;">
            La subasta <strong>${sub.subasta}</strong> ya cuenta con la totalidad de soportes cargados
            (${sub.total} ${sub.total === 1 ? "lote" : "lotes"}). Todos los valores han sido pagados en su totalidad.
          </p>
          <p style="color:#666;font-size:13px;margin-top:16px;">Ingresa al dashboard para revisar el detalle.</p>
        </div>
      `;

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
              subject: `Subasta ${sub.subasta} - soportes completos`,
              html,
            }),
          });
          if (!res.ok) {
            errors.push(`${sub.subasta} -> ${r.email}: ${res.status} ${await res.text()}`);
            continue;
          }
          emailsSent++;
        } catch (e) {
          errors.push(`${sub.subasta} -> ${r.email}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Mark as notified regardless of partial email failures (avoid spam re-tries)
      await supabase.from("subasta_notificada").insert({
        subasta: sub.subasta,
        total_placas: sub.total,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        subastas_notified: newlyComplete.length,
        emails_sent: emailsSent,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("notify-auction-complete error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
