# Third-party notices

The repository's MIT license covers its original application code, documentation,
and authored sample text. Dependencies and retained template files keep their own
licenses. It does **not** relicense the generated VOICEVOX audio as MIT.

## Template and UI

- The OpenAI Sites build integration retains its MIT notice at
  `build/sites-vite-plugin.LICENSE`.
- The vendored shadcn stylesheet retains its MIT notice at
  `vendor/shadcn-tailwind-4.13.0.LICENSE.md`.
- Installed npm packages retain their respective package licenses. Consult their
  distributions before redistributing dependencies.

## VOICEVOX sample audio

`public/audio/*.mp3` and `data/voices.json` contain speech synthesized from the
public sample words, their authored example sentences, question numbers, and a
neutral preview greeting. The voice models and synthesis runtime are not bundled.

Required credits, also shown in the interface:

- `VOICEVOX:四国めたん`
- `VOICEVOX:春日部つむぎ`

Using or redistributing these audio files requires compliance with the
[VOICEVOX software terms](https://voicevox.hiroshiba.jp/term/),
[VOICEVOX voice-model terms and voice-library notices](https://github.com/VOICEVOX/voicevox_vvm/blob/main/README.md),
[四国めたん voice terms](https://zunko.jp/con_ongen_kiyaku.html), and
[春日部つむぎ rules](https://tsumugi-official.studio.site/rule).
Keep the credits and these notices with redistributed audio, and require subsequent
recipients to follow the applicable voice-model and voice-library conditions.
Character artwork is not included.

The bundled audio was generated with
[VOICEVOX Core](https://github.com/VOICEVOX/voicevox_core) 0.17.0 and voice model
0.16.4. Core has its own MIT license; that code license is separate from the
conditions governing voice models and generated audio. Optional generation also
uses imageio-ffmpeg and its supplied FFmpeg executable; those are installed
separately and are not redistributed in this repository.
