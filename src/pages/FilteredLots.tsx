import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFilteredLots } from "@/services/bigqueryService";
import { markPaymentReviewAsReviewed } from "@/services/paymentReviewService";
import type { FilteredLotRow } from "@/types";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import logoSuperbid from "@/assets/logo-superbid.png";
import logoGmf from "@/assets/logo-gmf.png";

const CATEGORY_LABELS: Record<string, string> = {
  total: "Total Lotes",
  aprobados: "Aprobados",
  en_proceso: "En Proceso",
  pagos_pendientes_revision: "Pagos pendientes por revisar",
  pendientes_pago: "Pendientes de Pago",
  pendientes_traspaso: "Pendientes de Traspaso",
  pendientes_retiro: "Pendientes de Retiro",
};

const FilteredLots = () => {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const isPaymentReviewCategory = category === "pagos_pendientes_revision";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["bigquery-filter", category],
    queryFn: () => fetchFilteredLots(category!),
    enabled: !!category,
    staleTime: 5 * 60 * 1000,
  });

  const reviewMutation = useMutation({
    mutationFn: (placa: string) => markPaymentReviewAsReviewed(placa),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bigquery-filter", category] }),
        queryClient.invalidateQueries({ queryKey: ["bigquery-stats"] }),
      ]);
    },
  });

  const title = CATEGORY_LABELS[category || ""] || category || "";
  const rows = data?.rows || [];

  const normalizedSearch = search.toLowerCase().trim();
  const filteredRows = normalizedSearch
    ? rows.filter((r) =>
        [r.placa, r.comprador, r.subasta, r.descripcion]
          .filter(Boolean)
          .some((val) => val!.toLowerCase().includes(normalizedSearch))
      )
    : rows;

  const grouped = filteredRows.reduce<Record<string, typeof filteredRows>>((acc, row) => {
    const key = row.subasta || "Sin subasta";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const handleReviewCheck = (item: FilteredLotRow, checked: boolean | string) => {
    if (!checked || !item.placa || reviewMutation.isPending) return;
    reviewMutation.mutate(item.placa);
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
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Volver al inicio
          </Button>

          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isLoading ? "Cargando..." : `${filteredRows.length} lote(s) encontrado(s)`}
              </p>
              {isPaymentReviewCategory && (
                <p className="text-sm text-muted-foreground mt-2">
                  Marca cada lote como revisado para retirarlo de esta bandeja. Si recibe nuevos soportes, volverá a aparecer.
                </p>
              )}
            </div>
          </div>

          {!isLoading && rows.length > 0 && (
            <div className="relative w-full max-w-2xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por placa, comprador o subasta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 h-12 text-sm rounded-xl border-2 border-border bg-card shadow-card focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 transition-all"
              />
            </div>
          )}

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

          {!isLoading && rows.length === 0 && !isError && (
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No se encontraron lotes en esta categoría</p>
            </div>
          )}

          {!isLoading && Object.keys(grouped).length > 0 && (
            <div className="space-y-6">
              {Object.entries(grouped).map(([subasta, items]) => (
                <div key={subasta} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                    {subasta} <span className="text-xs font-normal">({items.length})</span>
                  </h3>
                  <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          {isPaymentReviewCategory && (
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-24">Revisado</th>
                          )}
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Placa</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Comprador</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Descripción</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => {
                          const isUpdating = reviewMutation.isPending && reviewMutation.variables === item.placa;

                          return (
                            <tr
                              key={`${item.placa}-${idx}`}
                              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                            >
                              {isPaymentReviewCategory && (
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={false}
                                      disabled={isUpdating}
                                      onCheckedChange={(checked) => handleReviewCheck(item, checked)}
                                      aria-label={`Marcar ${item.placa || "lote"} como revisado`}
                                    />
                                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                                  </div>
                                </td>
                              )}
                              <td className="px-4 py-2.5 font-mono font-semibold">
                                {item.placa ? (
                                  <Link
                                    to={`/vehiculo/${encodeURIComponent(item.placa)}`}
                                    className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                                  >
                                    {item.placa}
                                  </Link>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-foreground">
                                {item.comprador || "—"}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell max-w-[200px] truncate">
                                {item.descripcion || "—"}
                              </td>
                              <td className="px-4 py-2.5 hidden md:table-cell">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  {item.estadoTraspaso || item.estadoRetiro || item.estado || "—"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
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

export default FilteredLots;
