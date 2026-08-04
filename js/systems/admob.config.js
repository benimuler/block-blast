/**
 * AdMob unit IDs — replace with your IDs from https://admob.google.com
 *
 * 1. Create app "Block Blast Evolved" in AdMob (link to Play Store when published)
 * 2. Create ad units: Banner + Interstitial
 * 3. Paste IDs below and set IS_TEST_MODE to false for production
 */

export const IS_TEST_MODE = true;

/** Google official test IDs — safe for development */
export const ADMOB_IDS = {
  app: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917'
};

// Production example (uncomment and fill after AdMob setup):
// export const IS_TEST_MODE = false;
// export const ADMOB_IDS = {
//   app: 'ca-app-pub-XXXXXXXX~YYYYYYYY',
//   banner: 'ca-app-pub-XXXXXXXX/ZZZZZZZZ',
//   interstitial: 'ca-app-pub-XXXXXXXX/WWWWWWWW',
//   rewarded: 'ca-app-pub-XXXXXXXX/RRRRRRRR'
// };
