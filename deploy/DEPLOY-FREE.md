# פריסה חינמית — Render.com

## דרך מהירה (מומלץ)

בטרמינל PowerShell מתוך תיקיית הפרויקט:

```powershell
.\deploy\push-to-github.ps1
```

הסקריפט:
1. מתחבר ל-GitHub (חלון דפדפן — פעם אחת)
2. יוצר repo `block-blast` ודוחף את הקוד
3. פותח את Render Blueprint אוטומטית

ב-Render: התחבר → **Apply** → המתן ~5 דקות → קבל URL.

---

## מה מוכן
- `render.yaml` — הגדרות Blueprint ל-Render (חינמי)
- השרת עובד עם HTTPS + Socket.io על Render

## שלב 1 — GitHub (פעם אחת, ~2 דקות)

1. צור repo חדש ב-[GitHub](https://github.com/new) בשם `block-blast` (Public)
2. בטרמינל בתיקיית הפרויקט:

```powershell
git add -A
git commit -m "Block Blast — ready for Render deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/block-blast.git
git push -u origin main
```

(החלף `YOUR_USERNAME` בשם המשתמש שלך)

## שלב 2 — Render (חינמי, ~3 דקות)

1. היכנס ל-[render.com](https://render.com) (חינמי עם GitHub)
2. **New +** → **Blueprint**
3. חבר את repo `block-blast`
4. Render יקרא את `render.yaml` ויפרוס אוטומטית
5. URL: **https://block-blast-062t.onrender.com**

## עדכון גרסה (Deploy)

הקוד ב-GitHub מעודכן, אבל Render לא מושך אוטומטית עד שמחברים repo:

1. [Render Dashboard](https://dashboard.render.com/) → **block-blast**
2. **Manual Deploy** → **Deploy latest commit** (~3 דק')
3. או: Settings → Build & Deploy → חבר `benimuler/block-blast` branch `main`

אחרי deploy: **Ctrl+Shift+R** (cache v3.14).

## הערות חשובות

| נושא | פירוט |
|------|--------|
| **Cold start** | אחרי 15 דק' ללא פעילות השרת "נרדם" — כניסה ראשונה לוקחת ~30–60 שניות |
| **נתונים** | `db.json` מתאפס בכל deploy (תוכנית חינמית) |
| **מולטיפלייר** | עובד — PC וטלפון נכנסים לאותו URL |
| **HTTPS** | אוטומטי — חובה ל-Socket.io בנייד |

## בדיקה

1. פתח את ה-URL מ-Render
2. Ctrl+Shift+R (רענון מלא)
3. Settings → בדוק ש-Server מחובר (ירוק)
4. Multiplayer → Find Match מ-2 מכשירים

## משתני סביבה (אוטומטיים מ-render.yaml)

- `NODE_ENV=production`
- `JWT_SECRET` — נוצר אוטומטית
- `HOST=0.0.0.0`

אחרי deploy, הוסף ב-Render Dashboard:
- `PUBLIC_URL` = `https://block-blast-062t.onrender.com`
