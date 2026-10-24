# G2 private transcription proxy (Cloudflare Workers AI)

This Cloudflare Worker accepts an authenticated WAV recording from the Even G2 companion app and uses Cloudflare's own hosted **Whisper-large-v3-turbo** speech recognition service. It returns the English transcription as JSON. **There is no OpenAI API key or OpenAI billing account to configure.** Only audio is sent to Cloudflare; the private English/Korean paired corpus remains in the G2 companion app's local storage.

## Configure

1. Create or sign in to a Cloudflare account (Cloudflare Workers + Workers AI free tier).
2. In GitHub Codespaces terminal run:

```bash
cd /workspaces/even-voice-search/asr-worker
npx wrangler login
npx wrangler deploy
```

Follow Wrangler login instructions in your own browser. On successful deployment, copy the `https://...workers.dev` URL. This is a public endpoint URL, **not** a credential.

3. Generate a cryptographically random shared token, copy it *privately* and keep it out of chat, files and GitHub:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

4. Put that same token in your Worker through Wrangler's **interactive secret prompt**:

```bash
npx wrangler secret put ACCESS_TOKEN
```

**Do not commit ACCESS_TOKEN or paste it into this conversation.** The secret must be 32+ characters.

5. On the G2 app settings screen, enter the Worker URL (without `/transcribe`) and the same ACCESS_TOKEN. The token is held only in sessionStorage.

## Update G2 app manifest

The Even Hub manifest requires an exact network origin. After confirming your `workers.dev` URL, run:

```bash
cd /workspaces/even-voice-search/g2-prototype
npm run build
G2_STT_ORIGIN=https://YOUR-WORKER.workers.dev node prepare-manifest.mjs
npx evenhub pack app.json dist -o g2-stt-v020.ehpk
npx evenhub upload g2-stt-v020.ehpk -m "G2 Cloudflare Whisper transcription and local bilingual matching"
```

Replace the placeholder with the actual Cloudflare Worker origin. Without the origin, app packaging is deliberately **offline-only** and network permission is omitted. `npm run build` can be done before Worker registration.

## Security and quota

Only the short, user-started English speech recording is transmitted to Cloudflare. The Worker performs no intentional storage and sets `Cache-Control: no-store`, but Cloudflare processes data according to its own service terms. Worker authentication requires the random token; CORS headers alone are not an authentication mechanism. Cloudflare Workers AI currently has a limited daily free allocation; free requests may fail when that is exhausted. Verify the current rate and account plan before enabling paid services. Revoke or rotate ACCESS_TOKEN if exposed.

## Self-test

Public status endpoint: `GET https://YOUR-WORKER.workers.dev/health` returns `{"ok":true,"configured":true}` when ready. Transcription endpoint accepts `POST /transcribe`, WAV s16le 16kHz mono, with `Authorization: Bearer <ACCESS_TOKEN>` and responds `{"text":"..."}`.
