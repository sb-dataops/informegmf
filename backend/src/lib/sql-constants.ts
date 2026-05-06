export const TABLES = {
  relatorio: "sbc-data-int.relatorio_bq.relatorio_actual",
  retiros: "sbc-data-int.r_retiros.r_retiros_gmf_2025",
  servitram: "sbc-data-int.r_retiros_tramitadores.r_tramitadores_servitram_gmf",
  gestramites: "sbc-data-int.r_retiros_tramitadores.r_tramitadores_gestramites",
  consolidadoChan: "sbc-data-int.HubSpot_uploads.consolidadoChan",
};

export const COMITENTE_FILTER = `UPPER(IFNULL(CAST(comitente AS STRING),'')) = UPPER('Gm Financial Colombia Sa Compañia De Financiamiento')`;
export const ESTADO_ALLOWED_FILTER = `UPPER(IFNULL(CAST(estado AS STRING),'')) IN ('VENTA', 'CONDICIONAL APROBADO', 'POST-OFERTA APROBADA')`;
