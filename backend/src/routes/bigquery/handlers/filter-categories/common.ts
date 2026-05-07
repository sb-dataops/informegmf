// Shared SQL fragment for filter category queries: excludes
// estados that should never appear in the dashboard drill-down.
export const EXCLUDED_ESTADOS_RETIROS = `
  AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA RESCINDIDA%'
  AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%INCUMPLIMIENTO DE PAGO%'
  AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
`;
