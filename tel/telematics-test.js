// telematics-test.js
import https from 'https';
import { URL, URLSearchParams } from 'url';

const TELEMATICS_API_BASE = 'https://api-emea04.telematics.guru';

// Test credentials
const CREDENTIALS = {
  username: 'heinrich@matanuska.co.za',
  password: '0824656647@Hj',
  organisationId: 4002
};

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    if (options.body) {
      reqOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    console.log(`📡 ${reqOptions.method} ${urlObj.pathname}`);

    const req = https.request(reqOptions, (res) => {
      let data = '';
      
      console.log(`📊 Response: ${res.statusCode} ${res.statusMessage}`);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ 
            status: res.statusCode, 
            headers: res.headers,
            data: parsed,
            raw: data 
          });
        } catch (error) {
          console.log('⚠️  Could not parse JSON, keeping raw data');
          resolve({ 
            status: res.statusCode, 
            headers: res.headers,
            raw: data 
          });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function testAuthentication() {
  console.log('\n🔐 Testing authentication...');
  console.log(`   Username: ${CREDENTIALS.username}`);
  console.log(`   Password: ${CREDENTIALS.password.substring(0, 3)}...`);
  
  const body = new URLSearchParams({
    Username: CREDENTIALS.username,
    Password: CREDENTIALS.password,
  }).toString();

  const result = await makeRequest(`${TELEMATICS_API_BASE}/v1/user/authenticate`, {
    method: 'POST',
    body
  });

  if (result.status === 200 && result.data && result.data.access_token) {
    console.log(`✅ Authentication successful!`);
    console.log(`   Token: ${result.data.access_token.substring(0, 20)}...`);
    console.log(`   Expires in: ${result.data.expires_in} seconds`);
    return result.data.access_token;
  } else {
    console.log(`❌ Authentication failed with status ${result.status}`);
    if (result.raw) {
      console.log(`   Response: ${result.raw.substring(0, 200)}`);
    }
    return null;
  }
}

async function testOrganisations(token) {
  console.log(`\n🏢 Testing organisations...`);
  
  const result = await makeRequest(`${TELEMATICS_API_BASE}/v1/user/organisation`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (result.status === 200 && Array.isArray(result.data)) {
    console.log(`✅ Found ${result.data.length} organisations:`);
    result.data.forEach((org, i) => {
      console.log(`   ${i + 1}. ${org.Name} (ID: ${org.Id}) - ${org.CustomerCode || 'No code'}`);
    });
  } else {
    console.log(`❌ Failed to get organisations: ${result.status}`);
    if (result.raw) {
      console.log(`   Response: ${result.raw.substring(0, 200)}`);
    }
  }
}

async function testAssets(token) {
  console.log(`\n🚚 Testing assets for organisation ${CREDENTIALS.organisationId}...`);
  
  const result = await makeRequest(`${TELEMATICS_API_BASE}/v1/organisation/${CREDENTIALS.organisationId}/asset`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (result.status === 200 && Array.isArray(result.data)) {
    console.log(`✅ Found ${result.data.length} assets:`);
    result.data.slice(0, 10).forEach((asset, i) => {
      const name = asset.Name || asset.name || 'Unnamed';
      const id = asset.Id || asset.id || 'N/A';
      const lat = asset.LastLatitude || asset.lastLatitude;
      const lng = asset.LastLongitude || asset.lastLongitude;
      const speed = asset.SpeedKmH || asset.speedKmH || 0;
      const lastSeen = asset.LastConnectedUtc || asset.lastConnectedUtc;
      
      console.log(`   ${i + 1}. ${name} (ID: ${id})`);
      if (lat && lng) {
        console.log(`       📍 Position: ${lat}, ${lng}`);
      }
      if (speed > 0) {
        console.log(`       🚀 Speed: ${speed} km/h`);
      }
      if (lastSeen) {
        console.log(`       ⏰ Last seen: ${new Date(lastSeen).toLocaleString()}`);
      }
    });
    
    if (result.data.length > 10) {
      console.log(`   ... and ${result.data.length - 10} more assets`);
    }
  } else {
    console.log(`❌ Failed to get assets: ${result.status}`);
    if (result.raw) {
      console.log(`   Response: ${result.raw.substring(0, 200)}`);
    }
  }
}

async function testGeofences(token) {
  console.log(`\n📍 Testing geofences for organisation ${CREDENTIALS.organisationId}...`);
  
  // Test multiple possible endpoints
  const endpoints = [
    { 
      name: 'Primary endpoint', 
      url: `/v1/organisation/${CREDENTIALS.organisationId}/geofence` 
    },
    { 
      name: 'Alternative endpoint 1', 
      url: `/v1/geofence/organisation/${CREDENTIALS.organisationId}` 
    },
    { 
      name: 'Alternative endpoint 2', 
      url: `/v1/geofence?organisationId=${CREDENTIALS.organisationId}` 
    },
    { 
      name: 'All geofences (no filter)', 
      url: `/v1/geofence` 
    },
  ];

  let foundGeofences = false;

  for (const endpoint of endpoints) {
    console.log(`\n🔍 ${endpoint.name}: ${endpoint.url}`);
    
    const result = await makeRequest(`${TELEMATICS_API_BASE}${endpoint.url}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (result.status === 200) {
      if (Array.isArray(result.data)) {
        console.log(`   ✅ Found ${result.data.length} geofences`);
        
        if (result.data.length > 0) {
          foundGeofences = true;
          result.data.slice(0, 5).forEach((geofence, i) => {
            const name = geofence.Name || geofence.name || 'Unnamed';
            const id = geofence.Id || geofence.id || 'N/A';
            const type = geofence.Type || geofence.type || 'Unknown';
            const lat = geofence.Latitude || geofence.latitude || geofence.Lat || geofence.lat;
            const lng = geofence.Longitude || geofence.longitude || geofence.Lng || geofence.lng;
            const radius = geofence.Radius || geofence.radius;
            
            console.log(`      ${i + 1}. ${name} (ID: ${id})`);
            console.log(`          Type: ${type}`);
            if (lat && lng) {
              console.log(`          Center: ${lat}, ${lng}`);
            }
            if (radius) {
              console.log(`          Radius: ${radius}m`);
            }
          });
          
          if (result.data.length > 5) {
            console.log(`      ... and ${result.data.length - 5} more`);
          }
        }
      } else if (result.data && typeof result.data === 'object') {
        console.log(`   📊 Response is an object with keys: ${Object.keys(result.data).join(', ')}`);
        
        // Check if there's a nested array of geofences
        for (const key in result.data) {
          if (Array.isArray(result.data[key])) {
            console.log(`   📦 Found array in "${key}" with ${result.data[key].length} items`);
            if (result.data[key].length > 0) {
              foundGeofences = true;
            }
          }
        }
      }
    } else if (result.status === 404) {
      console.log(`   ❌ Endpoint not found (404)`);
    } else if (result.status === 403) {
      console.log(`   🔒 Access denied (403)`);
    } else {
      console.log(`   ⚠️  Status ${result.status}`);
      if (result.raw) {
        console.log(`      Response: ${result.raw.substring(0, 100)}...`);
      }
    }
  }

  if (!foundGeofences) {
    console.log(`\n📝 Summary: No geofences found for organisation ${CREDENTIALS.organisationId}`);
    console.log(`   This is normal if geofences aren't configured in Telematics Guru`);
    console.log(`   The live tracking will work fine without geofences`);
  }
}

async function testOtherEndpoints(token) {
  console.log(`\n🔧 Testing other available endpoints...`);
  
  const endpoints = [
    { name: 'Asset Types', url: `/v1/organisation/${CREDENTIALS.organisationId}/assettype` },
    { name: 'Asset Groups', url: `/v1/organisation/${CREDENTIALS.organisationId}/assetgroup` },
    { name: 'Trips (last 24h)', url: `/v1/organisation/${CREDENTIALS.organisationId}/trip?from=${new Date(Date.now() - 24*60*60*1000).toISOString()}` },
    { name: 'User Profile', url: `/v1/user` },
  ];

  for (const endpoint of endpoints) {
    const result = await makeRequest(`${TELEMATICS_API_BASE}${endpoint.url}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    console.log(`   ${endpoint.name}: ${result.status} ${result.statusText || ''}`);
    
    if (result.status === 200) {
      if (Array.isArray(result.data)) {
        console.log(`      Found ${result.data.length} items`);
      } else if (result.data && typeof result.data === 'object') {
        const keys = Object.keys(result.data);
        if (keys.length > 0) {
          console.log(`      Keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
        }
      }
    }
  }
}

async function runAllTests() {
  console.log('🚀 Starting Telematics Guru API Test Suite\n');
  console.log(`📋 Test Configuration:`);
  console.log(`   API Base: ${TELEMATICS_API_BASE}`);
  console.log(`   Username: ${CREDENTIALS.username}`);
  console.log(`   Organisation ID: ${CREDENTIALS.organisationId}\n`);
  
  console.log('='.repeat(60));

  // Step 1: Authentication
  const token = await testAuthentication();
  if (!token) {
    console.log('\n❌ Cannot proceed without valid authentication');
    return;
  }

  console.log('\n' + '='.repeat(60));

  // Step 2: Organisations
  await testOrganisations(token);

  console.log('\n' + '='.repeat(60));

  // Step 3: Assets
  await testAssets(token);

  console.log('\n' + '='.repeat(60));

  // Step 4: Geofences
  await testGeofences(token);

  console.log('\n' + '='.repeat(60));

  // Step 5: Other endpoints
  await testOtherEndpoints(token);

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed!');
  console.log('\n📋 Summary:');
  console.log(`   - Authentication: ${token ? '✓ Successful' : '✗ Failed'}`);
  console.log(`   - Live tracking should work with the token above`);
  console.log(`   - If no geofences were found, that's expected`);
  console.log(`   - Use the token in your app: "${token.substring(0, 20)}..."`);
}

// Run all tests
runAllTests().catch(error => {
  console.error('💥 Fatal error:', error.message);
  console.error(error.stack);
});