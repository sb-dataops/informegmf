SELECT
  UPPER(TRIM(IFNULL(CAST(placa AS STRING), ''))) AS placa,
  ANY_VALUE(CAST(fechaAprobacionVendedorDocsCreacionFiltros AS STRING)) AS fechaAprobacionFiltros
FROM `${TABLES_consolidadoChan}`
WHERE LOWER(IFNULL(CAST(comitente AS STRING), '')) = 'gm financial colombia sa compañia de financiamiento'
  AND UPPER(TRIM(IFNULL(CAST(placa AS STRING), ''))) IN (${placaList})
GROUP BY UPPER(TRIM(IFNULL(CAST(placa AS STRING), '')))
