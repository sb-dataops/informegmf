import type { Context } from "hono";
import { getAdminClient } from "../../services/supabase.js";
import { sendEmail } from "../../services/resend.js";
import { buildSoportesByPlaca, todayColombia } from "./helpers.js";
import type { DocRow, PagoWithDeadlineRow } from "./helpers.js";
import { deadlineAlertsEmail } from "./email-templates.js";
import type { DeadlineRow } from "./email-templates.js";

export async function deadlineAlertsHandler(c: Context): Promise<Response> {
  try {
    const supabase = getAdminClient();
    const today = todayColombia();

    // 1. Pagos vencen hoy
    const { data: pagos, error: pagosErr } = await supabase
      .from("pagos")
      .select("placa, subasta, total_pagos, fecha_limite_pago")
      .eq("fecha_limite_pago", today);
    if (pagosErr) throw new Error(`pagos: ${pagosErr.message}`);

    if (!pagos || pagos.length === 0) {
      return c.json({ success: true, message: "No deadlines today", today });
    }

    // 2. Soportes para esas placas
    const placas = (pagos as PagoWithDeadlineRow[]).map((p) =>
      p.placa.toUpperCase(),
    );
    const { data: docs, error: docsErr } = await supabase
      .from("documentos")
      .select("placas, valor_soporte")
      .overlaps("placas", placas);
    if (docsErr) throw new Error(`documentos: ${docsErr.message}`);

    const soportesByPlaca = buildSoportesByPlaca((docs ?? []) as DocRow[], placas);

    // 3. Filter incomplete: soportes < total_pagos
    const incompletos = (pagos as PagoWithDeadlineRow[]).filter((p) => {
      const totalEsperado = Number(p.total_pagos) || 0;
      const totalSoporte = soportesByPlaca.get(p.placa.toUpperCase()) ?? 0;
      // Vence hoy y NO está completo
      return !(totalEsperado > 0 && totalSoporte >= totalEsperado);
    });

    if (incompletos.length === 0) {
      return c.json({
        success: true,
        message: "All today's deadlines are complete",
        today,
      });
    }

    // 4. Recipients
    const { data: recipients, error: recErr } = await supabase.rpc(
      "get_notification_recipients",
    );
    if (recErr) throw new Error(`recipients: ${recErr.message}`);

    const rows: DeadlineRow[] = incompletos.map((p) => ({
      placa: p.placa,
      subasta: p.subasta,
      esperado: Number(p.total_pagos) || 0,
      soporte: soportesByPlaca.get(p.placa.toUpperCase()) ?? 0,
    }));

    const html = deadlineAlertsEmail({ today, rows });

    const validRecipients = (recipients ?? []).filter(
      (r: { email: string | null }) => r.email,
    );
    let emailsSent = 0;
    const errors: string[] = [];

    for (const r of validRecipients) {
      try {
        await sendEmail({
          to: [r.email],
          subject: `Vencimientos hoy: ${incompletos.length} placa(s) sin soportes completos`,
          html,
        });
        emailsSent++;
      } catch (e) {
        errors.push(
          `${r.email}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return c.json({
      success: true,
      today,
      deadlines_incomplete: incompletos.length,
      emails_sent: emailsSent,
      errors,
    });
  } catch (error: unknown) {
    console.error("send-deadline-alerts error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
}
