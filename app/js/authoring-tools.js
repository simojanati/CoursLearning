import { escapeHTML } from './ui.js';

export function sanitizeHtml(html){
  // Minimal sanitizer for static authoring:
  // - remove <script> tags
  // - remove on* attributes
  // - remove javascript: URLs
  // - allow basic tags used in lessons
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ''), 'text/html');

  // remove scripts
  doc.querySelectorAll('script').forEach(n => n.remove());

  // walk all elements
  const all = doc.body.querySelectorAll('*');
  all.forEach(el => {
    // remove event handlers and style risky urls
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const val = String(attr.value || '');
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      if ((name === 'href' || name === 'src') && val.trim().toLowerCase().startsWith('javascript:')){
        el.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML;
}

export function buildLessonHtml({ title, objectives, steps, code }){
  const obj = (objectives || []).filter(Boolean);
  const st = (steps || []).filter(Boolean);
  const safeTitle = escapeHTML(title || '');

  const objHtml = obj.length ? `<ul>${obj.map(o=>`<li>${escapeHTML(o)}</li>`).join('')}</ul>` : '';
  const stepsHtml = st.length ? `<ol>${st.map(s=>`<li>${escapeHTML(s)}</li>`).join('')}</ol>` : '';
  const codeHtml = code && code.trim()
    ? `<pre class="code-block">${escapeHTML(code).replace(/\n/g,'\n')}</pre>` : '';

  return `<div class="lesson-content">
<p><b>${safeTitle}</b></p>
${objHtml}
${stepsHtml}
${codeHtml}
</div>`;
}
