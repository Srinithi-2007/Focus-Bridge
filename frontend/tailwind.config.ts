import type { Config } from 'tailwindcss';

// Temporary design tokens. Replace these with the exact colors, type scale and spacing
// from the FocusBridge Figma file in the design-to-code pass.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe7ff',
          500: '#3b63d8',
          600: '#2f50b8',
          700: '#263f93',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
