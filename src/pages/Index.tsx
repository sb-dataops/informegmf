import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SearchBar from "@/components/SearchBar";
import BuyerHeader from "@/components/BuyerHeader";
import VehicleCard from "@/components/VehicleCard";
import { buscarCompradores, buscarPorPlaca, getVehiculosByComprador } from "@/data/mockData";
import { Comprador } from "@/types";
import { Car, Users, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [query, setQuery] = useState("");
  const [selectedComprador, setSelectedComprador] = useState<Comprador | null>(null);
  const [searchResults, setSearchResults] = useState<Comprador[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = () => {
    if (!query.trim()) return;
    setHasSearched(true);
    setSelectedComprador(null);

    // Try plate search first
    const plateResult = buscarPorPlaca(query);
    if (plateResult) {
      setSelectedComprador(plateResult.comprador);
      setSearchResults([]);
      return;
    }

    // Search by name/ID
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
      {/* Top bar */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center">
              <Car className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">Portal Vehículos</h1>
              <p className="text-xs text-muted-foreground leading-tight">Consulta & Gestión</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Search */}
        {!selectedComprador && (
          <div className="space-y-8">
            <div className="text-center space-y-2 pt-8">
              <h2 className="text-3xl font-bold text-foreground tracking-tight">
                Buscar Comprador o Vehículo
              </h2>
              <p className="text-muted-foreground">
                Ingresa el nombre, cédula/NIT o placa para consultar
              </p>
            </div>

            <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} />

            {/* Search results list */}
            {searchResults.length > 0 && (
              <div className="max-w-2xl mx-auto space-y-2">
                <p className="text-sm text-muted-foreground">{searchResults.length} resultado(s)</p>
                {searchResults.map((c) => (
                  <button
                    key={c.id_comprador}
                    onClick={() => selectComprador(c)}
                    className="w-full text-left bg-card rounded-xl border border-border shadow-card hover:shadow-card-hover transition-all p-4 flex items-center gap-3"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
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

            {/* Quick stats */}
            {!hasSearched && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto pt-4">
                <div className="bg-card rounded-xl border border-border p-4 text-center shadow-card">
                  <p className="text-2xl font-bold text-primary">2</p>
                  <p className="text-sm text-muted-foreground">Compradores</p>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 text-center shadow-card">
                  <p className="text-2xl font-bold text-primary">4</p>
                  <p className="text-sm text-muted-foreground">Vehículos</p>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 text-center shadow-card">
                  <p className="text-2xl font-bold text-primary">6</p>
                  <p className="text-sm text-muted-foreground">Pagos</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Detail view */}
        {selectedComprador && (
          <div className="space-y-5">
            <Button variant="ghost" onClick={goBack} className="text-muted-foreground hover:text-foreground -ml-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Volver a búsqueda
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
    </div>
  );
};

export default Index;
