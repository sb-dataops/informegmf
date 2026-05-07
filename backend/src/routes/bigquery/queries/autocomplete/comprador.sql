SELECT DISTINCT CAST(comprador AS STRING) AS value, CAST(documento AS STRING) AS extra
FROM `${TABLES_relatorio}`
WHERE ${COMITENTE_FILTER}
  AND ${ESTADO_ALLOWED_FILTER}
  AND IFNULL(CAST(comprador AS STRING),'') != ''
  AND (
    UPPER(IFNULL(CAST(comprador AS STRING),'')) LIKE '%${qUpper}%'
    OR REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(CAST(comprador AS STRING),''), NFD), r'[^a-z0-9]', '') LIKE '%${qNormalizedLower}%'
  )${ctxSQL}
ORDER BY value
LIMIT 20
