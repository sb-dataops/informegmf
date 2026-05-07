SELECT
  UPPER(TRIM(IFNULL(CAST(c.placa AS STRING), ''))) AS placa,
  UPPER(TRIM(IFNULL(CAST(c.subasta AS STRING), ''))) AS subasta,
  CAST(c.fechaAprobacionVendedorDocsCreacionFiltros AS STRING) AS fecha_raw,
  IFNULL(TRIM(CAST(c.fechaAprobacionVendedorDocsCreacionFiltros AS STRING)), '') AS fecha_trimmed
FROM `${TABLES_consolidadoChan}` c
WHERE UPPER(IFNULL(CAST(c.subasta AS STRING), '')) LIKE '%GM FINANCIAL 6%'
ORDER BY c.subasta, c.placa
LIMIT 50
