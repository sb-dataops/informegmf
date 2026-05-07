WITH allowed_placas AS (
  SELECT DISTINCT UPPER(IFNULL(placa,'')) AS placa
  FROM `${TABLES_relatorio}`
  WHERE ${ESTADO_ALLOWED_FILTER} AND ${COMITENTE_FILTER}
    AND IFNULL(TRIM(placa),'') != ''
),
base AS (
  SELECT
    UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa,
    IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '') AS fat,
    IFNULL(CAST(r.fechaEntregaVehiculo AS STRING), '') AS fev
  FROM `${TABLES_retiros}` r
  INNER JOIN allowed_placas ap ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ap.placa
  WHERE UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA RESCINDIDA%'
    AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%INCUMPLIMIENTO DE PAGO%'
    AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
),
agg AS (
  SELECT
    placa,
    MAX(fat) AS fat,
    MAX(fev) AS fev
  FROM base
  GROUP BY placa
)
SELECT
  CAST(COUNTIF(fat = '') AS STRING) AS pendientes_traspaso,
  CAST(COUNTIF(fat != '' AND fev = '') AS STRING) AS pendientes_retiro,
  CAST(COUNTIF(fev != '') AS STRING) AS vehiculos_entregados
FROM agg
