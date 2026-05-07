SELECT tramitador, codigo, fechaDeAsignacion, fechaDeSubasta, subasta,
       descripcion, placa, lote, comprador, documento, email, movil,
       direccion, ciudadYDepartamento, pazYSalvoContabilidad,
       fechaRecibidoImprontas, fechasFirmasComprador, fechaEnvioFirmasVendedor,
       fechaOkDocsTraspaso, transito, estadoTraspaso, fechaAprobadoRunt,
       fechaTp, fechaEnvioTpComprador, ans, observacion
FROM `${TABLES_servitram}`
 WHERE ${placa_eq}
   OR UPPER(IFNULL(documento,'')) = '${qUpper}'
   OR UPPER(IFNULL(comprador,'')) LIKE '%${qUpper}%'
   OR UPPER(IFNULL(subasta,'')) = '${qUpper}'
   OR ${subasta_contains}
LIMIT 1000
