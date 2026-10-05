import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // Long form-filling tests need headroom on slow machines and under coverage instrumentation.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/test/**', 'src/main.jsx', 'src/pages/DevComponentsPage.jsx', '**/*.test.{js,jsx}'],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 },
    },
  },
});
