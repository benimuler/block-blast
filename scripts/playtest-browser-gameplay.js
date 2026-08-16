/**
 * Extended browser gameplay: survival drag placements + duel mode UI.
 * Run: node scripts/playtest-browser-gameplay.js  (server on :3001)
 */
import { chromium } from 'playwright';

const URL = process.env.GAME_URL || 'http://localhost:3001';
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

async function dismissTutorial(page) {
  const tutorial = page.locator('#tutorial-modal:not(.hidden)');
  if (await tutorial.count()) await page.click('#btn-tutorial-close');
}

async function dragPieceToBoard(page, pieceIndex, boardFracX, boardFracY) {
  const piece = page.locator('.tray-piece').nth(pieceIndex);
  const board = page.locator('#board');
  const pieceBox = await piece.boundingBox();
  const boardBox = await board.boundingBox();
  if (!pieceBox || !boardBox) return false;

  const startX = pieceBox.x + pieceBox.width / 2;
  const startY = pieceBox.y + pieceBox.height / 2;
  const endX = boardBox.x + boardBox.width * boardFracX;
  const endY = boardBox.y + boardBox.height * boardFracY;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
  return true;
}

async function getScore(page) {
  const text = await page.locator('#score-display').textContent();
  return parseInt(text?.replace(/[^\d]/g, '') || '0', 10);
}

async function getFilledCells(page) {
  return page.locator('#board .cell.filled').count();
}

async function testSurvivalDragLoop(page) {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await dismissTutorial(page);
  await page.click('[data-action="survival"]');
  await page.waitForSelector('#screen-game.active');

  const startScore = await getScore(page);
  assert(startScore === 0, 'survival starts at score 0');

  let placed = 0;
  for (let attempt = 0; attempt < 9 && placed < 3; attempt++) {
    const trayCount = await page.locator('.tray-piece').count();
    if (trayCount === 0) break;
    const beforeFilled = await getFilledCells(page);
    const pieceIdx = Math.min(attempt % 3, trayCount - 1);
    const frac = 0.15 + (attempt % 3) * 0.25;
    await dragPieceToBoard(page, pieceIdx, frac, frac);
    await page.waitForTimeout(200);
    const afterFilled = await getFilledCells(page);
    if (afterFilled > beforeFilled) placed++;
  }
  assert(placed >= 1, `placed at least 1 piece via drag (${placed} ok)`);

  const ghostHidden = await page.locator('.drag-ghost.hidden').count();
  assert(ghostHidden >= 1, 'ghost hidden after survival drag loop');

  const scoreAfter = await getScore(page);
  assert(scoreAfter >= startScore, 'score did not decrease after placements');

  // Touch drag on second survival round
  await page.click('#btn-back');
  await page.waitForSelector('#screen-menu.active');
  await page.click('[data-action="survival"]');
  await page.waitForSelector('#screen-game.active');

  const piece = page.locator('.tray-piece').first();
  const pieceBox = await piece.boundingBox();
  const boardBox = await page.locator('#board').boundingBox();
  if (pieceBox && boardBox) {
    const tx = pieceBox.x + pieceBox.width / 2;
    const ty = pieceBox.y + pieceBox.height / 2;
    const dx = boardBox.x + boardBox.width * 0.5;
    const dy = boardBox.y + boardBox.height * 0.5;
    await piece.dispatchEvent('pointerdown', {
      pointerId: 9, pointerType: 'touch', clientX: tx, clientY: ty, button: 0, bubbles: true
    });
    await page.evaluate(({ dx, dy }) => {
      document.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 9, pointerType: 'touch', clientX: dx, clientY: dy, button: 0, bubbles: true
      }));
      document.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 9, pointerType: 'touch', clientX: dx, clientY: dy, button: 0, bubbles: true
      }));
    }, { dx, dy });
    await page.waitForTimeout(100);
    const ghostVisible = await page.locator('.drag-ghost:not(.hidden)').count();
    assert(ghostVisible === 0, 'touch drag cleans up ghost');
  }
}

async function testDuelModes(page) {
  await page.click('#btn-back');
  await page.waitForSelector('#screen-menu.active');
  await page.click('[data-action="multiplayer"]');
  await page.waitForSelector('#screen-multiplayer.active');

  const modes = await page.locator('.duel-mode-btn').all();
  assert(modes.length === 5, '5 duel modes available');

  for (let i = 0; i < modes.length; i++) {
    await modes[i].click();
    const selected = await modes[i].evaluate(el => el.classList.contains('selected'));
    assert(selected, `duel mode ${i + 1} selects on click`);
    const name = await modes[i].locator('.duel-mode-name').textContent();
    assert(name && name.length > 1, `duel mode ${i + 1} has name`);
    const desc = await modes[i].locator('.duel-mode-desc').textContent();
    assert(desc && desc.length > 3, `duel mode ${i + 1} has description`);
  }

  const findBtn = page.locator('#btn-find-duel');
  assert(await findBtn.isVisible(), 'find match button visible');
  assert(await findBtn.isEnabled(), 'find match button enabled before search');

  const cancelBtn = page.locator('#btn-cancel-duel');
  const cancelHidden = await cancelBtn.evaluate(el => {
    const style = window.getComputedStyle(el);
    return style.display === 'none' || el.offsetParent === null;
  });
  assert(cancelHidden, 'cancel button hidden before search');

  await findBtn.click();
  await page.waitForSelector('#mp-duel-card.mp-searching', { timeout: 8000 });
  const cancelVisible = await cancelBtn.evaluate(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && el.offsetParent !== null;
  });
  assert(cancelVisible, 'cancel button visible during search');
  await cancelBtn.click();
  await page.waitForFunction(() => !document.getElementById('mp-duel-card')?.classList.contains('mp-searching'), { timeout: 5000 });
  assert(true, 'search cancelled returns to idle');

  // Verify duel timer/scores hidden on lobby
  const duelTimerHidden = await page.locator('#duel-timer').evaluate(el => el.classList.contains('hidden'));
  assert(duelTimerHidden, 'duel timer hidden on lobby screen');
  const duelScoresHidden = await page.locator('#duel-scores').evaluate(el => el.classList.contains('hidden'));
  assert(duelScoresHidden, 'duel scores hidden on lobby screen');
}

async function main() {
  console.log(`Browser gameplay test → ${URL}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await testSurvivalDragLoop(page);
    await testDuelModes(page);
    assert(!errors.some(e => e.includes('SyntaxError') || e.includes('TypeError')), 'no critical JS errors');
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
