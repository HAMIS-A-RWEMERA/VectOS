// Scans all EJS views for onclick/onsubmit/onchange handlers and verifies each
// referenced function is defined in that page's script graph (own scripts +
// included partials). Catches "button visible but does nothing" bugs.
import fs from 'fs';
import path from 'path';

const VIEWS = path.join(process.cwd(), 'views');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]
  );
}

const files = walk(VIEWS).filter((f) => f.endsWith('.ejs'));
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));

function resolveIncludes(name, seen = new Set()) {
  const key = name.replace(/\\/g, '/');
  if (seen.has(key)) return '';
  seen.add(key);
  const file = files.find((f) => f.replace(/\\/g, '/').endsWith(key));
  if (!file) return '';
  let text = src[file];
  for (const m of text.matchAll(/include\('([^']+)'\)/g)) {
    text += resolveIncludes(m[1], seen);
  }
  return text;
}

let problems = 0;
for (const f of files) {
  const pageName = path.basename(f);
  // Skip pure partials (they render inside hosts)
  if (pageName.startsWith('_') || /partials[/\\]/.test(f)) continue;

  const text = src[f];
  const handlers = new Set();
  for (const m of text.matchAll(/\bon(?:click|submit|change|input)\s*=\s*"([a-zA-Z_$][\w$]*)\(/g)) {
    handlers.add(m[1]);
  }
  if (!handlers.size) continue;

  const full = resolveIncludes(path.relative(VIEWS, f));
  const missing = [...handlers].filter((h) => {
    const def = new RegExp(`function\\s+${h}\\s*\\(|(?:const|let|var)\\s+${h}\\s*=|window\\.${h}\\s*=`);
    return !def.test(full);
  });

  if (missing.length) {
    problems += missing.length;
    console.log(`✗ ${pageName}: MISSING -> ${missing.join(', ')}`);
  }
}
console.log(problems === 0 ? 'ALL HANDLERS DEFINED ✓' : `${problems} missing handler(s)`);
process.exit(0);
