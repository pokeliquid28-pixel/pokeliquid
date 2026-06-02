import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#080808",
        panel: "#0d0d0d",
        border: "#1f1f1f",
        "border2": "#2a2a2a",
        primary: "#e8e8e8",
        secondary: "#555",
        muted: "#333",
        long: "#00ff88",
        short: "#ff3355",
        accent: "#ffe000",
        info: "#00d4ff",
      },
      fontFamily: {
        mono: ["Share Tech Mono", "monospace"],
        cond: ["Barlow Condensed", "sans-serif"],
      },
      keyframes: {
        flash: {
          "0%": { backgroundColor: "rgba(0,255,136,0.2)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-red": {
          "0%": { backgroundColor: "rgba(255,51,85,0.2)" },
          "100%": { backgroundColor: "transparent" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        flash: "flash 0.8s ease-out",
        "flash-red": "flash-red 0.8s ease-out",
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
