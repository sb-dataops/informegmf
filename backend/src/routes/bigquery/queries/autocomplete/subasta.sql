SELECT DISTINCT CAST(subasta AS STRING) AS value, NULL AS extra
FROM `${TABLES_relatorio}`
WHERE ${COMITENTE_FILTER}
  AND ${ESTADO_ALLOWED_FILTER}
  AND IFNULL(CAST(subasta AS STRING),'') != ''
  AND (
    UPPER(IFNULL(CAST(subasta AS STRING),'')) LIKE '%${qUpper}%'
    OR REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(CAST(subasta AS STRING),''), NFD), r'[^a-z0-9]', '') LIKE '%${qNormalizedLower}%'
  )${ctxSQL}
ORDER BY value
LIMIT 20
