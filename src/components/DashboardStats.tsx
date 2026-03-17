import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchDashboardStats } from "@/services/bigqueryService";
import { Clock, FileText, Loader2, Truck, Wallet } from "lucide-react";

const DashboardStats = () => {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery({
    queryKey: ["bigquery-stats"],
    queryFn: fetchDashboardStats,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Cargando estadísticas...</span>
      </div>
    );
  }

  const sections = [
    {
      title: "PAGOS",
      icon: Wallet,
      items: [
        {
          label: "Lotes con pagos pendientes",
          value: stats ? Number(stats.pagos_pendientes_revision).toLocaleString("es-CO") : "—",
          category: "pagos_pendientes_revision",
          tone: "bg-warning/10 text-warning",
          icon: Clock,
        },
      ],
    },
    {
      title: "RETIROS",
      icon: Truck,
      items: [
        {
          label: "Pendientes de Traspaso",
          value: stats ? Number(stats.pendientes_traspaso).toLocaleString("es-CO") : "—",
          category: "pendientes_traspaso",
          tone: "bg-info/10 text-info",
          icon: FileText,
        },
        {
          label: "Pendientes de Retiro",
          value: stats ? Number(stats.pendientes_retiro).toLocaleString("es-CO") : "—",
          category: "pendientes_retiro",
          tone: "bg-warning/10 text-warning",
          icon: Truck,
        },
      ],
    },
  ];

  return (
    <div className="space-y-5 pt-2">
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => {
          const SectionIcon = section.icon;

          return (
            <div
              key={section.title}
              className="rounded-2xl border border-border bg-card p-4 shadow-card"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <SectionIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold tracking-wide text-foreground">{section.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {section.items.length} opción{section.items.length > 1 ? "es" : ""} disponible
                    {section.items.length > 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {section.items.map((item) => {
                  const ItemIcon = item.icon;

                  return (
                    <button
                      key={item.label}
                      onClick={() => navigate(`/filter/${item.category}`)}
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left transition-all hover:border-primary/30 hover:shadow-card-hover"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.tone}`}>
                          <ItemIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{item.value}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardStats;
