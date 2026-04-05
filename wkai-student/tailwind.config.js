/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        wkai: {
          bg:         "#0f1117",
          surface:    "#1a1d27",
          surface2:   "#20253a",
          border:     "#2a2d3a",
          accent:     "#6366f1",
          success:    "#22c55e",
          warning:    "#f59e0b",
          danger:     "#ef4444",
          muted:      "#6b7280",
          text:       "#e5e7eb",
          "text-dim": "#6b7280",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      keyframes: {
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.3s ease-out",
        "fade-in":  "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
