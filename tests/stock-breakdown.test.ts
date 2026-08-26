import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { createTestShop, login } from './helpers';

let agent: ReturnType<typeof request.agent>;
let token: string;
const shopName = 'WarehouseRevenueTest ' + Date.now();

beforeAll(async () => {
  const shop = await createTestShop(shopName);
  const session = await login(shop.managerEmail, shop.managerPassword);
  agent = session.agent as any;
  token = session.token;
});

describe('Warehouse Revenue Attribution (stockBreakdown)', () => {
  it('reports page loads without error', async () => {
    const res = await agent.get('/reports').set('Accept', 'text/html');
    expect(res.status).toBeLessThan(500);
  });
});