import fs from 'node:fs';
const filename = 'app.json';
if (!fs.existsSync(filename)) {
  console.error('Missing app.json. Run: npx evenhub init');
  process.exit(1);
}
const app = JSON.parse(fs.readFileSync(filename, 'utf8'));
app.package_id = 'com.godinusalways2.g2voicesearch';
app.edition = '202601';
app.name = 'G2 Voice Search';
app.version = '0.1.1';
app.min_app_version = '2.2.10';
app.min_sdk_version = '0.0.16';
app.entrypoint = 'index.html';
app.permissions = [
  {
    name: 'g2-microphone',
    desc: 'Checks G2 microphone PCM reception during a user-started 12-second diagnostic. Audio is not stored or uploaded.'
  }
];
app.supported_languages = ['ko', 'en'];
fs.writeFileSync(filename, JSON.stringify(app, null, 2) + '\n');
console.log('Prepared G2 microphone test manifest', app.package_id, app.version);
