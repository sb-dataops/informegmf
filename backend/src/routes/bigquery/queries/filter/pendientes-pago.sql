WITH allowed_relatorio AS (
  SELECT DISTINCT UPPER(IFNULL(placa,'')) AS placa
  FROM `${TABLES_relatorio}`
  WHERE ${ESTADO_ALLOWED_FILTER}
    AND ${COMITENTE_FILTER}
    AND IFNULL(placa,'') != ''
),
consolidado_lookup AS (
  SELECT
    UPPER(TRIM(IFNULL(CAST(placa AS STRING), ''))) AS placa,
    ANY_VALUE(CAST(fechaAprobacionVendedorDocsCreacionFiltros AS STRING)) AS fechaAprobacionFiltros
  FROM `${TABLES_consolidadoChan}`
  WHERE LOWER(IFNULL(CAST(comitente AS STRING), '')) = 'gm financial colombia sa compañia de financiamiento'
    AND IFNULL(TRIM(CAST(placa AS STRING)), '') != ''
  GROUP BY UPPER(TRIM(IFNULL(CAST(placa AS STRING), '')))
)
SELECT r.subasta, UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa, r.comprador, r.documento, r.lote,
       c.fechaAprobacionFiltros
FROM `${TABLES_retiros}` r
INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
LEFT JOIN consolidado_lookup c ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = c.placa
WHERE IFNULL(CAST(r.cierrecontableTraspasoComision AS STRING), '') = ''
  ${EXCLUDED_ESTADOS_RETIROS}
ORDER BY r.subasta, r.placa
LIMIT 2000
