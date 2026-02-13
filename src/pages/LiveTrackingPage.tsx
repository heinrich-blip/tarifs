import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getActiveLoadsForTracking,
  type ActiveLoadForTracking,
} from "@/lib/api";
import { DEPOTS } from "@/lib/depots";
import { useCustomLocations } from "@/hooks/useCustomLocations";
import {
  authenticate,
  clearAuth,
  formatLastConnected,
  getAssetsWithPositions,
  getGeofences,
  getHeadingDirection,
  getStatusColor,
  isAuthenticated,
  type TelematicsAsset,
  type TelematicsGeofence,
} from "@/lib/telematicsGuru";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertCircle,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Package,
  RefreshCw,
  Route,
  Settings,
  Target,
  Truck,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { Link } from "react-router-dom";
import { toast } from "sonner";

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}h ${remainingMinutes}m`;
}

function calculateETA(
  vehicle: TelematicsAsset,
  geofence: TelematicsGeofence,
): {
  eta: Date | null;
  etaFormatted: string;
  distance: number;
  distanceFormatted: string;
  durationMinutes: number;
  durationFormatted: string;
  speed: number;
  isMoving: boolean;
} {
  const vehicleLat = vehicle.lastLatitude;
  const vehicleLng = vehicle.lastLongitude;
  const geofenceLat =
    geofence.latitude ?? geofence.centerLatitude ?? geofence.lat;
  const geofenceLng =
    geofence.longitude ?? geofence.centerLongitude ?? geofence.lng;

  if (!vehicleLat || !vehicleLng || !geofenceLat || !geofenceLng) {
    return {
      eta: null,
      etaFormatted: "N/A",
      distance: 0,
      distanceFormatted: "N/A",
      durationMinutes: 0,
      durationFormatted: "N/A",
      speed: vehicle.speedKmH || 0,
      isMoving: vehicle.speedKmH > 0 || vehicle.inTrip,
    };
  }

  const distance = calculateDistance(
    vehicleLat,
    vehicleLng,
    geofenceLat,
    geofenceLng,
  );
  const distanceFormatted = formatDistance(distance);
  const speed = vehicle.speedKmH || 0;
  const isMoving = speed > 0 || vehicle.inTrip;
  const effectiveSpeed = isMoving ? Math.max(speed, 20) : 50;
  const durationMinutes = (distance / effectiveSpeed) * 60;
  const durationFormatted = formatDuration(durationMinutes);
  const now = new Date();
  const eta = new Date(now.getTime() + durationMinutes * 60000);
  const etaFormatted = eta.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    eta,
    etaFormatted,
    distance,
    distanceFormatted,
    durationMinutes,
    durationFormatted,
    speed: vehicle.speedKmH || 0,
    isMoving,
  };
}

function createVehicleIcon(
  asset: TelematicsAsset,
  hasActiveLoad = false,
): L.DivIcon {
  const isStationary = asset.speedKmH < 5 && !asset.inTrip;
  const color = isStationary ? "#ef4444" : getStatusColor(asset);
  const rotation = asset.heading || 0;
  const fleetNumber = asset.name || asset.code || `${asset.id}`;
  const displayNumber =
    fleetNumber.length > 8 ? fleetNumber.substring(0, 7) + "…" : fleetNumber;

  const loadIndicator = hasActiveLoad
    ? `
    <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:#7c3aed;color:white;font-size:8px;padding:1px 4px;border-radius:4px;white-space:nowrap;font-weight:bold;border:1px solid white;">
      LOAD
    </div>
  `
    : "";

  const statusIndicator = asset.inTrip
    ? `<div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid white;animation:pulse 1.5s infinite;"></div>`
    : "";

  const iconContent = isStationary
    ? ""
    : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L12 22M12 2L5 9M12 2L19 9"/>
      </svg>`;

  const fleetLabel = `
    <div style="position:absolute;top:30px;left:50%;transform:translateX(-50%);background:white;color:#1e293b;font-size:10px;padding:2px 8px;border-radius:4px;white-space:nowrap;font-weight:700;letter-spacing:0.2px;box-shadow:0 1px 3px rgba(0,0,0,0.2);border:1.5px solid ${color};">
      ${displayNumber}
    </div>
  `;

  return L.divIcon({
    html: `
      <div style="width:80px;height:${hasActiveLoad ? "70px" : "55px"};position:relative;display:flex;align-items:flex-start;justify-content:center;padding-top:0;overflow:visible;">
        <div style="
          width:28px;height:28px;border-radius:50%;background:${color};
          border:3px solid ${hasActiveLoad ? "#7c3aed" : "white"};display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);${isStationary ? "" : `transform:rotate(${rotation}deg);`}
        ">
          ${iconContent}
        </div>
        ${statusIndicator}
        ${fleetLabel}
        ${loadIndicator}
      </div>
      <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:0.7}}</style>
    `,
    className: "vehicle-marker",
    iconSize: [80, hasActiveLoad ? 70 : 55],
    iconAnchor: [40, 14],
    popupAnchor: [0, -14],
  });
}

function FitBounds({ assets }: { assets: TelematicsAsset[] }) {
  const map = useMap();

  useEffect(() => {
    if (assets.length === 0) return;

    const validAssets = assets.filter(
      (a) => a.lastLatitude !== null && a.lastLongitude !== null,
    );
    if (validAssets.length === 0) return;

    const bounds = L.latLngBounds(
      validAssets.map((a) => [a.lastLatitude!, a.lastLongitude!]),
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [assets, map]);

  return null;
}

export default function LiveTrackingPage() {
  const [assets, setAssets] = useState<TelematicsAsset[]>([]);
  const [activeLoads, setActiveLoads] = useState<ActiveLoadForTracking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showLoadsPanel, setShowLoadsPanel] = useState(true);
  const [geofences, setGeofences] = useState<TelematicsGeofence[]>([]);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showDepots, setShowDepots] = useState(true);
  const [showCustomLocations, setShowCustomLocations] = useState(true);
  const { data: customLocations = [] } = useCustomLocations();
  const [maximizeMap, setMaximizeMap] = useState(false);
  const [showRouteCalculator, setShowRouteCalculator] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(
    null,
  );
  const [selectedGeofenceId, setSelectedGeofenceId] = useState<number | null>(
    null,
  );
  const [etaResult, setEtaResult] = useState<{
    eta: Date | null;
    etaFormatted: string;
    distance: number;
    distanceFormatted: string;
    durationMinutes: number;
    durationFormatted: string;
    speed: number;
    isMoving: boolean;
  } | null>(null);

  // Auth form state
  const [username, setUsername] = useState(
    localStorage.getItem("tg_username") || "",
  );
  const [password, setPassword] = useState("");
  const [organisationId, setOrganisationId] = useState(
    localStorage.getItem("telematics_org_id") || "4002",
  );
  const [authLoading, setAuthLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    localStorage.getItem("tg_remember") === "true",
  );

  // Auto-authenticate on mount
  useEffect(() => {
    const autoLogin = async () => {
      if (isAuthenticated()) {
        setAuthenticated(true);
        return;
      }

      const savedUsername = localStorage.getItem("tg_username");
      const savedPassword = localStorage.getItem("tg_password");
      const savedRemember = localStorage.getItem("tg_remember") === "true";

      if (savedRemember && savedUsername && savedPassword) {
        setAuthLoading(true);
        const success = await authenticate(savedUsername, atob(savedPassword));
        if (success) {
          setAuthenticated(true);
        } else {
          localStorage.removeItem("tg_password");
          localStorage.removeItem("tg_remember");
          setRememberMe(false);
          setShowAuthDialog(true);
        }
        setAuthLoading(false);
      } else if (!isAuthenticated()) {
        setShowAuthDialog(true);
      }
    };

    autoLogin();
  }, []);

  const fetchAssets = useCallback(async () => {
    if (!authenticated || !organisationId) return;

    setLoading(true);
    setError(null);

    try {
      const [telematicsData, loadsResponse, geofenceData] = await Promise.all([
        getAssetsWithPositions(parseInt(organisationId)),
        getActiveLoadsForTracking().catch(() => ({
          data: { activeLoads: [] },
        })),
        getGeofences(parseInt(organisationId)).catch(() => []),
      ]);

      setAssets(telematicsData);
      setActiveLoads(loadsResponse.data?.activeLoads || []);
      setGeofences(geofenceData || []);
      setLastRefresh(new Date());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch vehicles";
      setError(message);
      toast.error(message);
      if (message.includes("Authentication") || message.includes("expired")) {
        setAuthenticated(false);
        setShowAuthDialog(true);
      }
    } finally {
      setLoading(false);
    }
  }, [authenticated, organisationId]);

  const assetToLoadMap = useMemo(() => {
    const map = new Map<string | number, ActiveLoadForTracking>();
    activeLoads.forEach((load) => {
      if (load.vehicle?.telematicsAssetId) {
        map.set(load.vehicle.telematicsAssetId, load);
      }
      if (load.vehicle?.registration) {
        map.set(load.vehicle.registration.toLowerCase(), load);
      }
    });
    return map;
  }, [activeLoads]);

  const getLoadForAsset = useCallback(
    (asset: TelematicsAsset): ActiveLoadForTracking | null => {
      if (assetToLoadMap.has(asset.id)) {
        return assetToLoadMap.get(asset.id)!;
      }
      const assetName = (asset.name || asset.code || "").toLowerCase();
      if (assetName && assetToLoadMap.has(assetName)) {
        return assetToLoadMap.get(assetName)!;
      }
      return null;
    },
    [assetToLoadMap],
  );

  // Calculate ETA when vehicle and geofence are selected
  useEffect(() => {
    if (!selectedVehicleId || !selectedGeofenceId) {
      setEtaResult(null);
      return;
    }

    const vehicle = assets.find((a) => a.id === selectedVehicleId);
    const geofence = geofences.find((g) => g.id === selectedGeofenceId);

    if (!vehicle || !geofence) {
      setEtaResult(null);
      return;
    }

    const result = calculateETA(vehicle, geofence);
    setEtaResult(result);
  }, [selectedVehicleId, selectedGeofenceId, assets, geofences]);

  const selectedVehicle = useMemo(
    () => assets.find((a) => a.id === selectedVehicleId),
    [assets, selectedVehicleId],
  );

  const selectedGeofence = useMemo(
    () => geofences.find((g) => g.id === selectedGeofenceId),
    [geofences, selectedGeofenceId],
  );

  const handleAuth = async () => {
    if (!username || !password || !organisationId) return;

    setAuthLoading(true);
    setError(null);

    const success = await authenticate(username, password);

    if (success) {
      localStorage.setItem("telematics_org_id", organisationId);
      localStorage.setItem("tg_username", username);

      if (rememberMe) {
        localStorage.setItem("tg_password", btoa(password));
        localStorage.setItem("tg_remember", "true");
      } else {
        localStorage.removeItem("tg_password");
        localStorage.removeItem("tg_remember");
      }

      setAuthenticated(true);
      setShowAuthDialog(false);
      setPassword("");
      toast.success("Connected to Telematics Guru");
    } else {
      setError("Invalid credentials");
      toast.error("Invalid credentials");
    }

    setAuthLoading(false);
  };

  const handleLogout = () => {
    clearAuth();
    setAuthenticated(false);
    setAssets([]);
    setUsername("");
    setOrganisationId("");
    setRememberMe(false);
    localStorage.removeItem("telematics_org_id");
    localStorage.removeItem("tg_username");
    localStorage.removeItem("tg_password");
    localStorage.removeItem("tg_remember");
    toast.success("Disconnected from Telematics");
  };

  // Initial fetch when authenticated
  useEffect(() => {
    if (authenticated && organisationId) {
      fetchAssets();
    }
  }, [authenticated, organisationId, fetchAssets]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !authenticated) return;

    const intervalId = setInterval(fetchAssets, refreshInterval * 1000);
    return () => clearInterval(intervalId);
  }, [autoRefresh, authenticated, refreshInterval, fetchAssets]);

  const stats = useMemo(() => {
    const moving = assets.filter((a) => a.speedKmH >= 5 || a.inTrip).length;
    const stationary = assets.filter((a) => a.speedKmH < 5 && !a.inTrip).length;
    const offline = assets.filter((a) => {
      if (!a.lastConnectedUtc) return true;
      return Date.now() - new Date(a.lastConnectedUtc).getTime() > 3600000;
    }).length;

    return { total: assets.length, moving, stationary, offline };
  }, [assets]);

  const defaultCenter: [number, number] = [-19.0, 31.0];

  return (
    <MainLayout title="Live Tracking">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Live Vehicle Tracking</h1>
            <p className="text-sm text-muted-foreground">
              Real-time fleet positions from Telematics Guru
            </p>
          </div>
          <div className="flex items-center gap-2">
            {authenticated ? (
              <>
                <Button
                  variant="outline"
                  onClick={fetchAssets}
                  disabled={loading}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowSettingsDialog(true)}
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Button onClick={() => setShowAuthDialog(true)}>
                <Truck className="w-4 h-4 mr-2" />
                Connect to Telematics
              </Button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {authenticated && !maximizeMap && (
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="p-2 bg-muted rounded-lg">
                  <Truck className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Vehicles
                  </p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Truck className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Moving</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {stats.moving}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Stationary</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {stats.stationary}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Loads</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {activeLoads.length}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="p-2 bg-muted rounded-lg">
                  <AlertCircle className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Offline</p>
                  <p className="text-2xl font-bold text-muted-foreground">
                    {stats.offline}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Route/ETA Calculator Panel */}
        {authenticated && geofences.length > 0 && !maximizeMap && (
          <Card className="border-indigo-200 dark:border-indigo-800">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Route className="w-5 h-5 text-indigo-600" />
                Route & ETA Calculator
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRouteCalculator(!showRouteCalculator)}
              >
                {showRouteCalculator ? "Hide" : "Show"}
              </Button>
            </CardHeader>
            {showRouteCalculator && (
              <CardContent className="pt-0">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Select Vehicle
                    </Label>
                    <select
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                      value={selectedVehicleId || ""}
                      onChange={(e) =>
                        setSelectedVehicleId(
                          e.target.value ? parseInt(e.target.value) : null,
                        )
                      }
                    >
                      <option value="">Choose a vehicle...</option>
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name || asset.code || `Vehicle ${asset.id}`}
                          {asset.speedKmH > 0
                            ? ` (${asset.speedKmH} km/h)`
                            : " (Stationary)"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Destination Geofence
                    </Label>
                    <select
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                      value={selectedGeofenceId || ""}
                      onChange={(e) =>
                        setSelectedGeofenceId(
                          e.target.value ? parseInt(e.target.value) : null,
                        )
                      }
                    >
                      <option value="">Choose a destination...</option>
                      {geofences.map((geofence) => (
                        <option key={geofence.id} value={geofence.id}>
                          {geofence.name}
                          {geofence.description
                            ? ` - ${geofence.description}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {etaResult && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Estimated Arrival
                        </Label>
                        <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800">
                          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                            {etaResult.etaFormatted}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {etaResult.durationFormatted}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <Navigation className="w-4 h-4" />
                          Distance & Speed
                        </Label>
                        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {etaResult.distanceFormatted}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {etaResult.isMoving
                              ? `Moving at ${Math.round(etaResult.speed)} km/h`
                              : "Vehicle stationary"}
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {(!selectedVehicleId || !selectedGeofenceId) && (
                    <div className="md:col-span-2 flex items-center justify-center p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">
                        Select a vehicle and destination to calculate ETA
                      </p>
                    </div>
                  )}
                </div>

                {(selectedVehicleId || selectedGeofenceId) && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedVehicleId(null);
                        setSelectedGeofenceId(null);
                        setEtaResult(null);
                      }}
                    >
                      Clear Selection
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* Error Alert */}
        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Map Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="w-5 h-5" />
              Fleet Map
            </CardTitle>
            <div className="flex items-center gap-4">
              <Button
                variant={maximizeMap ? "default" : "outline"}
                size="sm"
                onClick={() => setMaximizeMap((v) => !v)}
                className="gap-2"
              >
                {maximizeMap ? "Exit Full Screen" : "Full Screen"}
              </Button>
              <Button
                variant={showDepots ? "default" : "outline"}
                size="sm"
                onClick={() => setShowDepots(!showDepots)}
                className="gap-2"
              >
                <MapPin className="w-4 h-4" />
                Depots ({DEPOTS.length})
              </Button>
              {authenticated && geofences.length > 0 && (
                <Button
                  variant={showGeofences ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowGeofences(!showGeofences)}
                  className="gap-2"
                >
                  <Target className="w-4 h-4" />
                  Geofences ({geofences.length})
                </Button>
              )}
              {lastRefresh && (
                <span className="text-sm text-muted-foreground">
                  Last updated: {lastRefresh.toLocaleTimeString()}
                  {autoRefresh && ` • Auto-refresh: ${refreshInterval}s`}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!authenticated ? (
              <div className="h-[500px] flex flex-col items-center justify-center bg-muted/30 rounded-b-lg">
                <Truck className="w-16 h-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">
                  Connect to Telematics Guru
                </p>
                <p className="text-muted-foreground mb-4">
                  Sign in to view your fleet&apos;s live positions
                </p>
                <Button onClick={() => setShowAuthDialog(true)}>
                  <Truck className="w-4 h-4 mr-2" />
                  Connect Now
                </Button>
              </div>
            ) : loading && assets.length === 0 ? (
              <div className={`${maximizeMap ? "h-[calc(100vh-160px)]" : "h-[500px]"} flex items-center justify-center`}>
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className={`${maximizeMap ? "h-[calc(100vh-160px)]" : "h-[500px]"} rounded-b-lg overflow-hidden`}>
                <MapContainer
                  center={defaultCenter}
                  zoom={7}
                  style={{ height: "100%", width: "100%" }}
                  scrollWheelZoom
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://carto.com/">Carto</a>'
                  />

                  {/* Geofences */}
                  {showGeofences &&
                    geofences.map((geofence) => {
                      const lat =
                        geofence.latitude ??
                        geofence.centerLatitude ??
                        geofence.lat;
                      const lng =
                        geofence.longitude ??
                        geofence.centerLongitude ??
                        geofence.lng;
                      const radius = geofence.radius || 500;

                      if (!lat || !lng) return null;

                      return (
                        <Circle
                          key={geofence.id}
                          center={[lat, lng]}
                          radius={radius}
                          pathOptions={{
                            color: "#8b5cf6",
                            fillColor: "#8b5cf6",
                            fillOpacity: 0.15,
                            weight: 2,
                          }}
                        >
                          <Tooltip permanent={false} direction="top">
                            <div className="font-semibold">{geofence.name}</div>
                            {geofence.description && (
                              <div className="text-xs text-gray-500">
                                {geofence.description}
                              </div>
                            )}
                          </Tooltip>
                        </Circle>
                      );
                    })}

                  {/* Fixed Depot Markers */}
                  {showDepots &&
                    DEPOTS.map((depot) => {
                      const depotIcon = L.divIcon({
                        className: "depot-marker",
                        html: `
                          <div style="
                            background: ${depot.type === 'depot' ? '#059669' : depot.type === 'warehouse' ? '#0284c7' : depot.type === 'market' ? '#dc2626' : '#9333ea'};
                            width: 28px;
                            height: 28px;
                            border-radius: 50%;
                            border: 3px solid white;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                          ">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M20 9v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9"/>
                              <path d="M9 22V12h6v10"/>
                              <path d="M2 10.6L12 2l10 8.6"/>
                            </svg>
                          </div>
                        `,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14],
                      });

                      return (
                        <React.Fragment key={depot.id}>
                          <Circle
                            center={[depot.latitude, depot.longitude]}
                            radius={depot.radius}
                            pathOptions={{
                              color: depot.type === 'depot' ? '#059669' : depot.type === 'warehouse' ? '#0284c7' : depot.type === 'market' ? '#dc2626' : '#9333ea',
                              fillColor: depot.type === 'depot' ? '#059669' : depot.type === 'warehouse' ? '#0284c7' : depot.type === 'market' ? '#dc2626' : '#9333ea',
                              fillOpacity: 0.2,
                              weight: 2,
                              dashArray: '5, 5',
                            }}
                          />
                          <Marker
                            position={[depot.latitude, depot.longitude]}
                            icon={depotIcon}
                          >
                            <Popup>
                              <div className="p-1">
                                <div className="font-bold text-base">{depot.name}</div>
                                <div className="text-sm text-gray-600">
                                  {depot.type.charAt(0).toUpperCase() + depot.type.slice(1)} • {depot.country}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {depot.latitude.toFixed(5)}, {depot.longitude.toFixed(5)}
                                </div>
                                <div className="text-xs text-green-600 mt-1 font-medium">
                                  ✓ Fixed Depot Coordinate
                                </div>
                              </div>
                            </Popup>
                            <Tooltip permanent={false} direction="top">
                              <div className="font-semibold">{depot.name}</div>
                              <div className="text-xs text-gray-500">
                                {depot.type.charAt(0).toUpperCase() + depot.type.slice(1)}
                              </div>
                            </Tooltip>
                          </Marker>
                        </React.Fragment>
                      );
                    })}

                  {/* Custom Location Markers (user-defined geofences) */}
                  {showCustomLocations &&
                    customLocations.map((loc) => {
                      const locIcon = L.divIcon({
                        className: "custom-location-marker",
                        html: `
                          <div style="
                            background: #f97316;
                            width: 26px;
                            height: 26px;
                            border-radius: 50%;
                            border: 3px solid white;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                          ">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                              <circle cx="12" cy="10" r="3"/>
                            </svg>
                          </div>
                        `,
                        iconSize: [26, 26],
                        iconAnchor: [13, 13],
                      });

                      return (
                        <React.Fragment key={loc.id}>
                          <Circle
                            center={[Number(loc.latitude), Number(loc.longitude)]}
                            radius={loc.radius || 500}
                            pathOptions={{
                              color: '#f97316',
                              fillColor: '#f97316',
                              fillOpacity: 0.2,
                              weight: 2,
                              dashArray: '5, 5',
                            }}
                          />
                          <Marker
                            position={[Number(loc.latitude), Number(loc.longitude)]}
                            icon={locIcon}
                          >
                            <Popup>
                              <div className="p-1">
                                <div className="font-bold text-base">{loc.name}</div>
                                <div className="text-sm text-gray-600">
                                  {loc.type.charAt(0).toUpperCase() + loc.type.slice(1)} • {loc.country}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {Number(loc.latitude).toFixed(5)}, {Number(loc.longitude).toFixed(5)}
                                </div>
                                <div className="text-xs text-orange-600 mt-1 font-medium">
                                  ★ Custom Location
                                </div>
                              </div>
                            </Popup>
                            <Tooltip permanent={false} direction="top">
                              <div className="font-semibold">{loc.name}</div>
                              <div className="text-xs text-orange-500">
                                ★ Custom
                              </div>
                            </Tooltip>
                          </Marker>
                        </React.Fragment>
                      );
                    })}

                  {/* Route Line */}
                  {selectedVehicle &&
                    selectedGeofence &&
                    selectedVehicle.lastLatitude &&
                    selectedVehicle.lastLongitude &&
                    (() => {
                      const destLat =
                        selectedGeofence.latitude ??
                        selectedGeofence.centerLatitude ??
                        selectedGeofence.lat;
                      const destLng =
                        selectedGeofence.longitude ??
                        selectedGeofence.centerLongitude ??
                        selectedGeofence.lng;
                      if (!destLat || !destLng) return null;

                      return (
                        <Polyline
                          positions={[
                            [
                              selectedVehicle.lastLatitude,
                              selectedVehicle.lastLongitude,
                            ],
                            [destLat, destLng],
                          ]}
                          pathOptions={{
                            color: "#4f46e5",
                            weight: 3,
                            dashArray: "10, 10",
                            opacity: 0.8,
                          }}
                        >
                          <Tooltip permanent direction="center">
                            <div className="text-xs font-medium">
                              {etaResult ? (
                                <>
                                  <div>{etaResult.distanceFormatted}</div>
                                  <div className="text-indigo-600">
                                    ETA: {etaResult.etaFormatted}
                                  </div>
                                </>
                              ) : (
                                "Calculating..."
                              )}
                            </div>
                          </Tooltip>
                        </Polyline>
                      );
                    })()}

                  {/* Highlight selected geofence */}
                  {selectedGeofence &&
                    (() => {
                      const lat =
                        selectedGeofence.latitude ??
                        selectedGeofence.centerLatitude ??
                        selectedGeofence.lat;
                      const lng =
                        selectedGeofence.longitude ??
                        selectedGeofence.centerLongitude ??
                        selectedGeofence.lng;
                      const radius = selectedGeofence.radius || 500;
                      if (!lat || !lng) return null;

                      return (
                        <Circle
                          center={[lat, lng]}
                          radius={radius}
                          pathOptions={{
                            color: "#4f46e5",
                            fillColor: "#4f46e5",
                            fillOpacity: 0.3,
                            weight: 3,
                          }}
                        />
                      );
                    })()}

                  {assets.map((asset) => {
                    const load = getLoadForAsset(asset);
                    const hasActiveLoad = !!load;

                    return asset.lastLatitude !== null &&
                      asset.lastLongitude !== null ? (
                      <Marker
                        key={asset.id}
                        position={[asset.lastLatitude, asset.lastLongitude]}
                        icon={createVehicleIcon(asset, hasActiveLoad)}
                      >
                        <Popup>
                          <div className="min-w-[220px]">
                            <div className="font-bold text-lg mb-2">
                              {asset.name ||
                                asset.code ||
                                `Vehicle ${asset.id}`}
                            </div>

                            {load && (
                              <div className="mb-3 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                <div className="flex items-center gap-1 text-purple-700 dark:text-purple-400 font-semibold text-sm mb-1">
                                  <Package className="w-4 h-4" />
                                  Active Delivery
                                </div>
                                <div className="text-xs space-y-1">
                                  <div>
                                    <span className="font-medium">Load:</span>{" "}
                                    {load.load_id}
                                  </div>
                                  <div>
                                    <span className="font-medium">From:</span>{" "}
                                    {load.origin || "N/A"}
                                  </div>
                                  <div>
                                    <span className="font-medium">To:</span>{" "}
                                    {load.destination || "N/A"}
                                  </div>
                                  <div>
                                    <span className="font-medium">Status:</span>
                                    <span
                                      className={`ml-1 px-1.5 py-0.5 rounded text-xs ${
                                        load.status === "in_transit"
                                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                                          : load.status === "dispatched"
                                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                            : load.status === "loaded"
                                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                      }`}
                                    >
                                      {load.status?.replace("_", " ")}
                                    </span>
                                  </div>
                                  {load.driver && (
                                    <div>
                                      <span className="font-medium">
                                        Driver:
                                      </span>{" "}
                                      {load.driver.name}
                                    </div>
                                  )}
                                </div>
                                <Link
                                  to={`/loads`}
                                  className="text-xs text-purple-600 hover:underline mt-1 inline-block"
                                >
                                  View Load Details →
                                </Link>
                              </div>
                            )}

                            <div className="space-y-1 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">Speed:</span>
                                <span>{Math.round(asset.speedKmH)} km/h</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">Heading:</span>
                                <span>
                                  {getHeadingDirection(asset.heading || 0)} (
                                  {Math.round(asset.heading || 0)}°)
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">Last seen:</span>
                                <span>
                                  {formatLastConnected(asset.lastConnectedUtc)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                {asset.inTrip ? (
                                  <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded text-xs font-medium">
                                    In Trip
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-medium">
                                    Parked
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    ) : null;
                  })}
                  <FitBounds assets={assets} />
                </MapContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vehicle List */}
        {authenticated && assets.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Vehicle List</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {assets.map((asset) => {
                  const load = getLoadForAsset(asset);
                  return (
                    <div
                      key={asset.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors ${
                        load
                          ? "border-purple-300 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-900/20"
                          : ""
                      }`}
                    >
                      <div
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${
                          load ? "ring-2 ring-purple-400 ring-offset-1" : ""
                        }`}
                        style={{ backgroundColor: getStatusColor(asset) }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {asset.name || asset.code || `Vehicle ${asset.id}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {Math.round(asset.speedKmH)} km/h •{" "}
                          {formatLastConnected(asset.lastConnectedUtc)}
                        </p>
                        {load && (
                          <p className="text-xs text-purple-600 dark:text-purple-400 truncate">
                            📦 {load.load_id} → {load.destination || "N/A"}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        {asset.inTrip && (
                          <span className="px-2 py-0.5 bg-green-50 text-green-600 border border-green-200 dark:bg-green-900/30 dark:border-green-800 rounded text-xs font-medium">
                            Moving
                          </span>
                        )}
                        {load && (
                          <Link
                            to={`/loads`}
                            className="px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded text-xs font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50"
                          >
                            View Load
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Loads Panel */}
        {authenticated && activeLoads.length > 0 && showLoadsPanel && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" />
                Active Deliveries ({activeLoads.length})
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLoadsPanel(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {activeLoads.map((load) => (
                  <Link
                    key={load.id}
                    to={`/loads`}
                    className="block p-3 rounded-lg border border-purple-200 bg-purple-50/50 hover:bg-purple-100/50 dark:border-purple-800 dark:bg-purple-900/20 dark:hover:bg-purple-900/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-semibold text-purple-700 dark:text-purple-400">
                        {load.load_id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          load.status === "in_transit"
                            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                            : load.status === "dispatched"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                              : load.status === "loaded"
                                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}
                      >
                        {load.status?.replace("_", " ")}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-green-500" />
                        <span className="truncate">{load.origin || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-red-500" />
                        <span className="truncate">
                          {load.destination || "N/A"}
                        </span>
                      </div>
                      {load.vehicle && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Truck className="w-4 h-4" />
                          <span>{load.vehicle.registration}</span>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Authentication Dialog */}
        <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Connect to Telematics Guru</DialogTitle>
              <DialogDescription>
                Enter your credentials to view live tracking data
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="user@example.com"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orgId">Organisation ID</Label>
                <Input
                  id="orgId"
                  type="text"
                  placeholder="4002"
                  value={organisationId}
                  onChange={(e) => setOrganisationId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Your Matanuska org ID is 4002
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) =>
                    setRememberMe(checked as boolean)
                  }
                />
                <Label
                  htmlFor="rememberMe"
                  className="text-sm font-medium cursor-pointer"
                >
                  Remember me (stay signed in)
                </Label>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setShowAuthDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAuth}
                disabled={
                  authLoading || !username || !password || !organisationId
                }
              >
                {authLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Connect"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Tracking Settings</DialogTitle>
              <DialogDescription>
                Configure auto-refresh and connection settings
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto Refresh</Label>
                  <p className="text-sm text-muted-foreground">
                    Update vehicle positions automatically
                  </p>
                </div>
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="refreshInterval">
                  Refresh Interval (seconds)
                </Label>
                <Input
                  id="refreshInterval"
                  type="number"
                  min={10}
                  max={300}
                  value={refreshInterval}
                  onChange={(e) =>
                    setRefreshInterval(parseInt(e.target.value) || 30)
                  }
                />
              </div>
              <div className="pt-4 border-t">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    handleLogout();
                    setShowSettingsDialog(false);
                  }}
                >
                  Disconnect from Telematics
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowSettingsDialog(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}