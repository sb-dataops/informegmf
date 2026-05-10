import type { Context } from "hono";
import { getAdminClient } from "../../services/supabase.js";
import { sendEmail } from "../../services/resend.js";
import { buildSoportesByPlaca } from "./helpers.js";
import type { DocRow, PagoRow } from "./helpers.js";
import { auctionCompleteEmail } from "./email-templates.js";

export async function auctionCompleteHandler(c: Context): Promise<Response> {
  try {
    const supabase = getAdminClient();

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

    const soportesByPlaca = buildSoportesByPlaca((docs ?? []) as DocRow[]);

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
      return c.json({ success: true, notified: 0, message: "No complete auctions" });
    }

    // 4. Filter out already-notified subastas
    const subastaNames = completeSubastas.map((cs) => cs.subasta);
    const { data: alreadyNotified } = await supabase
      .from("subasta_notificada")
      .select("subasta")
      .in("subasta", subastaNames);

    const notifiedSet = new Set(
      (alreadyNotified ?? []).map((n: { subasta: string }) => n.subasta),
    );
    const newlyComplete = completeSubastas.filter((cs) => !notifiedSet.has(cs.subasta));

    if (newlyComplete.length === 0) {
      return c.json({
        success: true,
        notified: 0,
        message: "All complete auctions already notified",
      });
    }

    // 5. Get recipients (lector_con_notificacion)
    const { data: recipients, error: recErr } = await supabase.rpc(
      "get_notification_recipients",
    );
    if (recErr) throw new Error(`recipients: ${recErr.message}`);

    const validRecipients = (recipients ?? []).filter(
      (r: { email: string | null }) => r.email,
    );
    let emailsSent = 0;
    const errors: string[] = [];

    for (const sub of newlyComplete) {
      const html = auctionCompleteEmail({
        subasta: sub.subasta,
        totalLotes: sub.total,
      });

      for (const r of validRecipients) {
        try {
          await sendEmail({
            to: [r.email],
            subject: `Subasta ${sub.subasta} - soportes completos`,
            html,
          });
          emailsSent++;
        } catch (e) {
          errors.push(
            `${sub.subasta} -> ${r.email}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      // Marca como notificada incluso si fallaron envíos parciales (evitar reintentos masivos)
      await supabase.from("subasta_notificada").insert({
        subasta: sub.subasta,
        total_placas: sub.total,
      });
    }

    return c.json({
      success: true,
      subastas_notified: newlyComplete.length,
      emails_sent: emailsSent,
      errors,
    });
  } catch (error: unknown) {
    console.error("notify-auction-complete error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
}
