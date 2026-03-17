import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Download, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { parseCurrencyLikeValue } from "@/lib/payment-utils";
import { upsertPagosBulk } from "@/services/pagosService";

interface BulkPaymentRow {
  placa: string;
  subasta?: string;
  mayor_oferta: number;
  total_prorrateo_gastos: number;
  fecha_limite_pago: string | null;
}

const TEMPLATE_HEADERS = [
  "placa",
  "subasta",
  "mayor_oferta",
  "total_prorrateo_gastos",
  "fecha_limite_pago",
] as const;

const TEMPLATE_SAMPLE = {
  placa: "ABC123",
  subasta: "12345",
  mayor_oferta: 25000000,
  total_prorrateo_gastos: 1500000,
  fecha_limite_pago: "2025-12-31",
};

const normalizeHeader = (value: string) => value.trim().toLowerCase();

const downloadTemplate = () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet([TEMPLATE_SAMPLE], {
    header: [...TEMPLATE_HEADERS],
  });

  worksheet["!cols"] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 24 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, "Pagos");
  XLSX.writeFile(workbook, "plantilla-cargue-pagos.xlsx");
};

const parseCsvContent = (content: string): BulkPaymentRow[] => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("La plantilla debe incluir encabezados y al menos una fila de datos");
  }

  const headers = lines[0].split(",").map(normalizeHeader);
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));

  for (const requiredHeader of TEMPLATE_HEADERS) {
    if (headerIndex[requiredHeader] === undefined) {
      throw new Error(`Falta la columna obligatoria: ${requiredHeader}`);
    }
  }

  return lines.slice(1).map((line, rowIndex) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const placa = cells[headerIndex.placa]?.toUpperCase();
    const subasta = cells[headerIndex.subasta] || undefined;
    const mayorOferta = parseCurrencyLikeValue(cells[headerIndex.mayor_oferta] || "0");
    const totalProrrateo = parseCurrencyLikeValue(cells[headerIndex.total_prorrateo_gastos] || "0");
    const fechaLimite = cells[headerIndex.fecha_limite_pago] || null;

    if (!placa) {
      throw new Error(`La fila ${rowIndex + 2} no tiene placa`);
    }

    return {
      placa,
      subasta,
      mayor_oferta: mayorOferta,
      total_prorrateo_gastos: totalProrrateo,
      fecha_limite_pago: fechaLimite,
    };
  });
};

interface MassPaymentUploadProps {
  onCompleted?: () => void;
}

const MassPaymentUpload = ({ onCompleted }: MassPaymentUploadProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BulkPaymentRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const totalRows = useMemo(() => rows.length, [rows]);

  const processFile = async (file: File) => {
    try {
      const content = await file.text();
      const parsedRows = parseCsvContent(content);
      setRows(parsedRows);
      setFileName(file.name);
      toast({
        title: "Archivo cargado",
        description: `${parsedRows.length} registro(s) listos para procesar`,
      });
    } catch (error) {
      setRows([]);
      setFileName("");
      toast({
        title: "Error en la plantilla",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleUpload = async () => {
    if (rows.length === 0) {
      toast({
        title: "Sin datos",
        description: "Carga primero un archivo con registros válidos",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      await upsertPagosBulk(rows);
      toast({
        title: "Cargue completado",
        description: `${rows.length} pago(s) actualizados correctamente`,
      });
      setRows([]);
      setFileName("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      onCompleted?.();
    } catch (error) {
      toast({
        title: "Error al cargar pagos",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Cargue masivo de pagos</CardTitle>
        <CardDescription>
          Descarga la plantilla Excel, diligencia los valores por columnas y luego cárgala para actualizar múltiples placas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" variant="secondary" className="gap-2" onClick={downloadTemplate}>
          <Download className="h-4 w-4" />
          Descargar plantilla Excel
        </Button>

        <Input
          id="mass-payment-file"
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
        />

        <label
          htmlFor="mass-payment-file"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
            isDragging
              ? "border-primary bg-accent/60"
              : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
          }`}
        >
          <div className="mb-3 rounded-full bg-accent p-3 text-accent-foreground">
            <Upload className="h-5 w-5" />
          </div>
          <p className="font-medium text-foreground">Selecciona o arrastra tu archivo CSV aquí</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Columnas requeridas: placa, subasta, mayor_oferta, total_prorrateo_gastos, fecha_limite_pago.
          </p>
        </label>

        <Button type="button" onClick={handleUpload} disabled={isUploading || rows.length === 0} className="w-full">
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Cargar pagos masivamente
        </Button>

        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <p className="mb-2 font-medium text-foreground">Archivos adjuntos</p>
          {fileName ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground">{fileName}</span>
              </div>
              <span className="shrink-0 text-muted-foreground">{totalRows} registro(s)</span>
            </div>
          ) : (
            <p className="text-muted-foreground">Aún no has adjuntado ningún archivo</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MassPaymentUpload;
