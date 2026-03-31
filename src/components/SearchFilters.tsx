import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2, Filter, CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchAutocomplete, type AutocompleteField, type AutocompleteOption, type AutocompleteContext } from "@/services/autocompleteService";

// ─── Types ───
export interface SearchFiltersValues {
  subasta: string[];
  comprador: string[];
  documento: string[];
  placa: string[];
  fechaSubastaDesde: string;
  fechaSubastaHasta: string;
  fechaPazSalvoDesde: string;
  fechaPazSalvoHasta: string;
}

interface SearchFiltersProps {
  values: SearchFiltersValues;
  onChange: (values: SearchFiltersValues) => void;
  onSearch: () => void;
}

// ─── FilterField (multi-select with autocomplete) ───
interface FilterFieldProps {
  label: string;
  field: AutocompleteField;
  placeholder: string;
  selected: string[];
  onChange: (values: string[]) => void;
  context: AutocompleteContext;
  icon?: React.ReactNode;
}

function FilterField({ label, field, placeholder, selected, onChange, context, icon }: FilterFieldProps) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: options = [], isFetching } = useQuery({
    queryKey: ["autocomplete", field, inputValue, context],
    queryFn: () => fetchAutocomplete(field, inputValue, context),
    enabled: inputValue.length >= 2 && open,
    staleTime: 30 * 1000,
  });

  // Filter out already-selected options
  const filteredOptions = useMemo(
    () => options.filter((o) => !selected.includes(o.value)),
    [options, selected],
  );

  const handleSelect = (option: AutocompleteOption) => {
    if (!selected.includes(option.value)) {
      onChange([...selected, option.value]);
    }
    setInputValue("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleRemove = (value: string) => {
    onChange(selected.filter((v) => v !== value));
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    if (!open && val.length >= 2) setOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      e.stopPropagation();
      if (!selected.includes(inputValue.trim())) {
        onChange([...selected, inputValue.trim()]);
      }
      setInputValue("");
      setOpen(false);
    }
    if (e.key === "Backspace" && inputValue === "" && selected.length > 0) {
      onChange(selected.slice(0, -1));
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="flex-1 min-w-[180px]">
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <Popover open={open && inputValue.length >= 2} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <div className="absolute left-2.5 top-2.5 text-muted-foreground">
              {icon || <Search className="h-3.5 w-3.5" />}
            </div>
            <div className="flex flex-wrap items-center gap-1 min-h-[36px] pl-8 pr-2 py-1 border border-input bg-background rounded-lg focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              {selected.map((val) => (
                <Badge key={val} variant="secondary" className="text-xs gap-1 py-0 h-5 shrink-0">
                  <span className="max-w-[120px] truncate">{val}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(val); }}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => inputValue.length >= 2 && setOpen(true)}
                placeholder={selected.length === 0 ? placeholder : ""}
                className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 h-7 min-w-[80px] flex-1 p-0 text-sm"
              />
              {isFetching && inputValue.length >= 2 && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
              )}
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[var(--radix-popover-trigger-width)]"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-48 overflow-y-auto">
            {isFetching && filteredOptions.length === 0 ? (
              <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="py-3 text-center text-sm text-muted-foreground">
                Sin resultados
              </div>
            ) : (
              filteredOptions.map((option, idx) => (
                <button
                  key={`${option.value}-${idx}`}
                  onClick={() => handleSelect(option)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2"
                >
                  <span className="font-medium truncate">{option.value}</span>
                  {option.extra && (
                    <span className="text-xs text-muted-foreground truncate max-w-[40%]">
                      {option.extra}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Filter Summary ───
const FIELD_LABELS: Record<string, string> = {
  subasta: "Subasta",
  comprador: "Nombre",
  documento: "Cédula / NIT",
  placa: "Placa",
  fechaSubastaDesde: "Fecha subasta desde",
  fechaSubastaHasta: "Fecha subasta hasta",
  fechaPazSalvoDesde: "Fecha paz y salvo desde",
  fechaPazSalvoHasta: "Fecha paz y salvo hasta",
};

function FilterSummary({ values, onChange }: { values: SearchFiltersValues; onChange: (v: SearchFiltersValues) => void }) {
  const arrayFields = ["subasta", "comprador", "documento", "placa"] as const;
  const dateFields = ["fechaSubastaDesde", "fechaSubastaHasta", "fechaPazSalvoDesde", "fechaPazSalvoHasta"] as const;

  const hasArrayEntries = arrayFields.some((key) => values[key].length > 0);
  const hasDateEntries = dateFields.some((key) => values[key]);

  if (!hasArrayEntries && !hasDateEntries) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-xs text-muted-foreground font-medium">Filtrando por:</span>
      {arrayFields.map((key) =>
        values[key].map((val) => (
          <Badge key={`${key}-${val}`} variant="outline" className="gap-1 text-xs py-0.5">
            <span className="text-muted-foreground">{FIELD_LABELS[key]}:</span>
            <span className="font-semibold max-w-[150px] truncate">{val}</span>
            <button
              onClick={() => onChange({ ...values, [key]: values[key].filter((v) => v !== val) })}
              className="hover:text-destructive ml-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))
      )}
      {dateFields.map((key) =>
        values[key] ? (
          <Badge key={key} variant="outline" className="gap-1 text-xs py-0.5">
            <span className="text-muted-foreground">{FIELD_LABELS[key]}:</span>
            <span className="font-semibold">{values[key]}</span>
            <button
              onClick={() => onChange({ ...values, [key]: '' })}
              className="hover:text-destructive ml-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ) : null
      )}
    </div>
  );
}

// ─── Main Component ───
const SearchFilters = ({ values, onChange, onSearch }: SearchFiltersProps) => {
  const updateField = useCallback(
    (field: keyof SearchFiltersValues) => (fieldValues: string[]) => {
      onChange({ ...values, [field]: fieldValues });
    },
    [values, onChange],
  );

  // Build context for cascading filters
  const contextFor = useCallback(
    (field: keyof SearchFiltersValues): AutocompleteContext => {
      const ctx: AutocompleteContext = {};
      if (field !== "subasta" && values.subasta.length) ctx.subasta = values.subasta;
      if (field !== "comprador" && values.comprador.length) ctx.comprador = values.comprador;
      if (field !== "documento" && values.documento.length) ctx.documento = values.documento;
      if (field !== "placa" && values.placa.length) ctx.placa = values.placa;
      return ctx;
    },
    [values],
  );

  const hasAnyFilter = values.subasta.length > 0 || values.comprador.length > 0 || values.documento.length > 0 || values.placa.length > 0;
  const activeCount = values.subasta.length + values.comprador.length + values.documento.length + values.placa.length;

  const handleClearAll = () => {
    onChange({ subasta: [], comprador: [], documento: [], placa: [] });
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-3">
      <div className="bg-card rounded-xl border border-border shadow-card p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Filtros de búsqueda</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeCount} filtro{activeCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <FilterField
            label="Subasta"
            field="subasta"
            placeholder="Buscar subasta..."
            selected={values.subasta}
            onChange={updateField("subasta")}
            context={contextFor("subasta")}
          />
          <FilterField
            label="Nombre"
            field="comprador"
            placeholder="Buscar nombre..."
            selected={values.comprador}
            onChange={updateField("comprador")}
            context={contextFor("comprador")}
          />
          <FilterField
            label="Cédula / NIT"
            field="documento"
            placeholder="Buscar documento..."
            selected={values.documento}
            onChange={updateField("documento")}
            context={contextFor("documento")}
          />
          <FilterField
            label="Placa"
            field="placa"
            placeholder="Buscar placa..."
            selected={values.placa}
            onChange={updateField("placa")}
            context={contextFor("placa")}
          />
        </div>

        <FilterSummary values={values} onChange={onChange} />

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={onSearch} disabled={!hasAnyFilter} className="gap-2">
            <Search className="h-4 w-4" />
            Buscar
          </Button>
          {hasAnyFilter && (
            <Button variant="ghost" size="sm" onClick={handleClearAll} className="text-muted-foreground">
              <X className="h-3.5 w-3.5 mr-1" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchFilters;
