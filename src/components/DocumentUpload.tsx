import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  uploadDocumento,
  listDocumentos,
  deleteDocumento,
  formatFileSize,
  DocumentoRecord,
  groupDocumentosByArchivo,
} from "@/services/documentosService";
import { searchBigQuery, formatCurrency } from "@/services/bigqueryService";
import { toast } from "@/hooks/use-toast";
import { formatNumericInput, parseCurrencyLikeValue } from "@/lib/payment-utils";
import { buildAllowedPlacasFromRelatorio, normalizePlaca } from "@/lib/vehicle-filters";
import PlateValueFields from "@/components/documentos/PlateValueFields";
import { Upload, FileIcon, Trash2, Loader2, FileText, Download, X } from "lucide-react";

interface DocumentUploadProps {
  documentoComprador: string;
  placa?: string;
  compradorNombre?: string;
}

const DocumentUpload = ({ documentoComprador, placa, compradorNombre }: DocumentUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedPlacas, setSelectedPlacas] = useState<string[]>(placa ? [placa.toUpperCase()] : []);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [valoresPorPlaca, setValoresPorPlaca] = useState<Record<string, string>>(
    placa ? { [placa.toUpperCase()]: "" } : {},
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  const queryKey = ["documentos", documentoComprador, placa || "all"];

  useEffect(() => {
    const normalizedPlaca = placa?.toUpperCase();
    setSelectedPlacas(normalizedPlaca ? [normalizedPlaca] : []);
    setValoresPorPlaca(normalizedPlaca ? { [normalizedPlaca]: "" } : {});
    setSelectedFiles([]);
  }, [documentoComprador, placa]);

  const { data: documentos = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listDocumentos({ documento_comprador: documentoComprador, placa }),
    enabled: !!documentoComprador,
  });

  const { data: vehiculosResult } = useQuery({
    queryKey: ["documentos-placas", documentoComprador],
    queryFn: () => searchBigQuery(documentoComprador),
    enabled: !!documentoComprador,
  });

  const placasDisponibles = useMemo(() => {
    const placas = new Set<string>();
    if (!vehiculosResult) return [];

    const allowedPlacas = buildAllowedPlacasFromRelatorio(vehiculosResult.relatorio);
    const hasRelatorioFilter = allowedPlacas.size > 0;

    const isAllowed = (placa: string | null) => {
      if (!placa) return false;
      if (!hasRelatorioFilter) return true; // No relatorio data: allow all plates
      return allowedPlacas.has(normalizePlaca(placa));
    };

    vehiculosResult.relatorio.forEach((item) => {
      if (item.documento === documentoComprador && item.placa && isAllowed(item.placa)) {
        placas.add(item.placa.toUpperCase());
      }
    });
    vehiculosResult.retiros.forEach((item) => {
      if (item.documento === documentoComprador && item.placa && isAllowed(item.placa)) {
        placas.add(item.placa.toUpperCase());
      }
    });
    vehiculosResult.servitram.forEach((item) => {
      if (item.documento === documentoComprador && item.placa && isAllowed(item.placa)) {
        placas.add(item.placa.toUpperCase());
      }
    });
    vehiculosResult.gestramites.forEach((item) => {
      if (item.documento === documentoComprador && item.placa && isAllowed(item.placa)) {
        placas.add(item.placa.toUpperCase());
      }
    });
    return Array.from(placas).sort();
  }, [documentoComprador, vehiculosResult]);

  const documentosAgrupados = useMemo(() => groupDocumentosByArchivo(documentos), [documentos]);

  const togglePlaca = (plate: string) => {
    setSelectedPlacas((current) => {
      const exists = current.includes(plate);
      if (exists) {
        setValoresPorPlaca((prev) => {
          const next = { ...prev };
          delete next[plate];
          return next;
        });
        return current.filter((item) => item !== plate);
      }

      setValoresPorPlaca((prev) => ({ ...prev, [plate]: prev[plate] || "" }));
      return [...current, plate];
    });
  };

  const handlePlateValueChange = (plate: string, value: string) => {
    setValoresPorPlaca((current) => ({
      ...current,
      [plate]: formatNumericInput(value),
    }));
  };

  const queueFiles = useCallback((files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    if (nextFiles.length === 0) return;

    setSelectedFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const merged = [...current];

      nextFiles.forEach((file) => {
        const signature = `${file.name}-${file.size}-${file.lastModified}`;
        if (!existing.has(signature)) {
          merged.push(file);
          existing.add(signature);
        }
      });

      return merged;
    });
  }, []);

  const handleUpload = useCallback(async () => {
    if (!documentoComprador) {
      toast({ title: "Error", description: "Documento del comprador requerido", variant: "destructive" });
      return;
    }

    if (selectedFiles.length === 0) {
      toast({ title: "Error", description: "Selecciona al menos un archivo", variant: "destructive" });
      return;
    }

    if (selectedPlacas.length === 0) {
      toast({ title: "Error", description: "Selecciona al menos una placa", variant: "destructive" });
      return;
    }

    const valoresNormalizados: Record<string, number> = {};
    for (const placaSeleccionada of selectedPlacas) {
      const valor = parseCurrencyLikeValue(valoresPorPlaca[placaSeleccionada]);
      if (Number.isNaN(valor) || valor <= 0) {
        toast({
          title: "Error",
          description: `Ingresa un valor válido para la placa ${placaSeleccionada}`,
          variant: "destructive",
        });
        return;
      }
      valoresNormalizados[placaSeleccionada] = valor;
    }

    setUploading(true);
    try {
      for (const file of selectedFiles) {
        await uploadDocumento(file, documentoComprador, valoresNormalizados);
      }
      toast({ title: "¡Cargado!", description: `${selectedFiles.length} archivo(s) subido(s) correctamente` });
      setSelectedFiles([]);
      setValoresPorPlaca((current) => Object.fromEntries(selectedPlacas.map((item) => [item, current[item] ? "" : ""] )));
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["all-documentos"] });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [documentoComprador, queryClient, queryKey, selectedFiles, selectedPlacas, valoresPorPlaca]);

  const handleDelete = async (doc: DocumentoRecord) => {
    try {
      await deleteDocumento(doc.id, doc.gcs_path);
      toast({ title: "Eliminado", description: doc.nombre_archivo });
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["all-documentos"] });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      queueFiles(e.dataTransfer.files);
    }
  }, [queueFiles]);

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-primary" />
          Documentos {compradorNombre ? `— ${compradorNombre}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!placa && placasDisponibles.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Relacionar soporte a placa(s)</Label>
            <div className="flex flex-wrap gap-2">
              {placasDisponibles.map((item) => {
                const active = selectedPlacas.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => togglePlaca(item)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/40"}`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Puedes cargar un mismo archivo y asignar un valor distinto por placa.</p>
          </div>
        )}

        {placa && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Placa relacionada</Label>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
              {placa.toUpperCase()}
            </div>
          </div>
        )}

        <PlateValueFields
          selectedPlacas={selectedPlacas}
          values={valoresPorPlaca}
          onValueChange={handlePlateValueChange}
          disabled={uploading}
        />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) queueFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-muted-foreground">Cargando soportes...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Arrastra archivos aquí o <span className="font-medium text-primary">haz clic para seleccionarlos</span>
              </p>
              <p className="text-xs text-muted-foreground">Luego usa el botón de carga para guardar la información.</p>
            </div>
          )}
        </div>

        {selectedFiles.length > 0 && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">Archivos listos para cargar</p>
              <p className="text-xs text-muted-foreground">{selectedFiles.length} archivo(s)</p>
            </div>
            <div className="space-y-2">
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
                  <FileIcon className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSelectedFile(index);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                Seleccionar más archivos
              </Button>
              <Button type="button" onClick={handleUpload} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Cargar soportes
              </Button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {documentosAgrupados.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{documentosAgrupados.length} archivo(s) cargado(s)</p>
            {documentosAgrupados.map((doc) => (
              <div
                key={doc.gcs_path}
                className="group flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3"
              >
                <FileIcon className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{doc.nombre_archivo}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.tamano ? formatFileSize(doc.tamano) : ""} · {new Date(doc.created_at).toLocaleDateString("es-CO")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {doc.soportes.map((soporte) => `${soporte.placa}: ${formatCurrency(soporte.valor_soporte)}`).join(" · ")}
                  </p>
                </div>
                <div className="flex gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  {doc.gcs_url && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                      <a href={doc.gcs_url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete({
                        id: doc.id,
                        documento_comprador: doc.documento_comprador,
                        placa: doc.soportes[0]?.placa || null,
                        placas: doc.soportes.map((item) => item.placa),
                        valor_soporte: doc.soportes.reduce((acc, item) => acc + item.valor_soporte, 0),
                        nombre_archivo: doc.nombre_archivo,
                        tipo_archivo: doc.tipo_archivo,
                        tamano: doc.tamano,
                        gcs_path: doc.gcs_path,
                        gcs_url: doc.gcs_url,
                        created_at: doc.created_at,
                      });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && documentosAgrupados.length === 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">No hay documentos cargados</p>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentUpload;
