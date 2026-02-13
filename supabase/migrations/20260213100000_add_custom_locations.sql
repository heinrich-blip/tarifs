-- Create custom_locations table for user-defined geofences/depots
CREATE TABLE IF NOT EXISTS custom_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  type TEXT DEFAULT 'depot' CHECK (type IN ('depot', 'warehouse', 'market', 'border', 'farm', 'customer')),
  country TEXT DEFAULT 'Zimbabwe' CHECK (country IN ('Zimbabwe', 'South Africa', 'Mozambique', 'Zambia', 'Botswana')),
  radius INTEGER DEFAULT 500,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create index for faster lookups
CREATE INDEX idx_custom_locations_name ON custom_locations(name);
CREATE INDEX idx_custom_locations_country ON custom_locations(country);
CREATE INDEX idx_custom_locations_active ON custom_locations(is_active);

-- Enable RLS
ALTER TABLE custom_locations ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow all authenticated users to read
CREATE POLICY "Allow authenticated users to read custom locations"
  ON custom_locations FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to create locations
CREATE POLICY "Allow authenticated users to create custom locations"
  ON custom_locations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow users to update their own locations or any location (for admins)
CREATE POLICY "Allow authenticated users to update custom locations"
  ON custom_locations FOR UPDATE
  TO authenticated
  USING (true);

-- Allow users to delete their own locations or any location (for admins)
CREATE POLICY "Allow authenticated users to delete custom locations"
  ON custom_locations FOR DELETE
  TO authenticated
  USING (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_custom_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custom_locations_updated_at
  BEFORE UPDATE ON custom_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_locations_updated_at();
