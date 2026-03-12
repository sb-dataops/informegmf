import {
  Car,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Truck,
  FileCheck,
  Users,
} from "lucide-react";

const stats = [
  {
    label: "Total Vehículos",
    value: 4,
    icon: Car,
    color: "text-primary",
    bgColor: "bg-accent",
  },
  {
    label: "Compradores Activos",
    value: 2,
    icon: Users,
    color: "text-info",
    bgColor: "bg-info/10",
  },
  {
    label: "Pagos Registrados",
    value: 6,
    icon: CreditCard,
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    label: "Total Recaudado",
    value: "$210.5M",
    icon: CheckCircle2,
    color: "text-success",
    bgColor: "bg-success/10",
    isText: true,
  },
];

const alerts = [
  {
    icon: AlertTriangle,
    color: "text-warning",
    bgColor: "bg-warning/10",
    borderColor: "border-warning/20",
    title: "Pendientes de Pago",
    value: 1,
    detail: "JKL012 — Mazda CX-5 (saldo pendiente)",
  },
  {
    icon: Clock,
    color: "text-primary",
    bgColor: "bg-accent",
    borderColor: "border-primary/20",
    title: "Traspaso en Proceso",
    value: 1,
    detail: "DEF456 — Renault Logan (docs pendientes tránsito Medellín)",
  },
  {
    icon: FileCheck,
    color: "text-info",
    bgColor: "bg-info/10",
    borderColor: "border-info/20",
    title: "Traspaso Pendiente por Iniciar",
    value: 1,
    detail: "JKL012 — Mazda CX-5 (recién adquirido, sin trámite)",
  },
  {
    icon: Truck,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    borderColor: "border-border",
    title: "Pendientes de Entrega",
    value: 2,
    detail: "DEF456, JKL012 — sin fecha de entrega asignada",
  },
];

const DashboardStats = () => {
  return (
    <div className="space-y-5 pt-2">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
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

      {/* Alert / action items */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">⚡ Atención Requerida</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {alerts.map((alert) => (
            <div
              key={alert.title}
              className={`bg-card rounded-xl border ${alert.borderColor} p-4 shadow-card flex items-start gap-3`}
            >
              <div className={`h-8 w-8 rounded-lg ${alert.bgColor} flex items-center justify-center shrink-0 mt-0.5`}>
                <alert.icon className={`h-4 w-4 ${alert.color}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                  <span className={`text-xs font-bold ${alert.color}`}>{alert.value}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{alert.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
