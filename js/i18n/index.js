import { locales, LANGUAGES } from './locales.js';

const STORAGE_KEY = 'blockblast_lang';
let currentLang = 'en';
let listeners = [];

export function initI18n() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const browser = navigator.language?.slice(0, 2);
  const docLang = document.documentElement.lang?.slice(0, 2);
  currentLang = saved
    || (locales[browser] ? browser : null)
    || (locales[docLang] ? docLang : 'en');
  applyDocumentDirection();
}

export function t(key, params = {}) {
  const dict = locales[currentLang] || locales.en;
  let str = dict[key] || locales.en[key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return str;
}

export function getLang() {
  return currentLang;
}

export function getLanguages() {
  return LANGUAGES;
}

export function getLangInfo(code) {
  return LANGUAGES.find(l => l.code === code) || LANGUAGES[0];
}

export function setLang(code) {
  if (!locales[code]) return;
  currentLang = code;
  localStorage.setItem(STORAGE_KEY, code);
  applyDocumentDirection();
  listeners.forEach(fn => fn(code));
}

export function onLangChange(fn) {
  listeners.push(fn);
}

function applyDocumentDirection() {
  const info = getLangInfo(currentLang);
  document.documentElement.lang = currentLang;
  document.documentElement.dir = info.dir;
}

export function applyI18nToDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.title = `${t('app.title')} ${t('app.subtitle')}`;
}
