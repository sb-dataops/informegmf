import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
}

const SearchBar = ({ value, onChange, onSearch }: SearchBarProps) => {
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Buscar por nombre, cédula/NIT o placa..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
        className="pl-12 pr-4 h-14 text-base rounded-xl border-2 border-border bg-card shadow-card focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-4 transition-all"
      />
    </div>
  );
};

export default SearchBar;
