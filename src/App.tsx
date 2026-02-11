import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import CalendarPage from "./pages/CalendarPage";
import ClientsPage from "./pages/ClientsPage";
import DeliveriesDashboardPage from "./pages/DeliveriesDashboardPage";
import DieselOrdersPage from "./pages/DieselOrdersPage";
import DriversPage from "./pages/DriversPage";
import FleetPage from "./pages/FleetPage";
import Index from "./pages/Index";
import LiveTrackingPage from "./pages/LiveTrackingPage";
import LoadsPage from "./pages/LoadsPage";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";
import ReportsPage from "./pages/ReportsPage";
import ShareableTrackingPage from "./pages/ShareableTrackingPage";
import ThirdPartyLoadsPage from "./pages/ThirdPartyLoadsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/track" element={<ShareableTrackingPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/loads"
              element={
                <ProtectedRoute>
                  <LoadsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <ProtectedRoute>
                  <CalendarPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/fleet"
              element={
                <ProtectedRoute>
                  <FleetPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/drivers"
              element={
                <ProtectedRoute>
                  <DriversPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute>
                  <ClientsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/live-tracking"
              element={
                <ProtectedRoute>
                  <LiveTrackingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/third-party"
              element={
                <ProtectedRoute>
                  <ThirdPartyLoadsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/diesel-orders"
              element={
                <ProtectedRoute>
                  <DieselOrdersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/deliveries"
              element={
                <ProtectedRoute>
                  <DeliveriesDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
