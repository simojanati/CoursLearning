# AI without OpenAI billing (Free options)

This project supports multiple AI providers via the **AI Proxy** Apps Script.

## Recommended free providers
- **Gemini API** (Google AI Studio): often has a free tier (eligibility/rate limits apply).
- **GroqCloud**: offers a free tier with rate limits.

## Configure (Apps Script > Project Settings > Script properties)

### Gemini (default)
- `AI_PROVIDER=gemini`
- `GEMINI_API_KEY=...`
- Optional: `GEMINI_MODEL=gemini-2.5-flash`

### Groq
- `AI_PROVIDER=groq`
- `GROQ_API_KEY=...`
- Optional: `GROQ_MODEL=llama-3.1-8b-instant`

### OpenAI (paid)
- `AI_PROVIDER=openai`
- `OPENAI_API_KEY (or GEMINI_API_KEY / GROQ_API_KEY)=...`

Deploy the **google-apps-script-ai** project as Web App (Execute as: Me, Access: Anyone), then set `AI_API_BASE_URL` in `app/js/app-config.js`.
