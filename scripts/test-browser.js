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

    // Touch-style pointer drag (mobile viewport uses immediate drag)
    await page.locator('#screen-multiplayer .back-btn').click();
    await page.waitForSelector('#screen-menu.active');
    await page.click('[data-action="survival"]');
    await page.waitForSelector('#screen-game.active');
    const piece2 = page.locator('.tray-piece').first();
    const pieceBox2 = await piece2.boundingBox();
    const boardBox2 = await board.boundingBox();
    if (pieceBox2 && boardBox2) {
      const touchX = pieceBox2.x + pieceBox2.width / 2;
      const touchY = pieceBox2.y + pieceBox2.height / 2;
      const dropX = boardBox2.x + boardBox2.width * 0.3;
      const dropY = boardBox2.y + boardBox2.height * 0.3;
      await piece2.dispatchEvent('pointerdown', {
        pointerId: 7, pointerType: 'touch', clientX: touchX, clientY: touchY, button: 0, bubbles: true
      });
      await page.evaluate(({ dropX, dropY }) => {
        document.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 7, pointerType: 'touch', clientX: dropX, clientY: dropY, button: 0, bubbles: true
        }));
        document.dispatchEvent(new PointerEvent('pointerup', {
          pointerId: 7, pointerType: 'touch', clientX: dropX, clientY: dropY, button: 0, bubbles: true
        }));
      }, { dropX, dropY });
      const ghostVisible = await page.locator('.drag-ghost:not(.hidden)').count();
      assert(ghostVisible === 0, 'touch pointer drag ends with ghost hidden');
    }

    // Duel mode picker labels
    await page.click('#btn-back');
    await page.waitForSelector('#screen-menu.active');
    await page.click('[data-action="multiplayer"]');
    await page.waitForSelector('#screen-multiplayer.active');
    const blitzBtn = page.locator('.duel-mode-btn').first();
    await blitzBtn.click();
    assert(await blitzBtn.evaluate(el => el.classList.contains('selected')), 'duel mode selection toggles');
    const blitzName = await blitzBtn.locator('.duel-mode-name').textContent();
    assert(blitzName?.length > 0, 'duel mode has label');

    // Settings + pack screen smoke
    await page.locator('#screen-multiplayer .back-btn').click();
    await page.waitForSelector('#screen-menu.active');
    await page.click('[data-action="pack"]');
    await page.waitForSelector('#screen-pack.active');
    assert(await page.locator('#btn-open-pack').isVisible(), 'pack screen opens');

    // Hebrew i18n
    await page.locator('#screen-pack .back-btn').click();
    await page.waitForSelector('#screen-menu.active');
    await page.click('[data-action="settings"]');
    await page.selectOption('#setting-language', 'he');
    await page.waitForTimeout(200);
    await page.locator('#screen-settings .back-btn').click();
    await page.waitForSelector('#screen-menu.active');
    const survivalText = await page.locator('[data-action="survival"]').textContent();
    assert(survivalText?.includes('הישרדות'), 'Hebrew survival menu label');
    await page.click('[data-action="multiplayer"]');
    await page.waitForSelector('#screen-multiplayer.active');
    const heBlitz = await page.locator('.duel-mode-btn').first().locator('.duel-mode-name').textContent();
    assert(heBlitz?.includes('בליץ'), 'Hebrew duel mode label');

    await page.locator('#screen-multiplayer .back-btn').click();
    await page.waitForSelector('#screen-menu.active');
    await page.click('[data-action="loadout"]');
    await page.waitForSelector('#screen-loadout.active');
    assert(await page.locator('.loadout-hint').isVisible(), 'loadout screen opens');

    await page.locator('#screen-loadout .back-btn').click();
    await page.click('[data-action="achievements"]');
    await page.waitForSelector('#screen-achievements.active');
    assert(await page.locator('#screen-achievements h2').isVisible(), 'achievements screen opens');

    await page.locator('#screen-achievements .back-btn').click();
    await page.click('[data-action="inventory"]');
    await page.waitForSelector('#screen-inventory.active');
    assert(await page.locator('#inventory-grid').isVisible(), 'inventory screen opens');

    await page.locator('#screen-inventory .back-btn').click();
    await page.click('[data-action="settings"]');
    await page.waitForSelector('#screen-settings.active');
    assert(await page.locator('#setting-language').isVisible(), 'settings screen opens');

    await page.locator('#screen-settings .back-btn').click();
    await page.click('[data-action="event-shop"]');
    await page.waitForSelector('#screen-event-shop.active');
    assert(await page.locator('#event-shop-items').isVisible(), 'event shop screen opens');

    await page.locator('#screen-event-shop .back-btn').click();
    await page.click('[data-action="leaderboard"]');
    await page.waitForSelector('#screen-leaderboard.active');
    assert(await page.locator('#leaderboard-list').isVisible(), 'leaderboard screen opens');

    await page.locator('#screen-leaderboard .back-btn').click();
    await page.click('#user-badge');
    await page.waitForSelector('#screen-profile.active');
    assert(await page.locator('#profile-stats').isVisible(), 'profile screen opens');

  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
