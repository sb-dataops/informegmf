WITH allowed_relatorio AS (
  SELECT UPPER(IFNULL(placa,'')) AS placa
  FROM `${TABLES_relatorio}`
  WHERE ${ESTADO_ALLOWED_FILTER} AND ${COMITENTE_FILTER}
),
excluded_retiros AS (
  SELECT DISTINCT UPPER(IFNULL(CAST(placa AS STRING), '')) AS placa
  FROM `${TABLES_retiros}`
  WHERE UPPER(IFNULL(CAST(estado AS STRING), '')) LIKE '%VENTA RESCINDIDA%'
     OR UPPER(IFNULL(CAST(estado AS STRING), '')) LIKE '%INCUMPLIMIENTO DE PAGO%'
     OR UPPER(IFNULL(CAST(estado AS STRING), '')) LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
),
retiros_filtered AS (
  SELECT
    UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa,
    MAX(IFNULL(CAST(r.cierrecontableTraspasoComision AS STRING), '')) AS cierre
  FROM `${TABLES_retiros}` r
  INNER JOIN (SELECT DISTINCT placa FROM allowed_relatorio WHERE placa != '') ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
  LEFT JOIN excluded_retiros er ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = er.placa
  WHERE er.placa IS NULL
  GROUP BY UPPER(IFNULL(CAST(r.placa AS STRING), ''))
)
SELECT CAST(COUNTIF(cierre = '') AS STRING) AS pendientes_pago FROM retiros_filtered
