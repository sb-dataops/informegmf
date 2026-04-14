import { useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFilteredLots } from "@/services/bigqueryService";
import { markPaymentReviewAsReviewed } from "@/services/paymentReviewService";
import type { FilteredLotRow } from "@/types";
import { ArrowLeft, Loader2, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/services/bigqueryService";
import { addBusinessDays } from "@/lib/business-days";
import logoSuperbid from "@/assets/logo-superbid.png";
import logoGmf from "@/assets/logo-gmf.png";
import * as XLSX from "xlsx";

const CATEGORY_LABELS: Record<string, string> = {
  total: "Total Lotes",
  aprobados: "Aprobados",
  pagos_pendientes_revision: "Lotes con pagos pendientes",
  soportes_pendientes_revision: "Pagos pendientes por revisar",
  pendientes_pago: "Lotes con pagos pendientes",
  pendientes_traspaso: "Pendientes de Traspaso",
  pendientes_retiro: "Pendientes de Retiro",
  vehiculos_entregados: "Vehículos Entregados",
  pendientes_filtros: "Pendientes por aprobación de filtros",
};

const isRetiroCategory = (cat?: string) => cat === "pendientes_traspaso" || cat === "pendientes_retiro" || cat === "vehiculos_entregados";
const isPendientesPagoCategory = (cat?: string) => cat === "pendientes_pago";
function downloadExcel(rows: FilteredLotRow[], category: string) {
  const data = rows.map((r) => ({
    Subasta: r.subasta || "",
    Placa: r.placa || "",
    Comprador: r.comprador || "",
    Documento: r.documento || "",
    Lote: r.lote || "",
    Tramitador: r.tramitador || "",
    "Fecha entrega docs al vendedor": r.documentosConTramitador || "",
    Estado: r.estadoTraspaso || r.estadoRetiro || r.estado || "",
    "Fecha Paz y Salvo": r.fechaPazSalvo || "",
    "Comentarios Superbid": r.comentarios || "",
    "Observación Tramitador": r.observacionTramitador || "",
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, `${category}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const FilteredLots = () => {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const isPendingPaymentsCategory = category === "pagos_pendientes_revision" || category === "soportes_pendientes_revision";
  const showPagoColumns = isPendientesPagoCategory(category);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["bigquery-filter", category],
    queryFn: () => fetchFilteredLots(category!),
    enabled: !!category,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
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

  const filteredRows = useMemo(() => {
    const baseRows = normalizedSearch
      ? rows.filter((r) =>
          [r.placa, r.comprador, r.subasta, r.descripcion, r.tramitador]
            .filter(Boolean)
            .some((val) => val!.toLowerCase().includes(normalizedSearch)),
        )
      : rows;

    if (!isPendingPaymentsCategory) {
      return baseRows;
    }

    return [...baseRows].sort((a, b) => {
      const priorityA = a.reviewPriority ?? (a.hasPendingReview ? 0 : 1);
      const priorityB = b.reviewPriority ?? (b.hasPendingReview ? 0 : 1);
      if (priorityA !== priorityB) return priorityA - priorityB;

      const subastaA = a.subasta || "Sin subasta";
      const subastaB = b.subasta || "Sin subasta";
      const subastaCompare = subastaA.localeCompare(subastaB, "es", { sensitivity: "base" });
      if (subastaCompare !== 0) return subastaCompare;

      const latestA = a.ultimoSoporteAt ? new Date(a.ultimoSoporteAt).getTime() : 0;
      const latestB = b.ultimoSoporteAt ? new Date(b.ultimoSoporteAt).getTime() : 0;
      if (latestA !== latestB) return latestB - latestA;

      return (a.placa || "").localeCompare(b.placa || "", "es", { sensitivity: "base" });
    });
  }, [isPendingPaymentsCategory, normalizedSearch, rows]);

  const grouped = useMemo(
    () => filteredRows.reduce<Record<string, typeof filteredRows>>((acc, row) => {
      const key = row.subasta || "Sin subasta";
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {}),
    [filteredRows],
  );

  const { pendingReviewCount, pendingPaymentCount } = useMemo(
    () => ({
      pendingReviewCount: rows.filter((row) => row.hasPendingReview).length,
      pendingPaymentCount: rows.filter((row) => row.hasPendingPayment).length,
    }),
    [rows],
  );

  const handleReviewCheck = (item: FilteredLotRow, checked: boolean | string) => {
    if (!checked || !item.placa || !item.hasPendingReview || reviewMutation.isPending) return;
    reviewMutation.mutate(item.placa);
  };

  const showRetiroColumns = isRetiroCategory(category);

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
              {category === "pagos_pendientes_revision" && (
                <p className="text-sm text-muted-foreground mt-2">
                  Aquí se listan primero los lotes con soportes nuevos por revisar y también los lotes pendientes de pago.
                </p>
              )}
            </div>
            {showRetiroColumns && !isLoading && rows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadExcel(filteredRows, category || "export")}
                className="gap-2 shrink-0"
              >
                <Download className="h-4 w-4" />
                Descargar Excel
              </Button>
            )}
          </div>

          {category === "pagos_pendientes_revision" && !isLoading && !isError && rows.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-xs text-muted-foreground">Con soportes pendientes por revisar</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{pendingReviewCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-xs text-muted-foreground">Pendientes de pago</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{pendingPaymentCount}</p>
              </div>
            </div>
          )}

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
                          {isPendingPaymentsCategory && (
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-36">Revisado</th>
                          )}
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Placa</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Comprador</th>
                          {isPendingPaymentsCategory && (
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Tipo</th>
                          )}
                          {isPendingPaymentsCategory && (
                            <>
                              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Fecha aprobación filtros</th>
                              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Fecha límite pago</th>
                            </>
                          )}
                          {showPagoColumns && (
                            <>
                              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Fecha aprobación filtros</th>
                              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Fecha límite pago</th>
                              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Observaciones pagos</th>
                            </>
                          )}
                          {!showPagoColumns && !isPendingPaymentsCategory && showRetiroColumns && (
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Fecha entrega docs al vendedor</th>
                          )}
                          {category === "vehiculos_entregados" && (
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Fecha de entrega</th>
                          )}
                          {!showPagoColumns && !isPendingPaymentsCategory && !showRetiroColumns && (
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Descripción</th>
                          )}
                          {!isPendingPaymentsCategory && !showPagoColumns && category !== "pendientes_filtros" && (
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Tramitador</th>
                          )}
                          {!showRetiroColumns && !showPagoColumns && (
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Estado</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => {
                          const isUpdating = reviewMutation.isPending && reviewMutation.variables === item.placa;
                          const fechaLimitePago = (showPagoColumns || isPendingPaymentsCategory) && item.fechaAprobacionFiltros
                            ? addBusinessDays(item.fechaAprobacionFiltros, 3)
                            : null;

                          return (
                            <tr
                              key={`${item.placa}-${idx}`}
                              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                            >
                              {isPendingPaymentsCategory && (
                                <td className="px-4 py-2.5 align-top">
                                  {item.hasPendingReview ? (
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        checked={false}
                                        disabled={isUpdating}
                                        onCheckedChange={(checked) => handleReviewCheck(item, checked)}
                                        aria-label={`Marcar ${item.placa || "lote"} como revisado`}
                                      />
                                      {isUpdating ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                      ) : (
                                        <span className="text-xs text-muted-foreground">Marcar revisión</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No aplica</span>
                                  )}
                                </td>
                              )}
                              <td className="px-4 py-2.5 font-mono font-semibold align-top">
                                {item.placa ? (
                                  <Link
                                    to={`/vehiculo/${encodeURIComponent(item.placa)}`}
                                    className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                                  >
                                    {item.placa}
                                  </Link>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-foreground align-top">
                                {item.comprador || "—"}
                              </td>
                              {isPendingPaymentsCategory && (
                                <td className="px-4 py-2.5 hidden md:table-cell align-top">
                                  <div className="flex flex-wrap gap-2">
                                    {item.hasPendingReview ? <Badge variant="secondary">Soporte por revisar</Badge> : null}
                                    {item.hasPendingPayment ? <Badge variant="outline">Pendiente de pago</Badge> : null}
                                  </div>
                                </td>
                              )}
                              {isPendingPaymentsCategory && (
                                <>
                                  <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell align-top">
                                    {item.fechaAprobacionFiltros ? formatDate(item.fechaAprobacionFiltros) : "—"}
                                  </td>
                                  <td className="px-4 py-2.5 hidden sm:table-cell align-top">
                                    {fechaLimitePago ? (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                                        {formatDate(fechaLimitePago)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                </>
                              )}
                              {showPagoColumns && (
                                <>
                                  <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell align-top">
                                    {item.fechaAprobacionFiltros ? formatDate(item.fechaAprobacionFiltros) : "—"}
                                  </td>
                                  <td className="px-4 py-2.5 hidden sm:table-cell align-top">
                                    {fechaLimitePago ? (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                                        {formatDate(fechaLimitePago)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell align-top max-w-[260px] truncate">
                                    {item.observacionPago || "—"}
                                  </td>
                                </>
                              )}
                              {category === "vehiculos_entregados" && (
                                <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell align-top">
                                  {item.fechaEntregaVehiculo ? formatDate(item.fechaEntregaVehiculo) : "—"}
                                </td>
                              )}
                              {!showPagoColumns && !isPendingPaymentsCategory && (
                                <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell max-w-[260px] truncate align-top">
                                  {showRetiroColumns
                                    ? (item.documentosConTramitador ? formatDate(item.documentosConTramitador) : "—")
                                    : (item.descripcion || "—")}
                                </td>
                              )}
                              {!isPendingPaymentsCategory && !showPagoColumns && category !== "pendientes_filtros" && (
                                <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell align-top">
                                  {item.tramitador || "—"}
                                </td>
                              )}
                              {!showRetiroColumns && !showPagoColumns && (
                                <td className="px-4 py-2.5 hidden md:table-cell align-top">
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {item.estadoTraspaso || item.estadoRetiro || item.estado || "—"}
                                  </span>
                                </td>
                              )}
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