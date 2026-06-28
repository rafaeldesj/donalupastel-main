import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
// @ts-ignore
import { processPaymentMiddleware } from './payment-middleware.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    mkcert(),
    {
      name: 'pagbank-payment-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/pagamentos/process-payment' && req.method === 'POST') {
            processPaymentMiddleware(req, res);
          } else {
            next();
          }
        });
      }
    }
  ],
  server: {
    host: true,
  }
})
