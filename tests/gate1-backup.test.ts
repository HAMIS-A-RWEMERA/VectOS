import { describe, it, expect, beforeAll } from 'vitest';
import { createTestShop, login } from './helpers';
import { createBackup, restoreBackup } from '../server/database/backup';
import { queryOne, queryAll, execute } from '../server/database/db';

describe('Gate 1: Backup & Restore Verification', () => {
  let shop: { shopId: number; managerEmail: string; managerPassword: string };

  beforeAll(async () => {
    shop = await createTestShop('BackupVerificationShop');
    // Add some products to the shop
    await execute(
      `INSERT INTO products (shop_id, stock_id, name, sku, category, buying_price, quantity, low_stock_threshold)
       VALUES (?, 1, 'Backup Test Hammer', ?, 'Hardware', 12000, 25, 5)`,
      [shop.shopId, `HAMMER-${Date.now()}`]
    );
  });

  it('generates a cryptographically signed backup manifest with table statistics', async () => {
    const backup = await createBackup(shop.shopId);
    expect(backup).toHaveProperty('metadata');
    expect(backup.metadata.version).toBe('1.0');
    expect(backup.metadata.checksum).toHaveLength(64);
    expect(backup.metadata.shop_id).toBe(shop.shopId);
    expect(backup.data.products).toBeDefined();
    expect(backup.data.products!.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects restoration if checksum is tampered with', async () => {
    const backup = await createBackup(shop.shopId);
    // Tamper with data
    backup.data.products![0].name = 'Tampered Item Name';
    // Do not recalculate checksum
    await expect(restoreBackup(backup)).rejects.toThrow(/Integrity verification failed/i);
  });

  it('successfully restores shop state atomically from a valid manifest', async () => {
    const originalBackup = await createBackup(shop.shopId);
    const originalProdCount = originalBackup.data.products?.length || 0;

    // Simulate accidental deletion
    await execute('DELETE FROM products WHERE shop_id = ?', [shop.shopId]);
    const afterDelete = await queryAll('SELECT * FROM products WHERE shop_id = ?', [shop.shopId]);
    expect(afterDelete.length).toBe(0);

    // Restore from original backup
    const restoreResult = await restoreBackup(originalBackup);
    expect(restoreResult.success).toBe(true);

    // Verify products restored
    const afterRestore = await queryAll('SELECT * FROM products WHERE shop_id = ?', [shop.shopId]);
    expect(afterRestore.length).toBe(originalProdCount);
  });

  it('exports and restores backup via /api/backup endpoints with manager authorization', async () => {
    const { agent, token } = await login(shop.managerEmail, shop.managerPassword);

    // Export backup via API
    const exportRes = await agent.get('/api/backup/export');
    expect(exportRes.status).toBe(200);
    expect(exportRes.body.metadata.checksum).toBeDefined();
    expect(exportRes.body.metadata.shop_id).toBe(shop.shopId);

    const manifest = exportRes.body;

    // Restore backup via API
    const restoreRes = await agent
      .post('/api/backup/restore')
      .set('X-CSRF-Token', token)
      .send(manifest);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);
  });
});
