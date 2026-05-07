SELECT codigo_k, codigo_, fecha, subasta, lote, comitente, categoria,
       estado, fecha_aprobacion_vendedor, placa, mayor_oferta, valor_inicial,
       comprador, email, documento, ciudad_comprador, departamento_comprador,
       gestor, movil, direccion, marca, linea, modelo, descripcion, codigoSubasta
FROM `${TABLES_relatorio}`
WHERE ${COMITENTE_FILTER}
  AND ${ESTADO_ALLOWED_FILTER}
  AND (
    REGEXP_REPLACE(UPPER(IFNULL(CAST(placa AS STRING), '')), r'[^A-Z0-9]', '') IN (${placasList})
    OR REGEXP_EXTRACT(UPPER(IFNULL(descripcion, '')), r'PLACA\s*:\s*([A-Z0-9]+)') IN (${placasList})
  )
LIMIT 5000
