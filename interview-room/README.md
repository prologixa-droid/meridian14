# Meridian Interview Room

A standalone, minimal voice-interview practice app for `trainee11`. This folder contains its own frontend and Supabase function scaffold; it does not load the Meridian operations dashboard or depend on its JavaScript files.

## Interview experience

- Natural, low-latency spoken English interviewer using OpenAI Realtime over WebRTC when configured. The model listens to spoken answers, replies in voice, and adapts follow-up questions.
- Focus choices for full interview, application walkthrough, AI data annotation fundamentals, and workplace scenarios.
- 10, 15, and 20 minute session options; foundation, standard, and stretch levels.
- Live microphone conversation with a mute control, visible speech transcript, and typed-answer fallback. If Realtime or microphone access is unavailable, the app falls back to the text AI interviewer and then to guided practice.
- End-of-session AI rubric covering annotation fundamentals, evidence and taxonomy judgment, quality and consistency, ticket ownership, QA understanding, communication, and self-reflection.
- Transcript download; session text is not uploaded to a database or saved as interview history by this static app.
- A clearly identified guided voice fallback when the AI service is not connected. Guided practice does not assign a score.

The app does not record or save microphone audio. Microphone audio streams to OpenAI Realtime only during a live session. The interface discloses that the interviewer voice is AI-generated. The transcript stays in browser memory and is sent to the authenticated Edge Function when the trainee requests a final assessment. Assessment requests use `store: false`; replies are not inserted into the Supabase database.

## Run the interface

Open `index.html` in a modern browser for guided practice. Live microphone access requires HTTPS or localhost and browser permission. Typed answers remain available if microphone access is unavailable.

For a local web server from this folder, use:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Enable the live AI interviewer

The OpenAI API key must stay in Supabase server secrets. It must never be added to `config.js`, the static app, or a public GitHub Pages repository. The Supabase URL and publishable key in `config.js` are browser-safe public project configuration.

1. In Supabase Dashboard, enable anonymous sign-ins under **Authentication → Sign In / Providers**.
2. From this folder, link the project, apply the included migration, and deploy the interview function:

   ```powershell
   supabase link --project-ref mweohabshlexvbtuoldq
   supabase db push
   supabase secrets set OPENAI_API_KEY=your-server-side-key OPENAI_MODEL=gpt-6-astra OPENAI_REALTIME_MODEL=gpt-realtime-2.1
   supabase functions deploy mock-interview
   ```

3. The function permits the origin `https://prologixa-droid.github.io`, including a GitHub Pages project path. If you publish this app on another domain, update `allowedOrigins` in `supabase/functions/mock-interview/index.ts` and redeploy the function.
4. Publish this folder's static files with GitHub Pages. Open the app and confirm the setup card reports **Live AI voice ready**.

The backend requires an anonymous Supabase session, keeps the OpenAI key server-side, and limits an anonymous profile to 60 requests per rolling 24-hour period. Creating a live voice session consumes one request; final grading uses the Responses API. That cap limits repeat use but does not prevent all abuse on a public site; add stronger account checks before an unrestricted public launch. OpenAI Realtime access and model availability depend on the configured account and project. The browser receives only a short-lived Realtime client secret; the standard API key never leaves Supabase.

The Realtime conversation uses WebRTC with semantic turn detection and English transcription. Candidate speech appears in the local transcript during the session. At the end, the trainee can request a rubric assessment based on that transcript.

## Interview integrity

The interviewer is a practice coach, not an employment screening or hiring-decision system. It assesses responses from this conversation and does not fetch the trainee's private application history. It is instructed to describe the application accurately: PT-100 browser accuracy is synthetic practice feedback, SVG packshots are illustrations, tickets use a separate resolution and closure review, and the checkout suite runs against an embedded fixture rather than production code or CI.
