export interface Comprador {
  id_comprador: string;
  nombre_completo: string;
}

export interface Vehiculo {
  placa: string;
  id_comprador: string;
  vehiculo_descripcion: string;
  fecha: string;
  subasta: string;
  estado_venta: string;
  lote: string;
  transito: string;
  tramitador_a_cargo: string;
  inicio_tramite_fecha: string | null;
  cierre_contable_fecha: string | null;
  envio_doc_firma_fecha: string | null;
  docs_con_tramitador_fecha: string | null;
  fecha_aprobacion_tramite: string | null;
  fecha_entrega_vehiculo: string | null;
  // Gestores
  fecha_recibido_improntas: string | null;
  estado_traspaso: "Aprobado" | "En Proceso" | "Rechazado" | "Pendiente";
  observacion: string;
}

export interface Pago {
  id_pago: string;
  placa: string;
  id_comprador: string;
  monto_pagado: number;
  fecha_pago: string;
  detalle_pago: "Transferencia" | "Efectivo" | "Cheque";
  url_soporte: string | null;
}

export interface ArchivoSoporte {
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  url: string;
  fecha_subida: string;
  placa: string;
}
