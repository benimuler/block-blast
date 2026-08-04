# פריסה לשרת (Production)

## דרישות

- שרת Linux (Ubuntu 22/24 מומלץ) או VPS
- דומיין (אופציונלי אבל מומלץ ל-HTTPS)
- Node.js 20+

---

## אופציה 1: PM2 + Nginx (מומלץ)

### 1. העלה את הקוד לשרת

```bash
# על השרת
sudo mkdir -p /var/www/blockblast
sudo chown $USER:$USER /var/www/blockblast

# מהמחשב שלך (החלף IP)
scp -r . user@YOUR_SERVER_IP:/var/www/blockblast/
```

או עם Git:

```bash
git clone YOUR_REPO /var/www/blockblast
```

### 2. הגדר משתני סביבה

```bash
cd /var/www/blockblast
cp deploy/env.example .env
nano .env
```

חובה לשנות:

```
JWT_SECRET=<מחרוזת-אקראית-ארוכה>
PUBLIC_URL=https://game.yourdomain.com
```

יצירת secret:

```bash
openssl rand -hex 32
```

### 3. התקנה והרצה

```bash
npm ci --omit=dev
mkdir -p server/data

npm install -g pm2
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

### 4. Nginx (פורט 80/443 → 3001)

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/blockblast
sudo nano /etc/nginx/sites-available/blockblast   # החלף YOUR_DOMAIN
sudo ln -s /etc/nginx/sites-available/blockblast /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. HTTPS (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d game.yourdomain.com
```

עדכן `.env`:

```
PUBLIC_URL=https://game.yourdomain.com
```

```bash
pm2 restart blockblast
```

---

## אופציה 2: Docker

```bash
cp deploy/env.example .env
# ערוך .env

docker compose up -d --build
```

המשחק על פורט **3001**. הוסף Nginx מול Docker כמו באופציה 1.

---

## בדיקה

```bash
curl http://localhost:3001/api/health
```

פתח בדפדפן: `https://game.yourdomain.com`

מולטיפלייר + הרשמה עובדים מאותו דומיין (HTTPS = גם `crypto.randomUUID` בטלפון).

---

## פקודות שימושיות

| פקודה | תיאור |
|--------|--------|
| `pm2 logs blockblast` | לוגים |
| `pm2 restart blockblast` | הפעלה מחדש |
| `pm2 status` | סטטוס |
| `docker compose logs -f` | לוגים (Docker) |

---

## סקריפט אוטומטי (Ubuntu)

```bash
chmod +x deploy/setup-server.sh
APP_DIR=/var/www/blockblast sudo bash deploy/setup-server.sh
```

(הרץ אחרי שהעלית קוד ויצרת `.env`)
