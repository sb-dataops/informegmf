import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { upsertPago, fetchPagoByPlaca } from "@/services/pagosService";
import { searchBigQuery, formatCurrency } from "@/services/bigqueryService";
import { calculateTotalPagos, formatNumericInput, parseCurrencyLikeValue } from "@/lib/payment-utils";
import { isCondicionalRechazado } from "@/lib/vehicle-filters";
import { toast } from "@/hooks/use-toast";
import { DollarSign, Search, Loader2, Save, CalendarDays } from "lucide-react";

interface PaymentFormProps {
  initialPlaca?: string;
  initialSubasta?: string;
  initialMayorOferta?: number;
  onSaved?: () => void;
}

const PaymentForm = ({ initialPlaca, initialSubasta, initialMayorOferta = 0, onSaved }: PaymentFormProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [placa, setPlaca] = useState(initialPlaca || "");
  const [subasta, setSubasta] = useState(initialSubasta || "");
  const [vehicleInfo, setVehicleInfo] = useState<string>("");
  const [mayorOferta, setMayorOferta] = useState(initialMayorOferta);
  const [totalProrrateo, setTotalProrrateo] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  const { data: existingPago } = useQuery({
    queryKey: ["pago", placa],
    queryFn: () => fetchPagoByPlaca(placa),
    enabled: placa.length >= 3,
  });

  useEffect(() => {
    if (!existingPago) return;
    setTotalProrrateo(formatNumericInput(existingPago.total_prorrateo_gastos || ""));
    setFechaLimite(existingPago.fecha_limite_pago || "");
  }, [existingPago]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const result = await searchBigQuery(searchQuery.trim());
      const records = result.relatorio.filter((r) => r.placa && !isCondicionalRechazado(r.estado));
      if (records.length > 0) {
        const first = records[0];
        setPlaca(first.placa || "");
        setSubasta(first.subasta || "");
        setMayorOferta(parseCurrencyLikeValue(first.mayor_oferta));
        setVehicleInfo(`${first.descripcion || ""} — ${first.comprador || ""}`);

        if (first.placa) {
          const pago = await fetchPagoByPlaca(first.placa);
          if (pago) {
            setTotalProrrateo(formatNumericInput(pago.total_prorrateo_gastos || ""));
            setFechaLimite(pago.fecha_limite_pago || "");
          } else {
            setTotalProrrateo("");
            setFechaLimite("");
          }
        }
      } else {
        toast({ title: "Sin resultados", description: "No se encontraron vehículos disponibles", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const totalPagosCalculado = useMemo(() => {
    return calculateTotalPagos(mayorOferta, parseCurrencyLikeValue(totalProrrateo));
  }, [mayorOferta, totalProrrateo]);

  const handleSave = async () => {
    if (!placa) {
      toast({ title: "Error", description: "Selecciona una placa primero", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertPago({
        placa: placa.toUpperCase(),
        subasta: subasta || undefined,
        total_prorrateo_gastos: parseCurrencyLikeValue(totalProrrateo),
        total_pagos: totalPagosCalculado,
        fecha_limite_pago: fechaLimite || null,
      });
      toast({ title: "¡Guardado!", description: `Pagos actualizados para ${placa}` });
      onSaved?.();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5 text-primary" />
          Actualizar Pagos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!initialPlaca && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Buscar por subasta o placa</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ej: FSP090, 1234..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={searching} variant="secondary" className="shrink-0">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {placa && (
          <div className="rounded-lg bg-accent/50 border border-accent p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">{placa}</span>
              {subasta && <span className="text-xs text-muted-foreground">Subasta: {subasta}</span>}
            </div>
            {vehicleInfo && <p className="text-sm text-muted-foreground">{vehicleInfo}</p>}
            <div className="rounded-md bg-background/80 px-3 py-2 text-sm text-foreground">
              Mayor oferta: <span className="font-semibold">{formatCurrency(mayorOferta)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="prorrateo" className="text-sm font-medium">
              Total Prorrateo + Total Gastos
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="prorrateo"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={totalProrrateo}
                onChange={(e) => setTotalProrrateo(formatNumericInput(e.target.value))}
                className="pl-7"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs text-muted-foreground mb-1">Total pagos calculado automáticamente</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalPagosCalculado)}</p>
          <p className="text-xs text-muted-foreground mt-1">Mayor oferta + prorrateo + gastos</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fecha" className="text-sm font-medium flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Fecha límite de pago
          </Label>
          <Input
            id="fecha"
            type="date"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
          />
        </div>

        <Button onClick={handleSave} disabled={saving || !placa} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar Pagos
        </Button>
      </CardContent>
    </Card>
  );
};

export default PaymentForm;
