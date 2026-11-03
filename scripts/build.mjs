// Genera un HTML autocontenido.
//   npm run build        -> dist/index.html (con inicio de sesión y sincronización en Supabase)
//   npm run build:local  -> dist/local.html (solo navegador, sin nube)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const local = process.argv.includes('--local');
const r = f => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
execFileSync('npx', ['tailwindcss', '-i', 'src/tw.css', '-o', 'dist/tw.css', '--minify'], { stdio: 'inherit' });
const css = readFileSync(new URL('../dist/tw.css', import.meta.url), 'utf8').replace(/\/\*! tailwindcss[^*]*\*\//, '');
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

let html = r('shell.html')
  .replace('/*TW*/', () => css)
  .replace('/*CONFIG*/', () => (local ? '' : r('config.js')))
  .replace('/*ENGINE*/', () => r('engine.js'))
  .replace('/*SAMPLE*/', () => r('sample.js'))
  .replace('/*APP*/', () => r('app.js'))
  .replace('<!--SUPABASE-->', () => (local ? '' : `<script src="${SUPABASE_JS}"></script>`))
  .replace('/*CLOUD*/', () => (local ? '' : r('cloud.js')));
const out = local ? 'local.html' : 'index.html';
writeFileSync(new URL('../dist/' + out, import.meta.url), html);
console.log(`dist/${out}: ${(html.length / 1024).toFixed(0)} KB`);
