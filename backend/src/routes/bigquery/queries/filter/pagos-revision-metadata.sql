SELECT
  UPPER(IFNULL(placa,'')) AS placa,
  ANY_VALUE(subasta) AS subasta,
  ANY_VALUE(comprador) AS comprador,
  ANY_VALUE(documento) AS documento,
  ANY_VALUE(descripcion) AS descripcion,
  ANY_VALUE(estado) AS estado,
  ANY_VALUE(lote) AS lote
FROM `${TABLES_relatorio}`
WHERE ${ESTADO_ALLOWED_FILTER}
  AND ${COMITENTE_FILTER}
  AND UPPER(IFNULL(placa,'')) IN (${placaList})
GROUP BY UPPER(IFNULL(placa,''))
