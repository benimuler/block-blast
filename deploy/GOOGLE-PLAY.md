# Google Play + AdMob — מדריך פרסום

## דרישות מוקדמות

| פריט | עלות | קישור |
|------|------|--------|
| **Google Play Developer** | $25 חד-פעמי | [play.google.com/console](https://play.google.com/console) |
| **AdMob** | חינם | [admob.google.com](https://admob.google.com) |
| **Android Studio** | חינם | [developer.android.com/studio](https://developer.android.com/studio) |

---

## שלב 1 — AdMob (פרסומות / הכנסות)

1. היכנס ל-[AdMob](https://admob.google.com) עם חשבון Google שלך
2. **Apps → Add app → Android**
   - שם: `Block Blast Evolved`
   - "App not published yet" → המשך
3. צור **Ad units**:
   - **Banner** (Adaptive)
   - **Interstitial** (מסך מלא בין משחקים)
4. העתק את ה-IDs ל-`js/systems/admob.config.js`:

```javascript
export const IS_TEST_MODE = false;
export const ADMOB_IDS = {
  app: 'ca-app-pub-XXXX~YYYY',
  banner: 'ca-app-pub-XXXX/111',
  interstitial: 'ca-app-pub-XXXX/222',
  rewarded: 'ca-app-pub-XXXX/333'
};
```

5. עדכן גם `capacitor.config.json` → `plugins.AdMob.appId`
6. עדכן `android/app/src/main/AndroidManifest.xml` → `APPLICATION_ID` (אותו app ID)

---

## שלב 2 — בניית APK/AAB

```powershell
cd "C:\Users\ASUS\Desktop\block blast"

# התקנת תלויות (פעם אחת)
npm install

# בניית www + סנכרון Android
npm run build:android

# פתח Android Studio
npm run android:open
```

ב-Android Studio:
1. **Build → Generate Signed Bundle / APK**
2. בחר **Android App Bundle (AAB)** — נדרש ל-Play Store
3. צור **Keystore** חדש (שמור אותו + סיסמה — לא לאבד!)
4. Build release

או בטרמינל (אחרי הגדרת signing ב-`android/app/build.gradle`):

```powershell
cd android
.\gradlew bundleRelease
```

הקובץ: `android/app/build/outputs/bundle/release/app-release.aab`

---

## שלב 3 — Google Play Console

1. [Play Console](https://play.google.com/console) → **Create app**
2. מלא פרטים:
   - **שם:** Block Blast Evolved
   - **קטגוריה:** Games → Puzzle
   - **חינמי** עם פרסומות
3. **Store listing:**
   - תיאור קצר + מלא (עברית + אנגלית)
   - **אייקון 512×512** PNG
   - **Feature graphic** 1024×500
   - צילומי מסך (מינימום 2) — מהטלפון או emulator
4. **Privacy policy URL** (חובה עם AdMob):
   ```
   https://block-blast-062t.onrender.com/privacy-policy.html
   ```
5. **App content:**
   - Ads: **Yes, contains ads**
   - Target audience: הגדר גיל (13+ מומלץ)
   - Data safety: ציין AdMob + account data
6. **Release → Production → Create release**
   - העלה `app-release.aab`
   - שלח לבדיקה (Review ~1–7 ימים)

---

## שלב 4 — קישור AdMob ↔ Play Store

אחרי שהאפליקציה אושרה:
1. AdMob → App settings → Link to store
2. בחר Google Play + `com.benimuler.blockblast`
3. `IS_TEST_MODE = false` ב-admob.config.js
4. בנה ופרוס עדכון (versionCode +1)

---

## מודל הכנסות

| סוג | מתי מוצג |
|-----|----------|
| **Banner** | תפריט ראשי, הגדרות, מסכים שאינם gameplay |
| **Interstitial** | אחרי Game Over (מקסימום פעם ב-90 שניות) |

---

## פקודות שימושיות

```powershell
npm run build:mobile      # העתקת קבצים ל-www/
npm run cap:sync          # סנכרון ל-Android
npm run android:open      # פתיחת Android Studio
npm run android:run       # הרצה על מכשיר/אמולטור
```

---

## package name

`com.benimuler.blockblast` — לא ניתן לשנות אחרי פרסום ראשון.

## גרסאות

עדכן ב-`android/app/build.gradle`:
- `versionCode` — מספר שלם, +1 בכל העלאה
- `versionName` — "2.1.0" וכו'
