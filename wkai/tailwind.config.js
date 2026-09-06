/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        accent:        "rgb(var(--accent) / <alpha-value>)",
        "accent-text": "rgb(var(--accent-text) / <alpha-value>)",
        "accent-fg":   "rgb(var(--accent-fg) / <alpha-value>)",
        ok:     "rgb(var(--ok) / <alpha-value>)",
        warn:   "rgb(var(--warn) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        info:   "rgb(var(--info) / <alpha-value>)",
        wkai: {
          bg:         "rgb(var(--wkai-bg) / <alpha-value>)",
          surface:    "rgb(var(--wkai-surface) / <alpha-value>)",
          surface2:   "rgb(var(--wkai-surface2) / <alpha-value>)",
          border:     "rgb(var(--wkai-border) / <alpha-value>)",
          accent:     "rgb(var(--accent) / <alpha-value>)",
          success:    "rgb(var(--ok) / <alpha-value>)",
          warning:    "rgb(var(--warn) / <alpha-value>)",
          danger:     "rgb(var(--danger) / <alpha-value>)",
          muted:      "rgb(var(--wkai-text-dim) / <alpha-value>)",
          text:       "rgb(var(--wkai-text) / <alpha-value>)",
          "text-dim": "rgb(var(--wkai-text-dim) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      zIndex: {
        sticky:   "var(--z-sticky)",
        dropdown: "var(--z-dropdown)",
        overlay:  "var(--z-overlay)",
        modal:    "var(--z-modal)",
        toast:    "var(--z-toast)",
      },
      keyframes: {
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: {
        "slide-up": "slide-up 0.22s var(--ease-out) both",
        "fade-in":  "fade-in 0.16s var(--ease-out) both",
      },
    },
  },
  plugins: [],
};
