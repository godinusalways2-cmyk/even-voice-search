import fs from 'node:fs';
const filename = 'app.json';
if (!fs.existsSync(filename)) {
  console.error('Missing app.json. Run: npx evenhub init');
  process.exit(1);
}
const app = JSON.parse(fs.readFileSync(filename, 'utf8'));
const origin = (process.env.G2_STT_ORIGIN || '').trim().replace(/\/+$/, '');
if (origin && (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) || !origin.endsWith('.workers.dev'))) {
  throw new Error('G2_STT_ORIGIN must be a single verified https://...workers.dev origin');
}
app.package_id = 'com.godinusalways2.g2voicesearch';
app.edition = '202601';
app.name = 'G2 Voice Search';
app.version = '0.2.0';
app.min_app_version = '2.2.10';
app.min_sdk_version = '0.0.16';
app.entrypoint = 'index.html';
app.permissions = [
  {
    name: 'g2-microphone',
    desc: 'Receives G2 PCM audio after user activation; may send a short recording to the user-configured private English transcription service.'
  },
  ...(origin ? [{
    name: 'network',
    desc: 'Sends only user-initiated English voice audio to the private transcription service; bilingual text stays local.',
    whitelist: [origin]
  }] : [])
];
app.supported_languages = ['ko', 'en'];
fs.writeFileSync(filename, JSON.stringify(app, null, 2) + '\n');
console.log('Prepared G2 Voice Search manifest', app.package_id, app.version);
console.log(origin ? 'Whitelisted private STT origin: ' + origin : 'No STT origin configured: offline-only demo; microphone upload is blocked.');
