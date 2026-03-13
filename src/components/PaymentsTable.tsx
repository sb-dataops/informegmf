import { formatCurrency, formatDate } from "@/services/bigqueryService";

interface PaymentRow {
  id: string;
  fecha: string;
  monto: number;
  detalle: string;
}

interface PaymentsTableProps {
  pagos: PaymentRow[];
}

const PaymentsTable = ({ pagos }: PaymentsTableProps) => {
  if (pagos.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay pagos registrados.</p>;
  }

  return (
    <div className="text-sm text-muted-foreground">
      Pagos no disponibles en esta vista.
    </div>
  );
};

export default PaymentsTable;
