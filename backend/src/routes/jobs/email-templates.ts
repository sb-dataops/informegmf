// HTML templates para los emails de jobs. Las variantes test prependen un banner.

const TEST_BANNER = `<div style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:16px;">
      ⚠️ ESTE ES UN CORREO DE PRUEBA — datos ficticios
    </div>`;

const fmtCop = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export interface AuctionCompleteParams {
  subasta: string;
  totalLotes: number;
  isTest?: boolean;
}

export function auctionCompleteEmail(params: AuctionCompleteParams): string {
  const { subasta, totalLotes, isTest = false } = params;
  const banner = isTest ? TEST_BANNER : "";
  const lotesLabel = totalLotes === 1 ? "lote" : "lotes";
  return `
    <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px;">
      ${banner}
      <h2 style="color:#1a1a2e;margin:0 0 8px;">✅ Subasta completa: ${subasta}</h2>
      <p style="color:#444;font-size:14px;line-height:1.5;">
        La subasta <strong>${subasta}</strong> ya cuenta con la totalidad de soportes cargados
        (${totalLotes} ${lotesLabel}). Todos los valores han sido pagados en su totalidad.
      </p>
      <p style="color:#666;font-size:13px;margin-top:16px;">Ingresa al dashboard para revisar el detalle.</p>
    </div>
  `;
}

export interface DeadlineRow {
  placa: string;
  subasta: string | null;
  esperado: number;
  soporte: number;
}

function deadlineRowsHtml(rows: DeadlineRow[]): string {
  return rows
    .map((p) => {
      const faltante = Math.max(p.esperado - p.soporte, 0);
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#111;font-weight:600;">${p.placa}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;">${p.subasta ?? "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;text-align:right;">$ ${fmtCop.format(p.esperado)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;text-align:right;">$ ${fmtCop.format(p.soporte)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#b91c1c;text-align:right;font-weight:600;">$ ${fmtCop.format(faltante)}</td>
        </tr>`;
    })
    .join("");
}

export interface DeadlineAlertsParams {
  today: string;
  rows: DeadlineRow[];
  isTest?: boolean;
}

export function deadlineAlertsEmail(params: DeadlineAlertsParams): string {
  const { today, rows, isTest = false } = params;
  const banner = isTest ? TEST_BANNER : "";
  return `
    <div style="font-family:Arial,sans-serif;max-width:820px;margin:0 auto;padding:24px;">
      ${banner}
      <h2 style="color:#1a1a2e;margin:0 0 8px;">⏰ Vencimientos de pago — hoy ${today}</h2>
      <p style="color:#555;margin:0 0 16px;">
        Las siguientes <strong>${rows.length}</strong> placa(s) vencen hoy y aún no tienen los soportes cargados en su totalidad:
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
        <tbody>${deadlineRowsHtml(rows)}</tbody>
      </table>
      <p style="color:#666;font-size:13px;margin-top:16px;">Ingresa al dashboard para gestionar estos pagos.</p>
    </div>
  `;
}
