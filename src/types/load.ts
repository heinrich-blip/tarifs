export type LoadStatus = 'scheduled' | 'in-transit' | 'pending' | 'delivered';
export type CargoType = 'VanSalesRetail' | 'Retail' | 'Vendor' | 'RetailVendor' | 'Fertilizer' | 'BV' | 'CBC' | 'Packaging';
export type Priority = 'high' | 'medium' | 'low';

export interface Load {
  id: string;
  loadId: string;
  priority: Priority;
  loadingDate: Date;
  offloadingDate: Date;
  timeWindow: string;
  origin: string;
  destination: string;
  cargoType: CargoType;
  quantity: number;
  weight: number;
  specialHandling: string[];
  fleetId: string;
  driver: string;
  driverContact: string;
  coDriver?: string;
  notes: string;
  status: LoadStatus;
}

export interface Driver {
  id: string;
  name: string;
  contact: string;
  available: boolean;
}

export interface Fleet {
  id: string;
  vehicleId: string;
  type: string;
  capacity: number;
  available: boolean;
}

export interface KPIData {
  totalLoads: number;
  scheduled: number;
  inTransit: number;
  delivered: number;
  pending: number;
}
