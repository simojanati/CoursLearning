# LearnHub (MVP) — Sneat + GitHub Pages + Google Sheets

هاد المشروع **static** (HTML/CSS/JS + Bootstrap/Sneat) وكيخدم فـ **GitHub Pages**.
الداتا ديال الكورسات/الدروس/الـquiz كتكون فـ **Google Sheets** وكنوصلو ليها عبر **Google Apps Script** (Web App API).

> ✅ فالبداية إلا ماحدّدتيش API_BASE_URL فـ `app/js/app-config.js` غادي تشوف **Mock data** باش تجرب الواجهة.

---

## 1) Structure

- `assets/` → ديال Template Sneat (مخليه كما هو)
- `app/pages/` → صفحات المنصة (home/courses/course/lesson/quiz)
- `app/js/` → Logic (API + rendering)
- `app/css/app.css` → Overrides بسيطة (باش ما نكسروش theme)
- `google-apps-script/Code.gs` → API ديال Google Sheets

---

## 2) Local test (optional)

تقدر تفتح مباشرة `index.html` فالمتصفح.
إلى بغيتي server محلي:

- Windows (PowerShell):
  - `python -m http.server 8080`
- ثم حل: `http://localhost:8080`

---

## 3) Create Google Sheet (Database)

دير Spreadsheet جديد وسميه مثلا: `VBA_ECO_DB`.
ومن بعد دير Tabs بهاد الأسماء (مهم):

### A) Courses
Headers فـ row 1:

| courseId | title | level | description | order |
|---|---|---|---|---|

### B) Lessons
Headers:

| lessonId | courseId | title | contentHtml | videoUrl | filesUrl | order |
|---|---|---|---|---|---|---|

> `contentHtml` تقدر تحط فيه HTML (مثلا `<p>...</p>` و `<pre class="code-block">...</pre>`)

### C) Quizzes
Headers:

| quizId | lessonId | title | passingScore |
|---|---|---|---|

### D) Questions
Headers:

| questionId | quizId | question | choiceA | choiceB | choiceC | choiceD | correct | explanation |
|---|---|---|---|---|---|---|---|---|

---

## 4) Setup Google Apps Script API

1) فـ Spreadsheet: `Extensions` → `Apps Script`
2) حيد أي code موجود ونسخ لصق `google-apps-script/Code.gs`
3) فـ `Code.gs` بدّل:

```js
const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
```

4) Deploy:
- `Deploy` → `New deployment`
- Type: **Web app**
- Execute as: **Me**
- Who has access: **Anyone**

5) Copy URL ديال Web App (كيكون كينتهي بـ `/exec`)

---

## 5) Connect Front to API

حل `app/js/app-config.js` وحط URL:

```js
export const API_BASE_URL = "PASTE_YOUR_APPS_SCRIPT_WEBAPP_URL";
```

> ملاحظة: الـFrontend كيحاول `fetch()`، وإذا CORS منع، كيرجع **JSONP** تلقائياً (هادشي مضمون مع GitHub Pages).

---

## 6) Deploy on GitHub Pages

1) دير Repo جديد فـ GitHub
2) Upload هاد الملفات كاملين
3) Settings → Pages
4) Source: `Deploy from a branch`
5) Branch: `main` و Folder: `/root`
6) Site غادي يطلع لك رابط

---

## 7) API endpoints (للتجربة)

- `?action=courses`
- `?action=course&courseId=...`
- `?action=lessons&courseId=...`
- `?action=lesson&lessonId=...`
- `?action=quiz&lessonId=...`

---

## 8) Notes (MVP)

- Progress و “Recent lessons” كيتسجلو فـ **localStorage** (باش نبقاو static)
- Quiz scoring حاليا client-side (correct answer كيجينا من Sheet)
- من بعد نقدر نزيدو:
  - Auth بسيط
  - Progress/Submissions فـ Google Sheet عبر `doPost`
  - Admin pages



## Bilingual content (FR/EN)

This version supports UI i18n (FR/EN/AR) and bilingual learning content (FR/EN) from Google Sheets.

**Expected columns:**
- Courses: `courseId, title_fr, title_en, description_fr, description_en, level, order`
- Lessons: `lessonId, courseId, title_fr, title_en, contentHtml_fr, contentHtml_en, videoUrl, filesUrl, order`
- Quizzes: `quizId, lessonId, title_fr, title_en, passingScore`
- Questions: `questionId, quizId, question_fr, question_en, choices_fr, choices_en, correctIndex, explanation_fr, explanation_en`

`choices_fr/choices_en` can be either a JSON array (e.g. `["A","B","C","D"]`) or a pipe-separated string (e.g. `A|B|C|D`).


## SEO (GitHub Pages)
- `index.html` is a landing page (SEO-friendly) with language switch (FR/EN/AR UI).
- `assets/img/og.png` is used for Open Graph preview.
- Update `robots.txt` and `sitemap.xml` by replacing `YOUR_GITHUB_PAGES_URL` with your real GitHub Pages URL.


## AI Assistant (optional)

This project can expose an `action=aiChat` endpoint via Google Apps Script.

1) In Apps Script (Project Settings), add Script Property `OPENAI_API_KEY (or GEMINI_API_KEY / GROQ_API_KEY)`.
2) (Optional) add `OPENAI_MODEL`.
3) Redeploy the Web App.

Then, in a lesson page you will see an AI panel to explain / generate exercises / mini-quiz / review.


## AI Assistant (Recommended setup: separate Apps Script proxy)

This project runs on GitHub Pages (static). To keep API keys safe and avoid Apps Script permission issues, deploy the AI as a separate Apps Script Web App.

1) Create a new Apps Script project and copy `google-apps-script-ai/Code.gs` + `google-apps-script-ai/appsscript.json`.
2) In Apps Script **Script Properties**, set:
   - `OPENAI_API_KEY (or GEMINI_API_KEY / GROQ_API_KEY)`
   - optional `OPENAI_MODEL` (default: `gpt-4o-mini`)
3) Deploy as **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
4) Paste the AI Web App `/exec` URL in `app/js/app-config.js` as `AI_API_BASE_URL`.

The main data API (`google-apps-script/Code.gs`) no longer calls external APIs.


### AI Proxy: OpenAI HTTP 429
If you get `OpenAI HTTP 429`, it usually means you hit rate limits or quota/spend limits. Add billing/credits, verify your usage tier, and retry with backoff. The proxy includes automatic retries/backoff.


## Optional: platform_settings (branding without code)
Create a sheet named `platform_settings` to override branding.

**Format B (recommended, single row):** headers on row 1, values on row 2:
- `app_name`, `tagline_fr`, `tagline_en`, `tagline_ar`, `footer_fr`, `footer_en`, `footer_ar`, `logo_url`, `icon_url`, `primary_color`

If the sheet is missing, defaults are used.
