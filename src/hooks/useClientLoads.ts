import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Load } from './useLoads';
import { Client } from './useClients';

/**
 * Parse time_window JSON to extract the third-party customer ID
 */
function getCustomerIdFromLoad(timeWindow: string): string | null {
  try {
    const data = JSON.parse(timeWindow);
    return data.thirdParty?.customerId || null;
  } catch {
    return null;
  }
}

/**
 * Hook to fetch a single client by ID
 */
export function useClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      if (!clientId) throw new Error('No client ID provided');
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      if (error) throw error;
      return data as Client;
    },
    enabled: !!clientId,
  });
}

/**
 * Hook to fetch all loads for a specific client.
 * Third-party loads are identified by TP- prefix and have customerId in time_window JSON.
 */
export function useClientLoads(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-loads', clientId],
    queryFn: async () => {
      if (!clientId) return [];

      // Fetch all third-party loads (TP- prefix)
      const { data, error } = await supabase
        .from('loads')
        .select(`
          *,
          driver:drivers!loads_driver_id_fkey(id, name, contact),
          fleet_vehicle:fleet_vehicles(id, vehicle_id, type, telematics_asset_id)
        `)
        .like('load_id', 'TP-%')
        .order('loading_date', { ascending: false });

      if (error) throw error;

      // Filter to only loads belonging to this client
      const clientLoads = (data || []).filter((load) => {
        const customerId = getCustomerIdFromLoad(load.time_window);
        return customerId === clientId;
      });

      return clientLoads as unknown as Load[];
    },
    enabled: !!clientId,
  });
}

/**
 * Hook to get active (in-transit/scheduled) loads for a client - used for live tracking
 */
export function useClientActiveLoads(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-active-loads', clientId],
    queryFn: async () => {
      if (!clientId) return [];

      const { data, error } = await supabase
        .from('loads')
        .select(`
          *,
          driver:drivers!loads_driver_id_fkey(id, name, contact),
          fleet_vehicle:fleet_vehicles(id, vehicle_id, type, telematics_asset_id)
        `)
        .like('load_id', 'TP-%')
        .in('status', ['in-transit', 'scheduled', 'pending'])
        .order('loading_date', { ascending: true });

      if (error) throw error;

      const clientLoads = (data || []).filter((load) => {
        const customerId = getCustomerIdFromLoad(load.time_window);
        return customerId === clientId;
      });

      return clientLoads as unknown as Load[];
    },
    enabled: !!clientId,
    refetchInterval: 30000, // Refresh every 30 seconds for active tracking
  });
}
