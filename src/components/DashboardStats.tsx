import { useQuery } from "@tanstack/react-query";
import { fetchDashboardStats } from "@/services/bigqueryService";
import {
  Car,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
} from "lucide-react";

const DashboardStats = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["bigquery-stats"],
    queryFn: fetchDashboardStats,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Cargando estadísticas...</span>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Registros",
      value: stats ? Number(stats.total).toLocaleString("es-CO") : "—",
      icon: Car,
      color: "text-primary",
      bgColor: "bg-accent",
    },
    {
      label: "Aprobados",
      value: stats ? Number(stats.aprobados).toLocaleString("es-CO") : "—",
      icon: CheckCircle2,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "En Proceso / Condicional",
      value: stats ? Number(stats.en_proceso).toLocaleString("es-CO") : "—",
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      label: "Rechazados",
      value: stats ? Number(stats.rechazados).toLocaleString("es-CO") : "—",
      icon: AlertTriangle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
  ];

  return (
    <div className="space-y-5 pt-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-card rounded-xl border border-border p-4 shadow-card hover:shadow-card-hover transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`h-9 w-9 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                <stat.icon className={`h-4.5 w-4.5 ${stat.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardStats;
