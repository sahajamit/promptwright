import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/**/*.{js,ts,jsx,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic tokens — backed by CSS variables (RGB channels) in index.css,
        // so opacity modifiers (e.g. bg-accent/15) work and themes switch via .dark.
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          strong: "rgb(var(--border-strong) / <alpha-value>)",
        },
        text: {
          DEFAULT: "rgb(var(--text) / <alpha-value>)",
          muted: "rgb(var(--text-muted) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          2: "rgb(var(--accent-2) / <alpha-value>)",
          fg: "rgb(var(--accent-fg) / <alpha-value>)",
        },
        success: "rgb(var(--success) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",

        // Migration aliases: the ~70 not-yet-migrated files reference these.
        // Point them at the accent so they de-blue + theme automatically.
        // Remove once every file uses semantic tokens.
        jarvis: {
          primary: "rgb(var(--accent) / <alpha-value>)",
          secondary: "rgb(var(--accent-2) / <alpha-value>)",
          accent: "rgb(var(--accent-2) / <alpha-value>)",
          dark: "rgb(var(--text) / <alpha-value>)",
          darker: "rgb(var(--text) / <alpha-value>)",
        },
        lseg: {
          blue: {
            DEFAULT: "rgb(var(--accent) / <alpha-value>)",
            light: "rgb(var(--accent-2) / <alpha-value>)",
            lighter: "rgb(var(--accent-2) / <alpha-value>)",
            dark: "rgb(var(--accent) / <alpha-value>)",
          },
        },
      },
      ringColor: {
        DEFAULT: "rgb(var(--ring) / <alpha-value>)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [typography],
};
