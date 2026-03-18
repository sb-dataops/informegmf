import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchBigQuery, consolidateVehiculos, extractCompradores, formatCurrency } from "@/services/bigqueryService";
import { fetchPagoByPlaca, updateObservacionPago } from "@/services/pagosService";
import { groupDocumentosByArchivo, listDocumentos, sumValorSoportesByPlaca } from "@/services/documentosService";
import { calculateSaldoPendiente, calculateTotalPagos, parseCurrencyLikeValue } from "@/lib/payment-utils";
import VehicleCard from "@/components/VehicleCard";
import BuyerHeader from "@/components/BuyerHeader";
import PaymentForm from "@/components/PaymentForm";
import DocumentUpload from "@/components/DocumentUpload";
import VehicleSupportViewer from "@/components/VehicleSupportViewer";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import logoSuperbid from "@/assets/logo-superbid.png";
import logoGmf from "@/assets/logo-gmf.png";

const VehicleDetail = () => {
  const { placa } = useParams<{ placa: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["vehicle-detail", placa],
    queryFn: () => searchBigQuery(placa!),
    enabled: !!placa,
    staleTime: 5 * 60 * 1000,
  });

  const vehiculos = data ? consolidateVehiculos(data, undefined, true) : [];
  const vehiculo = vehiculos.find(
    (v) => v.placa.toUpperCase() === placa?.toUpperCase(),
  ) || vehiculos[0];

  const { data: pagoData, refetch: refetchPago } = useQuery({
    queryKey: ["pago-detail", placa],
    queryFn: () => fetchPagoByPlaca(placa!),
    enabled: !!placa,
  });

  const { data: documentos = [], refetch: refetchDocumentos } = useQuery({
    queryKey: ["documentos-vehiculo", vehiculo?.documento, vehiculo?.placa],
    queryFn: () => listDocumentos({ documento_comprador: vehiculo?.documento || undefined, placa: vehiculo?.placa || undefined }),
    enabled: !!vehiculo?.documento && !!vehiculo?.placa,
  });

  const mayorOferta = parseCurrencyLikeValue(vehiculo?.mayor_oferta);
  const totalPagosCalculado = calculateTotalPagos(mayorOferta, Number(pagoData?.total_prorrateo_gastos || 0));
  const documentosAgrupados = useMemo(() => groupDocumentosByArchivo(documentos), [documentos]);
  const totalSoportes = useMemo(() => {
    if (!vehiculo?.placa) return 0;
    return sumValorSoportesByPlaca(documentos, vehiculo.placa);
  }, [documentos, vehiculo?.placa]);
  const saldoPendiente = calculateSaldoPendiente(totalPagosCalculado, totalSoportes);

  const compradores = data ? extractCompradores(data) : [];
  const comprador = vehiculo?.documento
    ? compradores.find((c) => c.documento === vehiculo.documento) || null
    : null;

  const handleObservacionPagoChange = async (placaVal: string, value: string) => {
    try {
      await updateObservacionPago(placaVal, value);
      toast.success("Observación de pago actualizada");
      refetchPago();
    } catch {
      toast.error("Error al actualizar observación");
    }
  };

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

          {comprador && vehiculo && (
            <BuyerHeader comprador={comprador} vehicleCount={vehiculos.length} />
          )}

          {vehiculo && <VehicleCard vehiculo={vehiculo} />}

          {vehiculo && (
            <VehicleSupportViewer
              documents={documentosAgrupados}
              totalPagos={totalPagosCalculado}
              mayorOferta={mayorOferta}
              prorrateoGastos={Number(pagoData?.total_prorrateo_gastos || 0)}
              totalSoportes={totalSoportes}
              saldoPendiente={saldoPendiente}
              placa={vehiculo.placa}
              fechaLimitePago={pagoData?.fecha_limite_pago}
              observacionPago={(pagoData as any)?.observacion_pago}
              onObservacionPagoChange={handleObservacionPagoChange}
            />
          )}

          {vehiculo && (
            <PaymentForm
              initialPlaca={vehiculo.placa}
              initialSubasta={vehiculo.subasta || undefined}
              initialMayorOferta={mayorOferta}
              onSaved={() => refetchPago()}
            />
          )}

          {vehiculo && vehiculo.documento && (
            <DocumentUpload
              documentoComprador={vehiculo.documento}
              placa={vehiculo.placa}
              compradorNombre={vehiculo.comprador || undefined}
            />
          )}
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
