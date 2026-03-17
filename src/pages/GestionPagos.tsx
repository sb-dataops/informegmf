import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PaymentForm from "@/components/PaymentForm";
import DocumentUpload from "@/components/DocumentUpload";
import MassPaymentUpload from "@/components/MassPaymentUpload";
import { fetchAllPagos } from "@/services/pagosService";
import { listDocumentos, sumValorSoportesByPlaca } from "@/services/documentosService";
import { formatCurrency, searchBigQuery } from "@/services/bigqueryService";
import { calculateSaldoPendiente } from "@/lib/payment-utils";
import { buildAllowedPlacasFromRelatorio, isCondicionalRechazado, normalizePlaca } from "@/lib/vehicle-filters";
import { ArrowLeft, DollarSign, Search, Loader2, FileText } from "lucide-react";
import logoSuperbid from "@/assets/logo-superbid.png";
import logoGmf from "@/assets/logo-gmf.png";

const getTabFromQuery = (tab: string | null): "pagos" | "documentos" => (tab === "documentos" ? "documentos" : "pagos");

const GestionPagos = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"pagos" | "documentos">(() => getTabFromQuery(searchParams.get("tab")));
  const [docSearch, setDocSearch] = useState("");
  const [docSearchTerm, setDocSearchTerm] = useState("");
  const [selectedComprador, setSelectedComprador] = useState<{ documento: string; nombre: string } | null>(null);

  useEffect(() => {
    const tabFromQuery = getTabFromQuery(searchParams.get("tab"));
    setActiveTab((current) => (current === tabFromQuery ? current : tabFromQuery));
  }, [searchParams]);

  const handleTabChange = (tab: "pagos" | "documentos") => {
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tab);
    setSearchParams(nextParams, { replace: true });
  };

  const { data: pagos = [], refetch: refetchPagos } = useQuery({
    queryKey: ["all-pagos"],
    queryFn: fetchAllPagos,
  });

  const { data: documentos = [] } = useQuery({
    queryKey: ["all-documentos"],
    queryFn: () => listDocumentos({}),
  });

  const { data: searchResult, isLoading: searchingDoc } = useQuery({
    queryKey: ["doc-search", docSearchTerm],
    queryFn: () => searchBigQuery(docSearchTerm),
    enabled: !!docSearchTerm,
  });

  const compradores = searchResult
    ? [...new Map(
        searchResult.relatorio
          .filter((r) => r.documento && !isCondicionalRechazado(r.estado))
          .map((r) => [r.documento, { documento: r.documento!, nombre: r.comprador || "Sin nombre" }]),
      ).values()]
    : [];


  const allowedSearchPlacas = useMemo(
    () => (searchResult ? buildAllowedPlacasFromRelatorio(searchResult.relatorio) : new Set<string>()),
    [searchResult],
  );

  const pagosVisibles = useMemo(() => {
    if (!searchResult) return pagos;
    return pagos.filter((pago) => allowedSearchPlacas.has(normalizePlaca(pago.placa)));
  }, [allowedSearchPlacas, pagos, searchResult]);

  const handleDocSearch = () => {
    if (docSearch.trim()) {
      setSelectedComprador(null);
      setDocSearchTerm(docSearch.trim());
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
              <p className="text-[10px] text-primary-foreground/50 leading-tight">Gestión de Pagos & Documentos</p>
            </div>
          </div>
          <img src={logoGmf} alt="GM Financial" className="h-10 sm:h-12 brightness-0 invert" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Volver al Dashboard
        </Button>

        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Pagos y Documentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Actualiza información de pagos y carga documentos soporte</p>
        </div>

        <div className="flex gap-2 border-b border-border pb-0">
          <button
            onClick={() => handleTabChange("pagos")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "pagos"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <DollarSign className="h-4 w-4 inline mr-1.5" />
            Pagos
          </button>
          <button
            onClick={() => handleTabChange("documentos")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "documentos"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4 inline mr-1.5" />
            Documentos
          </button>
        </div>

        {activeTab === "pagos" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <PaymentForm onSaved={() => refetchPagos()} />
              <MassPaymentUpload onCompleted={() => refetchPagos()} />
            </div>

            <Card className="border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Pagos Registrados</CardTitle>
              </CardHeader>
              <CardContent>
                {pagosVisibles.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No hay pagos registrados aún</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Placa</TableHead>
                          <TableHead>Subasta</TableHead>
                          <TableHead className="text-right">Prorrateo + Gastos</TableHead>
                          <TableHead className="text-right">Total Pagos</TableHead>
                          <TableHead className="text-right">Soportes</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                          <TableHead>Fecha Límite</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagosVisibles.map((p) => {
                          const soportes = sumValorSoportesByPlaca(documentos, p.placa);
                          const saldo = calculateSaldoPendiente(p.total_pagos || 0, soportes);
                          return (
                            <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/vehiculo/${p.placa}`)}>
                              <TableCell className="font-medium text-primary">{p.placa}</TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap">{p.subasta || "—"}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{formatCurrency(p.total_prorrateo_gastos)}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{formatCurrency(p.total_pagos)}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{formatCurrency(soportes)}</TableCell>
                              <TableCell className={`text-right font-medium whitespace-nowrap ${saldo > 0 ? "text-destructive" : "text-accent-foreground"}`}>
                                {formatCurrency(saldo)}
                              </TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap">
                                {p.fecha_limite_pago ? new Date(p.fecha_limite_pago).toLocaleDateString("es-CO") : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "documentos" && (
          <div className="space-y-6">
            <Card className="border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Buscar Comprador</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Buscar por cédula/NIT, nombre o placa..."
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleDocSearch()}
                  />
                  <Button onClick={handleDocSearch} disabled={searchingDoc} variant="secondary" className="shrink-0">
                    {searchingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {compradores.length > 0 && !selectedComprador && (
                  <div className="space-y-2">
                    {compradores.map((c) => (
                      <button
                        key={c.documento}
                        onClick={() => setSelectedComprador(c)}
                        className="w-full text-left p-3 rounded-lg bg-muted/50 border border-border hover:border-primary/30 transition-colors"
                      >
                        <p className="font-medium text-foreground">{c.nombre}</p>
                        <p className="text-sm text-muted-foreground">{c.documento}</p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedComprador && (
              <DocumentUpload
                documentoComprador={selectedComprador.documento}
                compradorNombre={selectedComprador.nombre}
              />
            )}
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

export default GestionPagos;

