# Bug Hunt Cloud Agent

Overnight loop until **01:00 IDT (UTC+3)** or **10,000 cumulative fixes**.

## Loop

```
1. npm run bug-hunt:status
2. npm run bug-hunt:loop
3. On exit 2: read data/bug-hunt-last-explore.json + CI output → fix → test → register → commit → push → goto 1
4. On exit 0 and cumulativeFixed < 10000: proactive explore (MP, mobile, RTL, fuzz) → goto 1
5. Stop at 01:00 IDT or 10k fixes
```

## Register each fix

```bash
node scripts/bug-registry.js register "title" unique-test-id js/files/changed.js
```

Every fix needs a unique `testId` in playtest.js, explore-all-screens.js, playtest-browser-gameplay.js, or test-mega.js.

## Areas

Menu screens, survival, daily puzzle, 5 duel modes, mobile 390×844, RTL Hebrew, MP disconnect/forfeit, off-board drag no wrap.
