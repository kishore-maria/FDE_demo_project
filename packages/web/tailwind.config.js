/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bw: {
          bg: '#161616',
          'bg-alt': '#1c1c1c',
          surface: '#262626',
          'surface-hover': '#2e2e2e',
          sidebar: '#1f1f1f',
          border: '#393939',
          accent: '#0f62fe',
          'accent-hover': '#0050e6',
          link: '#78a9ff',
          muted: '#c6c6c6',
          subtle: '#8d8d8d',
          success: '#24a148',
          warning: '#f1c21b',
          danger: '#da1e28',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      maxWidth: { content: '1280px' },
    },
  },
  plugins: [],
};
