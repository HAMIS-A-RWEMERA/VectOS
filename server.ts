import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { app, dbReady } from './server/app';

const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.VECTOS_NO_LISTEN === '1';

// Vite middleware for React Single Page Application (VectOS Modern UI)
async function setupViteAndListen() {
  if (isTest) {
    return;
  }

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (
    process.env.VERCEL !== '1' &&
    process.env.AWS_LAMBDA_FUNCTION_NAME === undefined &&
    process.env.FUNCTION_TARGET === undefined &&
    process.env.FIREBASE_CONFIG === undefined &&
    process.env.VECTOS_NO_LISTEN !== '1'
  ) {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🏗️ VectOS React ERP running at http://0.0.0.0:${PORT}`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${PORT} is currently occupied, reusing existing active listener.`);
      } else {
        console.error('Server listener error:', err);
      }
    });
  }
}

setupViteAndListen().catch((err) => {
  console.error('Failed to start server:', err);
});

export { app, dbReady };
