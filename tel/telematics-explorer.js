import https from 'https';
import { URL, URLSearchParams } from 'url';

class TelematicsExplorer {
  constructor(baseUrl = 'https://api-emea04.telematics.guru') {
    this.baseUrl = baseUrl;
    this.token = null;
  }

  async makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const reqOptions = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      if (options.body) {
        reqOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
      }

      console.log(`📡 ${reqOptions.method} ${url.pathname}`);

      const req = https.request(reqOptions, (res) => {
        let data = '';
        
        console.log(`📊 Response: ${res.statusCode} ${res.statusMessage}`);

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (data) {
              const parsed = JSON.parse(data);
              console.log(`📦 Data received: ${Array.isArray(parsed) ? `${parsed.length} items` : 'Object'}`);
              resolve(parsed);
            } else {
              resolve(null);
            }
          } catch (error) {
            console.log('⚠️  Could not parse JSON, raw response:', data.substring(0, 200));
            resolve(data);
          }
        });
      });

      req.on('error', (error) => {
        console.error('💥 Request error:', error.message);
        reject(error);
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  async authenticate(username, password) {
    const body = new URLSearchParams({
      Username: username,
      Password: password,
    }).toString();

    const data = await this.makeRequest('/v1/user/authenticate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (data && data.access_token) {
      this.token = data.access_token;
      console.log(`✅ Authenticated! Token: ${this.token.substring(0, 20)}...`);
      console.log(`⏰ Expires in: ${data.expires_in} seconds`);
      return true;
    }

    console.log('❌ Authentication failed');
    return false;
  }

  async getOrganisations() {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const data = await this.makeRequest('/v1/user/organisation', {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    });

    return data;
  }

  async getAssets(organisationId) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const data = await this.makeRequest(`/v1/organisation/${organisationId}/asset`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    });

    return data;
  }

  async testGeofences(organisationId) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const endpoints = [
      `/v1/organisation/${organisationId}/geofence`,
      `/v1/geofence/organisation/${organisationId}`,
      `/v1/geofence?organisationId=${organisationId}`,
    ];

    const results = [];

    for (const endpoint of endpoints) {
      console.log(`\n🔍 Testing endpoint: ${endpoint}`);
      try {
        const data = await this.makeRequest(endpoint, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
          },
        });
        results.push({ endpoint, data });
      } catch (error) {
        results.push({ endpoint, error: error.message });
      }
    }

    return results;
  }

  async exploreAll(username, password, organisationId) {
    console.log('🚀 Starting Telematics Guru API Exploration\n');

    // 1. Authenticate
    console.log('1️⃣ Authenticating...');
    const authSuccess = await this.authenticate(username, password);
    if (!authSuccess) return;

    // 2. Get organisations
    console.log('\n2️⃣ Getting organisations...');
    const orgs = await this.getOrganisations();
    if (Array.isArray(orgs)) {
      console.log(`✅ Found ${orgs.length} organisations:`);
      orgs.forEach((org, i) => {
        console.log(`   ${i + 1}. ${org.Name} (ID: ${org.Id})`);
      });
    }

    // 3. Get assets
    console.log(`\n3️⃣ Getting assets for organisation ${organisationId}...`);
    const assets = await this.getAssets(organisationId);
    if (Array.isArray(assets)) {
      console.log(`✅ Found ${assets.length} assets`);
      assets.slice(0, 5).forEach((asset, i) => {
        console.log(`   ${i + 1}. ${asset.Name || 'Unnamed'} (ID: ${asset.Id})`);
        if (asset.LastLatitude && asset.LastLongitude) {
          console.log(`      📍 Position: ${asset.LastLatitude}, ${asset.LastLongitude}`);
        }
      });
    }

    // 4. Test geofences
    console.log(`\n4️⃣ Testing geofence endpoints for organisation ${organisationId}...`);
    const geofenceResults = await this.testGeofences(organisationId);
    
    geofenceResults.forEach(result => {
      console.log(`\n📡 Endpoint: ${result.endpoint}`);
      if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
      } else if (Array.isArray(result.data)) {
        console.log(`   ✅ Found ${result.data.length} geofences`);
        if (result.data.length > 0) {
          console.log('   Sample geofences:');
          result.data.slice(0, 3).forEach((g, i) => {
            console.log(`      ${i + 1}. ${g.Name || g.name || 'Unnamed'} (ID: ${g.Id || g.id})`);
          });
        }
      }
    });

    console.log('\n✅ Exploration complete!');
  }
}

// Usage
const explorer = new TelematicsExplorer();

// Replace with your credentials
const credentials = {
  username: 'mike@matanuska.co.zw',
  password: 'Matatele13',
  organisationId: 4002
};

// Run the exploration
explorer.exploreAll(
  credentials.username,
  credentials.password,
  credentials.organisationId
).catch(console.error);