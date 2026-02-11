import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getLocationDisplayName } from "@/lib/utils";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertCircle,
  Calendar,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Package,
  RefreshCw,
  Truck,
  User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useSearchParams } from "react-router-dom";

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

interface TelematicsAsset {
  id: number;
  name: string;
  code: string;
  lastLatitude: number | null;
  lastLongitude: number | null;
  heading: number | null;
  speedKmH: number;
  inTrip: boolean;
  isEnabled: boolean;
  lastConnectedUtc: string;
}

interface TrackingShareLink {
  id: string;
  token: string;
  load_id: string;
  telematics_asset_id: string;
  expires_at: string;
  created_at: string;
  view_count: number;
  last_viewed_at: string | null;
  load?: {
    load_id: string;
    origin: string;
    destination: string;
    loading_date: string;
    offloading_date: string;
    cargo_type: string;
    status: string;
    driver?: { name: string; contact: string } | null;
    fleet_vehicle?: {
      vehicle_id: string;
      type: string;
      telematics_asset_id?: string;
    } | null;
  };
}

// Get status color based on asset state
function getStatusColor(asset: TelematicsAsset): string {
  if (!asset.isEnabled) return "#9CA3AF";
  if (asset.inTrip) return "#22C55E";
  if (asset.speedKmH > 0) return "#22C55E";
  return "#3B82F6";
}

// Get heading direction as compass point
function getHeadingDirection(heading: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(heading / 45) % 8;
  return directions[index];
}

