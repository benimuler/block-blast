# Bug Hunt Cloud Agent — Run Until 01:00 IDT

## Mission

Play and stress-test **every part** of Block Blast. Find bugs, fix them, add a **permanent test** for each fix, register in `data/bug-registry.json`. **Do not stop** until:

1. `cumulativeFixed >= 10000` in `data/bug-registry.json`, **OR**
2. Clock reaches **01:00 IDT** (UTC+3)

## Autonomy

- Run commands without asking
- Fix bugs immediately when found
- Commit and push after each fix batch when `npm run test:ci` passes
- Never skip adding a test for a registered bug

## Loop (repeat until stop condition)

```
1. Read data/bug-registry.json — note cumulativeFixed / target
2. node scripts/bug-hunt-loop.js   (OR manual sub-steps below)
3. If exit code 2 or explore/CI failed:
   a. Read data/bug-hunt-last-explore.json and test output
   b. Reproduce bug (browser / engine)
   c. Fix minimal code change
   d. Add test with unique testId (scripts/playtest.js, scripts/explore-all-screens.js,
      scripts/playtest-browser-gameplay.js, or scripts/test-mega.js if engine-only)
   e. Register: import registerFix from scripts/bug-registry.js OR edit data/bug-registry.json
   f. Run npm run test:ci — must pass
   g. git commit -m "fix(BUG-XXXXX): <title>" && git push
   h. GOTO 1
4. If batch OK but cumulativeFixed < 10000:
   - Proactively explore: new seeds, duel MP, mobile viewport, RTL, edge cases
   - Invent fuzz tests for uncovered paths
   - GOTO 1
5. Stop only when target or 01:00 IDT
```

## Areas to cover (checklist)

- [ ] Menu → every screen (settings, profile, leaderboard, inventory, loadout, pack, event-shop, achievements, multiplayer)
- [ ] Survival: drag, rotate, undo, abilities, line clear, game over, score
- [ ] Daily puzzle: win/lose, move counter
- [ ] All 5 duel modes: blitz, mirror, attack, shrink, sudden (MP smoke + engine)
- [ ] Mobile 390×844: board size, ghost under finger, off-board drag (no wrap)
- [ ] i18n: Hebrew + English
- [ ] Service worker / cache bump when JS changes
- [ ] Rejoin / disconnect / forfeit
- [ ] Shrink walls, garbage attack, mirror RNG restore

## Registering a fix

Each bug needs:

```json
{
  "testId": "unique.test.id",
  "title": "Short description",
  "area": "ui/drag | duel | engine | mp | mobile",
  "testFile": "scripts/playtest.js",
  "filesChanged": ["js/ui/renderer.js"],
  "description": "Root cause one line"
}
```

Use `node -e "import('./scripts/bug-registry.js').then(m => { const r=m.loadRegistry(); m.registerFix(r,{testId:'...',title:'...',area:'...',testFile:'...',filesChanged:[]}); })"`

## Commands

```bash
npm start                          # :3001
npm run test:ci                    # full suite
npm run test:explore               # all screens Playwright
npm run bug-hunt:loop              # automated loop until fix needed or 01:00
node scripts/bug-registry.js       # (via import) status
```

## Output

- `BUGS.md` — human-readable log (auto-appended)
- `data/bug-registry.json` — cumulative counter
- `data/bug-hunt-status.json` — last batch state

## Important

- **10,000 bugs** = 10,000 registered fixes with unique tests (includes engine fuzz / mega-style cases)
- Duplicate testId rejected — each test must be unique
- Prefer real bugs from gameplay; synthetic edge-case tests count if they expose/fix real logic holes
