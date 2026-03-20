import { useQuery } from "@tanstack/react-query";
import { fetchAllPagos } from "@/services/pagosService";
import { fetchFilteredLots } from "@/services/bigqueryService";
import { AlertTriangle, CalendarClock, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PaymentDeadlineAlerts = () => {
  const navigate = useNavigate();

  const { data: pagos = [], isLoading: isPagosLoading } = useQuery({
    queryKey: ["pagos-all-alerts"],
    queryFn: fetchAllPagos,
    staleTime: 5 * 60 * 1000,
  });

  const { data: filteredData, isLoading: isFilterLoading } = useQuery({
    queryKey: ["filtered-pendientes-pago"],
    queryFn: () => fetchFilteredLots("pendientes_pago"),
    staleTime: 10 * 60 * 1000,
  });

  const isLoading = isPagosLoading || isFilterLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 animate-pulse">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  // Get plates that are still pending (not closed)
  const pendingPlacas = new Set(
    (filteredData?.rows || []).map((r) =>
      r.placa?.toUpperCase?.()
    ).filter(Boolean)
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiringToday: string[] = [];
  const alreadyExpired: string[] = [];

  pagos.forEach((pago) => {
    if (!pago.fecha_limite_pago) return;
    const placa = pago.placa.toUpperCase();
    if (!pendingPlacas.has(placa)) return;

    const deadline = new Date(pago.fecha_limite_pago + "T00:00:00");
    deadline.setHours(0, 0, 0, 0);

    if (deadline.getTime() === today.getTime()) {
      expiringToday.push(placa);
    } else if (deadline.getTime() < today.getTime()) {
      alreadyExpired.push(placa);
    }
  });

  if (expiringToday.length === 0 && alreadyExpired.length === 0) return null;

  return (
    <div className="space-y-3">
      {alreadyExpired.length > 0 && (
        <button
          onClick={() => navigate("/filter/pendientes_pago")}
          className="flex w-full items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-left transition-all hover:bg-destructive/20"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/20 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">
              {alreadyExpired.length} placa{alreadyExpired.length > 1 ? "s" : ""} con fecha de pago vencida
            </p>
            <p className="text-xs text-destructive/70">
              {alreadyExpired.slice(0, 5).join(", ")}
              {alreadyExpired.length > 5 ? ` y ${alreadyExpired.length - 5} más...` : ""}
            </p>
          </div>
        </button>
      )}

      {expiringToday.length > 0 && (
        <button
          onClick={() => navigate("/filter/pendientes_pago")}
          className="flex w-full items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-left transition-all hover:bg-warning/20"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-warning">
              {expiringToday.length} placa{expiringToday.length > 1 ? "s vencen" : " vence"} hoy
            </p>
            <p className="text-xs text-warning/70">
              {expiringToday.slice(0, 5).join(", ")}
              {expiringToday.length > 5 ? ` y ${expiringToday.length - 5} más...` : ""}
            </p>
          </div>
        </button>
      )}
    </div>
  );
};

export default PaymentDeadlineAlerts;
