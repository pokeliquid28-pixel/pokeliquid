/* eslint-disable @next/next/no-img-element */

export function Logo({ size = 32, width, maxHeight }: { size?: number; width?: number; maxHeight?: number }) {
  const effectiveSize = width ?? size;
  const src = effectiveSize <= 64 ? "/logo-64.png" : effectiveSize <= 192 ? "/logo-192.png" : "/logo-512.png";
  return (
    <img
      src={src}
      alt="Pokeliquid"
      className="object-contain"
      style={{
        width: width ?? size,
        height: width ? "auto" : size,
        ...(maxHeight ? { maxHeight } : {}),
      }}
    />
  );
}
