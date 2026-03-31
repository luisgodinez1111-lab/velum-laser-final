/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './context/**/*.{js,ts,jsx,tsx}',
    './services/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans:  ['"Lato"', 'sans-serif'],
      },
      colors: {
        velum: {
          50:  '#fdfcfb',
          100: '#f7f5f2',
          200: '#efeadd',
          300: '#e0d6c0',
          400: '#ccb999',
          500: '#b89c76',
          600: '#9d8160',
          700: '#7e664d',
          800: '#675341',
          900: '#544538',
        },
      },
    },
  },
  plugins: [],
};
