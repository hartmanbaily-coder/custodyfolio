// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#020617", // near-black background
          card: "#020617",
          border: "#111827",
          accent: "#22c55e",
          accentSoft: "#6ee7b7",
        },
      },
    },
  },
  plugins: [],
};

export default config;
