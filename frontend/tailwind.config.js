/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          red: "#c8102e",
          "red-dark": "#a80d26",
          mint: "#7ecbc0",
          "mint-light": "#e6f5f0",
          "yellow-light": "#fef9e7",
          "pink-light": "#fef0f0",
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
