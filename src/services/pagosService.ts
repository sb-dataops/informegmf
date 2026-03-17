import { supabase } from "@/integrations/supabase/client";
import { calculateTotalPagos } from "@/lib/payment-utils";

export interface PagoRecord {
  id: string;
  placa: string;
  subasta: string | null;
  total_prorrateo_gastos: number;
  total_pagos: number;
  fecha_limite_pago: string | null;
  created_at: string;
  updated_at: string;
}

interface UpsertPagoInput {
  placa: string;
  subasta?: string;
  total_prorrateo_gastos: number;
  total_pagos: number;
  fecha_limite_pago: string | null;
}

interface BulkPagoInput {
  placa: string;
  subasta?: string;
  mayor_oferta: number;
  total_prorrateo_gastos: number;
  fecha_limite_pago: string | null;
}

export async function upsertPago(data: UpsertPagoInput): Promise<PagoRecord> {
  const { data: existing } = await supabase
    .from("pagos")
    .select("id")
    .eq("placa", data.placa.toUpperCase())
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabase
      .from("pagos")
      .update({
        total_prorrateo_gastos: data.total_prorrateo_gastos,
        total_pagos: data.total_pagos,
        fecha_limite_pago: data.fecha_limite_pago,
        subasta: data.subasta || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated as unknown as PagoRecord;
  }

  const { data: inserted, error } = await supabase
    .from("pagos")
    .insert({
      placa: data.placa.toUpperCase(),
      subasta: data.subasta || null,
      total_prorrateo_gastos: data.total_prorrateo_gastos,
      total_pagos: data.total_pagos,
      fecha_limite_pago: data.fecha_limite_pago,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return inserted as unknown as PagoRecord;
}

export async function upsertPagosBulk(rows: BulkPagoInput[]): Promise<PagoRecord[]> {
  return Promise.all(
    rows.map((row) =>
      upsertPago({
        placa: row.placa,
        subasta: row.subasta,
        total_prorrateo_gastos: row.total_prorrateo_gastos,
        total_pagos: calculateTotalPagos(row.mayor_oferta, row.total_prorrateo_gastos),
        fecha_limite_pago: row.fecha_limite_pago,
      }),
    ),
  );
}

export async function fetchPagoByPlaca(placa: string): Promise<PagoRecord | null> {
  const { data, error } = await supabase
    .from("pagos")
    .select("*")
    .eq("placa", placa.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as PagoRecord | null;
}

export async function fetchAllPagos(): Promise<PagoRecord[]> {
  const { data, error } = await supabase
    .from("pagos")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as unknown as PagoRecord[];
}
