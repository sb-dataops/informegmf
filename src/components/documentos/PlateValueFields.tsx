import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PlateValueFieldsProps {
  disabled?: boolean;
  selectedPlacas: string[];
  values: Record<string, string>;
  onValueChange: (placa: string, value: string) => void;
}

const PlateValueFields = ({ disabled = false, selectedPlacas, values, onValueChange }: PlateValueFieldsProps) => {
  if (selectedPlacas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona una o más placas para ingresar el valor del soporte por cada una.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Valor del soporte por placa</Label>
      <div className="space-y-3">
        {selectedPlacas.map((placa) => (
          <div key={placa} className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
            <div className="text-sm font-medium text-foreground">{placa}</div>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Ej: 1.500.000"
              value={values[placa] || ""}
              onChange={(e) => onValueChange(placa, e.target.value)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlateValueFields;
