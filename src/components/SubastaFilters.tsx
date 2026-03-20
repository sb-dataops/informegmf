import { useMemo, useState, useRef, useEffect } from "react";
import { Filter, X, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VehiculoConsolidado } from "@/types";

interface SubastaFiltersProps {
  vehiculos: VehiculoConsolidado[];
  selectedPlacas: Set<string>;
  selectedCompradores: Set<string>;
  onPlacasChange: (placas: Set<string>) => void;
  onCompradoresChange: (compradores: Set<string>) => void;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toUpperCase();
    return options.filter(
      (o) => o.value.toUpperCase().includes(q) || o.label.toUpperCase().includes(q),
    );
  }, [options, search]);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40"
      >
        <span className="text-muted-foreground">{label}</span>
        {selected.size > 0 && (
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {selected.size}
          </Badge>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-card shadow-lg">
          <div className="p-2">
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </div>
          <div className="max-h-52 overflow-y-auto px-1 pb-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
            ) : (
              filtered.map((o) => {
                const isSelected = selected.has(o.value);
                return (
                  <button
                    key={o.value}
                    onClick={() => toggle(o.value)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent ${isSelected ? "bg-accent/50 font-medium" : ""}`}
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
          {selected.size > 0 && (
            <div className="border-t border-border p-1.5">
              <button
                onClick={() => onChange(new Set())}
                className="w-full rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SubastaFilters = ({
  vehiculos,
  selectedPlacas,
  selectedCompradores,
  onPlacasChange,
  onCompradoresChange,
}: SubastaFiltersProps) => {
  const placaOptions = useMemo(
    () =>
      [...new Set(vehiculos.map((v) => v.placa.toUpperCase()))]
        .sort()
        .map((p) => ({ value: p, label: p })),
    [vehiculos],
  );

  const compradorOptions = useMemo(() => {
    const map = new Map<string, string>();
    vehiculos.forEach((v) => {
      if (v.documento) map.set(v.documento, v.comprador || v.documento);
    });
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([doc, name]) => ({ value: doc, label: name }));
  }, [vehiculos]);

  const hasFilters = selectedPlacas.size > 0 || selectedCompradores.size > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground" />
      <MultiSelectDropdown
        label="Placas"
        options={placaOptions}
        selected={selectedPlacas}
        onChange={onPlacasChange}
      />
      <MultiSelectDropdown
        label="Compradores"
        options={compradorOptions}
        selected={selectedCompradores}
        onChange={onCompradoresChange}
      />
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onPlacasChange(new Set());
            onCompradoresChange(new Set());
          }}
          className="h-8 gap-1 text-xs text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
};

export default SubastaFilters;
