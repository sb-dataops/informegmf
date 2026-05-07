SELECT subasta, placa, comprador, documento, descripcion, estado, lote
FROM `${TABLES_relatorio}`
WHERE ${ESTADO_ALLOWED_FILTER}
  AND ${COMITENTE_FILTER}
ORDER BY subasta, placa
LIMIT 2000
