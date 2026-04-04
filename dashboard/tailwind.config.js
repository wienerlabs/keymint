/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"AuxMono"', "monospace"],
      },
      colors: {
        accent1: "#7DD8FF",
        accent2: "#FF7D97",
        accent3: "#FFE57D",
      },
    },
  },
  plugins: [],
};
