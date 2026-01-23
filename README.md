# VBA Eco Academy (MVP) — Sneat + GitHub Pages + Google Sheets

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
