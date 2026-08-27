import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { queryAll, queryOne, execute, withTransaction, isPostgres } from './db';

export interface BackupMetadata {
  version: string;
  generated_at: string;
  engine: string;
  shop_id: number | null;
  tables: string[];
  records_count: Record<string, number>;
  checksum: string;
}

export interface BackupManifest {
  metadata: BackupMetadata;
  data: {
    shops?: any[];
    stocks?: any[];
    users?: any[];
    products?: any[];
    customers?: any[];
    partner_shops?: any[];
    orders?: any[];
    order_items?: any[];
    payments?: any[];
    inventory_movements?: any[];
    stock_transfers?: any[];
    audit_logs?: any[];
  };
}

const ORDERED_TABLES = [
  'shops',
  'stocks',
  'users',
  'customers',
  'partner_shops',
  'products',
  'orders',
  'order_items',
  'payments',
  'inventory_movements',
  'stock_transfers',
  'audit_logs'
];

/**
 * Creates a cryptographically verified JSON backup of the system or a specific shop tenant.
 */
export async function createBackup(shopId?: number | null): Promise<BackupManifest> {
  const data: BackupManifest['data'] = {};
  const recordsCount: Record<string, number> = {};

  for (const table of ORDERED_TABLES) {
    let sql = `SELECT * FROM ${table}`;
    const params: any[] = [];

    // Tenant-scoped filter (except for shops where id = shopId)
    if (shopId && shopId > 0) {
      if (table === 'shops') {
        sql += ` WHERE id = ?`;
        params.push(shopId);
      } else if (table === 'order_items') {
        sql = `SELECT oi.* FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.shop_id = ?`;
        params.push(shopId);
      } else {
        sql += ` WHERE shop_id = ?`;
        params.push(shopId);
      }
    }

    sql += ` ORDER BY id ASC`;

    const rows = await queryAll(sql, params);
    data[table as keyof BackupManifest['data']] = rows;
    recordsCount[table] = rows.length;
  }

  const payloadString = JSON.stringify(data);
  const checksum = crypto.createHash('sha256').update(payloadString).digest('hex');

  const manifest: BackupManifest = {
    metadata: {
      version: '1.0',
      generated_at: new Date().toISOString(),
      engine: isPostgres() ? 'postgresql' : 'sqlite',
      shop_id: shopId || null,
      tables: ORDERED_TABLES,
      records_count: recordsCount,
      checksum
    },
    data
  };

  return manifest;
}

/**
 * Restores the database from a verified BackupManifest inside a transaction.
 */
export async function restoreBackup(manifest: BackupManifest): Promise<{ success: boolean; stats: Record<string, number> }> {
  if (!manifest || !manifest.metadata || !manifest.data) {
    throw new Error('Invalid backup structure: Missing metadata or data payload.');
  }

  // 1. Verify cryptographic checksum
  const payloadString = JSON.stringify(manifest.data);
  const calculatedChecksum = crypto.createHash('sha256').update(payloadString).digest('hex');

  if (calculatedChecksum !== manifest.metadata.checksum) {
    throw new Error('Integrity verification failed: Backup payload checksum mismatch.');
  }

  const restoredStats: Record<string, number> = {};

  // 2. Perform restoration in single atomic transaction
  await withTransaction(async () => {
    // Reverse table order for safe foreign key cleanup
    const reverseTables = [...ORDERED_TABLES].reverse();

    for (const table of reverseTables) {
      if (manifest.metadata.shop_id) {
        if (table === 'shops') {
          await execute(`DELETE FROM shops WHERE id = ?`, [manifest.metadata.shop_id]);
        } else if (table === 'order_items') {
          await execute(
            `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE shop_id = ?)`,
            [manifest.metadata.shop_id]
          );
        } else {
          await execute(`DELETE FROM ${table} WHERE shop_id = ?`, [manifest.metadata.shop_id]);
        }
      } else {
        await execute(`DELETE FROM ${table}`);
      }
    }

    // Insert records in topological forward order
    for (const table of ORDERED_TABLES) {
      const records = manifest.data[table as keyof BackupManifest['data']] || [];
      restoredStats[table] = 0;

      for (const record of records) {
        const keys = Object.keys(record);
        if (keys.length === 0) continue;

        const placeholders = keys.map(() => '?').join(', ');
        const columns = keys.join(', ');
        const values = keys.map(k => record[k]);

        const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
        await execute(sql, values);
        restoredStats[table]++;
      }
    }
  });

  return {
    success: true,
    stats: restoredStats
  };
}

/**
 * Exports backup to a file on disk.
 */
export async function exportBackupToFile(destPath?: string, shopId?: number | null): Promise<string> {
  const manifest = await createBackup(shopId);
  const targetPath = destPath || path.join(process.cwd(), `backup-${Date.now()}.json`);
  fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return targetPath;
}

/**
 * Restores database from a file on disk.
 */
export async function restoreBackupFromFile(srcPath: string): Promise<{ success: boolean; stats: Record<string, number> }> {
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Backup file not found: ${srcPath}`);
  }
  const content = fs.readFileSync(srcPath, 'utf-8');
  const manifest: BackupManifest = JSON.parse(content);
  return restoreBackup(manifest);
}
