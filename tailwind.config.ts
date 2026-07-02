import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#FF671F",
          slate: "#425563",
          black: "#000000",
          white: "#FFFFFF",
          light: "#F5F5F5",
        },
      },
    },
  },
  plugins: [],
};

export default config;
