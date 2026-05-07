WITH allowed_relatorio AS (
  SELECT DISTINCT UPPER(IFNULL(placa,'')) AS placa
  FROM `${TABLES_relatorio}`
  WHERE ${ESTADO_ALLOWED_FILTER}
    AND ${COMITENTE_FILTER}
    AND IFNULL(placa,'') != ''
)
SELECT
  ANY_VALUE(r.subasta) AS subasta,
  UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa,
  ANY_VALUE(r.comprador) AS comprador,
  ANY_VALUE(r.documento) AS documento,
  ANY_VALUE(r.descripcion) AS descripcion,
  ANY_VALUE(r.estado) AS estado,
  ANY_VALUE(r.lote) AS lote
FROM `${TABLES_retiros}` r
INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
WHERE IFNULL(CAST(r.cierrecontableTraspasoComision AS STRING), '') = ''
  AND IFNULL(CAST(r.placa AS STRING), '') != ''
GROUP BY UPPER(IFNULL(CAST(r.placa AS STRING), ''))
ORDER BY subasta, placa
LIMIT 5000
