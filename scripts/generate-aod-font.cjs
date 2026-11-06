const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const font = path.join(root, 'assets/fonts/Modeseven-L3n5.ttf');
const targets = Object.keys(require('../app.json').targets);

targets.forEach((target) => {
  const output = path.join(root, 'assets', target, 'aod');

  fs.mkdirSync(output, { recursive: true });
  for (const glyph of '0123456789:') {
    const name = glyph === ':' ? 'colon' : glyph;

    // Match the 120px TEXT font: 600-unit advance, 800 ascent, 200 descent.
    // Keep design resolution for both targets; Zeus scales packaged images.
    // Retain a 2px inner outline so glyph bounds and alignment stay unchanged.
    execFileSync('convert', [
      '-size',
      '72x120',
      'xc:none',
      '-font',
      font,
      '-pointsize',
      '120',
      '-fill',
      '#66ff88',
      '-draw',
      `text 0,96 '${glyph}'`,
      '-virtual-pixel',
      'transparent',
      '-channel',
      'A',
      '-morphology',
      'EdgeIn',
      'Square:2',
      '+channel',
      'PNG32:' + path.join(output, name + '.png')
    ]);
  }
});
