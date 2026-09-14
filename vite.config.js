import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

// Serve the /api serverless function in `vite dev` too, so availability checks
// behave the same locally as they do on Vercel.
const vercelApiDev = {
  name: 'vercel-api-dev',
  configureServer(server) {
    for (const route of ['vix-availability', 'vix-catalog']) {
      server.middlewares.use(`/api/${route}`, async (req, res) => {
        const { default: handler } = await server.ssrLoadModule(`/api/${route}.js`);
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (body) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
          return res;
        };
        await handler(req, res);
      });
    }
  },
};

export default defineConfig({
  plugins: [
    vercelApiDev,
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
