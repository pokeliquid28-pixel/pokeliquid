"use client";

import { useToasts, Toast, NotifLevel } from "@/providers/NotificationProvider";

const LEVEL_STYLES: Record<NotifLevel, string> = {
  info: "border-info/50 bg-info/10 text-info",
  success: "border-long/50 bg-long/10 text-long",
  warning: "border-accent/50 bg-accent/10 text-accent",
  error: "border-short/50 bg-short/10 text-short",
};

const LEVEL_ICONS: Record<NotifLevel, string> = {
  info: "i",
  success: "+",
  warning: "!",
  error: "x",
};

export function ToastContainer() {
  const { toasts, dismissToast } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-[360px] w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto border px-4 py-3 backdrop-blur-sm animate-in slide-in-from-right ${LEVEL_STYLES[t.level]}`}
        >
          <div className="flex items-start gap-2">
            <span className="font-mono font-bold text-xs mt-0.5 shrink-0 w-4 h-4 flex items-center justify-center border border-current rounded-full">
              {LEVEL_ICONS[t.level]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{t.title}</div>
              {t.body && (
                <div className="text-[11px] opacity-80 mt-0.5 line-clamp-2">{t.body}</div>
              )}
            </div>
            <button
              onClick={() => dismissToast(t.id)}
              className="text-current opacity-60 hover:opacity-100 text-xs ml-2 shrink-0"
            >
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
