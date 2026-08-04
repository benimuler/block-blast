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

**Render עדיין על v3.12** — GitHub Actions רץ אבל **לא deploy** כי חסר Deploy Hook.

### Deploy אוטומטי (פעם אחת, 2 דק')

1. [Render Dashboard](https://dashboard.render.com/) → **block-blast** → **Settings** → **Deploy Hook** → Create → העתק URL
2. בטרמינל:
```powershell
gh secret set RENDER_DEPLOY_HOOK --repo benimuler/block-blast
```
(הדבק את ה-URL כשיתבקש)
3. מעכשיו כל `git push` ל-main מפעיל deploy אוטומטי

### Deploy ידני (מיידי)

1. Render Dashboard → **block-blast** → **Manual Deploy** → **Deploy latest commit**
2. **Ctrl+Shift+R** (cache v3.16)

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
