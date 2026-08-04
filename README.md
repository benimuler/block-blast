# Block Blast Evolved v2.0

משחק התאמת בלוקים מלא עם הרשמה, מולטיפלייר אונליין, 25 שפות, הישגים ו-PWA.

## משחק חי (Render)

**https://block-blast-062t.onrender.com**

## Google Play + AdMob

- מדריך מלא: [`deploy/GOOGLE-PLAY.md`](deploy/GOOGLE-PLAY.md)
- בניית Android: `npm run build:android` → `npm run android:open`
- Package: `com.benimuler.blockblast`

## התקנה והרצה

```bash
npm install
npm start
```

פתח: **http://localhost:3001**

## תכונות v2.0

### 🔐 הרשמה והתחברות
- יצירת חשבון (username, email, password)
- JWT authentication
- סנכרון שמירה לענן
- משחק כאורח (offline)

### ⚔️ מולטיפלייר אונליין
- **Quick Duel** — מרוץ 3 דקות מול שחקן אחר (Socket.io)
- **Weekly Tournament** — טבלת שיאים שבועית
- Leaderboard גלובלי Top 100

### 🌍 25 שפות
English, עברית, العربية, Español, Français, Deutsch, Русский, 中文, 日本語, Português, Italiano, 한국어, Türkçe, हिन्दी, Polski, Nederlands, Svenska, Українська, ไทย, Tiếng Việt, Indonesia, Čeština, Română, Magyar, Ελληνικά

### 🎖️ הישגים
7 הישגים עם XP — First Steps, Rising Star, Block Master, Week Warrior, Collector, Duelist, Legend

### 🔊 הגדרות
- אפקטי סאונד (Web Audio API)
- ערכת נושא כהה/בהירה
- בחירת שפה
- מדריך למתחילים

### 📱 PWA
- manifest.json + Service Worker
- ניתן להתקנה על מובייל/דסקטופ

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | הרשמה |
| POST | /api/auth/login | התחברות |
| GET | /api/auth/me | פרופיל |
| POST | /api/game/save | סנכרון שמירה |
| GET | /api/tournament/leaderboard | טבלת שיאים |
| POST | /api/tournament/submit | שליחת ניקוד |

## Socket.io Events

- `find_duel` / `duel_found` / `duel_score` / `duel_end`

## מבנה

```
server/          — Backend (Express + SQLite + Socket.io)
js/i18n/         — 25 שפות
js/systems/      — auth, multiplayer, achievements, settings
js/game/         — מנוע משחק
```

## Production

ראה **[deploy/DEPLOY.md](deploy/DEPLOY.md)** — מדריך מלא לשרת Linux (PM2 + Nginx + HTTPS).

Quick start:

```bash
cp deploy/env.example .env   # ערוך JWT_SECRET + PUBLIC_URL
npm ci --omit=dev
pm2 start ecosystem.config.cjs --env production
```

Or Docker:

```bash
docker compose up -d --build
```
