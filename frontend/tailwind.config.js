/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        ink: { DEFAULT: "#151A21", 800: "#1D242D", 700: "#2A333F", 500: "#5B6675", 300: "#A3ACB8" },
        paper: { DEFAULT: "#F5F3EE", 200: "#ECE8DF", 300: "#DDD7CA" },
        saffron: { DEFAULT: "#E0740F", 50: "#FDF3E7", 100: "#FBE3C8", 600: "#C25F06", 700: "#9A4A05" },
        before: "#C2412D",
        after: "#0E7C6B",
      },
      boxShadow: { card: "0 1px 0 rgba(21,26,33,.04), 0 1px 3px rgba(21,26,33,.06)" },
    },
  },
  plugins: [],
};
