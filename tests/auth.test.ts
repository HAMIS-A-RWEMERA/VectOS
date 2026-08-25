import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { getCsrf, login } from './helpers';

const ADMIN = { email: 'admin@vectos.co.rw', password: 'password123' };

describe('Authentication & security', () => {
  it('renders the login page with VectOS branding', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('VectOS');
    expect(res.text).toContain('Sign In to Portal');
  });

  it('rejects a wrong password', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const res = await agent.post('/login').type('form').send({
      email: ADMIN.email, password: 'definitely-wrong', _csrf: token
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid password');
  });

  it('logs the superadmin in and reaches the admin dashboard', async () => {
    const { agent } = await login(ADMIN.email, ADMIN.password);
    const dash = await agent.get('/admin/shops');
    expect(dash.status).toBe(200);
    expect(dash.text).toContain('VectOS');
  });

  it('redirects anonymous visitors away from protected pages', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('rejects POST requests without a CSRF token (403)', async () => {
    const res = await request(app).post('/login').type('form').send({
      email: 'someone@test.rw', password: 'whatever'
    });
    expect(res.status).toBe(403);
    expect(res.text).toContain('Security Check Failed');
  });

  it('locks an identity after 8 failed attempts', async () => {
    const email = `throttle-${Date.now()}@test.rw`;
    const agent = request.agent(app);
    // The CSRF cookie is issued once and never rotates server-side, so a
    // single valid cookie+token pair is reused for every attempt in the loop.
    const token = await getCsrf(agent);
    let lastRes;
    for (let i = 0; i < 9; i++) {
      lastRes = await agent.post('/login').type('form').send({
        email, password: 'wrong-password', _csrf: token
      });
      if (i < 8) {
        expect(lastRes.text).toContain('Account not found');
      }
    }
    expect(lastRes!.text).toContain('temporarily locked');
  });
});
