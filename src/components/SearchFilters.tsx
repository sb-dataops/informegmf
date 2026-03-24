import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2, ChevronDown, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchAutocomplete, type AutocompleteField, type AutocompleteOption } from "@/services/autocompleteService";

interface FilterFieldProps {
  label: string;
  field: AutocompleteField;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
}

function FilterField({ label, field, placeholder, value, onChange, icon }: FilterFieldProps) {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const { data: options = [], isFetching } = useQuery({
    queryKey: ["autocomplete", field, inputValue],
    queryFn: () => fetchAutocomplete(field, inputValue),
    enabled: inputValue.length >= 2 && open,
    staleTime: 30 * 1000,
  });

  const handleSelect = (option: AutocompleteOption) => {
    onChange(option.value);
    setInputValue(option.value);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setInputValue("");
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    if (!open && val.length >= 2) setOpen(true);
    if (val === "") onChange("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (inputValue.trim()) {
        onChange(inputValue.trim());
        setOpen(false);
      }
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
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              {icon || <Search className="h-3.5 w-3.5" />}
            </div>
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => inputValue.length >= 2 && setOpen(true)}
              placeholder={placeholder}
              className="pl-8 pr-8 h-9 text-sm rounded-lg"
            />
            {value ? (
              <button
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              isFetching && inputValue.length >= 2 && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[var(--radix-popover-trigger-width)]"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-48 overflow-y-auto">
            {isFetching && options.length === 0 ? (
              <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando...
              </div>
            ) : options.length === 0 ? (
              <div className="py-3 text-center text-sm text-muted-foreground">
                Sin resultados
              </div>
            ) : (
              options.map((option, idx) => (
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

export interface SearchFiltersValues {
  subasta: string;
  comprador: string;
  documento: string;
  placa: string;
}

interface SearchFiltersProps {
  values: SearchFiltersValues;
  onChange: (values: SearchFiltersValues) => void;
  onSearch: () => void;
}

const SearchFilters = ({ values, onChange, onSearch }: SearchFiltersProps) => {
  const updateField = useCallback(
    (field: keyof SearchFiltersValues) => (value: string) => {
      onChange({ ...values, [field]: value });
    },
    [values, onChange],
  );

  const hasAnyFilter = values.subasta || values.comprador || values.documento || values.placa;
  const activeCount = [values.subasta, values.comprador, values.documento, values.placa].filter(Boolean).length;

  const handleClearAll = () => {
    onChange({ subasta: "", comprador: "", documento: "", placa: "" });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && hasAnyFilter) {
      onSearch();
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-3" onKeyDown={handleKeyDown}>
      <div className="bg-card rounded-xl border border-border shadow-card p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Filtros de búsqueda</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeCount} activo{activeCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <FilterField
            label="Subasta"
            field="subasta"
            placeholder="Buscar subasta..."
            value={values.subasta}
            onChange={updateField("subasta")}
          />
          <FilterField
            label="Nombre"
            field="comprador"
            placeholder="Buscar nombre..."
            value={values.comprador}
            onChange={updateField("comprador")}
          />
          <FilterField
            label="Cédula / NIT"
            field="documento"
            placeholder="Buscar documento..."
            value={values.documento}
            onChange={updateField("documento")}
          />
          <FilterField
            label="Placa"
            field="placa"
            placeholder="Buscar placa..."
            value={values.placa}
            onChange={updateField("placa")}
          />
        </div>

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
