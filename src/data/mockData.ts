import { Comprador, Vehiculo, Pago, ArchivoSoporte } from "@/types";

export const compradores: Comprador[] = [
  { id_comprador: "1.023.456.789", nombre_completo: "Carlos Andrés Martínez Ríos" },
  { id_comprador: "900.123.456-7", nombre_completo: "Transportes del Valle S.A.S." },
];

export const vehiculos: Vehiculo[] = [
  {
    placa: "ABC123",
    id_comprador: "1.023.456.789",
    vehiculo_descripcion: "Chevrolet Spark GT 2019",
    fecha: "2024-08-15",
    subasta: "Subasta #1042",
    estado_venta: "Vendido",
    lote: "L-2045",
    transito: "Bogotá",
    tramitador_a_cargo: "Servitram",
    inicio_tramite_fecha: "2024-09-01",
    cierre_contable_fecha: "2024-09-10",
    envio_doc_firma_fecha: "2024-09-12",
    docs_con_tramitador_fecha: "2024-09-15",
    fecha_aprobacion_tramite: "2024-10-05",
    fecha_entrega_vehiculo: "2024-10-12",
    fecha_recibido_improntas: "2024-09-20",
    estado_traspaso: "Aprobado",
    observacion: "Trámite completado sin novedades.",
  },
  {
    placa: "DEF456",
    id_comprador: "1.023.456.789",
    vehiculo_descripcion: "Renault Logan 2021",
    fecha: "2024-10-20",
    subasta: "Subasta #1058",
    estado_venta: "Vendido",
    lote: "L-3012",
    transito: "Medellín",
    tramitador_a_cargo: "Gestramites",
    inicio_tramite_fecha: "2024-11-01",
    cierre_contable_fecha: "2024-11-08",
    envio_doc_firma_fecha: "2024-11-10",
    docs_con_tramitador_fecha: null,
    fecha_aprobacion_tramite: null,
    fecha_entrega_vehiculo: null,
    fecha_recibido_improntas: null,
    estado_traspaso: "En Proceso",
    observacion: "Pendiente documentación del tránsito de Medellín.",
  },
  {
    placa: "GHI789",
    id_comprador: "900.123.456-7",
    vehiculo_descripcion: "Toyota Hilux 2020",
    fecha: "2024-07-10",
    subasta: "Subasta #1035",
    estado_venta: "Vendido",
    lote: "L-1890",
    transito: "Cali",
    tramitador_a_cargo: "Servitram",
    inicio_tramite_fecha: "2024-07-25",
    cierre_contable_fecha: "2024-08-02",
    envio_doc_firma_fecha: "2024-08-05",
    docs_con_tramitador_fecha: "2024-08-10",
    fecha_aprobacion_tramite: "2024-08-28",
    fecha_entrega_vehiculo: "2024-09-05",
    fecha_recibido_improntas: "2024-08-15",
    estado_traspaso: "Aprobado",
    observacion: "Entregado al comprador en sede Cali.",
  },
  {
    placa: "JKL012",
    id_comprador: "900.123.456-7",
    vehiculo_descripcion: "Mazda CX-5 2022",
    fecha: "2024-11-05",
    subasta: "Subasta #1065",
    estado_venta: "Vendido",
    lote: "L-3200",
    transito: "Barranquilla",
    tramitador_a_cargo: "Gestramites",
    inicio_tramite_fecha: "2024-11-20",
    cierre_contable_fecha: null,
    envio_doc_firma_fecha: null,
    docs_con_tramitador_fecha: null,
    fecha_aprobacion_tramite: null,
    fecha_entrega_vehiculo: null,
    fecha_recibido_improntas: null,
    estado_traspaso: "Pendiente",
    observacion: "Recién adquirido, trámite por iniciar.",
  },
];

export const pagos: Pago[] = [
  {
    id_pago: "PAG-001",
    placa: "ABC123",
    id_comprador: "1.023.456.789",
    monto_pagado: 18500000,
    fecha_pago: "2024-08-16",
    detalle_pago: "Transferencia",
    url_soporte: null,
  },
  {
    id_pago: "PAG-002",
    placa: "ABC123",
    id_comprador: "1.023.456.789",
    monto_pagado: 5000000,
    fecha_pago: "2024-08-20",
    detalle_pago: "Efectivo",
    url_soporte: null,
  },
  {
    id_pago: "PAG-003",
    placa: "DEF456",
    id_comprador: "1.023.456.789",
    monto_pagado: 32000000,
    fecha_pago: "2024-10-21",
    detalle_pago: "Transferencia",
    url_soporte: null,
  },
  {
    id_pago: "PAG-004",
    placa: "GHI789",
    id_comprador: "900.123.456-7",
    monto_pagado: 95000000,
    fecha_pago: "2024-07-11",
    detalle_pago: "Transferencia",
    url_soporte: null,
  },
  {
    id_pago: "PAG-005",
    placa: "GHI789",
    id_comprador: "900.123.456-7",
    monto_pagado: 15000000,
    fecha_pago: "2024-07-15",
    detalle_pago: "Cheque",
    url_soporte: null,
  },
  {
    id_pago: "PAG-006",
    placa: "JKL012",
    id_comprador: "900.123.456-7",
    monto_pagado: 45000000,
    fecha_pago: "2024-11-06",
    detalle_pago: "Transferencia",
    url_soporte: null,
  },
];

export const archivosSoporte: ArchivoSoporte[] = [
  {
    id: "arch-001",
    nombre: "comprobante_transferencia_abc123.pdf",
    tipo: "application/pdf",
    tamano: 245000,
    url: "#",
    fecha_subida: "2024-08-17",
    placa: "ABC123",
  },
  {
    id: "arch-002",
    nombre: "recibo_efectivo_abc123.jpg",
    tipo: "image/jpeg",
    tamano: 180000,
    url: "#",
    fecha_subida: "2024-08-21",
    placa: "ABC123",
  },
];

export function buscarCompradores(query: string): Comprador[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return compradores.filter(
    (c) =>
      c.nombre_completo.toLowerCase().includes(q) ||
      c.id_comprador.toLowerCase().includes(q)
  );
}

export function buscarPorPlaca(query: string): { comprador: Comprador; vehiculo: Vehiculo } | null {
  const q = query.toUpperCase().trim();
  const vehiculo = vehiculos.find((v) => v.placa === q);
  if (!vehiculo) return null;
  const comprador = compradores.find((c) => c.id_comprador === vehiculo.id_comprador);
  if (!comprador) return null;
  return { comprador, vehiculo };
}

export function getVehiculosByComprador(id_comprador: string): Vehiculo[] {
  return vehiculos.filter((v) => v.id_comprador === id_comprador);
}

export function getPagosByPlaca(placa: string): Pago[] {
  return pagos.filter((p) => p.placa === placa);
}

export function getArchivosByPlaca(placa: string): ArchivoSoporte[] {
  return archivosSoporte.filter((a) => a.placa === placa);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}
