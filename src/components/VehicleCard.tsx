import type { ReactNode } from "react";
import { VehiculoConsolidado } from "@/types";
import { formatCurrency, formatDate } from "@/services/bigqueryService";
import { parseCurrencyLikeValue } from "@/lib/payment-utils";
import StatusBadges from "@/components/StatusBadges";
import TramiteTimeline from "@/components/TramiteTimeline";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Car, FileStack } from "lucide-react";

interface VehicleCardProps {
  vehiculo: VehiculoConsolidado;
  extraContent?: ReactNode;
}

const VehicleCard = ({ vehiculo, extraContent }: VehicleCardProps) => {
  return (
    <div className="bg-card rounded-xl border border-border shadow-card hover:shadow-card-hover transition-shadow">
      <div className="p-5 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center">
              <Car className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-lg">{vehiculo.placa}</h3>
                {vehiculo.descripcion && (
                  <>
                    <span className="text-sm text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground line-clamp-1">{vehiculo.descripcion}</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
                {vehiculo.subasta && <span>{vehiculo.subasta}</span>}
                {vehiculo.lote && <span>Lote: {vehiculo.lote}</span>}
                {vehiculo.fecha && <span>{formatDate(vehiculo.fecha)}</span>}
                {vehiculo.mayor_oferta && (
                  <span className="font-semibold text-foreground">
                    Oferta: {formatCurrency(parseCurrencyLikeValue(vehiculo.mayor_oferta))}
                  </span>
                )}
              </div>
            </div>
          </div>
          <StatusBadges vehiculo={vehiculo} />
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["tramites"]} className="px-5">
        <AccordionItem value="tramites" className="border-b-border">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileStack className="h-4 w-4 text-primary" />
              Trámites y Retiros
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <TramiteTimeline vehiculo={vehiculo} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {extraContent ? <div className="border-t border-border p-5">{extraContent}</div> : null}
    </div>
  );
};

export default VehicleCard;

