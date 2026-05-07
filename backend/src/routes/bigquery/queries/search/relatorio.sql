SELECT codigo_k, codigo_, fecha, subasta, lote, comitente, categoria,
       estado, fecha_aprobacion_vendedor, placa, mayor_oferta, valor_inicial,
       comprador, email, documento, ciudad_comprador, departamento_comprador,
       gestor, movil, direccion, marca, linea, modelo, descripcion, codigoSubasta
FROM `${TABLES_relatorio}`
 WHERE ${COMITENTE_FILTER}
   AND ${ESTADO_ALLOWED_FILTER}
   AND (
     ${placa_eq}
     OR ${desc_contains}
     OR UPPER(IFNULL(documento,'')) = '${qUpper}'
     OR UPPER(IFNULL(comprador,'')) LIKE '%${qUpper}%'
     OR UPPER(IFNULL(subasta,'')) = '${qUpper}'
     OR ${subasta_contains}
   )
LIMIT 1000
