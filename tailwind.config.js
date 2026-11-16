const v = n => `rgb(var(--${n}) / <alpha-value>)`;
module.exports = {
  content: ['./src/shell.html', './src/app.js', './src/cloud.js', './src/crews-view.js'],
  safelist: ['bg-ok-soft','bg-warn-soft','bg-bad-soft','text-ok','text-warn','text-bad','bg-bad','bg-warn','bg-line','rotate-90'],
  theme: { extend: {
    fontFamily: { sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
    colors: {
      bg: v('bg'), surface: v('surface'), 'surface-2': v('surface-2'),
      ink: v('ink'), 'ink-2': v('ink-2'), 'ink-3': v('ink-3'),
      line: v('line'), 'line-2': v('line-2'),
      accent: v('accent'), 'accent-hover': v('accent-hover'), 'accent-soft': v('accent-soft'), 'accent-ink': v('accent-ink'),
      signal: v('signal'), 'signal-soft': v('signal-soft'),
      ok: v('ok'), 'ok-soft': v('ok-soft'), warn: v('warn'), 'warn-soft': v('warn-soft'), bad: v('bad'), 'bad-soft': v('bad-soft')
    }
  } }
};
