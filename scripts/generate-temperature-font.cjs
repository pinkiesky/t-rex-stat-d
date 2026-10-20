const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const font = path.join(root, 'assets/fonts/Modeseven-L3n5.ttf');
const targets = Object.keys(require('../app.json').targets);
const glyphs = [...'0123456789', '-', 'C', 'F'];

targets.forEach((target) => {
  const output = path.join(root, 'assets', target, 'temperature');

  fs.mkdirSync(output, { recursive: true });
  glyphs.forEach((glyph) => {
    const name = glyph === '-' ? 'minus' : glyph;

    // Fixed canvas and baseline retain the font's side bearings and line alignment.
    execFileSync('convert', [
      '-size',
      '18x29',
      'xc:none',
      '-font',
      font,
      '-pointsize',
      '29',
      '-fill',
      '#66ff88',
      '-draw',
      `text 0,23 '${glyph}'`,
      'PNG32:' + path.join(output, name + '.png')
    ]);
  });
});
