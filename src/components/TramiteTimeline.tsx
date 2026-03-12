import { Vehiculo } from "@/types";
import { formatDate } from "@/data/mockData";
import { CheckCircle2, Circle, Clock } from "lucide-react";

interface TramiteTimelineProps {
  vehiculo: Vehiculo;
}

const steps = [
  { key: "inicio_tramite_fecha", label: "Inicio Trámite" },
  { key: "cierre_contable_fecha", label: "Cierre Contable" },
  { key: "envio_doc_firma_fecha", label: "Envío Docs Firma" },
  { key: "docs_con_tramitador_fecha", label: "Docs con Tramitador" },
  { key: "fecha_recibido_improntas", label: "Improntas Recibidas" },
  { key: "fecha_aprobacion_tramite", label: "Aprobación Trámite" },
  { key: "fecha_entrega_vehiculo", label: "Entrega Vehículo" },
] as const;

const TramiteTimeline = ({ vehiculo }: TramiteTimelineProps) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium min-w-[110px]">Tramitador:</span>
          <span className="font-semibold text-foreground">{vehiculo.tramitador_a_cargo}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium min-w-[110px]">Tránsito:</span>
          <span className="font-semibold text-foreground">{vehiculo.transito}</span>
        </div>
      </div>

      <div className="relative">
        <div className="space-y-0">
          {steps.map((step, index) => {
            const value = vehiculo[step.key as keyof Vehiculo] as string | null;
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
