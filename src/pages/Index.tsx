import { useState } from "react";
import SearchBar from "@/components/SearchBar";
import BuyerHeader from "@/components/BuyerHeader";
import VehicleCard from "@/components/VehicleCard";
import DashboardStats from "@/components/DashboardStats";
import { buscarCompradores, buscarPorPlaca, getVehiculosByComprador } from "@/data/mockData";
import { Comprador } from "@/types";
import { Users, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoSuperbid from "@/assets/logo-superbid.png";
import logoGmf from "@/assets/logo-gmf.png";

const Index = () => {
  const [query, setQuery] = useState("");
  const [selectedComprador, setSelectedComprador] = useState<Comprador | null>(null);
  const [searchResults, setSearchResults] = useState<Comprador[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = () => {
    if (!query.trim()) return;
    setHasSearched(true);
    setSelectedComprador(null);

    const plateResult = buscarPorPlaca(query);
    if (plateResult) {
      setSelectedComprador(plateResult.comprador);
      setSearchResults([]);
      return;
    }

    const results = buscarCompradores(query);
    if (results.length === 1) {
      setSelectedComprador(results[0]);
      setSearchResults([]);
    } else {
      setSearchResults(results);
    }
  };

  const selectComprador = (c: Comprador) => {
    setSelectedComprador(c);
    setSearchResults([]);
  };

  const goBack = () => {
    setSelectedComprador(null);
    setSearchResults([]);
    setHasSearched(false);
    setQuery("");
  };

  const vehiculos = selectedComprador
    ? getVehiculosByComprador(selectedComprador.id_comprador)
    : [];

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
          <img src={logoGmf} alt="GM Financial" className="h-6 sm:h-7 brightness-0 invert opacity-70" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Dashboard / Search */}
        {!selectedComprador && (
          <div className="space-y-6">
            <div className="text-center space-y-2 pt-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                Portal Consolidado de Vehículos
              </h2>
              <p className="text-muted-foreground text-sm">
                Busca por nombre, cédula/NIT o placa para consultar pagos y trámites
              </p>
            </div>

            <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} />

            {/* Stats dashboard */}
            {!hasSearched && <DashboardStats />}

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="max-w-2xl mx-auto space-y-2">
                <p className="text-sm text-muted-foreground">{searchResults.length} resultado(s)</p>
                {searchResults.map((c) => (
                  <button
                    key={c.id_comprador}
                    onClick={() => selectComprador(c)}
                    className="w-full text-left bg-card rounded-xl border border-border shadow-card hover:shadow-card-hover transition-all p-4 flex items-center gap-3"
                  >
                    <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                      <Users className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{c.nombre_completo}</p>
                      <p className="text-sm text-muted-foreground">{c.id_comprador}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {hasSearched && searchResults.length === 0 && !selectedComprador && (
              <div className="text-center py-12">
                <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No se encontraron resultados para "{query}"</p>
              </div>
            )}
          </div>
        )}

        {/* Detail view */}
        {selectedComprador && (
          <div className="space-y-5">
            <Button variant="ghost" onClick={goBack} className="text-muted-foreground hover:text-foreground -ml-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Volver al inicio
            </Button>

            <BuyerHeader comprador={selectedComprador} vehicleCount={vehiculos.length} />

            <div className="space-y-4">
              {vehiculos.map((v) => (
                <VehicleCard key={v.placa} vehiculo={v} />
              ))}
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
