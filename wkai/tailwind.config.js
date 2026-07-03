/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        wkai: {
          bg: "#0c0c0e",
          surface: "#18181b",
          border: "#2c2c31",
          accent: "#14b8a6",
          "accent-hover": "#0d9488",
          success: "#22c55e",
          warning: "#f59e0b",
          danger: "#ef4444",
          muted: "#6b7280",
          text: "#e5e7eb",
          "text-dim": "#9ca3af",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
