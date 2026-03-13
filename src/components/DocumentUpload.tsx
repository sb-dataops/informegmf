import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { uploadDocumento, listDocumentos, deleteDocumento, formatFileSize, DocumentoRecord } from "@/services/documentosService";
import { toast } from "@/hooks/use-toast";
import { Upload, File, Trash2, Loader2, FileText, Download } from "lucide-react";

interface DocumentUploadProps {
  documentoComprador: string;
  placa?: string;
  compradorNombre?: string;
}

const DocumentUpload = ({ documentoComprador, placa, compradorNombre }: DocumentUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const queryClient = useQueryClient();

  const queryKey = ["documentos", documentoComprador, placa || "all"];

  const { data: documentos = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listDocumentos({ documento_comprador: documentoComprador, placa }),
    enabled: !!documentoComprador,
  });

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!documentoComprador) {
      toast({ title: "Error", description: "Documento del comprador requerido", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadDocumento(file, documentoComprador, placa);
      }
      toast({ title: "¡Subido!", description: `${files.length} archivo(s) subido(s) correctamente` });
      queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [documentoComprador, placa, queryClient, queryKey]);

  const handleDelete = async (doc: DocumentoRecord) => {
    try {
      await deleteDocumento(doc.id, doc.gcs_path);
      toast({ title: "Eliminado", description: doc.nombre_archivo });
      queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-primary" />
          Documentos {compradorNombre ? `— ${compradorNombre}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dropzone */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
            ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.onchange = (e) => {
              const files = (e.target as HTMLInputElement).files;
              if (files) handleFiles(files);
            };
            input.click();
          }}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-muted-foreground">Subiendo...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Arrastra archivos aquí o <span className="text-primary font-medium">haz clic para seleccionar</span>
              </p>
            </div>
          )}
        </div>

        {/* File list */}
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {documentos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">{documentos.length} documento(s)</p>
            {documentos.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border group"
              >
                <File className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.nombre_archivo}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.tamano ? formatFileSize(doc.tamano) : ""} · {new Date(doc.created_at).toLocaleDateString("es-CO")}
                    {doc.placa && ` · ${doc.placa}`}
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && documentos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">No hay documentos cargados</p>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentUpload;
