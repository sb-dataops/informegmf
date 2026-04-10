import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VehiculoConsolidado } from "@/types";
import { formatCurrency, formatDate } from "@/services/bigqueryService";
import { parseCurrencyLikeValue } from "@/lib/payment-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DollarSign, ArrowLeft, ExternalLink } from "lucide-react";

interface SubastaCobranzaProps {
  vehiculos: VehiculoConsolidado[];
  pagosPorPlaca: Map<string, { observacion_pago?: string | null }>;
}

interface BuyerRow {
  comprador: string;
  documento: string;
  asignados: number;
  vlrAsignados: number;
  pagados: number;
  vlrPagados: number;
  nroDesistidos: number;
  vlrDesistidos: number;
  porcentajePagado: number;
  estadoPago: string;
  vehicles: VehiculoConsolidado[];
}

const isIncumplimiento = (estado: string | null) =>
  (estado || "").toUpperCase().includes("INCUMPLIMIENTO");

const isPagado = (v: VehiculoConsolidado) =>
  !!v.cierreContableFecha && v.cierreContableFecha.trim() !== "";

const SubastaCobranza = ({ vehiculos, pagosPorPlaca }: SubastaCobranzaProps) => {
  const [open, setOpen] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerRow | null>(null);
  const navigate = useNavigate();

  const summary = useMemo(() => {
    let totalValor = 0;
    let pagadosCount = 0;
    let pagadosValor = 0;
    let pendientesCount = 0;
    let pendientesValor = 0;
    let incumplimientoCount = 0;
    let incumplimientoValor = 0;

    vehiculos.forEach((v) => {
      const valor = parseCurrencyLikeValue(v.mayor_oferta);
      totalValor += valor;

      if (isIncumplimiento(v.estado)) {
        incumplimientoCount++;
        incumplimientoValor += valor;
      } else if (isPagado(v)) {
        pagadosCount++;
        pagadosValor += valor;
      } else {
        pendientesCount++;
        pendientesValor += valor;
      }
    });

    return { total: vehiculos.length, totalValor, pagadosCount, pagadosValor, pendientesCount, pendientesValor, incumplimientoCount, incumplimientoValor };
  }, [vehiculos]);

  const buyerRows = useMemo<BuyerRow[]>(() => {
    const map = new Map<string, { comprador: string; documento: string; vehicles: VehiculoConsolidado[] }>();

    vehiculos.forEach((v) => {
      const doc = v.documento || "SIN_DOC";
      if (!map.has(doc)) {
        map.set(doc, { comprador: v.comprador || "Sin nombre", documento: doc, vehicles: [] });
      }
      map.get(doc)!.vehicles.push(v);
    });

    return Array.from(map.values()).map(({ comprador, documento, vehicles }) => {
      let vlrAsignados = 0;
      let pagados = 0;
      let vlrPagados = 0;
      let nroDesistidos = 0;
      let vlrDesistidos = 0;

      vehicles.forEach((v) => {
        const valor = parseCurrencyLikeValue(v.mayor_oferta);
        vlrAsignados += valor;

        if (isIncumplimiento(v.estado)) {
          nroDesistidos++;
          vlrDesistidos += valor;
        } else if (isPagado(v)) {
          pagados++;
          vlrPagados += valor;
        }
      });

      const asignados = vehicles.length;
      const porcentajePagado = asignados > 0 ? Math.round((pagados / asignados) * 100) : 0;

      const estadoPago = vehicles
        .map((v) => {
          const pago = pagosPorPlaca.get(v.placa.toUpperCase());
          return (pago as any)?.observacion_pago || "";
        })
        .find((o) => !!o) || "";

      return { comprador, documento, asignados, vlrAsignados, pagados, vlrPagados, nroDesistidos, vlrDesistidos, porcentajePagado, estadoPago, vehicles };
    }).sort((a, b) => b.vlrAsignados - a.vlrAsignados);
  }, [vehiculos, pagosPorPlaca]);

  const summaryRows = [
    { label: "Total lotes vendidos", count: summary.total, value: summary.totalValor, bg: "" },
    { label: "Pagados", count: summary.pagadosCount, value: summary.pagadosValor, bg: "bg-green-50 dark:bg-green-950/20" },
    { label: "Pendientes pago", count: summary.pendientesCount, value: summary.pendientesValor, bg: "bg-yellow-50 dark:bg-yellow-950/20" },
    { label: "Con incumplimiento de pago", count: summary.incumplimientoCount, value: summary.incumplimientoValor, bg: "bg-red-50 dark:bg-red-950/20" },
  ];

  return (
    <div className="space-y-4">
      {/* Gestión de cobranza summary */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground">Gestión de cobranza</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground w-16">Cantidad</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Valor</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => (
              <tr key={row.label} className={`border-b border-border last:border-0 ${row.bg}`}>
                <td className="px-4 py-2 text-center font-semibold text-foreground">{row.count}</td>
                <td className="px-4 py-2 text-foreground">{formatCurrency(row.value)}</td>
                <td className="px-4 py-2 text-muted-foreground">{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detalle pagos button */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelectedBuyer(null); }}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Detalle pagos
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedBuyer ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedBuyer(null)} className="h-7 px-2">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  Vehículos de {selectedBuyer.comprador}
                </div>
              ) : (
                "Detalle de pagos por comprador"
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedBuyer ? (
            <BuyerVehiclesDetail buyer={selectedBuyer} pagosPorPlaca={pagosPorPlaca} navigate={navigate} />
          ) : (
            <BuyerSummaryTable buyerRows={buyerRows} onSelectBuyer={setSelectedBuyer} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ---------- Buyer summary table ---------- */
const BuyerSummaryTable = ({ buyerRows, onSelectBuyer }: { buyerRows: BuyerRow[]; onSelectBuyer: (b: BuyerRow) => void }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/50">
          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Comprador</th>
          <th className="text-center px-3 py-2 font-medium text-muted-foreground">N° Asignados</th>
          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Vlr Asig + Gastos</th>
          <th className="text-center px-3 py-2 font-medium text-muted-foreground">N° Pagados</th>
          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Vlr Pagados</th>
          <th className="text-center px-3 py-2 font-medium text-muted-foreground">Nro Desistidos</th>
          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Vlr Desistidos</th>
          <th className="text-center px-3 py-2 font-medium text-muted-foreground">Pagado %</th>
          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Estado de pago</th>
        </tr>
      </thead>
      <tbody>
        {buyerRows.map((row) => {
          const pctColor = row.porcentajePagado === 100
            ? "text-green-600"
            : row.porcentajePagado > 0
            ? "text-yellow-600"
            : "text-red-600";

          return (
            <tr key={row.documento} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2">
                <button
                  onClick={() => onSelectBuyer(row)}
                  className="text-primary font-medium hover:underline text-left max-w-[200px] truncate block"
                >
                  {row.comprador}
                </button>
              </td>
              <td className="px-3 py-2 text-center text-foreground">{row.asignados}</td>
              <td className="px-3 py-2 text-right text-foreground">{formatCurrency(row.vlrAsignados)}</td>
              <td className="px-3 py-2 text-center text-foreground">{row.pagados}</td>
              <td className="px-3 py-2 text-right text-foreground">{formatCurrency(row.vlrPagados)}</td>
              <td className="px-3 py-2 text-center text-foreground">{row.nroDesistidos}</td>
              <td className="px-3 py-2 text-right text-foreground">{formatCurrency(row.vlrDesistidos)}</td>
              <td className={`px-3 py-2 text-center font-semibold ${pctColor}`}>{row.porcentajePagado}%</td>
              <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate">{row.estadoPago || "—"}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-border bg-muted/30 font-semibold">
          <td className="px-3 py-2 text-foreground">TOTAL</td>
          <td className="px-3 py-2 text-center text-foreground">{buyerRows.reduce((s, r) => s + r.asignados, 0)}</td>
          <td className="px-3 py-2 text-right text-foreground">{formatCurrency(buyerRows.reduce((s, r) => s + r.vlrAsignados, 0))}</td>
          <td className="px-3 py-2 text-center text-foreground">{buyerRows.reduce((s, r) => s + r.pagados, 0)}</td>
          <td className="px-3 py-2 text-right text-foreground">{formatCurrency(buyerRows.reduce((s, r) => s + r.vlrPagados, 0))}</td>
          <td className="px-3 py-2 text-center text-foreground">{buyerRows.reduce((s, r) => s + r.nroDesistidos, 0)}</td>
          <td className="px-3 py-2 text-right text-foreground">{formatCurrency(buyerRows.reduce((s, r) => s + r.vlrDesistidos, 0))}</td>
          <td className="px-3 py-2 text-center text-foreground">
            {buyerRows.length > 0
              ? Math.round((buyerRows.reduce((s, r) => s + r.pagados, 0) / buyerRows.reduce((s, r) => s + r.asignados, 0)) * 100)
              : 0}%
          </td>
          <td className="px-3 py-2"></td>
        </tr>
      </tfoot>
    </table>
  </div>
);

/* ---------- Buyer vehicles detail ---------- */
const BuyerVehiclesDetail = ({
  buyer,
  pagosPorPlaca,
  navigate,
}: {
  buyer: BuyerRow;
  pagosPorPlaca: Map<string, { observacion_pago?: string | null }>;
  navigate: (path: string) => void;
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <div><span className="text-muted-foreground">Documento:</span> <span className="font-medium text-foreground">{buyer.documento}</span></div>
        <div><span className="text-muted-foreground">Lotes:</span> <span className="font-medium text-foreground">{buyer.asignados}</span></div>
        <div><span className="text-muted-foreground">Pagados:</span> <span className="font-semibold text-green-600">{buyer.pagados}</span></div>
        <div><span className="text-muted-foreground">Desistidos:</span> <span className="font-semibold text-red-600">{buyer.nroDesistidos}</span></div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Placa</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Descripción</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Mayor Oferta</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Estado</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Pagado</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Obs. Pago</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {buyer.vehicles.map((v) => {
              const valor = parseCurrencyLikeValue(v.mayor_oferta);
              const pagado = isPagado(v);
              const incumplimiento = isIncumplimiento(v.estado);
              const pago = pagosPorPlaca.get(v.placa.toUpperCase());
              const obs = (pago as any)?.observacion_pago || "";

              return (
                <tr key={v.placa} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-mono font-semibold text-foreground">{v.placa}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{v.descripcion || "—"}</td>
                  <td className="px-3 py-2 text-right text-foreground">{formatCurrency(valor)}</td>
                  <td className="px-3 py-2 text-center">
                    {incumplimiento ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400">Incumplimiento</span>
                    ) : pagado ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400">Pagado</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400">Pendiente</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {pagado ? "✓" : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate">{obs || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-primary"
                      onClick={() => navigate(`/vehiculo/${v.placa}`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-semibold">
              <td className="px-3 py-2 text-foreground" colSpan={2}>TOTAL</td>
              <td className="px-3 py-2 text-right text-foreground">{formatCurrency(buyer.vlrAsignados)}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default SubastaCobranza;
