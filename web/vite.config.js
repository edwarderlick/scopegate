import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import handler from './api/read.js';

const apiPlugin = () => ({
  name: 'api-plugin',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.startsWith('/api/read')) {
        try {
          // Mock Express-like req/res for Vercel functions locally
          const url = new URL(req.url, `http://${req.headers.host}`);
          req.query = Object.fromEntries(url.searchParams);
          console.log(`[API Proxy] ${url.pathname}?functionName=${req.query.functionName}&_t=${req.query._t || 'cached'}`);
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          };
          await handler(req, res);
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.end(e.message);
        }
      } else {
        next();
      }
    });
  }
});

export default defineConfig({
  plugins: [react(), apiPlugin()],
});
