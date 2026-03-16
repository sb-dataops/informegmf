import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SearchBar from "@/components/SearchBar";
import BuyerHeader from "@/components/BuyerHeader";
import VehicleCard from "@/components/VehicleCard";
import VehicleSupportViewer from "@/components/VehicleSupportViewer";
import DashboardStats from "@/components/DashboardStats";
import { searchBigQuery, extractCompradores, consolidateVehiculos } from "@/services/bigqueryService";
import { fetchAllPagos } from "@/services/pagosService";
import { groupDocumentosByArchivo, listDocumentos, sumValorSoportesByPlaca } from "@/services/documentosService";
import { calculateSaldoPendiente, calculateTotalPagos, parseCurrencyLikeValue } from "@/lib/payment-utils";
import { Comprador } from "@/types";
import { Users, Search, ArrowLeft, Loader2, DollarSign, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

  const handleSearch = () => {
    if (!query.trim()) return;
    setSelectedComprador(null);
    setSearchTerm(query.trim());
  };

  // Auto-select if only 1 buyer found
  const effectiveComprador = selectedComprador || (compradores.length === 1 && searchResult ? compradores[0] : null);

  const effectiveVehiculos =
    effectiveComprador && searchResult ? consolidateVehiculos(searchResult, effectiveComprador.documento) : [];

  const { data: pagos = [], isLoading: isPagosLoading } = useQuery({
    queryKey: ["pagos-comprador"],
    queryFn: fetchAllPagos,
    enabled: showingDetail,
    staleTime: 5 * 60 * 1000,
  });

  const { data: documentosComprador = [], isLoading: isDocumentosLoading } = useQuery({
    queryKey: ["documentos-comprador", effectiveComprador?.documento],
    queryFn: () => listDocumentos({ documento_comprador: effectiveComprador?.documento || undefined }),
    enabled: !!effectiveComprador?.documento && showingDetail,
    staleTime: 60 * 1000,
  });

  const pagosPorPlaca = useMemo(
    () => new Map(pagos.map((pago) => [pago.placa.toUpperCase(), pago])),
    [pagos],
  );

  const documentosAgrupados = useMemo(
    () => groupDocumentosByArchivo(documentosComprador),
    [documentosComprador],
  );

  const isFinancialDataLoading = isPagosLoading || isDocumentosLoading;

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

  const hasSearched = !!searchTerm;
  const showingDetail = !!effectiveComprador && !!searchResult;
  const showingResults = hasSearched && !isLoading && compradores.length > 1 && !selectedComprador;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
        {/* Dashboard / Search */}
        {!showingDetail && (
          <div className="space-y-6">
            <div className="text-center space-y-2 pt-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                Portal Consolidado de Vehículos
              </h2>
              <p className="text-muted-foreground text-sm">
                Busca por nombre, cédula/NIT o placa para consultar trámites y retiros
              </p>
            </div>

            <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} />

            {/* Loading */}
            {isLoading && (
              <div className="flex items-center justify-center py-12 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-muted-foreground">Consultando...</span>
              </div>
            )}

            {/* Error */}
            {isError && (
              <div className="text-center py-12">
                <p className="text-destructive">Error: {(error as Error).message}</p>
              </div>
            )}

            {/* Quick actions */}
            {!hasSearched && (
              <div className="flex justify-center gap-3">
                <Button onClick={() => navigate("/gestion-pagos")} variant="outline" className="gap-2">
                  <DollarSign className="h-4 w-4" />
                  Gestión de Pagos
                </Button>
                <Button onClick={() => navigate("/gestion-pagos")} variant="outline" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Cargar Documentos
                </Button>
              </div>
            )}

            {/* Stats dashboard */}
            {!hasSearched && <DashboardStats />}

            {/* Multiple results */}
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

            {/* No results */}
            {hasSearched && !isLoading && compradores.length === 0 && !isError && (
              <div className="text-center py-12">
                <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No se encontraron resultados para "{searchTerm}"</p>
              </div>
            )}
          </div>
        )}

        {/* Detail view */}
        {showingDetail && (
          <div className="space-y-5">
            <Button
              variant="ghost"
              onClick={compradores.length > 1 ? goBackToResults : goBack}
              className="text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {compradores.length > 1 ? "Volver a resultados" : "Volver al inicio"}
            </Button>

            <BuyerHeader comprador={effectiveComprador} vehicleCount={effectiveVehiculos.length} />

            <div className="space-y-4">
              {effectiveVehiculos.map((v) => (
                <VehicleCard key={v.placa} vehiculo={v} />
              ))}
              {effectiveVehiculos.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No se encontraron vehículos con placa para este comprador</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
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
