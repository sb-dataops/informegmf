import { Badge } from "@/components/ui/badge";
import { VehiculoConsolidado } from "@/types";

interface StatusBadgesProps {
  vehiculo: VehiculoConsolidado;
}

const StatusBadges = ({ vehiculo }: StatusBadgesProps) => {
  const estadoColor = (estado: string | null): string => {
    if (!estado) return "bg-muted text-muted-foreground";
    const upper = estado.toUpperCase();
    if (upper.includes("APROBADO")) return "bg-success text-success-foreground";
    if (upper.includes("PROCESO") || upper.includes("CONDICIONAL")) return "bg-warning text-warning-foreground";
    if (upper.includes("RECHAZADO")) return "bg-destructive text-destructive-foreground";
    if (upper.includes("VENTA")) return "bg-info text-info-foreground";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="flex flex-wrap gap-2">
      {vehiculo.estado && (
        <Badge className={`${estadoColor(vehiculo.estado)} hover:opacity-90 border-0 px-3 py-1 text-xs font-semibold`}>
          📋 {vehiculo.estado}
        </Badge>
      )}
      {vehiculo.estadoTraspaso && (
        <Badge className={`${estadoColor(vehiculo.estadoTraspaso)} hover:opacity-90 border-0 px-3 py-1 text-xs font-semibold`}>
          🔄 Traspaso: {vehiculo.estadoTraspaso}
        </Badge>
      )}
      {vehiculo.estadoRetiro && (
        <Badge className={`${vehiculo.estadoRetiro.toUpperCase() === "CERRADO" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"} hover:opacity-90 border-0 px-3 py-1 text-xs font-semibold`}>
          🚗 Retiro: {vehiculo.estadoRetiro}
        </Badge>
      )}
      {vehiculo.fechaEntregaVehiculo && (
        <Badge className="bg-info text-info-foreground hover:bg-info/90 border-0 px-3 py-1 text-xs font-semibold">
          ✅ Entregado
        </Badge>
      )}
    </div>
  );
};

export default StatusBadges;
