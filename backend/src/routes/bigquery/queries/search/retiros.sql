SELECT codigo, fecha, subasta, estado, lote, descripcion, placa, transito,
       tramitador, incioServitramFecha, cierrecontableTraspasoComision,
       procesoPazySalvoaTramitador, estadoDocuemntosComprador,
       enviodoFirmarGmFinancial, estadoGmFinancialFirmas,
       SAFE_CAST(documentosConTramitador AS STRING) AS documentosConTramitador, fechaAprobacionTramite, fechaEntregaVehiculo,
       comentarios, mayoroferta, comprador, email, documento, movil,
       direccion, ciudadComprador, departamentoComprador,
       ubicacionVehiculo, ciudadUbicacionVehiculo, direccionUbicacionVehiculo,
       quienRetira, estadoRetiro, fechaEstadoRetiro
FROM `${TABLES_retiros}`
WHERE ${placa_eq}
   OR UPPER(IFNULL(documento,'')) = '${qUpper}'
   OR UPPER(IFNULL(comprador,'')) LIKE '%${qUpper}%'
   OR UPPER(IFNULL(subasta,'')) = '${qUpper}'
   OR ${subasta_contains}
LIMIT 1000
