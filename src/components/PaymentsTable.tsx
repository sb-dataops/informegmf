import { Pago } from "@/types";
import { formatCurrency, formatDate } from "@/data/mockData";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PaymentsTableProps {
  pagos: Pago[];
}

const PaymentsTable = ({ pagos }: PaymentsTableProps) => {
  const total = pagos.reduce((sum, p) => sum + p.monto_pagado, 0);

  const detalleBadgeClass: Record<string, string> = {
    Transferencia: "bg-info/10 text-info border-info/20",
    Efectivo: "bg-success/10 text-success border-success/20",
    Cheque: "bg-warning/10 text-warning border-warning/20",
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ID</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fecha</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monto</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagos.map((pago) => (
              <TableRow key={pago.id_pago} className="hover:bg-muted/30">
                <TableCell className="text-sm font-mono text-muted-foreground">{pago.id_pago}</TableCell>
                <TableCell className="text-sm">{formatDate(pago.fecha_pago)}</TableCell>
                <TableCell className="text-sm font-semibold">{formatCurrency(pago.monto_pagado)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`${detalleBadgeClass[pago.detalle_pago] || ""} text-xs`}>
                    {pago.detalle_pago}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end">
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2">
          <span className="text-sm text-muted-foreground mr-2">Total pagado:</span>
          <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
};

export default PaymentsTable;
