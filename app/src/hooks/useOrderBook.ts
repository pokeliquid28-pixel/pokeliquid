"use client";

export type OrderBookEntry = {
  price: number;
  size: number;
  total: number;
};

export type OrderBookData = {
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
  spread: number | null;
  loading: boolean;
};

export function useOrderBook(_marketId: string): OrderBookData {
  // Stub — returns empty data until order book is implemented on-chain
  return { asks: [], bids: [], spread: null, loading: false };
}
