"use client";

export function Skeleton({
  className = "",
  width,
  height = "h-4",
}: {
  className?: string;
  width?: string;
  height?: string;
}) {
  return (
    <div
      className={`skeleton ${height} ${width ?? "w-full"} ${className}`}
    />
  );
}

export function SkeletonBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={i % 2 === 0 ? "w-full" : "w-3/4"} />
      ))}
    </div>
  );
}
