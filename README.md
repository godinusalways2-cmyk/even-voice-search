# EVEN English → Korean Voice Search (v0.6)

Experimental iPhone Safari bilingual lookup app. Designed for **permitted study and presentation settings**.

## Quick start
1. Open the published GitHub Pages site on iPhone Safari.
2. Select your private paired English–Korean JSON using **개인 DB 불러오기**. The repository does **not** contain the private corpus.
3. Tap **연속 듣기 시작** once, speak an English clause, pause briefly, and check the Korean result.
4. Tap **연속 듣기 종료** to stop. Safari must remain active and the screen awake.

## v0.6 improvements
- Exact substring search retains highest priority.
- Order-sensitive fuzzy alignment tolerates one or more recognition errors or dropped words.
- Frequently repeated filler words have low weight; less common distinguishing words have higher weight.
- Asks Web Speech Recognition for up to three alternative transcripts (browser may provide fewer), ranks all available alternatives against stored text.
- Ambiguous or weak results are explicitly withheld instead of silently selecting the first hit.
- Intermediate suggestions require an exact, unambiguous match.
- Local CSV trial logs include recognition candidates and ranked paragraph IDs/scores to help debug mistaken matches.

## Limitations and privacy
- Matching returns **verbatim stored translations**; no new translations are generated.
- Matching takes place inside the browser. Browser speech recognition may process voice on external servers.
- The database is read from the user's device and may optionally be cached locally using IndexedDB. Never commit the corpus to a public GitHub repository.
- Safari can stop voice capture, limit alternative transcripts, or deny automatic relaunch. This implementation cannot provide reliable background listening with the screen locked.
- Scores are heuristics, not calibrated statistical probabilities. Always verify uncertain matches.
- EVEN G2 hardware input/output is **not** integrated yet.

## Tests
`node --test tests/matcher.test.mjs` — runs synthetic regression tests without publishing user content. GitHub Actions also checks JS syntax.

