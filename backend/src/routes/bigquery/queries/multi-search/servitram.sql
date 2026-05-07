SELECT tramitador, codigo, fechaDeAsignacion, fechaDeSubasta, subasta,
       descripcion, placa, lote, comprador, documento, email, movil,
       direccion, ciudadYDepartamento, pazYSalvoContabilidad,
       fechaRecibidoImprontas, fechasFirmasComprador, fechaEnvioFirmasVendedor,
       fechaOkDocsTraspaso, transito, estadoTraspaso, fechaAprobadoRunt,
       fechaTp, fechaEnvioTpComprador, ans, observacion
FROM `${TABLES_servitram}`
WHERE ${whereConditions}
LIMIT 1000
