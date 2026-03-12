import { Vehiculo } from "@/types";
import { getPagosByPlaca, getArchivosByPlaca, formatDate } from "@/data/mockData";
import StatusBadges from "@/components/StatusBadges";
import TramiteTimeline from "@/components/TramiteTimeline";
import PaymentsTable from "@/components/PaymentsTable";
import FileDropzone from "@/components/FileDropzone";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Car, FileStack, CreditCard } from "lucide-react";

interface VehicleCardProps {
  vehiculo: Vehiculo;
}

const VehicleCard = ({ vehiculo }: VehicleCardProps) => {
  const pagos = getPagosByPlaca(vehiculo.placa);
  const archivos = getArchivosByPlaca(vehiculo.placa);
  const totalPagado = pagos.reduce((sum, p) => sum + p.monto_pagado, 0);

  return (
    <div className="bg-card rounded-xl border border-border shadow-card hover:shadow-card-hover transition-shadow">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center">
              <Car className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-lg">{vehiculo.placa}</h3>
                <span className="text-sm text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">{vehiculo.vehiculo_descripcion}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                <span>{vehiculo.subasta}</span>
                <span>Lote: {vehiculo.lote}</span>
                <span>{formatDate(vehiculo.fecha)}</span>
              </div>
            </div>
          </div>
          <StatusBadges vehiculo={vehiculo} totalPagado={totalPagado} />
        </div>
      </div>

      {/* Content */}
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

        <AccordionItem value="pagos" className="border-b-border">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4 text-primary" />
              Pagos ({pagos.length})
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-5 space-y-4">
            <PaymentsTable pagos={pagos} />
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Soportes de Pago</h4>
              <FileDropzone archivos={archivos} placa={vehiculo.placa} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default VehicleCard;
