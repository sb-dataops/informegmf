import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { upsertPago, fetchPagoByPlaca } from "@/services/pagosService";
import { searchBigQuery } from "@/services/bigqueryService";
import { toast } from "@/hooks/use-toast";
import { DollarSign, Search, Loader2, Save, CalendarDays } from "lucide-react";

interface PaymentFormProps {
  initialPlaca?: string;
  initialSubasta?: string;
  onSaved?: () => void;
}

const PaymentForm = ({ initialPlaca, initialSubasta, onSaved }: PaymentFormProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [placa, setPlaca] = useState(initialPlaca || "");
  const [subasta, setSubasta] = useState(initialSubasta || "");
  const [vehicleInfo, setVehicleInfo] = useState<string>("");
  const [totalProrrateo, setTotalProrrateo] = useState("");
  const [totalPagos, setTotalPagos] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  // Load existing payment data when placa changes
  const { data: existingPago } = useQuery({
    queryKey: ["pago", placa],
    queryFn: () => fetchPagoByPlaca(placa),
    enabled: placa.length >= 3,
  });

  // Auto-fill existing data
  useState(() => {
    if (existingPago) {
      setTotalProrrateo(String(existingPago.total_prorrateo_gastos || ""));
      setTotalPagos(String(existingPago.total_pagos || ""));
      setFechaLimite(existingPago.fecha_limite_pago || "");
    }
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const result = await searchBigQuery(searchQuery.trim());
      const records = result.relatorio.filter(r => r.placa);
      if (records.length > 0) {
        const first = records[0];
        setPlaca(first.placa || "");
        setSubasta(first.subasta || "");
        setVehicleInfo(`${first.descripcion || ""} — ${first.comprador || ""}`);
        
        // Load existing pago for this placa
        if (first.placa) {
          const pago = await fetchPagoByPlaca(first.placa);
          if (pago) {
            setTotalProrrateo(String(pago.total_prorrateo_gastos || ""));
            setTotalPagos(String(pago.total_pagos || ""));
            setFechaLimite(pago.fecha_limite_pago || "");
          } else {
            setTotalProrrateo("");
            setTotalPagos("");
            setFechaLimite("");
          }
        }
      } else {
        toast({ title: "Sin resultados", description: "No se encontraron vehículos", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

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
        total_prorrateo_gastos: parseFloat(totalProrrateo) || 0,
        total_pagos: parseFloat(totalPagos) || 0,
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

  const saldo = (parseFloat(totalProrrateo) || 0) - (parseFloat(totalPagos) || 0);

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5 text-primary" />
          Actualizar Pagos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Search */}
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

        {/* Vehicle info */}
        {placa && (
          <div className="rounded-lg bg-accent/50 border border-accent p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">{placa}</span>
              {subasta && <span className="text-xs text-muted-foreground">Subasta: {subasta}</span>}
            </div>
            {vehicleInfo && <p className="text-sm text-muted-foreground">{vehicleInfo}</p>}
          </div>
        )}

        {/* Payment fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="prorrateo" className="text-sm font-medium">
              Total Prorrateo + Total Gastos
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="prorrateo"
                type="number"
                placeholder="0"
                value={totalProrrateo}
                onChange={(e) => setTotalProrrateo(e.target.value)}
                className="pl-7"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pagos" className="text-sm font-medium">
              Total Pagos
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="pagos"
                type="number"
                placeholder="0"
                value={totalPagos}
                onChange={(e) => setTotalPagos(e.target.value)}
                className="pl-7"
              />
            </div>
          </div>
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

        {/* Saldo */}
        {(totalProrrateo || totalPagos) && (
          <div className={`rounded-lg p-3 text-sm font-medium ${saldo > 0 ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}>
            Saldo pendiente: ${saldo.toLocaleString("es-CO")}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving || !placa} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar Pagos
        </Button>
      </CardContent>
    </Card>
  );
};

export default PaymentForm;
