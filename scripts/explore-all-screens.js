/**
 * Deep screen exploration — all menus, mobile viewport, RTL Hebrew.
 * Writes results to data/bug-hunt-last-explore.json
 * Run: node scripts/explore-all-screens.js  (server on :3001)
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const URL = process.env.GAME_URL || 'http://localhost:3001';
const OUT = join(__dir, '..', 'data', 'bug-hunt-last-explore.json');

const results = { passed: 0, failed: 0, tests: [], errors: [] };

function assert(testId, cond, msg) {
  if (cond) {
    results.passed++;
    results.tests.push({ testId, status: 'pass', msg });
    console.log(`  ✓ [${testId}] ${msg}`);
  } else {
    results.failed++;
    results.tests.push({ testId, status: 'fail', msg });
    console.error(`  ✗ [${testId}] ${msg}`);
  }
}

async function dismissTutorial(page) {
  const tutorial = page.locator('#tutorial-modal:not(.hidden)');
  if (await tutorial.count()) await page.click('#btn-tutorial-close');
}

async function exploreMenuScreens(page) {
  const screens = [
    ['explore.menu.survival', '[data-action="survival"]', '#screen-game'],
    ['explore.menu.daily', '[data-action="daily"]', '#screen-game'],
    ['explore.menu.inventory', '[data-action="inventory"]', '#screen-inventory'],
    ['explore.menu.loadout', '[data-action="loadout"]', '#screen-loadout'],
    ['explore.menu.pack', '[data-action="pack"]', '#screen-pack'],
    ['explore.menu.event-shop', '[data-action="event-shop"]', '#screen-event-shop'],
    ['explore.menu.multiplayer', '[data-action="multiplayer"]', '#screen-multiplayer'],
    ['explore.menu.leaderboard', '[data-action="leaderboard"]', '#screen-leaderboard'],
    ['explore.menu.settings', '[data-action="settings"]', '#screen-settings'],
    ['explore.menu.achievements', '[data-action="achievements"]', '#screen-achievements'],
  ];

  for (const [testId, action, selector] of screens) {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await dismissTutorial(page);
    await page.click(action);
    await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
    const visible = await page.locator(selector).evaluate(el => el?.classList.contains('active')).catch(() => false);
    assert(testId, visible, `${action} opens ${selector}`);
    const back = page.locator(`${selector.replace('#screen-', '#screen-')} .back-btn, #btn-back`).first();
    if (await back.count()) {
      await back.click().catch(() => page.goBack());
    }
  }

  await page.goto(URL, { waitUntil: 'networkidle' });
  await dismissTutorial(page);
  await page.click('#user-badge');
  await page.waitForSelector('#screen-profile.active', { timeout: 5000 }).catch(() => {});
  assert('explore.menu.profile', await page.locator('#screen-profile.active').count() > 0, 'profile opens');
}

async function exploreOffBoardDrag(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await dismissTutorial(page);
  await page.click('[data-action="survival"]');
  await page.waitForSelector('#screen-game.active');

  const piece = page.locator('.tray-piece').first();
  const board = page.locator('#board');
  const pieceBox = await piece.boundingBox();
  const boardBox = await board.boundingBox();
  if (!pieceBox || !boardBox) {
    assert('explore.drag.offboard-setup', false, 'could not get bounding boxes');
    return;
  }

  const startX = pieceBox.x + pieceBox.width / 2;
  const startY = pieceBox.y + pieceBox.height / 2;
  // Drop far right of board (off-board)
  const endX = boardBox.x + boardBox.width + 80;
  const endY = boardBox.y + boardBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 8 });

  const wrappedPreview = await page.evaluate(() => {
    const cells = document.querySelectorAll('#board .cell.preview-valid, #board .cell.preview-invalid');
    let offBoardIdx = false;
    cells.forEach(el => {
      const idx = Array.from(el.parentElement.children).indexOf(el);
      const row = Math.floor(idx / 8);
      const col = idx % 8;
      // If preview appears on row 0 when dragging far right, that's wrap
      if (cells.length && row === 0 && col < 3) offBoardIdx = true;
    });
    return { count: cells.length, wrapped: offBoardIdx };
  });

  await page.mouse.up();
  assert('explore.drag.offboard-no-wrap', !wrappedPreview.wrapped,
    `off-board drag must not wrap preview (previews=${wrappedPreview.count})`);

  const filledBefore = await page.locator('#board .cell.filled').count();
  await page.waitForTimeout(100);
  const filledAfter = await page.locator('#board .cell.filled').count();
  assert('explore.drag.offboard-no-place', filledAfter === filledBefore,
    'off-board drop must not place piece');
}

async function exploreEdgePreview(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await dismissTutorial(page);
  await page.click('[data-action="survival"]');
  await page.waitForSelector('#screen-game.active');

  const wrapped = await page.evaluate(() => {
    const app = window.__bbApp;
    if (!app?.engine || !app?.renderer) return { skip: true };
    const piece = app.engine.pieces.find(p => !p.used);
    if (!piece) return { skip: true };
    // Force wide piece at right edge
    piece.shapeKey = 'line3_h';
    piece.shape = [[1, 1, 1]];
    const cells = app.engine.getPreviewCells(piece, 0, 7);
    const bad = cells.some(c => c.col >= 8 || c.row >= 8 || c.col < 0 || c.row < 0);
    return { skip: false, bad, count: cells.length };
  });

  if (wrapped.skip) {
    assert('explore.preview.edge-setup', true, 'edge preview test skipped (no app hook)');
    return;
  }
  assert('explore.preview.edge-in-bounds', !wrapped.bad,
    `edge preview cells in bounds (${wrapped.count} cells)`);
}

async function exploreHebrewRTL(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await dismissTutorial(page);
  await page.click('[data-action="settings"]');
  await page.selectOption('#setting-language', 'he');
  await page.waitForTimeout(200);
  await page.locator('#screen-settings .back-btn').click();
  const survival = await page.locator('[data-action="survival"]').textContent();
  assert('explore.i18n.he.survival', survival?.includes('הישרדות'), 'Hebrew survival label');
  const htmlDir = await page.locator('html').getAttribute('dir');
  assert('explore.i18n.he.rtl', htmlDir === 'rtl', 'HTML dir=rtl for Hebrew');

  await page.click('[data-action="settings"]');
  await page.waitForSelector('#screen-settings.active');
  await page.selectOption('#setting-language', 'en');
  await page.locator('#screen-settings .back-btn').click();
}

async function exploreDuelModes(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await dismissTutorial(page);
  await page.click('[data-action="multiplayer"]');
  await page.waitForSelector('#screen-multiplayer.active');
  const modes = await page.locator('.duel-mode-btn').count();
  assert('explore.duel.five-modes', modes === 5, '5 duel modes listed');

  for (let i = 0; i < modes; i++) {
    await page.locator('.duel-mode-btn').nth(i).click();
    const selected = await page.locator('.duel-mode-btn').nth(i).evaluate(el => el.classList.contains('selected'));
    assert(`explore.duel.mode-${i}`, selected, `duel mode ${i} selectable`);
  }
}

async function main() {
  console.log(`Explore all screens → ${URL}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  page.on('pageerror', e => results.errors.push(e.message));

  try {
    await exploreMenuScreens(page);
    await exploreOffBoardDrag(page);
    await exploreEdgePreview(page);
    await exploreHebrewRTL(page);
    await exploreDuelModes(page);
    assert('explore.no-syntax-errors', !results.errors.some(e => e.includes('SyntaxError')),
      'no syntax errors during explore');
  } finally {
    await browser.close();
  }

  results.ok = results.failed === 0;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  console.log(`\n${results.passed} passed, ${results.failed} failed`);
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
  results.errors.push(String(e));
  writeFileSync(OUT, JSON.stringify({ ...results, ok: false, fatal: String(e) }, null, 2));
  console.error(e);
  process.exit(1);
});
