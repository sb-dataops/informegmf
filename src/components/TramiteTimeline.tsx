import { VehiculoConsolidado } from "@/types";
import { formatDate } from "@/services/bigqueryService";
import { CheckCircle2, Circle } from "lucide-react";

interface TramiteTimelineProps {
  vehiculo: VehiculoConsolidado;
}

const steps = [
  { key: "inicioTramiteFecha", label: "Inicio Trámite" },
  { key: "cierreContableFecha", label: "Cierre Contable / Paz y Salvo" },
  { key: "envioDocFirmaFecha", label: "Envío Docs Firma GM Financial" },
  { key: "docsConTramitadorFecha", label: "Docs con Tramitador" },
  { key: "fechaRecibidoImprontas", label: "Improntas Recibidas" },
  { key: "fechaAprobacionTramite", label: "Aprobación Trámite" },
  { key: "fechaAprobadoRunt", label: "Aprobado RUNT" },
  { key: "fechaTp", label: "Tarjeta de Propiedad" },
  { key: "fechaEntregaVehiculo", label: "Entrega Vehículo" },
] as const;

const TramiteTimeline = ({ vehiculo }: TramiteTimelineProps) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {vehiculo.tramitador && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-medium min-w-[110px]">Tramitador:</span>
            <span className="font-semibold text-foreground">{vehiculo.tramitador}</span>
          </div>
        )}
        {vehiculo.transito && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-medium min-w-[110px]">Tránsito:</span>
            <span className="font-semibold text-foreground">{vehiculo.transito}</span>
          </div>
        )}
      </div>

      <div className="relative">
        <div className="space-y-0">
          {steps.map((step, index) => {
            const value = vehiculo[step.key as keyof VehiculoConsolidado] as string | null;
            const done = !!value;
            const isLast = index === steps.length - 1;

            return (
              <div key={step.key} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-border shrink-0" />
                  )}
                  {!isLast && (
                    <div className={`w-0.5 h-6 ${done ? "bg-success/40" : "bg-border"}`} />
                  )}
                </div>
                <div className="flex items-center gap-2 pb-4">
                  <span className={`text-sm ${done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                  {done && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      {formatDate(value)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {vehiculo.comentarios && (
        <div className="bg-muted/50 rounded-lg p-3 text-sm">
          <span className="text-muted-foreground font-medium">Comentarios Superbid: </span>
          <span className="text-foreground">{vehiculo.comentarios}</span>
        </div>
      )}

      {vehiculo.observacion && (
        <div className="bg-muted/50 rounded-lg p-3 text-sm">
          <span className="text-muted-foreground font-medium">Observación: </span>
          <span className="text-foreground">{vehiculo.observacion}</span>
        </div>
      )}
    </div>
  );
};

export default TramiteTimeline;
