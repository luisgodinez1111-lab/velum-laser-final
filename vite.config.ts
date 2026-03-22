import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Legacy endpoints: /api/auth/* → /auth/*, /api/users/* → /users/*, etc.
          '^/api/(auth|users|admin|membership|documents|me)(/.*)?$': {
            target: 'http://localhost:4000',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, '')
          },
          // v1 API y resto: /api/* → pasa directo al backend
          '/api': {
            target: 'http://localhost:4000',
            changeOrigin: true
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
