/* eslint-disable @next/next/no-img-element */

export function Logo({ size = 32 }: { size?: number }) {
  const src = size <= 64 ? "/logo-64.png" : size <= 192 ? "/logo-192.png" : "/logo-512.png";
  return (
    <img
      src={src}
      alt="Pokeliquid"
      width={size}
      height={size}
      className="object-contain"
      style={{ width: size, height: size }}
    />
  );
}
