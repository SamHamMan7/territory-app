// Builds web-demo/index.html: the real map page + game engine + a simulated walker,
// as one file you can open in a browser. Run: npm run demo:build
import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { mapHtml } from '../components/map/mapHtml';

const root = join(__dirname, '..');
const js = buildSync({
  entryPoints: [join(root, 'web-demo/demo.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2019',
  minify: true,
  write: false,
}).outputFiles[0].text;

const hud = readFileSync(join(root, 'web-demo/hud.html'), 'utf8');
const html = mapHtml
  .replace('<head>', '<head>\n<title>Territory demo</title>')
  .replace('</body>', `${hud}\n<script>${js.replace(/<\/script/g, '<\\/script')}</script>\n</body>`);

writeFileSync(join(root, 'web-demo/index.html'), html);
console.log(`web-demo/index.html written (${Math.round(html.length / 1024)} KB)`);
