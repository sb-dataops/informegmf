SELECT
  COUNT(*) as total,
  COUNTIF(UPPER(IFNULL(CAST(estadoRetiro AS STRING), '')) = 'ABIERTO') as abierto,
  COUNTIF(UPPER(IFNULL(CAST(estadoRetiro AS STRING), '')) = 'CERRADO') as cerrado,
  COUNTIF(IFNULL(CAST(cierrecontableTraspasoComision AS STRING), '') = '') as sin_cierre,
  COUNTIF(IFNULL(CAST(fechaEntregaVehiculo AS STRING), '') = '') as sin_entrega
FROM `${tableName}`
