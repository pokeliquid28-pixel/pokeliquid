"use client";

import { useState, useRef, useEffect } from "react";
import { useNotifications, NotifLevel } from "@/providers/NotificationProvider";

const LEVEL_DOT: Record<NotifLevel, string> = {
  info: "bg-info",
  success: "bg-long",
  warning: "bg-accent",
  error: "bg-short",
};

function formatTime(ts: number) {
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diff = Math.floor((now - ts * 1000) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const displayed = notifications.slice(0, 20);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && unreadCount > 0) markAllRead();
        }}
        className="relative p-1.5 text-secondary hover:text-primary transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
        aria-label="Notifications"
      >
        {/* Bell SVG */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-short text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] max-h-[400px] border border-border bg-panel shadow-lg z-50 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-primary">Notifications</span>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[10px] text-secondary hover:text-short transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {displayed.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-secondary">
                No notifications yet
              </div>
            ) : (
              displayed.map((n) => (
                <div
                  key={n.id}
                  className={`px-3 py-2.5 border-b border-border/50 ${
                    !n.read ? "bg-bg/50" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[n.level]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-primary truncate">
                          {n.title}
                        </span>
                        <span className="text-[10px] text-secondary shrink-0">
                          {formatTime(n.timestamp)}
                        </span>
                      </div>
                      {n.body && (
                        <div className="text-[11px] text-secondary mt-0.5 line-clamp-2">
                          {n.body}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
