/**
 * AdMob ads — native Capacitor only (Google Play / Android).
 */
import { ADMOB_IDS, IS_TEST_MODE } from './admob.config.js';

let initialized = false;
let bannerVisible = false;

export function isNativeApp() {
  return typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.();
}

function getAdMobPlugin() {
  return window.Capacitor?.Plugins?.AdMob ?? null;
}

export async function initAds() {
  if (!isNativeApp() || initialized) return false;
  const AdMob = getAdMobPlugin();
  if (!AdMob) return false;

  await AdMob.initialize({
    initializeForTesting: IS_TEST_MODE
  });
  initialized = true;
  return true;
}

export async function showBanner() {
  if (!isNativeApp()) return;
  const AdMob = getAdMobPlugin();
  if (!AdMob || bannerVisible) return;

  try {
    await AdMob.showBanner({
      adId: ADMOB_IDS.banner,
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: 0,
      isTesting: IS_TEST_MODE
    });
    bannerVisible = true;
    document.body.classList.add('has-ad-banner');
  } catch (e) {
    console.warn('[ads] banner', e);
  }
}

export async function hideBanner() {
  if (!bannerVisible) return;
  const AdMob = getAdMobPlugin();
  if (AdMob) {
    try { await AdMob.hideBanner(); } catch { /* ignore */ }
  }
  bannerVisible = false;
  document.body.classList.remove('has-ad-banner');
}

export async function showInterstitial() {
  if (!isNativeApp()) return;
  const AdMob = getAdMobPlugin();
  if (!AdMob) return;

  try {
    await AdMob.prepareInterstitial({
      adId: ADMOB_IDS.interstitial,
      isTesting: IS_TEST_MODE
    });
    await AdMob.showInterstitial();
  } catch (e) {
    console.warn('[ads] interstitial', e);
  }
}

let lastInterstitial = 0;
const INTERSTITIAL_COOLDOWN_MS = 90000;

export async function showInterstitialAfterGame() {
  if (!isNativeApp()) return;
  const now = Date.now();
  if (now - lastInterstitial < INTERSTITIAL_COOLDOWN_MS) return;
  lastInterstitial = now;
  await showInterstitial();
}
