import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Kin brand — warm, calm, trustworthy
        kin: {
          bg: "#0f1115",
          panel: "#171a21",
          panel2: "#1d212b",
          border: "#2a2f3a",
          text: "#e6e8ee",
          muted: "#9aa2b1",
          accent: "#7c9cff",
          calm: "#4ade80",
          nudge: "#fbbf24",
          alert: "#f87171",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