// Format last connected time to relative string
function formatLastConnected(utcString: string): string {
  if (!utcString) return "Never";

  const date = new Date(utcString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// Create vehicle marker icon
function createVehicleIcon(asset: TelematicsAsset): L.DivIcon {
  const color = getStatusColor(asset);
  const rotation = asset.heading || 0;

  // Get fleet number from asset name or code
  const fleetNumber = asset.name || asset.code || `${asset.id}`;
  // Truncate if too long
  const displayNumber =
    fleetNumber.length > 8 ? fleetNumber.substring(0, 7) + "…" : fleetNumber;

  // Fleet number label below the icon - clean professional styling
  const fleetLabel = `
    <div style="position:absolute;top:50px;left:50%;transform:translateX(-50%);background:white;color:#1e293b;font-size:12px;padding:4px 10px;border-radius:5px;white-space:nowrap;font-weight:700;letter-spacing:0.2px;box-shadow:0 2px 4px rgba(0,0,0,0.15);border:2px solid ${color};">
      ${displayNumber}
    </div>
  `;

  return L.divIcon({
    html: `
      <div style="width:100px;height:80px;position:relative;display:flex;align-items:flex-start;justify-content:center;padding-top:0;overflow:visible;">
        <div style="
          width:48px;height:48px;border-radius:50%;background:${color};
          border:4px solid white;display:flex;align-items:center;justify-content:center;
          box-shadow:0 4px 12px rgba(0,0,0,0.3);transform:rotate(${rotation}deg);
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L12 22M12 2L5 9M12 2L19 9"/>
          </svg>
        </div>
        ${
          asset.inTrip
            ? `<div style="position:absolute;top:2px;right:22px;width:16px;height:16px;border-radius:50%;background:#22c55e;border:2px solid white;animation:pulse 1.5s infinite;"></div>`
            : ""
        }
        ${fleetLabel}
      </div>
      <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:0.7}}</style>
    `,
    className: "vehicle-marker",
    iconSize: [100, 80],
    iconAnchor: [50, 24],
    popupAnchor: [0, -24],
  });
}

// Center map on vehicle
function CenterOnVehicle({ asset }: { asset: TelematicsAsset | null }) {
  const map = useMap();

  useEffect(() => {
    if (
      asset?.lastLatitude !== null &&
      asset?.lastLatitude !== undefined &&
      asset?.lastLongitude !== null &&
      asset?.lastLongitude !== undefined
    ) {
      console.log(
        "CenterOnVehicle: centering map on",
        asset.lastLatitude,
        asset.lastLongitude,
      );
      map.setView([asset.lastLatitude, asset.lastLongitude], 14);
    }
  }, [asset, map]);

  return null;
}

// Format remaining time until expiry
function formatTimeRemaining(expiresAt: string): string {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) return "Expired";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h remaining`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
}

export default function ShareableTrackingPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [shareLink, setShareLink] = useState<TrackingShareLink | null>(null);
  const [asset, setAsset] = useState<TelematicsAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [loadingVehicle, setLoadingVehicle] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log("Tracking Page State:", {
      token,
      shareLinkId: shareLink?.id,
      assetId: asset?.id,
      hasPosition:
        asset?.lastLatitude !== null && asset?.lastLongitude !== null,
      position: asset ? [asset.lastLatitude, asset.lastLongitude] : null,
      loadingVehicle,
    });
  }, [token, shareLink, asset, loadingVehicle]);

  // Fetch the share link data
  const fetchShareLink = useCallback(async () => {
    if (!token) {
      setError("No tracking token provided");
      setLoading(false);
      return;
    }

    try {
      console.log("Fetching share link for token:", token);

      const { data, error: fetchError } = await supabase
        .from("tracking_share_links")
        .select(
          `
          *,
          load:loads(
            load_id,
            origin,
            destination,
            loading_date,
            offloading_date,
            cargo_type,
            status,
            driver:drivers!loads_driver_id_fkey(name, contact),
            fleet_vehicle:fleet_vehicles(vehicle_id, type, telematics_asset_id)
          )
        `,
        )
        .eq("token", token)
        .single();

      if (fetchError) {
        console.error("Error fetching share link:", fetchError);
        setError("Invalid or expired tracking link");
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Tracking link not found");
        setLoading(false);
        return;
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        setError("This tracking link has expired");
        setLoading(false);
        return;
      }

      console.log("Share link loaded:", data);
      setShareLink(data);

      // Update view count
      await supabase
        .from("tracking_share_links")
        .update({
          view_count: (data.view_count || 0) + 1,
          last_viewed_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    } catch (err) {
      console.error("Failed to load tracking data:", err);
      setError("Failed to load tracking data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch vehicle position from Edge Function
  const fetchVehiclePosition = useCallback(async () => {
    if (!shareLink || !token) {
      console.log("Missing shareLink or token");
      return;
    }

    setLoadingVehicle(true);
    setVehicleError(null);

    try {
      console.log("Fetching vehicle position for token:", token);

      // Determine which asset ID to use
      const assetId =
        shareLink.load?.fleet_vehicle?.telematics_asset_id ||
        shareLink.telematics_asset_id;

      console.log("Share link data:", {
        telematicsAssetId: shareLink.telematics_asset_id,
        fleetVehicleAssetId: shareLink.load?.fleet_vehicle?.telematics_asset_id,
        resolvedAssetId: assetId,
      });

      if (!assetId) {
        setVehicleError("No vehicle assigned to this tracking link");
        setLoadingVehicle(false);
        return;
      }

      console.log("Using asset ID:", assetId);

      // Call the Edge Function
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error("Missing Supabase configuration");
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/telematics-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            action: "getAssetByShareToken",
            shareToken: token,
            assetId: assetId,
          }),
        },
      );

      const responseText = await response.text();
      console.log("Edge Function raw response:", responseText);

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse response as JSON:", responseText);
        throw new Error("Invalid response from tracking service");
      }

      if (!response.ok) {
        console.error("Edge Function failed:", response.status, responseData);
        setVehicleError(
          responseData.error || "Failed to fetch vehicle position",
        );
        return;
      }

      console.log("Asset data received:", responseData);

      // Check if we have valid position data - the Edge Function now returns normalized data
      // Use typeof check since coordinates could be 0 (valid) or null
      const hasLatitude = typeof responseData.lastLatitude === "number";
      const hasLongitude = typeof responseData.lastLongitude === "number";

      if (responseData && (hasLatitude || hasLongitude)) {
        // Data is already normalized by the Edge Function
        const normalizedAsset: TelematicsAsset = {
          id: responseData.id ?? parseInt(assetId) ?? 0,
          name:
            responseData.name ||
            shareLink.load?.fleet_vehicle?.vehicle_id ||
            "Vehicle",
          code: responseData.code || `ASSET-${assetId}`,
          lastLatitude: hasLatitude ? responseData.lastLatitude : null,
          lastLongitude: hasLongitude ? responseData.lastLongitude : null,
          heading: responseData.heading ?? 0,
          speedKmH: responseData.speedKmH ?? 0,
          inTrip: responseData.inTrip ?? false,
          isEnabled: responseData.isEnabled ?? true,
          lastConnectedUtc:
            responseData.lastConnectedUtc || new Date().toISOString(),
        };

        console.log("Setting normalized asset:", normalizedAsset);
        console.log(
          "Position check - lat:",
          normalizedAsset.lastLatitude,
          "lng:",
          normalizedAsset.lastLongitude,
        );
        setAsset(normalizedAsset);
        setLastUpdate(new Date());
      } else {
        console.warn("No valid position data in response:", responseData);
        // Still set the asset even without position - show vehicle info with "position unavailable" message
        const partialAsset: TelematicsAsset = {
          id: responseData.id ?? parseInt(assetId) ?? 0,
          name:
            responseData.name ||
            shareLink.load?.fleet_vehicle?.vehicle_id ||
            "Vehicle",
          code: responseData.code || `ASSET-${assetId}`,
          lastLatitude: null,
          lastLongitude: null,
          heading: responseData.heading ?? 0,
          speedKmH: responseData.speedKmH ?? 0,
          inTrip: responseData.inTrip ?? false,
          isEnabled: responseData.isEnabled ?? true,
          lastConnectedUtc:
            responseData.lastConnectedUtc || new Date().toISOString(),
        };
        setAsset(partialAsset);
        setVehicleError(
          "GPS position not currently available. Will retry automatically.",
        );
      }
    } catch (err) {
      console.error("Error fetching vehicle position:", err);
      setVehicleError("Failed to connect to tracking service");
    } finally {
      setLoadingVehicle(false);
    }
  }, [shareLink, token]);

  // Note: Real-time updates are handled via polling (auto-refresh every 30 seconds)
  // The Telematics Guru API doesn't support real-time WebSocket connections,
  // so we poll the Edge Function periodically instead.
  // The realtimeConnected state is kept for UI purposes but always shows as polling mode.

  // Initial load
  useEffect(() => {
    fetchShareLink();
  }, [fetchShareLink]);

  // Fetch vehicle position after share link is loaded
  useEffect(() => {
    if (shareLink && !loading) {
      console.log("Share link loaded, fetching vehicle position...");
      fetchVehiclePosition();
    }
  }, [shareLink, loading, fetchVehiclePosition]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!shareLink || loadingVehicle) return;

    console.log("Setting up auto-refresh interval");
    const interval = setInterval(() => {
      console.log("Auto-refreshing vehicle position...");
      fetchVehiclePosition();
    }, 30000);

    return () => {
      console.log("Cleaning up auto-refresh interval");
      clearInterval(interval);
    };
  }, [shareLink, loadingVehicle, fetchVehiclePosition]);

  const defaultCenter: [number, number] = [-19.0, 31.0]; // Zimbabwe

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading tracking data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Tracking Unavailable
              </h2>
              <p className="text-gray-600">{error}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const load = shareLink?.load;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  Live Vehicle Tracking
                </h1>
                <p className="text-sm text-gray-500">
                  Load: {load?.load_id || "Unknown"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {shareLink && (
                <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {formatTimeRemaining(shareLink.expires_at)}
                </span>
              )}
              {asset && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                  <div className="w-2 h-2 bg-green-500 rounded-full inline-block mr-1 animate-pulse"></div>
                  Auto-refresh
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchVehiclePosition}
                disabled={loadingVehicle || !shareLink}
              >
                {loadingVehicle ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Load Details Card */}
        {load && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                Delivery Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Route Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-green-500" />
                    <span className="font-medium">From:</span>
                    <span>{getLocationDisplayName(load.origin)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-red-500" />
                    <span className="font-medium">To:</span>
                    <span>{getLocationDisplayName(load.destination)}</span>
                  </div>
                </div>

                {/* Dates */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">Loading:</span>
                    <span>
                      {new Date(load.loading_date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">Expected Arrival:</span>
                    <span>
                      {new Date(load.offloading_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Driver & Vehicle */}
                <div className="space-y-2">
                  {load.driver && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">Driver:</span>
                      <span>{load.driver.name}</span>
                    </div>
                  )}
                  {load.fleet_vehicle && (
                    <div className="flex items-center gap-2 text-sm">
                      <Truck className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">Vehicle:</span>
                      <span>{load.fleet_vehicle.vehicle_id}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Bar */}
        {asset && (
          <Card>
            <CardContent className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getStatusColor(asset) }}
                    />
                    <span className="text-sm font-medium">
                      {asset.inTrip ? "In Transit" : "Stationary"}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    <Navigation className="w-4 h-4 inline mr-1" />
                    {asset.speedKmH} km/h •{" "}
                    {getHeadingDirection(asset.heading || 0)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {lastUpdate && (
                    <span className="text-xs text-gray-500">
                      Last updated: {lastUpdate.toLocaleTimeString()}
                    </span>
                  )}
                  {shareLink && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      Tracking active
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vehicle Error State */}
        {vehicleError && !asset && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3 text-orange-600">
                <AlertCircle className="w-5 h-5" />
                <div>
                  <p className="font-medium">Vehicle Position Unavailable</p>
                  <p className="text-sm text-gray-500">{vehicleError}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchVehiclePosition}
                  disabled={loadingVehicle}
                  className="ml-auto"
                >
                  {loadingVehicle ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Retry"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading Vehicle State */}
        {loadingVehicle && !asset && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading vehicle position...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Map */}
        <Card className="overflow-hidden">
          <div className="h-[60vh] min-h-[400px] relative">
            {loadingVehicle && !asset && (
              <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-gray-500">Loading vehicle position...</p>
                </div>
              </div>
            )}
            <MapContainer
              center={
                asset?.lastLatitude !== null &&
                asset?.lastLatitude !== undefined &&
                asset?.lastLongitude !== null &&
                asset?.lastLongitude !== undefined
                  ? [asset.lastLatitude, asset.lastLongitude]
                  : defaultCenter
              }
              zoom={
                asset?.lastLatitude !== null &&
                asset?.lastLatitude !== undefined &&
                asset?.lastLongitude !== null &&
                asset?.lastLongitude !== undefined
                  ? 14
                  : 7
              }
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">Carto</a>'
              />

              {/* Vehicle Marker */}
              {asset &&
              asset.lastLatitude !== null &&
              asset.lastLatitude !== undefined &&
              asset.lastLongitude !== null &&
              asset.lastLongitude !== undefined ? (
                <Marker
                  position={[asset.lastLatitude, asset.lastLongitude]}
                  icon={createVehicleIcon(asset)}
                >
                  <Popup>
                    <div className="min-w-[200px]">
                      <div className="font-bold text-lg mb-2">
                        {asset.name ||
                          load?.fleet_vehicle?.vehicle_id ||
                          "Vehicle"}
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Status:</span>
                          <span>
                            {asset.inTrip ? "In Transit" : "Stationary"}
                          </span>
                        </div>
                        {asset.speedKmH > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Speed:</span>
                            <span>{asset.speedKmH} km/h</span>
                          </div>
                        )}
                        {(asset.heading || asset.heading === 0) && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Heading:</span>
                            <span>
                              {getHeadingDirection(asset.heading)} (
                              {asset.heading}°)
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Last update:</span>
                          <span>
                            {lastUpdate
                              ? lastUpdate.toLocaleTimeString()
                              : "Unknown"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ) : (
                asset && (
                  <div className="leaflet-top leaflet-right">
                    <div className="leaflet-control bg-white p-3 m-2 rounded shadow-lg max-w-xs">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-blue-600" />
                        <span className="font-medium">
                          {asset.name || "Vehicle"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        Vehicle is being tracked but GPS position is not
                        currently available. Location will update automatically
                        when available.
                      </p>
                    </div>
                  </div>
                )
              )}

              <CenterOnVehicle asset={asset} />
            </MapContainer>
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500 py-4">
          <p>
            This tracking link will expire{" "}
            {shareLink &&
              formatTimeRemaining(shareLink.expires_at).toLowerCase()}
          </p>
          <p className="mt-1">
            Auto-refreshes every 30 seconds • Powered by Telematics Guru
          </p>
        </div>
      </div>
    </div>
  );
}
