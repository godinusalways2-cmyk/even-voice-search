# G2 private transcription proxy

This Cloudflare Worker accepts an authenticated WAV recording from the Even G2 companion app and forwards **only the audio** to the OpenAI `gpt-transcribe` file-transcription API. It returns the English transcription as JSON. It does not receive, store, or index the user's private English/Korean study corpus.

## Required secrets

Do **not** commit any keys, passwords, or personal corpus files. Set these in Cloudflare, not in this repository:

- `OPENAI_API_KEY`: project-scoped OpenAI API key, with a small spending limit.
- `ACCESS_TOKEN`: a private random token at least 32 characters long, generated with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Deploy from GitHub Codespaces (after creating a Cloudflare account)

```bash
cd /workspaces/even-voice-search/asr-worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ACCESS_TOKEN
```

Enter secrets into Wrangler's **masked, interactive** prompt. Never paste secrets into chat, git files, commit messages or screenshots. A worker deployment URL ends with `.workers.dev`.

Private endpoint: `POST https://YOUR-WORKER.workers.dev/transcribe`, `Authorization: Bearer <ACCESS_TOKEN>`, `Content-Type: audio/wav`. Responses are `{"text":"..."}`.

## Manifest network permission

The Even Hub manifest **must** whitelist the exact Worker origin. Because the origin is not known until deployment, run:

```bash
cd /workspaces/even-voice-search/g2-prototype
npm run build
G2_STT_ORIGIN=https://YOUR-WORKER.workers.dev node prepare-manifest.mjs
npx evenhub pack app.json dist -o g2-stt-v020.ehpk
npx evenhub upload g2-stt-v020.ehpk -m "G2 speech-to-text and local bilingual matching"
```

Replace `YOUR-WORKER` with the verified Cloudflare URL. Without `G2_STT_ORIGIN`, the manifest deliberately omits network permission, so recording can be tested without permitting outbound audio transfer.

## Safety and cost

Only the user-started, bounded English microphone clip is transmitted. Worker replies include no-store headers. This design does not add persistence or request logging, but the transcription provider processes the audio under its own terms. The authentication token restricts access; never publish it. CORS alone is **not** authentication. Configure an OpenAI project spending limit and optionally Cloudflare rate limits. ChatGPT Plus does not provide an OpenAI API balance.
