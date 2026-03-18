import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GroupedDocumentoRecord } from "@/services/documentosService";
import { fetchDocumentoBlob, formatFileSize } from "@/services/documentosService";
import { formatCurrency } from "@/services/bigqueryService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, DollarSign, Eye, FileText, Loader2 } from "lucide-react";

interface VehicleSupportViewerProps {
  documents: GroupedDocumentoRecord[];
  totalPagos: number;
  mayorOferta: number;
  prorrateoGastos: number;
  totalSoportes: number;
  saldoPendiente: number;
  placa: string;
  fechaLimitePago?: string | null;
  observacionPago?: string | null;
  onObservacionPagoChange?: (placa: string, value: string) => void;
}

const OBSERVACION_PAGO_OPTIONS = [
  "En cobro",
  "PDT Certificado Origen de recursos",
  "En Filtros",
  "Ampliacion de pago",
  "Completado",
  "Incumplimiento de pago",
  "En proceso de giro por parte de Superbid.",
];

const VehicleSupportViewer = ({
  documents,
  totalPagos,
  mayorOferta,
  prorrateoGastos,
  totalSoportes,
  saldoPendiente,
  placa,
  fechaLimitePago,
  observacionPago,
  onObservacionPagoChange,
}: VehicleSupportViewerProps) => {
  const [activeDocument, setActiveDocument] = useState<GroupedDocumentoRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const documentsForPlate = useMemo(
    () => documents.filter((doc) => doc.soportes.some((item) => item.placa === placa.toUpperCase())),
    [documents, placa],
  );

  useEffect(() => {
    if (!activeDocument?.gcs_path) {
      setPreviewUrl(null);
      setIsPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    let isCancelled = false;
    let objectUrl: string | null = null;

    setIsPreviewLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);

    fetchDocumentoBlob(activeDocument.gcs_path)
      .then((blob) => {
        if (isCancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((error: Error) => {
        if (isCancelled) return;
        setPreviewError(error.message || "No se pudo cargar la vista previa del soporte.");
      })
      .finally(() => {
        if (!isCancelled) {
          setIsPreviewLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [activeDocument]);

  const isImage = (tipo: string | null) => Boolean(tipo?.startsWith("image/"));
  const isPdf = (tipo: string | null) => tipo === "application/pdf";

  return (
    <>
      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-primary" />
            Resumen de pago y soportes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fechaLimitePago && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
              <CalendarDays className="h-4 w-4 text-primary shrink-0" />
              <span className="text-muted-foreground">Fecha límite de pago:</span>
              <span className="font-semibold text-foreground">
                {new Date(fechaLimitePago + "T12:00:00").toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
              <p className="mb-1 text-xs text-muted-foreground">Valor mayor oferta</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(mayorOferta)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
              <p className="mb-1 text-xs text-muted-foreground">Prorrateos + Total gastos</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(prorrateoGastos)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
              <p className="mb-1 text-xs text-muted-foreground">Soportes cargados</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalSoportes)}</p>
            </div>
            <div className={`rounded-lg border p-4 text-center ${saldoPendiente > 0 ? "border-destructive/20 bg-destructive/10" : "border-border bg-accent/30"}`}>
              <p className="mb-1 text-xs text-muted-foreground">Saldo restante por pagar</p>
              <p className={`text-lg font-bold ${saldoPendiente > 0 ? "text-destructive" : "text-accent-foreground"}`}>
                {formatCurrency(saldoPendiente)}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="mb-2 text-xs text-muted-foreground">Observación de pagos</p>
            <Select
              value={observacionPago || ""}
              onValueChange={(val) => onObservacionPagoChange?.(placa, val)}
            >
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Seleccionar observación..." />
              </SelectTrigger>
              <SelectContent>
                {OBSERVACION_PAGO_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Soportes cargados a la placa {placa.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">
                  Aquí puedes revisar cada soporte que ya fue asociado a este vehículo.
                </p>
              </div>
              <Badge variant="secondary">{documentsForPlate.length} soporte(s)</Badge>
            </div>

            {documentsForPlate.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay soportes cargados para esta placa.</p>
            ) : (
              <div className="space-y-3">
                {documentsForPlate.map((doc) => {
                  const soportePlaca = doc.soportes.find((item) => item.placa === placa.toUpperCase());
                  return (
                    <div key={`${doc.gcs_path}-${doc.id}`} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-primary" />
                          <p className="truncate text-sm font-medium text-foreground">{doc.nombre_archivo}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{new Date(doc.created_at).toLocaleDateString("es-CO")}</span>
                          {doc.tamano ? <span>{formatFileSize(doc.tamano)}</span> : null}
                          <span>Valor aplicado: {formatCurrency(soportePlaca?.valor_soporte || 0)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => setActiveDocument(doc)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver soporte
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!activeDocument} onOpenChange={(open) => !open && setActiveDocument(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          {activeDocument && (
            <div className="flex h-full flex-col">
              <DialogHeader className="border-b border-border p-6 pb-4">
                <DialogTitle className="pr-8">{activeDocument.nombre_archivo}</DialogTitle>
                <DialogDescription>
                  Soporte cargado para la placa {placa.toUpperCase()} · Valor aplicado {formatCurrency(
                    activeDocument.soportes.find((item) => item.placa === placa.toUpperCase())?.valor_soporte || 0,
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-auto bg-muted/20 p-4">
                {isPreviewLoading ? (
                  <div className="flex min-h-[40vh] items-center justify-center gap-3 rounded-lg border border-border bg-background p-6 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    Cargando vista previa del soporte...
                  </div>
                ) : previewError ? (
                  <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-background p-6 text-center">
                    <FileText className="h-10 w-10 text-primary" />
                    <p className="text-sm text-muted-foreground">{previewError}</p>
                  </div>
                ) : isImage(activeDocument.tipo_archivo) && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={`Soporte ${activeDocument.nombre_archivo}`}
                    className="mx-auto h-auto max-h-[70vh] w-auto rounded-lg border border-border bg-background object-contain"
                    loading="lazy"
                  />
                ) : isPdf(activeDocument.tipo_archivo) && previewUrl ? (
                  <iframe
                    src={previewUrl}
                    title={activeDocument.nombre_archivo}
                    className="h-[70vh] w-full rounded-lg border border-border bg-background"
                  />
                ) : (
                  <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-background p-6 text-center">
                    <FileText className="h-10 w-10 text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Este tipo de archivo no tiene vista previa embebida.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VehicleSupportViewer;
