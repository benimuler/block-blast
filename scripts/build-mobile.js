/**
 * Copy static web assets into www/ for Capacitor Android build.
 * Run: npm run build:mobile
 */
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');

const PRODUCTION_SERVER = 'https://block-blast-062t.onrender.com';

function copyDir(src, dest) {
  cpSync(join(root, src), join(www, dest), { recursive: true });
}

if (existsSync(www)) rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

copyDir('css', 'css');
copyDir('js', 'js');
copyDir('icons', 'icons');
cpSync(join(root, 'manifest.json'), join(www, 'manifest.json'));
cpSync(join(root, 'privacy-policy.html'), join(www, 'privacy-policy.html'));

let html = readFileSync(join(root, 'index.html'), 'utf8');

// Mobile: Socket.io from CDN (no local Node server)
html = html.replace(
  '<script src="/socket.io/socket.io.js"></script>',
  '<script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>'
);

// Inject production server for Capacitor file:// origin
const configScript = `<script>window.__BLOCKBLAST_SERVER__="${PRODUCTION_SERVER}";</script>`;
html = html.replace('<head>', `<head>\n  ${configScript}`);

writeFileSync(join(www, 'index.html'), html);
console.log('Mobile build → www/ (server: ' + PRODUCTION_SERVER + ')');
