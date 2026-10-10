import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const sample = json('data/sample-words.json');
assert.equal(sample.source, 'Assistant-authored sample', 'Public seed must be explicitly sample data');
assert.equal(sample.words.length, 20, 'Public template needs 20 sample words');
assert.ok(!sample.importedAt, 'Do not commit a personal import timestamp');
for (const [index, word] of sample.words.entries()) {
  assert.equal(word.sourceId, `sample-${String(index + 1).padStart(3, '0')}`);
  for (const key of ['sourceScore', 'sourceCycle', 'learnedAt', 'observedAt', 'provenance']) {
    assert.equal(word[key] ?? null, null, `Sample ${word.sourceId}: ${key} must be empty`);
  }
}
assert.ok(!json('.openai/hosting.json').project_id, 'Keep production Site identity out of public template');
const allowed = new Set(['こんにちは。今日も少しずつ、日本語を練習しましょう。',
  ...Array.from({ length: 20 }, (_, i) => `第${i + 1}問。`),
  ...sample.words.flatMap(word => [`${word.reading}。`, ...(word.example ? [word.example] : [])])]);
const manifest = json('data/voices.json');
assert.equal(manifest.voices.length, 2);
const audio = new Set();
for (const [phrase, variants] of Object.entries(manifest.clips)) {
  assert.ok(allowed.has(phrase), 'Audio manifest contains a phrase outside public samples');
  for (const voice of manifest.voices) {
    const path = variants[voice.id];
    assert.match(path ?? '', /^\/audio\/[a-f0-9]{24}\.mp3$/);
    assert.ok(existsSync(resolve(root, `public${path}`)), 'A referenced audio file is missing');
    audio.add(`public${path}`);
  }
}
assert.equal(Object.keys(manifest.clips).length, allowed.size, 'All sample phrases must have audio');
for (const voice of manifest.voices) assert.ok(audio.has(`public${voice.sample}`));
const files = readdirSync(resolve(root, 'public/audio')).filter(name => name.endsWith('.mp3'));
assert.equal(files.length, audio.size, 'Remove orphan audio before publication');
for (const name of files) assert.ok(audio.has(`public/audio/${name}`));

let tracked;
try {
  tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
} catch {
  tracked = [];
}
// Before a clean export has a Git index, inspect source files while skipping state.
if (!tracked.length) {
  const skip = new Set(['.git', 'node_modules', 'dist', '.wrangler', '.sites-runtime', '.vinext', '.next', '.codex', '.agents', 'private', '.local-verification']);
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (skip.has(entry.name) || entry.name.endsWith('.tsbuildinfo')) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [relative(root, path)];
  });
  tracked = walk(root);
}
const forbidden = /(^|\/)(?:\.env(?:\..*)?|\.wrangler|\.sites-runtime|\.codex-efficient-workflow|backups|imports|exports|voicevox-runtime)(?:\/|$)|^data\/(?:private\/|moji-import\.json$|voices\.private\.json$)|^public\/audio-private\/|\.(?:sqlite3?|db(?:-wal|-shm)?|vvm|onnx|tsbuildinfo)$/;
const credentials = /(?:gh[opusr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
for (const path of tracked) {
  assert.ok(!forbidden.test(path), `Personal/runtime file is tracked: ${path}`);
  if (path.endsWith('.mp3')) continue;
  const body = readFileSync(resolve(root, path), 'utf8');
  assert.ok(!credentials.test(body), `Possible credential in ${path}; inspect privately`);
  assert.ok(!/(?:\/Users\/|\/home\/)[A-Za-z0-9_.-]+\//.test(body), `Personal machine path in ${path}`);
}
console.log(`Public-source check passed: ${tracked.length} source files, 20 samples, ${audio.size} audio assets.`);
