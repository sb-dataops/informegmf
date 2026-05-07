SELECT
  UPPER(TRIM(IFNULL(CAST(placa AS STRING), ''))) AS placa,
  TRIM(IFNULL(CAST(subasta AS STRING), '')) AS subasta,
  TRIM(IFNULL(CAST(comprador AS STRING), '')) AS comprador,
  TRIM(IFNULL(CAST(descripcion AS STRING), '')) AS descripcion,
  TRIM(IFNULL(CAST(tramitador AS STRING), '')) AS tramitador,
  TRIM(IFNULL(CAST(lote AS STRING), '')) AS lote,
  TRIM(IFNULL(CAST(estadoRelatorio AS STRING), '')) AS estadoRelatorio
FROM `${TABLES_consolidadoChan}`
WHERE LOWER(IFNULL(CAST(comitente AS STRING), '')) = 'gm financial colombia sa compañia de financiamiento'
  AND IFNULL(CAST(estadoRelatorio AS STRING), '') IN ('Venta', 'Condicional Aprobado', 'Post-oferta Aprobada')
  AND CAST(fechaSubasta AS STRING) > '2026-01-01'
  AND fechaAprobacionVendedorDocsCreacionFiltros IS NULL
  AND IFNULL(TRIM(CAST(placa AS STRING)), '') != ''
ORDER BY subasta, placa
