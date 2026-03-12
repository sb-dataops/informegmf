import { Comprador } from "@/types";
import { User, IdCard } from "lucide-react";

interface BuyerHeaderProps {
  comprador: Comprador;
  vehicleCount: number;
}

const BuyerHeader = ({ comprador, vehicleCount }: BuyerHeaderProps) => {
  return (
    <div className="bg-card rounded-xl border border-border shadow-card p-5">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-full gradient-primary flex items-center justify-center shrink-0">
          <User className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-foreground truncate">{comprador.nombre_completo}</h2>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <IdCard className="h-4 w-4" />
              {comprador.id_comprador}
            </span>
            <span className="flex items-center gap-1.5">
              🚗 {vehicleCount} vehículo(s)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuyerHeader;
