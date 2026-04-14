import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { fetchStatsPagos, fetchStatsRetiros, fetchStatsFiltros } from "@/services/bigqueryService";
import { fetchAllPagos } from "@/services/pagosService";

const Index = lazy(() => import("./pages/Index.tsx"));
const FilteredLots = lazy(() => import("./pages/FilteredLots.tsx"));
const VehicleDetail = lazy(() => import("./pages/VehicleDetail.tsx"));
const GestionPagos = lazy(() => import("./pages/GestionPagos.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

// Prefetch all 3 dashboard sections in parallel
queryClient.prefetchQuery({ queryKey: ["stats-pagos"], queryFn: fetchStatsPagos, staleTime: 15 * 1000 });
queryClient.prefetchQuery({ queryKey: ["stats-retiros"], queryFn: fetchStatsRetiros, staleTime: 15 * 1000 });
queryClient.prefetchQuery({ queryKey: ["stats-filtros"], queryFn: fetchStatsFiltros, staleTime: 15 * 1000 });
queryClient.prefetchQuery({
  queryKey: ["pagos-all-alerts"],
  queryFn: fetchAllPagos,
  staleTime: 5 * 60 * 1000,
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/filter/:category" element={<ProtectedRoute><FilteredLots /></ProtectedRoute>} />
              <Route path="/vehiculo/:placa" element={<ProtectedRoute><VehicleDetail /></ProtectedRoute>} />
              <Route path="/gestion-pagos" element={<ProtectedRoute><GestionPagos /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
