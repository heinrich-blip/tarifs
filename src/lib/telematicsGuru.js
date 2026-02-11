/**
 * Telematics Guru API Client
 * Integrates with the tracking platform for live vehicle locations
 * Uses Supabase Edge Function as proxy to avoid CORS issues
 */

// Supabase Edge Function for proxying requests - uses environment variable
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PROXY_URL = `${SUPABASE_URL}/functions/v1/telematics-proxy`;

// Supabase anon key for authentication with edge functions
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Store token in memory
let authToken = null;
let tokenExpiry = null;

/**
 * Authenticate with Telematics Guru API via proxy
 */
export async function authenticate(username, password) {
  try {
    console.log('[TelematicsGuru] Authenticating:', username);
    
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        action: 'authenticate',
        username,
        password,
      }),
    });

    const text = await response.text();
    console.log('[TelematicsGuru] Response:', response.status, text.substring(0, 200));

    if (!response.ok) {
      console.error('Telematics auth failed:', response.status, text);
      return false;
    }

    const data = JSON.parse(text);
    
    if (!data.access_token) {
      console.error('Telematics auth: No access token in response', data);
      return false;
    }
    
    authToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    
    localStorage.setItem('telematics_token', authToken);
    localStorage.setItem('telematics_expiry', tokenExpiry.toString());
    
    console.log('[TelematicsGuru] Authenticated successfully');
    return true;
  } catch (error) {
    console.error('Telematics auth error:', error);
    return false;
  }
}

/**
 * Get stored auth token
 */
export function getAuthToken() {
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    return authToken;
  }
  
  const storedToken = localStorage.getItem('telematics_token');
  const storedExpiry = localStorage.getItem('telematics_expiry');
  
  if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry)) {
    authToken = storedToken;
    tokenExpiry = parseInt(storedExpiry);
    return authToken;
  }
  
  return null;
}

/**
 * Check if authenticated
 */
export function isAuthenticated() {
  return getAuthToken() !== null;
}

/**
 * Clear authentication
 */
export function clearAuth() {
  authToken = null;
  tokenExpiry = null;
  localStorage.removeItem('telematics_token');
  localStorage.removeItem('telematics_expiry');
}

/**
 * Get user's organisations
 */
export async function getOrganisations() {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated with Telematics Guru');
  }

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'getOrganisations',
      token,
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAuth();
      throw new Error('Authentication expired - please re-login');
    }
    throw new Error('API error: ' + response.status);
  }

  const orgs = await response.json();
  console.log('[TelematicsGuru] User organisations:', orgs);
  return orgs;
}

/**
 * Get all assets for an organisation via proxy
 */
export async function getAssets(organisationId) {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated with Telematics Guru');
  }

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'getAssets',
      token,
      organisationId,
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAuth();
      throw new Error('Authentication expired - please re-login');
    }
    throw new Error('API error: ' + response.status);
  }

  return response.json();
}

/**
 * Get detailed asset information via proxy
 */
export async function getAssetDetails(assetId) {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated with Telematics Guru');
  }

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'getAssetDetails',
      token,
      assetId,
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAuth();
      throw new Error('Authentication expired - please re-login');
    }
    throw new Error('API error: ' + response.status);
  }

  return response.json();
}

/**
 * Get all assets with their current positions
 */
export async function getAssetsWithPositions(organisationId) {
  const assets = await getAssets(organisationId);
  return assets.filter(function(asset) {
    return asset.lastLatitude !== null && 
           asset.lastLongitude !== null &&
           asset.isEnabled;
  });
}

/**
 * Format last connected time to relative string
 * Handles various timestamp formats including UTC strings and future timestamps
 */
export function formatLastConnected(utcString) {
  if (!utcString) return 'Never';
  
  try {
    let date;
    
    // Handle various date formats
    if (typeof utcString === 'string') {
      // If the string doesn't end with Z and doesn't have timezone, add Z to treat as UTC
      if (!utcString.endsWith('Z') && !utcString.includes('+') && !utcString.includes('-', 10)) {
        utcString = utcString + 'Z';
      }
      date = new Date(utcString);
    } else if (utcString instanceof Date) {
      date = utcString;
    } else {
      return 'Unknown';
    }
    
    // Validate the date
    if (isNaN(date.getTime())) {
      console.warn('[TelematicsGuru] Invalid date:', utcString);
      return 'Unknown';
    }
    
    const now = new Date();
    let diffMs = now.getTime() - date.getTime();
    
    // Check for future timestamps (server time mismatch)
    // If timestamp is in the future, check if it's due to year mismatch (2026 vs 2024)
    if (diffMs < -60000) { // More than 1 minute in the future
      const yearDiff = date.getFullYear() - now.getFullYear();
      if (yearDiff > 0) {
        // Server might have incorrect year, adjust by assuming same month/day/time
        const adjustedDate = new Date(date);
        adjustedDate.setFullYear(now.getFullYear());
        diffMs = now.getTime() - adjustedDate.getTime();
        
        // If still in future after year adjustment, it's recent
        if (diffMs < 0) {
          return 'Just now';
        }
      } else {
        // Future timestamp without year issue - treat as just now
        return 'Just now';
      }
    }
    
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 0) return 'Just now';
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + 'm ago';
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return diffHours + 'h ago';
    
    const diffDays = Math.floor(diffHours / 24);
    return diffDays + 'd ago';
  } catch (error) {
    console.error('[TelematicsGuru] Error formatting date:', error, utcString);
    return 'Unknown';
  }
}

