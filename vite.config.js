import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    legacy({
      targets: ['chrome >= 49', 'samsung >= 5', 'not dead'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  server: {
    port: 5173,
    open: true,
    host: true,
    allowedHosts: ['7cc4-151-77-141-33.ngrok-free.app', '.ngrok-free.app', '.ngrok.io'],
  },
});
