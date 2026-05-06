import { Hono } from "hono";
import { getAdminClient } from "../services/supabase.js";
import { sendEmail } from "../services/resend.js";

// Cloud Run + Cloud Scheduler will protect these via IAM (roles/run.invoker).
// In local dev, these endpoints are unauthenticated — hit them directly with curl.
const router = new Hono();

interface PagoRow {
  placa: string;
  subasta: string | null;
  total_pagos: number | null;
}

interface PagoWithDeadlineRow {
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

router.post("/auction-complete", async (c) => {
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
      return c.json({ success: true, notified: 0, message: "No complete auctions" });
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
      return c.json({ success: true, notified: 0, message: "All complete auctions already notified" });
    }

    // 5. Get recipients (lector_con_notificacion)
    const { data: recipients, error: recErr } = await supabase.rpc("get_notification_recipients");
    if (recErr) throw new Error(`recipients: ${recErr.message}`);

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
          await sendEmail({
            to: [r.email],
            subject: `Subasta ${sub.subasta} - soportes completos`,
            html,
          });
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
});

router.post("/deadline-alerts", async (c) => {
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
    const placas = (pagos as PagoWithDeadlineRow[]).map((p) => p.placa.toUpperCase());
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
    const incompletos = (pagos as PagoWithDeadlineRow[]).filter((p) => {
      const totalEsperado = Number(p.total_pagos) || 0;
      const totalSoporte = soportesByPlaca.get(p.placa.toUpperCase()) ?? 0;
      // Vence hoy y NO está completo
      return !(totalEsperado > 0 && totalSoporte >= totalEsperado);
    });

    if (incompletos.length === 0) {
      return c.json({ success: true, message: "All today's deadlines are complete", today });
    }

    // 4. Recipients
    const { data: recipients, error: recErr } = await supabase.rpc("get_notification_recipients");
    if (recErr) throw new Error(`recipients: ${recErr.message}`);

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
        await sendEmail({
          to: [r.email],
          subject: `Vencimientos hoy: ${incompletos.length} placa(s) sin soportes completos`,
          html,
        });
        emailsSent++;
      } catch (e) {
        errors.push(`${r.email}: ${e instanceof Error ? e.message : String(e)}`);
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
});

router.post("/test-notifications", async (c) => {
  try {
    const supabase = getAdminClient();

    const { data: recipients, error: recErr } = await supabase.rpc("get_notification_recipients");
    if (recErr) throw new Error(`recipients: ${recErr.message}`);
    const validRecipients = (recipients ?? []).filter((r: { email: string | null }) => r.email);

    if (validRecipients.length === 0) {
      return c.json({ error: "No recipients with role lector_con_notificacion" }, 400);
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

    const sendOne = async (to: string, subject: string, html: string) => {
      try {
        await sendEmail({ to: [to], subject, html });
        sent++;
        return true;
      } catch (e) {
        errors.push(`${to} (${subject}): ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    };

    for (const r of validRecipients) {
      await sendOne(r.email, `[PRUEBA] Subasta ${fakeSubasta} - soportes completos`, auctionHtml);
      await sendOne(r.email, `[PRUEBA] Vencimientos hoy: ${fakePlacas.length} placa(s) sin soportes completos`, deadlineHtml);
    }

    return c.json({
      success: true,
      recipients: validRecipients.length,
      emails_sent: sent,
      errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export const jobsRouter = router;
