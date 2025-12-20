/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./kit/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "var(--tw-brand)",
        "brand-dark": "var(--tw-brand-dark)",
        surface: "var(--tw-surface)",
        "surface-2": "var(--tw-surface-2)",
        card: "var(--tw-card)",
      },
    },
  },
  corePlugins: {
    // Keep existing app CSS stable; we only want utilities.
    preflight: false,
  },
  plugins: [],
};
