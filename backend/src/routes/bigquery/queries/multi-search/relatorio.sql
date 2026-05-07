SELECT codigo_k, codigo_, fecha, subasta, lote, comitente, categoria,
       estado, fecha_aprobacion_vendedor, placa, mayor_oferta, valor_inicial,
       comprador, email, documento, ciudad_comprador, departamento_comprador,
       gestor, movil, direccion, marca, linea, modelo, descripcion, codigoSubasta
FROM `${TABLES_relatorio}`
WHERE ${COMITENTE_FILTER} AND ${whereConditions}
  AND (${ESTADO_ALLOWED_FILTER}
       OR UPPER(IFNULL(CAST(estado AS STRING),'')) LIKE '%INCUMPLIMIENTO DE PAGO%')
LIMIT 1000
