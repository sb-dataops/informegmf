import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fetchDashboardStats } from "@/services/bigqueryService";
import { fetchAllPagos } from "@/services/pagosService";

const Index = lazy(() => import("./pages/Index.tsx"));
const FilteredLots = lazy(() => import("./pages/FilteredLots.tsx"));
const VehicleDetail = lazy(() => import("./pages/VehicleDetail.tsx"));
const GestionPagos = lazy(() => import("./pages/GestionPagos.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

// Prefetch dashboard data immediately so it's ready when user sees the page
queryClient.prefetchQuery({
  queryKey: ["bigquery-stats"],
  queryFn: fetchDashboardStats,
  staleTime: 30 * 1000,
});
queryClient.prefetchQuery({
  queryKey: ["pagos-all-alerts"],
  queryFn: fetchAllPagos,
  staleTime: 5 * 60 * 1000,
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/filter/:category" element={<FilteredLots />} />
            <Route path="/vehiculo/:placa" element={<VehicleDetail />} />
            <Route path="/gestion-pagos" element={<GestionPagos />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
