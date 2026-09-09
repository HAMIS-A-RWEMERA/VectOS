import { cpSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const fn = join(root, 'functions');

// The Firebase function serves the SPA (dist), legacy EJS views, static
// public files and the Supabase schema from the functions directory at
// runtime, so they must be copied into the deploy payload.

const foldersToCopy = ['views', 'public', 'dist'];
for (const dir of foldersToCopy) {
  const src = join(root, dir);
  const dst = join(fn, dir);
  if (!existsSync(src)) {
    console.warn(`[build:firebase] Skipping missing folder: ${dir}`);
    continue;
  }
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
  console.log(`[build:firebase] Copied ${dir}/ -> functions/${dir}/`);
}

const schemaSrc = join(root, 'supabase-schema.sql');
const schemaDst = join(fn, 'supabase-schema.sql');
if (existsSync(schemaSrc)) {
  cpSync(schemaSrc, schemaDst);
  console.log('[build:firebase] Copied supabase-schema.sql -> functions/');
}