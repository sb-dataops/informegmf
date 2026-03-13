import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchBigQuery, consolidateVehiculos } from "@/services/bigqueryService";
import VehicleCard from "@/components/VehicleCard";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoSuperbid from "@/assets/logo-superbid.png";
import logoGmf from "@/assets/logo-gmf.png";

const VehicleDetail = () => {
  const { placa } = useParams<{ placa: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["vehicle-detail", placa],
    queryFn: () => searchBigQuery(placa!),
    enabled: !!placa,
    staleTime: 5 * 60 * 1000,
  });

  const vehiculos = data ? consolidateVehiculos(data) : [];
  const vehiculo = vehiculos.find(
    (v) => v.placa.toUpperCase() === placa?.toUpperCase()
  ) || vehiculos[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-header border-b border-sidebar-border sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoSuperbid} alt="Superbid Exchange" className="h-7 sm:h-8 brightness-0 invert" />
            <div className="h-6 w-px bg-sidebar-border" />
            <div>
              <p className="text-xs font-semibold text-primary-foreground/90 leading-tight">Portal de Vehículos</p>
              <p className="text-[10px] text-primary-foreground/50 leading-tight">Consulta & Gestión</p>
            </div>
          </div>
          <img src={logoGmf} alt="GM Financial" className="h-10 sm:h-12 brightness-0 invert" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="space-y-5">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Volver
          </Button>

          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Detalle del Vehículo — {placa?.toUpperCase()}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Resumen completo del estado y trámites
            </p>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-muted-foreground">Consultando datos...</span>
            </div>
          )}

          {isError && (
            <div className="text-center py-12">
              <p className="text-destructive">Error: {(error as Error).message}</p>
            </div>
          )}

          {!isLoading && !vehiculo && !isError && (
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No se encontró información para esta placa</p>
            </div>
          )}

          {vehiculo && <VehicleCard vehiculo={vehiculo} />}
        </div>
      </main>

      <footer className="border-t border-border py-4 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">© 2025 Superbid Exchange · GM Financial Colombia S.A.</p>
          <div className="flex items-center gap-3">
            <img src={logoSuperbid} alt="Superbid" className="h-4 opacity-30" />
            <img src={logoGmf} alt="GMF" className="h-4 opacity-30" />
          </div>
        </div>
      </footer>
    </div>
  );
};

export default VehicleDetail;
