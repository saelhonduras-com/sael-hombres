/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Sugerencia inicial: ajustar con los colores exactos del logo de FIHNEC
        fihnec: {
          primary: '#7c2d12',
          gold: '#c9a24b',
        },
      },
    },
  },
  plugins: [],
};
