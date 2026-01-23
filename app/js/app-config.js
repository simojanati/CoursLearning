// App configuration
// 1) Deploy Google Apps Script as Web App and paste the URL here.
//    Example: https://script.google.com/macros/s/AKfycb.../exec
export const DEFAULT_LANG = 'fr';
export const SUPPORTED_LANGS = ['fr','en','ar'];

export const API_BASE_URL = "https://script.google.com/macros/s/AKfycbwCBnuukMkv8rabEnI8-LESY-au2Ynlqq4g6kLHxEWJ9A9_XJyiup3DwvtZezk8ICY0JQ/exec";


// 1-bis) Google Sheet ID (the long ID in the Sheet URL)
export const SPREADSHEET_ID = "1wdRFM2Y5-VBeDOwQbBh76IXvBjGNJ48Owi3j8v552xU";
// 2) If API_BASE_URL is empty, the app will run using mock data.
export const USE_MOCK_DATA = API_BASE_URL.trim().length === 0;

// App branding (used in a couple of UI spots)
export const BRAND = {
  name: "VBA Eco Academy",
  shortName: "VBA Eco",
};
