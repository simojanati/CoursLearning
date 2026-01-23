// Mock data used when API_BASE_URL is not configured.
// Data is bilingual (FR/EN). When UI language is Arabic, content falls back to French.

export const mockCourses = [
  {
    courseId: "vba-basics",
    title_fr: "VBA - Les bases (spécial économie)",
    title_en: "VBA Basics (Economy-friendly)",
    level: "beginner",
    description_fr: "Variables, conditions, boucles, procédures. Avec des exemples économiques simples.",
    description_en: "Variables, conditions, loops, procedures. With simple econ examples.",
    order: 1
  },
  {
    courseId: "excel-automation",
    title_fr: "Automatisation Excel pour l’économie",
    title_en: "Excel Automation for Economics",
    level: "intermediate",
    description_fr: "Workbooks, Sheets, Ranges, import de données, génération de rapports.",
    description_en: "Workbooks, Sheets, Ranges, importing data, generating reports.",
    order: 2
  }
];

export const mockLessons = [
  {
    lessonId: "l1",
    courseId: "vba-basics",
    title_fr: "1) Démarrage + Macro Recorder",
    title_en: "1) Getting Started + Macro Recorder",
    order: 1,
    contentHtml_fr: `
      <div class="lesson-content">
        <p>Bienvenue ! Dans cette leçon vous allez :</p>
        <ul>
          <li>Activer l’onglet Développeur</li>
          <li>Enregistrer une macro</li>
          <li>Ouvrir l’éditeur VBA et lire le code généré</li>
        </ul>
        <h6>Exemple</h6>
        <pre class="code-block">Sub Hello()
  MsgBox "Salam! VBA est prêt."
End Sub</pre>
      </div>
    `,
    contentHtml_en: `
      <div class="lesson-content">
        <p>Welcome! In this lesson you will:</p>
        <ul>
          <li>Enable Developer tab</li>
          <li>Record a Macro</li>
          <li>Open the VBA editor and read the generated code</li>
        </ul>
        <h6>Example</h6>
        <pre class="code-block">Sub Hello()
  MsgBox "Salam! VBA is ready."
End Sub</pre>
      </div>
    `
  },
  {
    lessonId: "l2",
    courseId: "vba-basics",
    title_fr: "2) Variables + Types (petit KPI)",
    title_en: "2) Variables + Data Types (small KPI)",
    order: 2,
    contentHtml_fr: `
      <div class="lesson-content">
        <p>On calcule un KPI simple : <b>marge</b> = profit / revenu.</p>
        <pre class="code-block">Option Explicit

Sub ProfitMargin()
  Dim revenue As Double
  Dim profit As Double
  Dim margin As Double

  revenue = 125000
  profit = 18750
  margin = profit / revenue

  MsgBox "Marge = " &amp; Format(margin, "0.00%")
End Sub</pre>
      </div>
    `,
    contentHtml_en: `
      <div class="lesson-content">
        <p>We compute a simple KPI: <b>profit margin</b> = profit / revenue.</p>
        <pre class="code-block">Option Explicit

Sub ProfitMargin()
  Dim revenue As Double
  Dim profit As Double
  Dim margin As Double

  revenue = 125000
  profit = 18750
  margin = profit / revenue

  MsgBox "Margin = " &amp; Format(margin, "0.00%")
End Sub</pre>
      </div>
    `
  }
];

export const mockQuizzes = [
  {
    quizId: "q-l2",
    lessonId: "l2",
    title_fr: "Quiz : Variables & Types",
    title_en: "Quiz: Variables & Types",
    passingScore: 60,
    questions: [
      {
        questionId: "q-l2-1",
        question_fr: "Quelle instruction aide à éviter les fautes de frappe dans les variables ?",
        question_en: "Which statement helps avoid typos in variable names?",
        choices_fr: ["Option Base 1", "Option Explicit", "On Error Resume Next", "With...End With"],
        choices_en: ["Option Base 1", "Option Explicit", "On Error Resume Next", "With...End With"],
        correctIndex: 1,
        explanation_fr: "Option Explicit force la déclaration des variables.",
        explanation_en: "Option Explicit forces you to declare variables."
      },
      {
        questionId: "q-l2-2",
        question_fr: "Quel type est le plus adapté pour des nombres décimaux (revenu/profit) ?",
        question_en: "Which type is best for decimal numbers like revenue/profit?",
        choices_fr: ["String", "Boolean", "Double", "Object"],
        choices_en: ["String", "Boolean", "Double", "Object"],
        correctIndex: 2,
        explanation_fr: "Double stocke des nombres décimaux.",
        explanation_en: "Double holds floating-point values."
      }
    ]
  }
];
