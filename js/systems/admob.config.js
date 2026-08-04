/**
 * AdMob — https://admob.google.com
 *
 * App ID: AdMob → Apps → your app → App settings (format: ca-app-pub-XXXX~YYYY)
 * Ad units: Banner + Interstitial (format: ca-app-pub-XXXX/ZZZZ)
 */

export const IS_TEST_MODE = false;

export const ADMOB_IDS = {
  // TODO: paste App ID from AdMob (with ~). Required for AndroidManifest + capacitor.config.json
  app: 'ca-app-pub-9011390098995936~0000000000',
  banner: 'ca-app-pub-9011390098995936/1079287107',
  // TODO: create Interstitial ad unit in AdMob and paste here
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917'
};

/** Set true until ADMOB_IDS.app has your real ~ ID from AdMob dashboard */
export const ADMOB_APP_ID_PENDING = ADMOB_IDS.app.includes('0000000000');
