SELECT codigo, fecha, subasta, estado, lote, descripcion, placa, transito,
       tramitador, incioServitramFecha, CAST(${pazSalvoDateExpr} AS STRING) AS cierrecontableTraspasoComision,
       procesoPazySalvoaTramitador, estadoDocuemntosComprador,
       enviodoFirmarGmFinancial, estadoGmFinancialFirmas,
       SAFE_CAST(documentosConTramitador AS STRING) AS documentosConTramitador, fechaAprobacionTramite, fechaEntregaVehiculo,
       comentarios, mayoroferta, comprador, email, documento, movil,
       direccion, ciudadComprador, departamentoComprador,
       ubicacionVehiculo, ciudadUbicacionVehiculo, direccionUbicacionVehiculo,
       quienRetira, estadoRetiro, fechaEstadoRetiro
FROM `${TABLES_retiros}`
WHERE ${whereConditions}
LIMIT 1000
