/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Nunito", "sans-serif"],
        decorative: ["Better Together", "cursive"],
      },
      colors: {
        brand: {
          red: "#c8102e",
          "red-dark": "#a80d26",
          mint: "#7ecbc0",
          "mint-light": "#e6f5f0",
          "yellow-light": "#fef9e7",
          "pink-light": "#fef0f0",
        },
        gray: {
          500: "#8F8F8F",
          600: "#737375",
          700: "#58595B",
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};
