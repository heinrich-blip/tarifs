import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientActiveLoads } from '@/hooks/useClientLoads';
import { Load } from '@/hooks/useLoads';
import { DEPOTS, findDepotByName } from '@/lib/depots';
import {
  authenticate,
  formatLastConnected,
  getAssetsWithPositions,
  getOrganisations,
  getStatusColor,
  isAuthenticated,
  type TelematicsAsset,
} from '@/lib/telematicsGuru';
import { getLocationDisplayName } from '@/lib/utils';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertCircle,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Package,
  RefreshCw,
  Truck,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react'; // Updated import
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { useParams } from 'react-router-dom';

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
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

function createVehicleIcon(
  asset: TelematicsAsset,
): L.DivIcon {
  const isStationary = asset.speedKmH < 5 && !asset.inTrip;
  const color = isStationary ? '#ef4444' : getStatusColor(asset);
  const rotation = asset.heading || 0;
  const fleetNumber = asset.name || asset.code || `${asset.id}`;
  const displayNumber =
    fleetNumber.length > 8 ? fleetNumber.substring(0, 7) + '…' : fleetNumber;

  const loadIndicator = `
    <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:#7c3aed;color:white;font-size:8px;padding:1px 4px;border-radius:4px;white-space:nowrap;font-weight:bold;border:1px solid white;">
      LOAD
    </div>
  `;

  const statusIndicator = asset.inTrip
    ? `<div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid white;animation:pulse 1.5s infinite;"></div>`
    : '';

  const iconContent = isStationary
    ? ''
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
      <div style="width:80px;height:70px;position:relative;display:flex;align-items:flex-start;justify-content:center;padding-top:0;overflow:visible;">
        <div style="
          width:28px;height:28px;border-radius:50%;background:${color};
          border:3px solid #7c3aed;display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);${isStationary ? '' : `transform:rotate(${rotation}deg);`}
        ">
          ${iconContent}
        </div>
        ${statusIndicator}
        ${fleetLabel}
        ${loadIndicator}
      </div>
      <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:0.7}}</style>
    `,
    className: 'vehicle-marker',
    iconSize: [80, 70],
    iconAnchor: [40, 14],
    popupAnchor: [0, -14],
  });
}

function FitBounds({ assets, loads }: { assets: TelematicsAsset[]; loads: Load[] }) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];

    // Add vehicle positions
    assets.forEach((a) => {
      if (a.lastLatitude !== null && a.lastLongitude !== null) {
        points.push([a.lastLatitude, a.lastLongitude]);
      }
    });

    // Add origin/destination depot locations
    loads.forEach((load) => {
      const originName = getLocationDisplayName(load.origin);
      const destName = getLocationDisplayName(load.destination);
      const originDepot = DEPOTS.find((d) => d.name === originName);
      const destDepot = DEPOTS.find((d) => d.name === destName);
      if (originDepot) points.push([originDepot.latitude, originDepot.longitude]);
      if (destDepot) points.push([destDepot.latitude, destDepot.longitude]);
    });

    if (points.length === 0) return;

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
  }, [assets, loads, map]);

  return null;
}

export default function ClientLiveMapPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { data: loads = [], isLoading: loadsLoading } = useClientActiveLoads(clientId);

  const [telematicsAssets, setTelematicsAssets] = useState<TelematicsAsset[]>([]);
  const [telematicsLoading, setTelematicsLoading] = useState(false);
  const [telematicsError, setTelematicsError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [organisationId, setOrganisationId] = useState<number | null>(() => {
    const stored = localStorage.getItem('telematics_org_id');
    return stored ? parseInt(stored) : null;
  });

  const fetchTelematicsData = useCallback(async () => {
    if (!isAuthenticated()) {
      const username = localStorage.getItem('telematics_username');
      const password = localStorage.getItem('telematics_password');
      if (username && password) {
        const success = await authenticate(username, password);
        if (!success) {
          setTelematicsError(true);
          return;
        }
        setTelematicsError(false);
      } else {
        setTelematicsError(true);
        return;
      }
    }

    setTelematicsLoading(true);
    try {
      let orgId = organisationId;
      if (!orgId) {
        const orgs = await getOrganisations();
        if (orgs && orgs.length > 0) {
          orgId = orgs[0].id;
          setOrganisationId(orgId);
          localStorage.setItem('telematics_org_id', orgId.toString());
        } else {
          setTelematicsError(true);
          return;
        }
      }

      const assets = await getAssetsWithPositions(orgId);
      setTelematicsAssets(assets || []);
      setLastRefresh(new Date());
      setTelematicsError(false);
    } catch (error) {
      console.error('Failed to fetch telematics data:', error);
      setTelematicsError(true);
    } finally {
      setTelematicsLoading(false);
    }
  }, [organisationId]);

  useEffect(() => {
    fetchTelematicsData();
    const interval = setInterval(fetchTelematicsData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchTelematicsData]);

  // Match loads to telematics assets
  const matchedLoads = useMemo(() => {
    return loads.map((load) => {
      const vehicleId = load.fleet_vehicle?.telematics_asset_id;
      const asset = vehicleId
        ? telematicsAssets.find((a) => a.id.toString() === vehicleId || a.code === vehicleId)
        : null;
      return { load, asset };
    });
  }, [loads, telematicsAssets]);

  // Get unique depots for loads
  const relevantDepots = useMemo(() => {
    const depotNames = new Set<string>();
    loads.forEach((load) => {
      const originName = getLocationDisplayName(load.origin);
      const destName = getLocationDisplayName(load.destination);
      depotNames.add(originName);
      depotNames.add(destName);
    });
    return DEPOTS.filter((d) => depotNames.has(d.name));
  }, [loads]);

  // Vehicles with loads and positions
  const trackedVehicles = matchedLoads.filter(
    (m) => m.asset && m.asset.lastLatitude && m.asset.lastLongitude
  );

  const isLoading = loadsLoading || telematicsLoading;

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-purple-500" />
              Live Tracking
            </h2>
            <p className="text-sm text-muted-foreground">
              Real-time location of your active shipments
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-sm text-muted-foreground">
                Updated {formatLastConnected(lastRefresh.toISOString())}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTelematicsData}
              disabled={telematicsLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${telematicsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Loads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-500" />
                {loads.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Transit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-500" />
                {loads.filter((l) => l.status === 'in-transit').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                {loads.filter((l) => l.status === 'scheduled').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tracked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <Navigation className="h-5 w-5 text-green-500" />
                {trackedVehicles.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Map */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <Skeleton className="w-full h-[500px]" />
            ) : telematicsError ? (
              <div className="w-full h-[500px] flex items-center justify-center bg-muted/50">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Unable to load tracking data</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={fetchTelematicsData}>
                    Try Again
                  </Button>
                </div>
              </div>
            ) : loads.length === 0 ? (
              <div className="w-full h-[500px] flex items-center justify-center bg-muted/50">
                <div className="text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No active loads to track</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Active shipments will appear here in real-time
                  </p>
                </div>
              </div>
            ) : (
              <MapContainer
                center={[-19.5, 30.5]}
                zoom={7}
                style={{ height: '500px', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <FitBounds
                  assets={trackedVehicles.map((t) => t.asset!)}
                  loads={loads}
                />

                {/* Depot Markers */}
                {relevantDepots.map((depot) => (
                  <Circle
                    key={depot.id}
                    center={[depot.latitude, depot.longitude]}
                    radius={depot.radius}
                    pathOptions={{
                      color: '#7c3aed',
                      fillColor: '#7c3aed',
                      fillOpacity: 0.1,
                    }}
                  >
                    <Tooltip permanent direction="bottom" offset={[0, 10]}>
                      <span className="font-medium">{depot.name}</span>
                    </Tooltip>
                  </Circle>
                ))}

                {/* Vehicle Markers */}
                {trackedVehicles.map(({ load, asset }) => {
                  if (!asset || !asset.lastLatitude || !asset.lastLongitude) return null;

                  const destName = getLocationDisplayName(load.destination);
                  const destDepot = DEPOTS.find((d) => d.name === destName);
                  let distanceToDestination = '';
                  if (destDepot) {
                    const dist = calculateDistance(
                      asset.lastLatitude,
                      asset.lastLongitude,
                      destDepot.latitude,
                      destDepot.longitude
                    );
                    distanceToDestination = formatDistance(dist);
                  }

                  return (
                    <React.Fragment key={load.id}>
                    <Marker
                      position={[asset.lastLatitude, asset.lastLongitude]}
                      icon={createVehicleIcon(asset)}
                    >
                      <Popup>
                        <div className="p-2 min-w-[200px]">
                          <div className="font-semibold text-lg mb-2">
                            {load.fleet_vehicle?.vehicle_id || 'Vehicle'}
                          </div>
                          <div className="space-y-1 text-sm">
                            <p>
                              <span className="text-muted-foreground">Load:</span>{' '}
                              {load.load_id}
                            </p>
                            <p>
                              <span className="text-muted-foreground">From:</span>{' '}
                              {getLocationDisplayName(load.origin)}
                            </p>
                            <p>
                              <span className="text-muted-foreground">To:</span>{' '}
                              {getLocationDisplayName(load.destination)}
                            </p>
                            <p>
                              <span className="text-muted-foreground">Status:</span>{' '}
                              <Badge
                                variant={
                                  load.status === 'in-transit'
                                    ? 'default'
                                    : load.status === 'delivered'
                                    ? 'secondary'
                                    : 'outline'
                                }
                              >
                                {load.status}
                              </Badge>
                            </p>
                            <p>
                              <span className="text-muted-foreground">Speed:</span>{' '}
                              {asset.speedKmH} km/h
                            </p>
                            {distanceToDestination && (
                              <p>
                                <span className="text-muted-foreground">Distance to destination:</span>{' '}
                                {distanceToDestination}
                              </p>
                            )}
                            {asset.lastConnectedUtc && (
                              <p>
                                <span className="text-muted-foreground">Updated:</span>{' '}
                                {formatLastConnected(asset.lastConnectedUtc)}
                              </p>
                            )}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                    {/* Route line to destination */}
                    {destDepot && (
                      <Polyline
                        positions={[[asset.lastLatitude, asset.lastLongitude], [destDepot.latitude, destDepot.longitude]]}
                        pathOptions={{ color: "#4f46e5", weight: 3, dashArray: "10, 10", opacity: 0.8 }}
                      />
                    )}
                    </React.Fragment>
                  );
                })}
              </MapContainer>
            )}
          </CardContent>
        </Card>

        {/* Active Loads List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Active Shipments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : loads.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">No active shipments</p>
            ) : (
              <div className="divide-y">
                {matchedLoads.map(({ load, asset }) => (
                  <div key={load.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                        <Package className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="font-medium">{load.load_id}</p>
                        <p className="text-sm text-muted-foreground">
                          {getLocationDisplayName(load.origin)} → {getLocationDisplayName(load.destination)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {load.fleet_vehicle && (
                        <span className="text-sm text-muted-foreground">
                          {load.fleet_vehicle.vehicle_id}
                        </span>
                      )}
                      <Badge
                        variant={
                          load.status === 'in-transit'
                            ? 'default'
                            : load.status === 'delivered'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {load.status}
                      </Badge>
                      {asset ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <Navigation className="h-3 w-3 mr-1" />
                          Tracked
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500">
                          No GPS
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
