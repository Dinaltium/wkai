/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Accent trio (theme-switchable, user-customizable via CSS vars).
        accent:        "rgb(var(--accent) / <alpha-value>)",
        "accent-text": "rgb(var(--accent-text) / <alpha-value>)",
        "accent-fg":   "rgb(var(--accent-fg) / <alpha-value>)",
        wkai: {
          bg:         "rgb(var(--wkai-bg) / <alpha-value>)",
          surface:    "rgb(var(--wkai-surface) / <alpha-value>)",
          surface2:   "rgb(var(--wkai-surface2) / <alpha-value>)",
          border:     "rgb(var(--wkai-border) / <alpha-value>)",
          accent:     "rgb(var(--accent) / <alpha-value>)",
          success:    "#22c55e",
          warning:    "#f59e0b",
          danger:     "#ef4444",
          muted:      "rgb(var(--wkai-text-dim) / <alpha-value>)",
          text:       "rgb(var(--wkai-text) / <alpha-value>)",
          "text-dim": "rgb(var(--wkai-text-dim) / <alpha-value>)",
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
