import type { Request, Response } from 'express';
import { app, dbReady } from './app';

export default async function handler(req: Request, res: Response) {
  try {
    await dbReady;
  } catch (err) {
    console.error('Database connection error in Vercel handler:', err);
  }

  // Normalize path if rewritten without /api prefix by Vercel
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  return app(req, res);
}
