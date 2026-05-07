import type { Context } from "hono";
import { getAdminClient } from "../../services/supabase.js";
import { sendEmail } from "../../services/resend.js";
import { todayColombia } from "./helpers.js";
import { auctionCompleteEmail, deadlineAlertsEmail } from "./email-templates.js";
import type { DeadlineRow } from "./email-templates.js";

const FAKE_SUBASTA = "GM Financial 69 (PRUEBA)";
const FAKE_TOTAL_LOTES = 12;
const FAKE_DEADLINE_ROWS: DeadlineRow[] = [
  { placa: "ABC123", subasta: "GM Financial 70", esperado: 25_000_000, soporte: 15_000_000 },
  { placa: "XYZ789", subasta: "GM Financial 70", esperado: 18_500_000, soporte: 0 },
  { placa: "JKL456", subasta: "Superbid 145", esperado: 32_750_000, soporte: 20_000_000 },
];

export async function testNotificationsHandler(c: Context): Promise<Response> {
  try {
    const supabase = getAdminClient();

    const { data: recipients, error: recErr } = await supabase.rpc(
      "get_notification_recipients",
    );
    if (recErr) throw new Error(`recipients: ${recErr.message}`);
    const validRecipients = (recipients ?? []).filter(
      (r: { email: string | null }) => r.email,
    );

    if (validRecipients.length === 0) {
      return c.json(
        { error: "No recipients with role lector_con_notificacion" },
        400,
      );
    }

    const auctionHtml = auctionCompleteEmail({
      subasta: FAKE_SUBASTA,
      totalLotes: FAKE_TOTAL_LOTES,
      isTest: true,
    });

    const today = todayColombia();
    const deadlineHtml = deadlineAlertsEmail({
      today,
      rows: FAKE_DEADLINE_ROWS,
      isTest: true,
    });

    let sent = 0;
    const errors: string[] = [];

    const sendOne = async (to: string, subject: string, html: string) => {
      try {
        await sendEmail({ to: [to], subject, html });
        sent++;
        return true;
      } catch (e) {
        errors.push(
          `${to} (${subject}): ${e instanceof Error ? e.message : String(e)}`,
        );
        return false;
      }
    };

    for (const r of validRecipients) {
      await sendOne(
        r.email,
        `[PRUEBA] Subasta ${FAKE_SUBASTA} - soportes completos`,
        auctionHtml,
      );
      await sendOne(
        r.email,
        `[PRUEBA] Vencimientos hoy: ${FAKE_DEADLINE_ROWS.length} placa(s) sin soportes completos`,
        deadlineHtml,
      );
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
}
