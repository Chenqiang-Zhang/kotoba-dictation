# Kotoba Note · 言葉手帖

[简体中文](README.zh-CN.md)

A mobile-friendly Japanese dictation notebook: listen to a reading and an example
sentence, write on paper, then check the answers and mark mistakes yourself.
Daily selection and spaced mistake review are automatic. No paid API key is needed.

This reusable edition includes **20 authored sample words and two recorded Japanese
voices**. It contains no personal MOJi study history or production account settings.
The samples demonstrate the workflow; they are not an official JLPT list or a
verified ranking of frequently tested N1 vocabulary.

## Quick start

Install Node.js **22.13 or newer** and Git, then:

```sh
git clone https://github.com/Chenqiang-Zhang/kotoba-dictation.git
cd kotoba-dictation
npm ci
npm run db:setup
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The local sign-in route
automatically enters your local instance; no ChatGPT account or MOJi login is
needed for local use. The first visit initializes the sample word bank.
`db:setup` applies migrations and is safe to run again.

This is a **single-owner instance**. The development server listens on loopback;
local sign-in is a development convenience. A catalog is shared by an installation,
even though practice records are scoped by identity. Run a separate installation
for each owner. This starter does not supply authentication for a generic public
Worker deployment.

## Practice

1. Start today's practice. The answer stays hidden while you write on paper.
2. Listen to the question number, kana reading, and example sentence. Adjust the
   voice, speed, and writing pause as needed; pause or replay a question.
3. Show the answers, mark mistakes, and optionally enter your incorrect spelling,
   mistake category, or a note. Confirm the remaining answers as correct and save.
4. Review the mistake notebook and history. Corrections append a new grading event.

Days follow Japan time. Each day selects up to 20 words, prioritizing due mistakes
and then unpracticed words. Known scores and learning dates influence selection
only if your import supplies them. A mistake is due tomorrow; subsequent correct
reviews are scheduled after 3, 7, 14, and 30 days. A saved daily word snapshot
survives refreshes, restarts, and later catalog imports.

## Import your own words

Open **词库与导入**, choose replace or merge, and select a JSON file. Start with
[the import example](examples/words.example.json); the complete format is in
[words.schema.json](examples/words.schema.json).

```json
{
  "source": "My word list",
  "words": [
    {
      "sourceId": "my-word-001",
      "word": "検討",
      "reading": "けんとう",
      "meaning": "考虑；研究",
      "example": "新しい方法を検討しています。",
      "exampleSource": "Self-authored"
    }
  ]
}
```

Use stable, unique IDs. Optional scores, cycles, and learning dates remain null
when absent. The server records import time. Replace changes the current catalog;
merge adds or updates entries by ID. Existing daily snapshots and grading history
are retained, so the current exercise may still use its previous words.

Imports are validated before database writes. This edition does not log into MOJi,
scrape an account, or enable automatic synchronization. You must obtain your own
word data and supply an import file. Missing example sentences remain missing.

## Voices

The sample bank includes recorded **四国めたん** and **春日部つむぎ** speech,
with complete downloads before playback. Imported custom phrases need their own
recordings; select **设备日语语音（备用）** to use an installed device Japanese
voice instead. The application does not silently switch voices. Real-device voice
availability and pronunciation quality depend on the device and chosen engine.

For optional offline VOICEVOX generation, install the official `voicevox-core`
0.17.0 wheel and `imageio-ffmpeg==0.6.0` in a separate Python environment.
Download the matching ONNX Runtime, Open JTalk dictionary, and voice model 0.16.4
using the [Core release downloader](https://github.com/VOICEVOX/voicevox_core/releases).
Keep that runtime outside this repository, then:

```sh
python scripts/generate-voices.py --runtime /path/to/voicevox/core
```

This rebuilds sample recordings. `--input /path/to/words.json` accepts another
catalog; `--keep-existing` retains previous phrase mappings for saved snapshots.
Restart the development server after changing the manifest. Custom manifests and
audio reveal their text: keep personal generated variants private, and never push
them to this public template. Public-source checks intentionally allow only sample
phrases. See [the audio terms and credits](THIRD_PARTY_NOTICES.md).

## Data, backup, and deployment

Local catalog, sessions, grades, and notes stay in `.wrangler/state`. They are
ignored by Git. Use the interface's JSON export for a readable record backup; it
is not a database restore tool. To restore the entire local instance, stop the
server, back up `.wrangler/state` privately, and restore that directory before
restarting. Personal import files belong in ignored `data/private/` or outside the
checkout. Audio preferences are saved in the current browser.

For phone access, the retained Sites integration can be deployed to **your own
owner-private Site** with a D1 binding named `DB`. With the Codex Sites plugin,
ask it to deploy this checkout to a new private Site, assign its new project ID in
`.openai/hosting.json`, apply the migrations in `drizzle/`, and preserve private
gateway authentication. Keep that deployment checkout separate from the public
template. No production project ID or credentials are supplied here. A private
Sites deployment for this reusable edition has not been verified by this release.

## Development

React + Vinext/Vite + Cloudflare D1. Run:

```sh
npm run check
```

This audits public source files, runs the domain/audio tests, typechecks, and builds.
GitHub Actions repeats these checks. `npm run verify:local` creates an isolated
temporary database, starts and restarts its own local server, verifies authentication,
grading, imports and persistence, then removes the test data. It does not change
your study records. Browser/mobile playback remains a separate manual check.

Original code and sample text: [MIT](LICENSE).
Third-party code and generated voice assets retain their
[respective conditions](THIRD_PARTY_NOTICES.md).
