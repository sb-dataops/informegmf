WITH allowed_relatorio AS (
  SELECT UPPER(IFNULL(placa,'')) AS placa, UPPER(IFNULL(estado,'')) AS estado
  FROM `${TABLES_relatorio}`
  WHERE ${ESTADO_ALLOWED_FILTER}
    AND ${COMITENTE_FILTER}
),
relatorio_stats AS (
  SELECT
    COUNT(*) AS total,
    COUNTIF(estado LIKE '%APROBADO%') AS aprobados,
    COUNTIF((estado LIKE '%PROCESO%' OR estado LIKE '%CONDICIONAL%') AND estado NOT LIKE '%CONDICIONAL RECHAZADO%') AS en_proceso,
    COUNTIF(estado LIKE '%PENDIENTE%') AS pendientes
  FROM allowed_relatorio
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
    MAX(IFNULL(CAST(r.cierrecontableTraspasoComision AS STRING), '')) AS cierre,
    MAX(IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '')) AS aprobacion
  FROM `${TABLES_retiros}` r
  INNER JOIN (
    SELECT DISTINCT placa
    FROM allowed_relatorio
    WHERE placa != ''
  ) ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
  LEFT JOIN excluded_retiros er ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = er.placa
  WHERE er.placa IS NULL
  GROUP BY UPPER(IFNULL(CAST(r.placa AS STRING), ''))
),
retiros_pendientes_retiro AS (
  SELECT DISTINCT UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa
  FROM `${TABLES_retiros}` r
  INNER JOIN (
    SELECT DISTINCT placa
    FROM allowed_relatorio
    WHERE placa != ''
  ) ar2 ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar2.placa
  WHERE IFNULL(CAST(r.fechaEntregaVehiculo AS STRING), '') = ''
    AND IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '') != ''
    AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA RESCINDIDA%'
    AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%INCUMPLIMIENTO DE PAGO%'
    AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
),
retiros_pendientes_traspaso AS (
  SELECT DISTINCT UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa
  FROM `${TABLES_retiros}` r
  INNER JOIN (
    SELECT DISTINCT placa
    FROM allowed_relatorio
    WHERE placa != ''
  ) ar3 ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar3.placa
  WHERE IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '') = ''
    AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA RESCINDIDA%'
    AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%INCUMPLIMIENTO DE PAGO%'
    AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
),
retiros_stats AS (
  SELECT
    COUNTIF(cierre = '') AS pendientes_pago,
    (SELECT COUNT(*) FROM retiros_pendientes_retiro) AS pendientes_retiro,
    (SELECT COUNT(*) FROM retiros_pendientes_traspaso) AS pendientes_traspaso
  FROM retiros_filtered
)
SELECT
  CAST(relatorio_stats.total AS STRING) AS total,
  CAST(relatorio_stats.aprobados AS STRING) AS aprobados,
  CAST(relatorio_stats.en_proceso AS STRING) AS en_proceso,
  CAST(relatorio_stats.pendientes AS STRING) AS pendientes,
  CAST(retiros_stats.pendientes_pago AS STRING) AS pendientes_pago,
  CAST(retiros_stats.pendientes_traspaso AS STRING) AS pendientes_traspaso,
  CAST(retiros_stats.pendientes_retiro AS STRING) AS pendientes_retiro
FROM relatorio_stats
CROSS JOIN retiros_stats
