WITH allowed_relatorio AS (
  SELECT DISTINCT UPPER(IFNULL(placa,'')) AS placa
  FROM `${TABLES_relatorio}`
  WHERE ${ESTADO_ALLOWED_FILTER}
    AND ${COMITENTE_FILTER}
    AND IFNULL(placa,'') != ''
),
tramitadores_lookup AS (
  SELECT
    UPPER(IFNULL(CAST(placa AS STRING), '')) AS placa,
    ANY_VALUE(CAST(pazYSalvoContabilidad AS STRING)) AS fechaPazSalvo,
    ANY_VALUE(CAST(observacion AS STRING)) AS observacionTramitador,
    ANY_VALUE(CAST(estadoTraspaso AS STRING)) AS estadoTraspaso
  FROM (
    SELECT placa, pazYSalvoContabilidad, observacion, estadoTraspaso FROM `${TABLES_servitram}`
    UNION ALL
    SELECT placa, pazYSalvoContabilidad, observacion, estadoTraspaso FROM `${TABLES_gestramites}`
  )
  WHERE IFNULL(CAST(placa AS STRING), '') != ''
  GROUP BY UPPER(IFNULL(CAST(placa AS STRING), ''))
)
SELECT r.subasta, r.placa, r.comprador, r.documento, r.descripcion, r.estado, r.fechaAprobacionTramite, r.lote, r.tramitador,
       SAFE_CAST(r.documentosConTramitador AS STRING) AS documentosConTramitador, t.fechaPazSalvo,
       r.comentarios, t.estadoTraspaso,
       t.observacionTramitador,
       SAFE_CAST(r.fechaAutorizacionEntregaVh AS STRING) AS fechaAutorizacionEntregaVh
FROM `${TABLES_retiros}` r
INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
LEFT JOIN tramitadores_lookup t ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = t.placa
WHERE IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '') = ''
  ${EXCLUDED_ESTADOS_RETIROS}
ORDER BY r.subasta, r.placa
LIMIT 2000
