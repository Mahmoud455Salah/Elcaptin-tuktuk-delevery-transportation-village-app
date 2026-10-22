export interface VillageLocation {
  id: string;
  name: string;
  center: string;
  description: string;
  x: number;
  y: number;
  lat?: number;
  lng?: number;
  popularLandmarks: string[];
}

export type ServiceType = 'ride' | 'delivery';

export type PaymentMethod = 'cash' | 'vodafone_cash';
