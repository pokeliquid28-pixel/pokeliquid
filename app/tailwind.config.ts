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
        bg: "#0a0a0a",
        panel: "#111111",
        border: "#1a1a1a",
        "border2": "#222222",
        primary: "#ffffff",
        secondary: "#666666",
        muted: "#333333",
        long: "#00ff41",
        short: "#ff3333",
        accent: "#00ff41",
        info: "#00d4ff",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["Space Mono", "Consolas", "monospace"],
      },
      keyframes: {
        flash: {
          "0%": { backgroundColor: "rgba(0,255,65,0.2)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-red": {
          "0%": { backgroundColor: "rgba(255,51,51,0.2)" },
          "100%": { backgroundColor: "transparent" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        flash: "flash 0.8s ease-out",
        "flash-red": "flash-red 0.8s ease-out",
        shimmer: "shimmer 1.5s infinite",
        ticker: "ticker 30s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
