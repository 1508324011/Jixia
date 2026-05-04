/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        notion: {
          sidebar: "#f7f7f5",
          "sidebar-hover": "#efefec",
          border: "#e8e8e5",
          text: "#37352f",
          "text-secondary": "#6b6b6b",
          "text-tertiary": "#9b9a97",
          accent: "#2eaadc",
          "accent-light": "#e8f4f8",
        },
      },
      boxShadow: {
        notion: "0 8px 24px rgba(15, 23, 42, 0.06)",
        "notion-hover": "0 12px 28px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
