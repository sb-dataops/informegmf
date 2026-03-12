import { Badge } from "@/components/ui/badge";
import { Vehiculo } from "@/types";

interface StatusBadgesProps {
  vehiculo: Vehiculo;
  totalPagado: number;
}

const StatusBadges = ({ vehiculo, totalPagado }: StatusBadgesProps) => {
  const estadoTraspasoColor: Record<string, string> = {
    Aprobado: "bg-success text-success-foreground",
    "En Proceso": "bg-warning text-warning-foreground",
    Rechazado: "bg-destructive text-destructive-foreground",
    Pendiente: "bg-muted text-muted-foreground",
  };

  return (
    <div className="flex flex-wrap gap-2">
      {totalPagado > 0 && (
        <Badge className="bg-success text-success-foreground hover:bg-success/90 border-0 px-3 py-1 text-xs font-semibold">
          💰 Pagado
        </Badge>
      )}
      <Badge className={`${estadoTraspasoColor[vehiculo.estado_traspaso] || "bg-muted text-muted-foreground"} hover:opacity-90 border-0 px-3 py-1 text-xs font-semibold`}>
        📋 {vehiculo.estado_traspaso}
      </Badge>
      {vehiculo.fecha_entrega_vehiculo ? (
        <Badge className="bg-info text-info-foreground hover:bg-info/90 border-0 px-3 py-1 text-xs font-semibold">
          🚗 Entregado
        </Badge>
      ) : (
        <Badge variant="outline" className="border-border text-muted-foreground px-3 py-1 text-xs font-semibold">
          🚗 Sin Entregar
        </Badge>
      )}
    </div>
  );
};

export default StatusBadges;
