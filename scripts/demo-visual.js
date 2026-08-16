/** Visual demo for screen recording */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, slowMo: 400 });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });

if (await page.locator('#tutorial-modal:not(.hidden)').count()) {
  await page.click('#btn-tutorial-close');
}

await page.click('[data-action="survival"]');
await page.waitForSelector('#screen-game.active');

const board = await page.locator('#board').boundingBox();
const piece = await page.locator('.tray-piece').first().boundingBox();
if (board && piece) {
  await page.mouse.move(piece.x + piece.width / 2, piece.y + piece.height / 2);
  await page.mouse.down();
  await page.mouse.move(board.x + board.width * 0.3, board.y + board.height * 0.3, { steps: 15 });
  await page.mouse.up();
}

await page.waitForTimeout(1500);
await page.click('#btn-back');
await page.click('[data-action="multiplayer"]');
await page.waitForSelector('#screen-multiplayer.active');
await page.waitForTimeout(2000);

await browser.close();
