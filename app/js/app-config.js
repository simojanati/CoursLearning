// App configuration
// 1) Deploy Google Apps Script as Web App and paste the URL here.
//    Example: https://script.google.com/macros/s/AKfycb.../exec
export const DEFAULT_LANG = 'fr';
export const SUPPORTED_LANGS = ['fr','en','ar'];

// Allow overriding endpoints without rebuilding (stored in localStorage)
function _ls(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return (v && v.trim().length) ? v.trim() : fallback;
  } catch {
    return fallback;
  }
}

export const API_BASE_URL = _ls("API_BASE_URL", "https://script.google.com/macros/s/AKfycby9v1vuHrSY8F1e29ErufYQZ6mFEppGX7gW_c_a_FSC-e8HWJUVgVnvSt-uqvhJG362qg/exec");


// 1-bis) Google Sheet ID (the long ID in the Sheet URL)
export const SPREADSHEET_ID = "1wdRFM2Y5-VBeDOwQbBh76IXvBjGNJ48Owi3j8v552xU";
// 2) If API_BASE_URL is empty, the app will run using mock data.
export const USE_MOCK_DATA = API_BASE_URL.trim().length === 0;

// App branding (used in a couple of UI spots)
export const BRAND = {
  name: "LearnHub",
  shortName: "LearnHub",
};


// AI Proxy Apps Script Web App URL (separate deployment that is allowed to call external APIs)
// Example: https://script.google.com/macros/s/AKfycb.../exec
export const AI_API_BASE_URL = _ls("AI_API_BASE_URL", "https://script.google.com/macros/s/AKfycbyFnGvwGY3QwkttFsSf-DrV3-AfrREOiBFyBZzb8xIRUQ6KpPKQ0vXeDysB0rOu_7hK/exec");

// AI Assistant (optional)
export const AI_ENABLED = true;
export const AI_MAX_INPUT_CHARS = 1500;
export const AI_DEFAULT_MODE = 'explain';
