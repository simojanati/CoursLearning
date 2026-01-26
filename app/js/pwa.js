let _pwaInitDone = false;

function ensureHeadLink(rel, href, extraAttrs = {}) {
  if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  Object.entries(extraAttrs).forEach(([k,v]) => link.setAttribute(k, v));
  document.head.appendChild(link);
}

function ensureMeta(name, content) {
  if (document.querySelector(`meta[name="${name}"]`)) return;
  const meta = document.createElement('meta');
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}

export function initPWA() {
  if (_pwaInitDone) return;
  _pwaInitDone = true;

  try {
    // Manifest + icons (best effort; useful if some pages didn't include them in HTML)
    ensureHeadLink('manifest', `${getBasePath_()}manifest.webmanifest`);
    ensureMeta('theme-color', '#696cff');

    // iOS: add to home screen icon
    const appleIconHref = `${getBasePath_()}assets/img/icons/icon-192.png`;
    if (!document.querySelector(`link[rel="apple-touch-icon"]`)) {
      ensureHeadLink('apple-touch-icon', appleIconHref);
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      const swUrl = `${getBasePath_()}service-worker.js`;
      navigator.serviceWorker.register(swUrl).catch(() => {});
    }
  } catch (_) {
    // no-op
  }
}

// Determine repo base path for GitHub Pages (supports / or /repo/)
function getBasePath_() {
  // Use current path, but trim everything after last '/' to get directory
  // Then walk up to site root if we're inside /app/pages/...
  const p = location.pathname;
  const idx = p.indexOf('/app/');
  if (idx >= 0) return p.slice(0, idx + 1);
  // otherwise, root dir
  return p.endsWith('/') ? p : p.substring(0, p.lastIndexOf('/') + 1);
}