/**
 * Get the actual timestamp as a Date object, handling timezone issues
 */
export function parseLastConnected(utcString) {
  if (!utcString) return null;
  
  try {
    let dateStr = utcString;
    
    // Ensure UTC timezone
    if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
      dateStr = dateStr + 'Z';
    }
    
    const date = new Date(dateStr);
    
    if (isNaN(date.getTime())) return null;
    
    return date;
  } catch {
    return null;
  }
}

/**
 * Get status color based on asset state
 */
export function getStatusColor(asset) {
  if (!asset.isEnabled) return '#9CA3AF';
  if (asset.inTrip) return '#22C55E';
  if (asset.speedKmH > 0) return '#22C55E';
  return '#3B82F6';
}

/**
 * Get heading direction as compass point
 */
export function getHeadingDirection(heading) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(heading / 45) % 8;
  return directions[index];
}

/**
 * Get all geofences for an organisation
 * @param {number} organisationId - Organisation ID
 * @returns {Promise<Array>} Array of geofences with their locations
 */
export async function getGeofences(organisationId) {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  console.log('[TelematicsGuru] Fetching geofences for org:', organisationId);

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'getGeofences',
      token,
      organisationId,
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAuth();
      throw new Error('Authentication expired - please re-login');
    }
    // Return empty array for 404 (geofences not available)
    if (response.status === 404) {
      console.log('[TelematicsGuru] No geofences available for this organisation');
      return [];
    }
    throw new Error('Failed to fetch geofences: ' + response.status);
  }

  const data = await response.json();
  console.log('[TelematicsGuru] Geofences:', data);
  return data;
}

/**
 * Get detailed geofence information including coordinates
 * @param {number} geofenceId - Geofence ID
 * @returns {Promise<Object>} Geofence with full details including polygon points
 */
export async function getGeofenceDetails(geofenceId) {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  console.log('[TelematicsGuru] Fetching geofence details:', geofenceId);

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'getGeofenceDetails',
      token,
      geofenceId,
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAuth();
      throw new Error('Authentication expired - please re-login');
    }
    throw new Error('Failed to fetch geofence details: ' + response.status);
  }

  return response.json();
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate ETA based on current position, speed, and destination geofence
 * @param {Object} asset - Asset with current position and speed
 * @param {Object} geofence - Destination geofence with coordinates
 * @param {number} averageSpeed - Average speed in km/h (defaults to 60)
 * @returns {Object} ETA information
 */
export function calculateETA(asset, geofence, averageSpeed = 60) {
  if (!asset.lastLatitude || !asset.lastLongitude) {
    return { eta: null, distance: null, error: 'No vehicle position' };
  }

  // Get geofence center point
  const destLat = geofence.latitude || geofence.centerLatitude || geofence.lat;
  const destLon = geofence.longitude || geofence.centerLongitude || geofence.lng || geofence.lon;

  if (!destLat || !destLon) {
    return { eta: null, distance: null, error: 'No geofence coordinates' };
  }

  const distance = calculateDistance(
    asset.lastLatitude,
    asset.lastLongitude,
    destLat,
    destLon
  );

  // Use current speed if moving, otherwise use average
  const speed = asset.speedKmH > 10 ? asset.speedKmH : averageSpeed;
  
  // Calculate time in hours
  const timeHours = distance / speed;
  const timeMinutes = Math.round(timeHours * 60);

  // Calculate ETA
  const eta = new Date();
  eta.setMinutes(eta.getMinutes() + timeMinutes);

  return {
    eta,
    etaFormatted: eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    distance: Math.round(distance * 10) / 10, // Round to 1 decimal
    distanceFormatted: distance < 1 ? `${Math.round(distance * 1000)}m` : `${Math.round(distance)}km`,
    durationMinutes: timeMinutes,
    durationFormatted: timeMinutes < 60 
      ? `${timeMinutes} mins` 
      : `${Math.floor(timeMinutes / 60)}h ${timeMinutes % 60}m`,
    speed,
    isMoving: asset.speedKmH > 5,
  };
}

/**
 * Find the nearest geofence to a vehicle
 * @param {Object} asset - Asset with current position
 * @param {Array} geofences - Array of geofences
 * @returns {Object} Nearest geofence with distance
 */
export function findNearestGeofence(asset, geofences) {
  if (!asset.lastLatitude || !asset.lastLongitude || !geofences.length) {
    return null;
  }

  let nearest = null;
  let minDistance = Infinity;

  for (const geofence of geofences) {
    const lat = geofence.latitude || geofence.centerLatitude || geofence.lat;
    const lon = geofence.longitude || geofence.centerLongitude || geofence.lng || geofence.lon;
    
    if (!lat || !lon) continue;

    const distance = calculateDistance(
      asset.lastLatitude,
      asset.lastLongitude,
      lat,
      lon
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearest = { ...geofence, distance };
    }
  }

  return nearest;
}