import type { Request, Response } from 'express';
import { app, dbReady } from '../server';

export default async function handler(req: Request, res: Response) {
  try {
    await dbReady;
  } catch (err) {
    console.error('Database connection error in Vercel handler:', err);
  }
  return app(req, res);
}
