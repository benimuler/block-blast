/**
 * Systematic UI exploration — every screen, mode, and interaction surface.
 * Run: node scripts/explore-all-screens.js  (server on :3001)
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = process.env.GAME_URL || 'http://localhost:3001';
const failures = [];
let passed = 0;

function assert(cond, id, msg) {
  if (cond) { passed++; return; }
  failures.push({ id, msg, area: id.split('.')[0] });
}

async function dismissTutorial(page) {
  const t = page.locator('#tutorial-modal:not(.hidden)');
  if (await t.count()) await page.click('#btn-tutorial-close');
}

async function goMenu(page) {
  for (let i = 0; i < 6; i++) {
    const active = await page.evaluate(() =>
      document.getElementById('screen-menu')?.classList.contains('active')
    );
    if (active) return;
    const back = page.locator('.back-btn:visible').first();
    if (await back.count()) {
      await back.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(200);
      continue;
    }
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await dismissTutorial(page);
    return;
  }
}

async function openScreen(page, action, screenId) {
  await goMenu(page);
  await dismissTutorial(page);
  if (action === 'settings' || action === 'profile') {
    await page.evaluate((act) => {
      document.querySelector(`[data-action="${act}"]`)?.click();
    }, action);
  } else {
    await page.click(`[data-action="${action}"]`, { timeout: 10000 });
  }
  await page.waitForSelector(`#screen-${screenId}.active`, { timeout: 10000 });
  assert(true, `nav.${action}`, `opens screen-${screenId}`);
}

async function testMenuScreens(page) {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await dismissTutorial(page);

  const actions = [
    ['settings', 'settings'],
    ['profile', 'profile'],
    ['leaderboard', 'leaderboard'],
    ['inventory', 'inventory'],
    ['loadout', 'loadout'],
    ['pack', 'pack'],
    ['event-shop', 'event-shop'],
    ['achievements', 'achievements'],
    ['multiplayer', 'multiplayer']
  ];

  for (const [action, screen] of actions) {
    try {
      await openScreen(page, action, screen);
      const hasBack = await page.locator(`#screen-${screen} .back-btn`).count();
      assert(hasBack > 0, `screen.${screen}.back`, `${screen} has back button`);
    } catch (e) {
      failures.push({ id: `nav.${action}`, msg: e.message, area: 'navigation' });
    }
  }
}

async function testSurvivalGameplay(page) {
  await openScreen(page, 'survival', 'game');
  const board = page.locator('#board .cell');
  assert(await board.count() === 64, 'survival.board', 'board has 64 cells');
  assert(await page.locator('.tray-piece').count() >= 1, 'survival.tray', 'tray has pieces');

  const piece = page.locator('.tray-piece').first();
  const pBox = await piece.boundingBox();
  const bBox = await page.locator('#board').boundingBox();
  if (pBox && bBox) {
    await page.mouse.move(pBox.x + pBox.width / 2, pBox.y + pBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(bBox.x + bBox.width * 0.3, bBox.y + bBox.height * 0.3, { steps: 8 });
    await page.waitForTimeout(60);
    const wrapLeft = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('#board .cell').forEach((el, i) => {
        if (i < 8 && (el.classList.contains('preview-valid') || el.classList.contains('preview-invalid'))) n++;
      });
      return n;
    });
    assert(wrapLeft === 0, 'drag.no-wrap-left', 'off-board drag does not wrap preview to left');
    await page.mouse.up();
  }

  await page.click('#btn-back');
  await page.waitForSelector('#screen-menu.active');
}

async function testDailyPuzzle(page) {
  await openScreen(page, 'daily', 'game');
  const puzzleInfo = page.locator('#puzzle-info');
  const visible = await puzzleInfo.evaluate(el => !el.classList.contains('hidden'));
  assert(visible, 'daily.puzzle-info', 'daily puzzle shows move counter');
  await page.click('#btn-back');
  await page.waitForSelector('#screen-menu.active');
}

async function testDuelModes(page) {
  await openScreen(page, 'multiplayer', 'multiplayer');
  const modes = page.locator('.duel-mode-btn');
  assert(await modes.count() === 5, 'duel.modes.count', '5 duel modes listed');

  for (let i = 0; i < 5; i++) {
    await modes.nth(i).click();
    const sel = await modes.nth(i).evaluate(el => el.classList.contains('selected'));
    assert(sel, `duel.mode.${i + 1}.select`, `duel mode ${i + 1} selectable`);
  }

  await page.click('#btn-find-duel');
  await page.waitForSelector('#mp-duel-card.mp-searching', { timeout: 8000 }).catch(() => {});
  const searching = await page.locator('#mp-duel-card.mp-searching').count();
  assert(searching >= 1, 'duel.search.start', 'find match enters searching state');

  await page.evaluate(() => {
    document.getElementById('btn-cancel-duel')?.click();
  });
  await page.waitForTimeout(500);
  const stillSearching = await page.locator('#mp-duel-card.mp-searching').count();
  assert(stillSearching === 0, 'duel.search.cancel', 'cancel ends search');
}

async function testSettings(page) {
  await openScreen(page, 'settings', 'settings');
  const langSelect = page.locator('#setting-language');
  if (await langSelect.count()) {
    await langSelect.selectOption('he');
    assert(true, 'settings.lang.he', 'Hebrew language selectable');
    await langSelect.selectOption('en');
  }
  const soundToggle = page.locator('#setting-sound');
  if (await soundToggle.count()) {
    await soundToggle.click();
    assert(true, 'settings.sound.toggle', 'sound toggle clickable');
  }
}

async function testInventoryLoadout(page) {
  await openScreen(page, 'inventory', 'inventory');
  assert(await page.locator('#screen-inventory').isVisible(), 'inventory.visible', 'inventory renders');
  await openScreen(page, 'loadout', 'loadout');
  assert(await page.locator('#screen-loadout').isVisible(), 'loadout.visible', 'loadout renders');
}

async function testMobileViewport(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await goMenu(page);
  await openScreen(page, 'survival', 'game');
  const bBox = await page.locator('#board').boundingBox();
  const vh = 844;
  assert(bBox && bBox.height >= vh * 0.35, 'mobile.board.size', 'board uses significant viewport height on mobile');
  await page.click('#btn-back');
}

async function main() {
  console.log(`Explore all screens → ${URL}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  try {
    await testMenuScreens(page);
    await testSurvivalGameplay(page);
    await testDailyPuzzle(page);
    await testDuelModes(page);
    await testSettings(page);
    await testInventoryLoadout(page);
    await testMobileViewport(page);

    for (const err of jsErrors) {
      failures.push({ id: 'js.pageerror', msg: err, area: 'runtime' });
    }
    assert(jsErrors.length === 0, 'js.no-errors', 'no uncaught JS errors during exploration');
  } finally {
    await browser.close();
  }

  console.log(`\nExplore: ${passed} passed, ${failures.length} failures`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ [${f.id}] ${f.msg}`);
    writeReport(failures);
    process.exit(1);
  }
  writeReport([]);
  process.exit(0);
}

function writeReport(failList) {
  mkdirSync('data', { recursive: true });
  writeFileSync('data/bug-hunt-last-explore.json', JSON.stringify({
    at: new Date().toISOString(),
    passed,
    failures: failList
  }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
