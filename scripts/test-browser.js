/**
 * Browser smoke test: load game, start survival, verify board renders.
 * Run: node scripts/test-browser.js  (server on :3001)
 */
import { chromium } from 'playwright';

const URL = process.env.GAME_URL || 'http://localhost:3001';
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

async function main() {
  console.log(`Browser smoke test → ${URL}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    assert(!errors.some(e => e.includes('SyntaxError')), 'no JS syntax errors on load');

    // Menu is default screen (guest mode)
    await page.waitForSelector('#screen-menu.active', { timeout: 5000 });

    // Dismiss tutorial if shown
    const tutorial = page.locator('#tutorial-modal:not(.hidden)');
    if (await tutorial.count()) {
      await page.click('#btn-tutorial-close');
    }

    assert(true, 'menu screen visible');

    // Start survival
    await page.click('[data-action="survival"]');
    await page.waitForSelector('#screen-game.active', { timeout: 5000 });
    assert(true, 'survival game screen opened');

    const board = page.locator('#board');
    const cells = await board.locator('.cell').count();
    assert(cells === 64, 'board has 64 cells');

    const trayPieces = await page.locator('.tray-piece').count();
    assert(trayPieces === 3, 'tray has 3 pieces');

    const boardBox = await board.boundingBox();
    assert(boardBox && boardBox.width >= 300, `board width ${boardBox?.width?.toFixed(0)}px on mobile viewport`);

    // Test drag on first tray piece
    const piece = page.locator('.tray-piece').first();
    const pieceBox = await piece.boundingBox();
    if (pieceBox && boardBox) {
      const startX = pieceBox.x + pieceBox.width / 2;
      const startY = pieceBox.y + pieceBox.height / 2;
      const endX = boardBox.x + boardBox.width / 2;
      const endY = boardBox.y + boardBox.height / 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up();

      // Ghost should disappear after drop
      const ghostHidden = await page.locator('.drag-ghost.hidden').count();
      assert(ghostHidden >= 1, 'drag ghost hidden after drop');
    }

    // Daily puzzle screen
    await page.click('#btn-back');
    await page.waitForSelector('#screen-menu.active');
    await page.click('[data-action="daily"]');
    await page.waitForSelector('#screen-game.active');
    const puzzleInfo = page.locator('#puzzle-info');
    assert(await puzzleInfo.isVisible(), 'daily puzzle info visible');

    // Multiplayer screen
    await page.click('#btn-back');
    await page.waitForSelector('#screen-menu.active');
    await page.click('[data-action="multiplayer"]');
    await page.waitForSelector('#screen-multiplayer.active');
    const modeBtns = await page.locator('.duel-mode-btn').count();
    assert(modeBtns === 5, '5 duel mode buttons shown');

    // Hebrew i18n
    await page.locator('#screen-multiplayer .back-btn').click();
    await page.waitForSelector('#screen-menu.active');
    await page.click('[data-action="settings"]');
    await page.selectOption('#setting-language', 'he');
    await page.waitForTimeout(200);
    const survivalText = await page.locator('[data-action="survival"]').textContent();
    assert(survivalText?.includes('הישרדות'), 'Hebrew survival menu label');

  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
