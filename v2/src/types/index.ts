export type Tier = 'fish' | 'monkey' | 'gorilla' | 'whale' | 'shark' | 'scammer';
export type TxStatus = 'pending' | 'validated' | 'refused';
export type Currency = 'CHF' | 'EUR' | 'USD' | 'USDT';
export type Language = 'fr' | 'de' | 'en' | 'it';

export interface Spender {
  id: string;
  name: string;
  tier: Tier;
  vip_score: number;
  language: Language;
  ca_lifetime: number;
  tx_count: number;
  avg_basket: number;
  last_tx_at: string | null;
  is_scammer: boolean;
}

export interface Transaction {
  id: string;
  created_at: string;
  spender_id: string;
  model_id: string;
  chatter_id: string;
  provider: string;
  amount: number;
  currency: Currency;
  status: TxStatus;
  fx_rate?: number;
}

export interface ModelEntity {
  id: string;
  name: string;
  language: Language;
  is_active: boolean;
  ca_month: number;
  tx_count: number;
}

export interface Chatter {
  id: string;
  name: string;
  mc_id: string | null;
  tier: 'T1' | 'T2' | 'T3';
  commission_rate: number;
  score: number;
  is_live: boolean;
}
