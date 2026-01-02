
export type RotaName = 'Barra' | 'Botafogo' | 'Centro' | 'Copacabana' | 'Niteroi' | 'Norte' | 'Tijuca';

export const ROTAS: RotaName[] = ['Barra', 'Botafogo', 'Centro', 'Copacabana', 'Niteroi', 'Norte', 'Tijuca'];

export const PRODUCTS = [
  'Café',
  'Café organico',
  'Açucar',
  'Adoçante',
  'Chocolate',
  'Leite',
  'Copo 160',
  'Copo 160 AE',
  'Copo Isopor',
  'Adoçante líquido',
  'Xicaras',
  'Outros'
] as const;

export type ProductName = typeof PRODUCTS[number];

export interface RotaStock {
  [product: string]: number;
}

export interface ClientDelivery {
  id: string;
  clientName: string;
  timestamp: string;
  items: { [product: string]: number };
  rota: RotaName;
}

export interface DailyLog {
  date: string;
  rotaInbound: { [rota in RotaName]?: RotaStock };
  clientDeliveries: { [rota in RotaName]?: ClientDelivery[] };
}

export interface AppState {
  logs: { [date: string]: DailyLog };
  currentDate: string;
  isCloudSynced: boolean;
}
