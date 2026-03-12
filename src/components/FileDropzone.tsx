import { useState, useCallback } from "react";
import { ArchivoSoporte } from "@/types";
import { Upload, FileText, Image, Trash2, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FileDropzoneProps {
  archivos: ArchivoSoporte[];
  placa: string;
}

const FileDropzone = ({ archivos, placa }: FileDropzoneProps) => {
  const [files, setFiles] = useState<ArchivoSoporte[]>(archivos);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      addFiles(droppedFiles);
    },
    [placa]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(Array.from(e.target.files));
      }
    },
    [placa]
  );

  const addFiles = (newFiles: File[]) => {
    const nuevosArchivos: ArchivoSoporte[] = newFiles.map((f, i) => ({
      id: `new-${Date.now()}-${i}`,
      nombre: f.name,
      tipo: f.type,
      tamano: f.size,
      url: URL.createObjectURL(f),
      fecha_subida: new Date().toISOString().split("T")[0],
      placa,
    }));
    setFiles((prev) => [...prev, ...nuevosArchivos]);
    toast.success(`${newFiles.length} archivo(s) cargado(s) correctamente`);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    toast.success("Archivo eliminado");
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (tipo: string) => {
    if (tipo.startsWith("image/")) return <Image className="h-4 w-4 text-info" />;
    return <FileText className="h-4 w-4 text-warning" />;
  };

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <Upload className={`h-8 w-8 mx-auto mb-2 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
        <p className="text-sm font-medium text-foreground">
          Arrastra archivos aquí o <span className="text-primary">haz clic para seleccionar</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG — Máx. 10MB</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((archivo) => (
            <div
              key={archivo.id}
              className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2 group hover:bg-muted/50 transition-colors"
            >
              {getFileIcon(archivo.tipo)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground">{archivo.nombre}</p>
                <p className="text-xs text-muted-foreground">{formatSize(archivo.tamano)}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Previsualizar">
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Descargar">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:text-destructive"
                  onClick={() => removeFile(archivo.id)}
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileDropzone;
