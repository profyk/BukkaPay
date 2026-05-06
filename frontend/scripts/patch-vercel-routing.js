const fs = require('fs');
const path = require('path');

const configPath = path.join(process.cwd(), '.vercel', 'output', 'config.json');

if (!fs.existsSync(configPath)) {
  console.log('No .vercel/output/config.json found — vercel.json rewrites will handle routing.');
  process.exit(0);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log('Patching .vercel/output/config.json to add SPA catch-all route...');

if (!config.routes) config.routes = [];

const hasCatchAll = config.routes.some(r => r.src && r.src.includes('(.*)'));
if (!hasCatchAll) {
  const hasFilesystem = config.routes.some(r => r.handle === 'filesystem');
  if (!hasFilesystem) {
    config.routes.push({ handle: 'filesystem' });
  }
  config.routes.push({ src: '/(.*)', dest: '/index.html' });
  console.log('Added catch-all route: /(.*) -> /index.html');
} else {
  console.log('Catch-all route already present, skipping.');
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Done. Final routes config:', JSON.stringify(config.routes, null, 2));
