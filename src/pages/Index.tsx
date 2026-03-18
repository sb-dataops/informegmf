import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SearchBar from "@/components/SearchBar";
import BuyerHeader from "@/components/BuyerHeader";
import VehicleCard from "@/components/VehicleCard";
import VehicleSupportViewer from "@/components/VehicleSupportViewer";
import DashboardStats from "@/components/DashboardStats";
import PaymentDeadlineAlerts from "@/components/PaymentDeadlineAlerts";
import { searchBigQuery, extractCompradores, consolidateVehiculos, extractVehiculosBySubasta } from "@/services/bigqueryService";
import { fetchAllPagos, updateObservacionPago } from "@/services/pagosService";
import { groupDocumentosByArchivo, listDocumentos, sumValorSoportesByPlaca } from "@/services/documentosService";
import { calculateSaldoPendiente, calculateTotalPagos, parseCurrencyLikeValue } from "@/lib/payment-utils";
import { Comprador } from "@/types";
import { Users, Search, ArrowLeft, Loader2, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import logoSuperbid from "@/assets/logo-superbid.png";
import logoGmf from "@/assets/logo-gmf.png";

const Index = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedComprador, setSelectedComprador] = useState<Comprador | null>(null);

  const {
    data: searchResult,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["bigquery-search", searchTerm],
    queryFn: () => searchBigQuery(searchTerm),
    enabled: !!searchTerm,
    staleTime: 5 * 60 * 1000,
  });

  const compradores = searchResult ? extractCompradores(searchResult) : [];
  const hasSearched = !!searchTerm;
  const vehiculosSubasta = searchResult ? extractVehiculosBySubasta(searchResult, searchTerm) : [];
  const totalCompradoresSubasta = useMemo(
    () => new Set(vehiculosSubasta.map((vehiculo) => vehiculo.documento).filter(Boolean)).size,
    [vehiculosSubasta],
  );
  const showingSubastaDetail = hasSearched && !isLoading && vehiculosSubasta.length > 0;

  const handleSearch = () => {
    if (!query.trim()) return;
    setSelectedComprador(null);
    setSearchTerm(query.trim());
  };

  const effectiveComprador = showingSubastaDetail
    ? null
    : selectedComprador || (compradores.length === 1 && searchResult ? compradores[0] : null);
  const effectiveVehiculos = showingSubastaDetail
    ? vehiculosSubasta
    : effectiveComprador && searchResult
      ? consolidateVehiculos(searchResult, effectiveComprador.documento)
      : [];

  const showingDetail = (!!effectiveComprador && !!searchResult) || showingSubastaDetail;
  const showingResults = hasSearched && !isLoading && compradores.length > 1 && !selectedComprador && !showingSubastaDetail;

  const { data: pagos = [], isLoading: isPagosLoading } = useQuery({
    queryKey: ["pagos-comprador"],
    queryFn: fetchAllPagos,
    enabled: showingDetail,
    staleTime: 5 * 60 * 1000,
  });

  const { data: documentosComprador = [], isLoading: isDocumentosLoading } = useQuery({
    queryKey: ["documentos-comprador", effectiveComprador?.documento],
    queryFn: () => listDocumentos({ documento_comprador: effectiveComprador?.documento || undefined }),
    enabled: !!effectiveComprador?.documento && !!searchResult && !showingSubastaDetail,
    staleTime: 60 * 1000,
  });

  const { data: documentosSubasta = [], isLoading: isDocumentosSubastaLoading } = useQuery({
    queryKey: ["documentos-subasta", searchTerm],
    queryFn: () => listDocumentos({}),
    enabled: showingSubastaDetail,
    staleTime: 60 * 1000,
  });

  const pagosPorPlaca = useMemo(
    () => new Map(pagos.map((pago) => [pago.placa.toUpperCase(), pago])),
    [pagos],
  );

  const documentosFuente = showingSubastaDetail ? documentosSubasta : documentosComprador;
  const documentosAgrupados = useMemo(
    () => groupDocumentosByArchivo(documentosFuente),
    [documentosFuente],
  );

  const isFinancialDataLoading = isPagosLoading || (showingSubastaDetail ? isDocumentosSubastaLoading : isDocumentosLoading);

  const selectComprador = (c: Comprador) => {
    setSelectedComprador(c);
  };

  const goBack = () => {
    setSelectedComprador(null);
    setSearchTerm("");
    setQuery("");
  };

  const goBackToResults = () => {
    setSelectedComprador(null);
  };

  const queryClient = useQueryClient();
  const handleObservacionPagoChange = useCallback(async (placaVal: string, value: string) => {
    try {
      await updateObservacionPago(placaVal, value);
      toast.success("Observación de pago actualizada");
      queryClient.invalidateQueries({ queryKey: ["pagos-comprador"] });
    } catch {
      toast.error("Error al actualizar observación");
    }
  }, [queryClient]);

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
        {!showingDetail && (
          <div className="space-y-6">
            <div className="text-center space-y-2 pt-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                Portal Consolidado de Vehículos
              </h2>
              <p className="text-muted-foreground text-sm">
                Busca por nombre, cédula/NIT, placa o subasta para consultar trámites y retiros
              </p>
            </div>

            <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} />

            {isLoading && (
              <div className="flex items-center justify-center py-12 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-muted-foreground">Consultando...</span>
              </div>
            )}

            {isError && (
              <div className="text-center py-12">
                <p className="text-destructive">Error: {(error as Error).message}</p>
              </div>
            )}

            {!hasSearched && (
              <div className="flex justify-center gap-3">
                <Button onClick={() => navigate("/gestion-pagos")} variant="outline" className="gap-2">
                  <DollarSign className="h-4 w-4" />
                  Gestión y Soportes de Pago
                </Button>
              </div>
            )}

            {!hasSearched && <PaymentDeadlineAlerts />}
            {!hasSearched && <DashboardStats />}

            {showingResults && (
              <div className="max-w-2xl mx-auto space-y-2">
                <p className="text-sm text-muted-foreground">{compradores.length} comprador(es) encontrado(s)</p>
                {compradores.map((c) => (
                  <button
                    key={c.documento}
                    onClick={() => selectComprador(c)}
                    className="w-full text-left bg-card rounded-xl border border-border shadow-card hover:shadow-card-hover transition-all p-4 flex items-center gap-3"
                  >
                    <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                      <Users className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{c.nombre}</p>
                      <p className="text-sm text-muted-foreground">{c.documento}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {hasSearched && !isLoading && compradores.length === 0 && vehiculosSubasta.length === 0 && !isError && (
              <div className="text-center py-12">
                <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No se encontraron resultados para "{searchTerm}"</p>
              </div>
            )}
          </div>
        )}

        {showingDetail && (
          <div className="space-y-5">
            <Button
              variant="ghost"
              onClick={showingSubastaDetail ? goBack : compradores.length > 1 ? goBackToResults : goBack}
              className="text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {showingSubastaDetail ? "Volver al inicio" : compradores.length > 1 ? "Volver a resultados" : "Volver al inicio"}
            </Button>

            {showingSubastaDetail ? (
              <div className="bg-card rounded-xl border border-border shadow-card p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Subasta {searchTerm}</h2>
                    <p className="text-sm text-muted-foreground">
                      {effectiveVehiculos.length} vehículo(s) encontrado(s) con información consolidada
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span>🚗 {effectiveVehiculos.length} placa(s)</span>
                    <span>👤 {totalCompradoresSubasta} comprador(es)</span>
                  </div>
                </div>
              </div>
            ) : effectiveComprador ? (
              <BuyerHeader comprador={effectiveComprador} vehicleCount={effectiveVehiculos.length} />
            ) : null}

            <div className="space-y-4">
              {effectiveVehiculos.map((v) => {
                const pagoVehiculo = pagosPorPlaca.get(v.placa.toUpperCase());
                const totalPagos = calculateTotalPagos(
                  parseCurrencyLikeValue(v.mayor_oferta),
                  Number(pagoVehiculo?.total_prorrateo_gastos || 0),
                );
                const totalSoportes = sumValorSoportesByPlaca(documentosFuente, v.placa);
                const saldoPendiente = calculateSaldoPendiente(totalPagos, totalSoportes);

                return (
                  <VehicleCard
                    key={v.placa}
                    vehiculo={v}
                    extraContent={
                      isFinancialDataLoading ? (
                        <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          Cargando pagos y soportes...
                        </div>
                      ) : (
                        <VehicleSupportViewer
                          documents={documentosAgrupados}
                          totalPagos={totalPagos}
                          mayorOferta={parseCurrencyLikeValue(v.mayor_oferta)}
                          prorrateoGastos={Number(pagoVehiculo?.total_prorrateo_gastos || 0)}
                          totalSoportes={totalSoportes}
                          saldoPendiente={saldoPendiente}
                          placa={v.placa}
                          fechaLimitePago={pagoVehiculo?.fecha_limite_pago}
                          observacionPago={(pagoVehiculo as any)?.observacion_pago}
                          onObservacionPagoChange={handleObservacionPagoChange}
                        />
                      )
                    }
                  />
                );
              })}
              {effectiveVehiculos.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {showingSubastaDetail ? "No se encontraron vehículos para esta subasta" : "No se encontraron vehículos con placa para este comprador"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
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

export default Index;
