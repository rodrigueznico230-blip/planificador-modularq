// Build de producción.
//   npm run build        -> dist/ con index.html liviano + assets con hash (cacheables por un año)
//   npm run build:local  -> dist/local.html autocontenido, sin nube
//
// Estrategia de carga:
//  1. index.html trae el CSS crítico en línea y precarga la fuente y el script principal.
//  2. assets/app.<hash>.js (motor + interfaz, minificado) dibuja la app apenas se descarga (defer).
//  3. assets/cloud.<hash>.js (Supabase + sincronización) se pide recién cuando el navegador queda libre.
import { build, transform } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const local = process.argv.includes('--local');
const root = new URL('../', import.meta.url);
const r = f => readFileSync(new URL('src/' + f, root), 'utf8');
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 10);
const out = p => new URL('dist/' + p, root);

if (!local) rmSync(out(''), { recursive: true, force: true });
mkdirSync(out('assets/'), { recursive: true });

// CSS: Tailwind (solo clases usadas) + CSS propio del shell
execFileSync('npx', ['tailwindcss', '-i', 'src/tw.css', '-o', 'dist/tw.css', '--minify'], { cwd: root, stdio: 'ignore' });
const tw = readFileSync(out('tw.css'), 'utf8').replace(/\/\*! tailwindcss[^*]*\*\//, '');
rmSync(out('tw.css'));

// Fuente variable Inter (latín), servida desde el mismo dominio
const fontSrc = new URL('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', root);
const fontBuf = readFileSync(fontSrc);
const fontName = `inter-${hash(fontBuf)}.woff2`;
const fontFace = (url) => `@font-face{font-family:'Inter Variable';font-style:normal;font-display:swap;font-weight:100 900;src:url(${url}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;

// Script principal: motor + datos de ejemplo + interfaz
const appSrc = ['engine.js', 'sample.js', 'app.js'].map(f => f === 'app.js' ? r(f).replace('/*CREWS_VIEW*/', () => r('crews-view.js')) : r(f)).join('\n;\n');
const app = (await transform(appSrc, { minify: true, target: 'es2019', legalComments: 'none' })).code;

let shell = r('shell.html');
const minCss = async css => (await transform(css, { loader: 'css', minify: true })).code;

if (local) {
  const fontData = `data:font/woff2;base64,${fontBuf.toString('base64')}`;
  const css = await minCss(fontFace(fontData) + tw);
  const html = shell.replace('<!--HEAD-->', '').replace('/*FONT*//*TW*/', () => css)
    .replace('<!--SCRIPTS-->', () => `<script>${app}</script>`);
  writeFileSync(out('local.html'), html);
  console.log(`dist/local.html ${(html.length / 1024).toFixed(0)} KB`);
} else {
  copyFileSync(fontSrc, out('assets/' + fontName));
  const appName = `app.${hash(app)}.js`;
  writeFileSync(out('assets/' + appName), app);

  const cloud = await build({
    entryPoints: [new URL('src/cloud-entry.js', root).pathname], bundle: true, minify: true, write: false,
    format: 'iife', target: 'es2019', legalComments: 'none', logLevel: 'silent'
  });
  const cloudCode = cloud.outputFiles[0].text;
  const cloudName = `cloud.${hash(cloudCode)}.js`;
  writeFileSync(out('assets/' + cloudName), cloudCode);

  const css = await minCss(fontFace(`/assets/${fontName}`) + tw);
  const head = [
    `<link rel="preload" href="/assets/${fontName}" as="font" type="font/woff2" crossorigin>`,
    `<link rel="preload" href="/assets/${appName}" as="script">`,
    `<link rel="preconnect" href="https://ptehldwrmwaigvhgpiwk.supabase.co" crossorigin>`
  ].join('\n');
  const config = r('config.js').match(/window\.PLAN_CONFIG\s*=\s*\{[\s\S]*?\};/)[0];
  const scripts = `<script>${config.replace(/\s+/g, ' ')}window.PLAN_CLOUD_SRC='/assets/${cloudName}';</script>\n<script defer src="/assets/${appName}"></script>`;
  const html = shell.replace('<!--HEAD-->', () => head).replace('/*FONT*//*TW*/', () => css).replace('<!--SCRIPTS-->', () => scripts);
  writeFileSync(out('index.html'), html);
  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`dist/index.html ${kb(html.length)} | ${appName} ${kb(app.length)} | ${cloudName} ${kb(cloudCode.length)} | ${fontName} ${kb(fontBuf.length)}`);
}
