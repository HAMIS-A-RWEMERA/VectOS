/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './views/**/*.ejs'
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          400: '#E6CA65',
          500: '#D4AF37',
          600: '#B38F24'
        },
        brand: {
          dark: '#0D0F12',
          card: '#16191E',
          border: '#2A2F38',
          hover: '#222730'
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        display: ['"Playfair Display"', 'serif']
      }
    }
  },
  plugins: []
};
