"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useOracle } from "@/hooks/useOracle";
import { useMarginAccount, Position } from "@/hooks/useMarginAccount";
import { rawToPrice, rawToUsdc, calcLiqPriceLong, calcLiqPriceShort } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type NotifLevel = "info" | "success" | "warning" | "error";

export type Notification = {
  id: string;
  level: NotifLevel;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
};

type NotificationContextType = {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (level: NotifLevel, title: string, body: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
};

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markAllRead: () => {},
  clearAll: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_NOTIFICATIONS = 50;
const STORAGE_KEY = "pokeliquid_notifications";
const TOAST_DURATION = 8000;

// ── Toast state (separate from persisted notifications) ──────────────────────

export type Toast = {
  id: string;
  level: NotifLevel;
  title: string;
  body: string;
  expiresAt: number;
};

type ToastContextType = {
  toasts: Toast[];
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  dismissToast: () => {},
});

export const useToasts = () => useContext(ToastContext);

// ── Provider ─────────────────────────────────────────────────────────────────

function loadNotifications(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_NOTIFICATIONS);
  } catch {
    return [];
  }
}

function saveNotifications(notifs: Notification[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, MAX_NOTIFICATIONS)));
  } catch { /* quota exceeded, etc */ }
}

let idCounter = 0;
function makeId() {
  return `n_${Date.now()}_${++idCounter}`;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { connected } = useWallet();
  const oracle = useOracle();
  const margin = useMarginAccount();

  // Load from localStorage on mount
  useEffect(() => {
    setNotifications(loadNotifications());
  }, []);

  // Save whenever notifications change
  useEffect(() => {
    if (notifications.length > 0) {
      saveNotifications(notifications);
    }
  }, [notifications]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (toasts.length === 0) return;
    const now = Date.now();
    const soonest = Math.min(...toasts.map((t) => t.expiresAt));
    const delay = Math.max(100, soonest - now);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.expiresAt > Date.now()));
    }, delay);
    return () => clearTimeout(timer);
  }, [toasts]);

  const addNotification = useCallback(
    (level: NotifLevel, title: string, body: string) => {
      const notif: Notification = {
        id: makeId(),
        level,
        title,
        body,
        timestamp: Math.floor(Date.now() / 1000),
        read: false,
      };

      setNotifications((prev) => [notif, ...prev].slice(0, MAX_NOTIFICATIONS));

      // Also show toast
      const toast: Toast = {
        id: notif.id,
        level,
        title,
        body,
        expiresAt: Date.now() + TOAST_DURATION,
      };
      setToasts((prev) => [...prev, toast]);
    },
    []
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    saveNotifications([]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Liquidation warning monitor ────────────────────────────────────────

  const lastLiqWarnings = useRef<Record<number, number>>({});

  useEffect(() => {
    if (!connected || !margin.hasOpenPosition || oracle.price === 0) return;

    const checkLiquidation = () => {
      const now = Date.now();
      for (const pos of margin.positions) {
        const marginRatio = pos.notional > 0
          ? (pos.collateral / pos.notional) * 100
          : 100;

        const liqPrice = pos.direction === "Long"
          ? calcLiqPriceLong(pos.entryPrice, pos.leverage)
          : calcLiqPriceShort(pos.entryPrice, pos.leverage);

        const lastWarned = lastLiqWarnings.current[pos.index] ?? 0;
        const cooldown = 60_000; // 1 minute between repeated warnings

        if (marginRatio < 8 && now - lastWarned > cooldown) {
          lastLiqWarnings.current[pos.index] = now;
          addNotification(
            "error",
            `Position #${pos.index} near liquidation`,
            `Current margin: ${marginRatio.toFixed(1)}%. Liq price: $${liqPrice.toFixed(2)}`
          );
        } else if (marginRatio < 15 && marginRatio >= 8 && now - lastWarned > cooldown) {
          lastLiqWarnings.current[pos.index] = now;
          addNotification(
            "warning",
            `Position #${pos.index} at ${marginRatio.toFixed(1)}% margin`,
            `Add margin to avoid liquidation at $${liqPrice.toFixed(2)}`
          );
        }
      }
    };

    checkLiquidation();
    const id = setInterval(checkLiquidation, 10_000);
    return () => clearInterval(id);
  }, [connected, margin.positions, margin.hasOpenPosition, oracle.price, addNotification]);

  // ── Price movement monitor ─────────────────────────────────────────────

  const lastNotifiedPrice = useRef(0);

  useEffect(() => {
    if (oracle.price === 0 || oracle.isLoading) return;

    const currentUsd = rawToPrice(oracle.price);

    if (lastNotifiedPrice.current === 0) {
      lastNotifiedPrice.current = currentUsd;
      return;
    }

    const prev = lastNotifiedPrice.current;
    const pctChange = ((currentUsd - prev) / prev) * 100;

    if (Math.abs(pctChange) >= 1) {
      lastNotifiedPrice.current = currentUsd;
      const up = pctChange > 0;
      addNotification(
        "info",
        `Price ${up ? "up" : "down"}: $${currentUsd.toFixed(2)} (${up ? "+" : ""}${pctChange.toFixed(1)}%)`,
        `PRISMATIC-ETB-PERP moved ${Math.abs(pctChange).toFixed(1)}% from $${prev.toFixed(2)}`
      );
    }
  }, [oracle.price, oracle.isLoading, addNotification]);

  // ── SL/TP position disappearance monitor ───────────────────────────────

  const prevPositions = useRef<Position[]>([]);

  useEffect(() => {
    if (!connected || margin.isLoading) return;

    const prev = prevPositions.current;
    if (prev.length === 0) {
      prevPositions.current = [...margin.positions];
      return;
    }

    // Check for positions that disappeared (closed by SL/TP/liquidation)
    for (const oldPos of prev) {
      const stillExists = margin.positions.some((p) => p.index === oldPos.index);
      if (!stillExists) {
        const currentPriceUsd = rawToPrice(oracle.price);
        const entryPriceUsd = rawToPrice(oldPos.entryPrice);

        // Check if SL or TP was set and likely triggered
        const slUsd = oldPos.slPrice ? rawToPrice(oldPos.slPrice) : null;
        const tpUsd = oldPos.tpPrice ? rawToPrice(oldPos.tpPrice) : null;

        let reason = "closed";
        let exitPrice = currentPriceUsd;

        if (tpUsd !== null) {
          if ((oldPos.direction === "Long" && currentPriceUsd >= tpUsd) ||
              (oldPos.direction === "Short" && currentPriceUsd <= tpUsd)) {
            reason = "Take profit hit";
            exitPrice = tpUsd;
          }
        }
        if (slUsd !== null) {
          if ((oldPos.direction === "Long" && currentPriceUsd <= slUsd) ||
              (oldPos.direction === "Short" && currentPriceUsd >= slUsd)) {
            reason = "Stop loss triggered";
            exitPrice = slUsd;
          }
        }

        // Estimate PnL
        const pnlRaw = oldPos.direction === "Long"
          ? ((exitPrice - entryPriceUsd) / entryPriceUsd) * rawToUsdc(oldPos.notional)
          : ((entryPriceUsd - exitPrice) / entryPriceUsd) * rawToUsdc(oldPos.notional);

        const level = reason === "Take profit hit" ? "success" :
                      reason === "Stop loss triggered" ? "warning" : "info";

        addNotification(
          level,
          `${reason} — Position #${oldPos.index}`,
          `${oldPos.direction} closed at $${exitPrice.toFixed(2)} (${pnlRaw >= 0 ? "+" : ""}$${pnlRaw.toFixed(2)})`
        );
      }
    }

    prevPositions.current = [...margin.positions];
  }, [connected, margin.positions, margin.isLoading, oracle.price, addNotification]);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, markAllRead, clearAll }}
    >
      <ToastContext.Provider value={{ toasts, dismissToast }}>
        {children}
      </ToastContext.Provider>
    </NotificationContext.Provider>
  );
}
