import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchStatsPagos, fetchStatsRetiros, fetchStatsFiltros } from "@/services/bigqueryService";
import { Clock, FileText, Filter, Truck, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LucideIcon } from "lucide-react";

const QUERY_OPTIONS = {
  staleTime: 15 * 1000,
  refetchInterval: 30 * 1000,
  refetchOnWindowFocus: true,
};

interface StatItem {
  label: string;
  value: string;
  category: string;
  tone: string;
  icon: LucideIcon;
}

const StatButton = ({ item, onClick }: { item: StatItem; onClick: () => void }) => {
  const ItemIcon = item.icon;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left transition-all hover:border-primary/30 hover:shadow-card-hover"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.tone}`}>
          <ItemIcon className="h-4 w-4" />
        </div>
        <p className="text-sm font-semibold text-foreground">{item.label}</p>
      </div>
      <p className="text-2xl font-bold text-foreground">{item.value}</p>
    </button>
  );
};

const StatItemSkeleton = () => (
  <div className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
    <div className="flex items-center gap-3">
      <Skeleton className="h-9 w-9 rounded-lg" />
      <Skeleton className="h-4 w-36" />
    </div>
    <Skeleton className="h-7 w-12" />
  </div>
);

const SectionCard = ({
  title,
  icon: SectionIcon,
  items,
  isLoading,
  itemCount,
}: {
  title: string;
  icon: LucideIcon;
  items: StatItem[];
  isLoading: boolean;
  itemCount: number;
}) => {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-4 flex items-center justify-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <SectionIcon className="h-5 w-5" />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold tracking-wide text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">
            {itemCount} opción{itemCount > 1 ? "es" : ""} disponible{itemCount > 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: itemCount }).map((_, i) => <StatItemSkeleton key={i} />)
          : items.map((item) => (
              <StatButton key={item.category} item={item} onClick={() => navigate(`/filter/${item.category}`)} />
            ))}
      </div>
    </div>
  );
};

const DashboardStats = () => {
  const { data: pagos, isLoading: loadingPagos } = useQuery({
    queryKey: ["stats-pagos"],
    queryFn: fetchStatsPagos,
    ...QUERY_OPTIONS,
  });

  const { data: retiros, isLoading: loadingRetiros } = useQuery({
    queryKey: ["stats-retiros"],
    queryFn: fetchStatsRetiros,
    ...QUERY_OPTIONS,
  });

  const { data: filtros, isLoading: loadingFiltros } = useQuery({
    queryKey: ["stats-filtros"],
    queryFn: fetchStatsFiltros,
    ...QUERY_OPTIONS,
  });

  const fmt = (v: string | undefined) => v ? Number(v).toLocaleString("es-CO") : "0";

  return (
    <div className="space-y-5 pt-2">
      <div className="grid gap-4 md:grid-cols-3">
        <SectionCard
          title="PAGOS"
          icon={Wallet}
          isLoading={loadingPagos}
          itemCount={2}
          items={[
            { label: "Lotes con pagos pendientes", value: fmt(pagos?.pendientes_pago), category: "pendientes_pago", tone: "bg-warning/10 text-warning", icon: Clock },
            { label: "Pagos pendientes por revisar", value: fmt(pagos?.soportes_pendientes_revision), category: "soportes_pendientes_revision", tone: "bg-info/10 text-info", icon: FileText },
          ]}
        />
        <SectionCard
          title="RETIROS"
          icon={Truck}
          isLoading={loadingRetiros}
          itemCount={2}
          items={[
            { label: "Pendientes de Traspaso", value: fmt(retiros?.pendientes_traspaso), category: "pendientes_traspaso", tone: "bg-info/10 text-info", icon: FileText },
            { label: "Pendientes de Retiro", value: fmt(retiros?.pendientes_retiro), category: "pendientes_retiro", tone: "bg-warning/10 text-warning", icon: Truck },
          ]}
        />
        <SectionCard
          title="FILTROS"
          icon={Filter}
          isLoading={loadingFiltros}
          itemCount={1}
          items={[
            { label: "Pendientes por aprobación de filtros", value: fmt(filtros?.pendientes_filtros), category: "pendientes_filtros", tone: "bg-orange-500/10 text-orange-600", icon: Filter },
          ]}
        />
      </div>
    </div>
  );
};

export default DashboardStats;
