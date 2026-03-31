// Configuración de Tailwind CDN — debe cargarse ANTES del script de Tailwind CDN
// para que el CDN la lea al inicializarse.
window.tailwind = window.tailwind || {};
window.tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans: ['"Lato"', 'sans-serif'],
      },
      colors: {
        velum: {
          50: '#fdfcfb',
          100: '#f7f5f2',
          200: '#efeadd',
          300: '#e0d6c0',
          400: '#ccb999',
          500: '#b89c76',
          600: '#9d8160',
          700: '#7e664d',
          800: '#675341',
          900: '#544538',
        }
      }
    },
  },
};
