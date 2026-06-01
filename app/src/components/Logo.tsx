export function Logo({ size = 32 }: { size?: number }) {
  const id = `logo-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Pokeliquid logo"
    >
      <defs>
        <linearGradient id={`${id}-holo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff6ec7" />
          <stop offset="33%" stopColor="#a78bfa" />
          <stop offset="66%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <clipPath id={`${id}-drop`}>
          <path d="M32 4 C32 4 8 30 8 42 A24 24 0 0 0 56 42 C56 30 32 4 32 4Z" />
        </clipPath>
      </defs>

      {/* Droplet outline with holo gradient */}
      <path
        d="M32 4 C32 4 8 30 8 42 A24 24 0 0 0 56 42 C56 30 32 4 32 4Z"
        fill={`url(#${id}-holo)`}
      />

      {/* Inner droplet (dark inset) */}
      <path
        d="M32 10 C32 10 13 32 13 42 A19 19 0 0 0 51 42 C51 32 32 10 32 10Z"
        fill="#0a0a0f"
      />

      {/* Pokeball inside the inset droplet, clipped */}
      <g clipPath={`url(#${id}-drop)`}>
        {/* Top half — red/gradient */}
        <rect x="13" y="26" width="38" height="16" fill="#e53e3e" />
        {/* Bottom half — dark */}
        <rect x="13" y="42" width="38" height="18" fill="#1a1a2e" />
        {/* Center band */}
        <rect x="13" y="40" width="38" height="4" fill="#2d2d44" />
        {/* Center circle outer */}
        <circle cx="32" cy="42" r="7" fill="#2d2d44" />
        {/* Center circle middle */}
        <circle cx="32" cy="42" r="5" fill="#0a0a0f" />
        {/* Center circle inner — holo */}
        <circle cx="32" cy="42" r="3" fill={`url(#${id}-holo)`} />
      </g>
    </svg>
  );
}

/** Raw SVG string for use in data URIs (favicon, wallet adapter icon) */
export const logoSvgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="h" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff6ec7"/>
      <stop offset="33%" stop-color="#a78bfa"/>
      <stop offset="66%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#34d399"/>
    </linearGradient>
    <clipPath id="d">
      <path d="M32 4C32 4 8 30 8 42A24 24 0 0056 42C56 30 32 4 32 4Z"/>
    </clipPath>
  </defs>
  <path d="M32 4C32 4 8 30 8 42A24 24 0 0056 42C56 30 32 4 32 4Z" fill="url(#h)"/>
  <path d="M32 10C32 10 13 32 13 42A19 19 0 0051 42C51 32 32 10 32 10Z" fill="#0a0a0f"/>
  <g clip-path="url(#d)">
    <rect x="13" y="26" width="38" height="16" fill="#e53e3e"/>
    <rect x="13" y="42" width="38" height="18" fill="#1a1a2e"/>
    <rect x="13" y="40" width="38" height="4" fill="#2d2d44"/>
    <circle cx="32" cy="42" r="7" fill="#2d2d44"/>
    <circle cx="32" cy="42" r="5" fill="#0a0a0f"/>
    <circle cx="32" cy="42" r="3" fill="url(#h)"/>
  </g>
</svg>`;
