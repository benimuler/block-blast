/**
 * Sync ADMOB_IDS.app from admob.config.js into AndroidManifest + capacitor.config.json
 * Run: node scripts/sync-admob-config.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ADMOB_IDS, ADMOB_APP_ID_PENDING } from '../js/systems/admob.config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appId = ADMOB_IDS.app;

if (ADMOB_APP_ID_PENDING) {
  console.warn('Warning: Replace placeholder App ID in js/systems/admob.config.js (ca-app-pub-...~...)');
}

const manifestPath = join(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
manifest = manifest.replace(
  /android:value="ca-app-pub-[^"]+"/,
  `android:value="${appId}"`
);
writeFileSync(manifestPath, manifest);

const capPath = join(root, 'capacitor.config.json');
const cap = JSON.parse(readFileSync(capPath, 'utf8'));
cap.plugins ??= {};
cap.plugins.AdMob ??= {};
cap.plugins.AdMob.appId = appId;
writeFileSync(capPath, JSON.stringify(cap, null, 2) + '\n');

console.log('AdMob App ID synced:', appId);
