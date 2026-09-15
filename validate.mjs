import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const must = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const file of [
  'package.json', 'package-lock.json', 'vite.config.js', 'index.html',
  'src/main.jsx', 'src/App.jsx', 'src/styles.css',
  'src/services/backend.js', 'src/lib/supabase.js',
  'public/config.js', 'public/manifest.webmanifest', 'public/sw.js',
  'netlify/functions/calendar.js', 'netlify/functions/gemini.js', 'netlify/functions/strava.js'
]) must(fs.existsSync(path.join(root, file)), `${file} exists`);

const pkg = JSON.parse(read('package.json'));
const config = read('public/config.js');
const entry = read('src/main.jsx');
const app = read('src/App.jsx');

must(pkg.dependencies.react && pkg.dependencies['react-dom'], 'React dependencies are declared');
must(pkg.dependencies['@supabase/supabase-js'], 'Supabase dependency is declared');
must(pkg.devDependencies.vite && pkg.devDependencies['@vitejs/plugin-react'], 'Vite/React build tooling is declared');
must(entry.includes("./App.jsx") && entry.includes("createRoot"), 'React entrypoint imports App and mounts with createRoot');
must(app.includes('function App(') && app.includes('createChallenge') && app.includes('FitnessModal'), 'Recovered application module contains core Fit Together behavior');
must(config.includes('jaesndcamjdcokhxyqpl.supabase.co'), 'Browser config targets the current Supabase project');
must(!/service[_-]?role/i.test(config), 'Browser config contains no service-role secret');
must(!config.includes('STRAVA_ENABLED: true'), 'Strava remains disabled');

for (const file of ['src/services/backend.js','src/lib/supabase.js','netlify/functions/calendar.js','netlify/functions/gemini.js','netlify/functions/strava.js']) {
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
}
console.log('✓ JavaScript syntax checks passed');
console.log('Validation complete. JSX requires the Vite toolchain for compilation.');
