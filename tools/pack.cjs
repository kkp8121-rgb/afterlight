#!/usr/bin/env node
'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputArg = process.argv.slice(2).find((arg) => arg.startsWith('--out='));
const output = path.resolve(root, outputArg ? outputArg.slice(6) : 'dist/afterlight-web.zip');
if (output !== root && !output.startsWith(root + path.sep)) throw new Error('Output must stay inside the project.');
fs.mkdirSync(path.dirname(output), { recursive: true });

const names = ['index.html', 'style.css', 'levels.js', 'engine.js', 'renderer.js', 'audio.js', 'game.js', 'favicon.svg', '.nojekyll'];
if (fs.existsSync(path.join(root, 'art'))) names.push('art');
const files = names.map((name) => path.join(root, name)).filter((file) => fs.existsSync(file));
if (!files.some((file) => path.basename(file) === 'index.html')) throw new Error('index.html is missing.');

if (process.platform === 'win32') {
  // LiteralPath avoids wildcard expansion and the process is launched without a shell.
  const quote = (value) => "'" + value.replace(/'/g, "''") + "'";
  const script = "$ErrorActionPreference='Stop'; Compress-Archive -LiteralPath @(" + files.map(quote).join(',') + ') -DestinationPath ' + quote(output) + ' -Force';
  childProcess.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'inherit' });
} else {
  const relative = files.map((file) => path.relative(root, file));
  childProcess.execFileSync('zip', ['-q', '-r', output, ...relative], { cwd: root, stdio: 'inherit' });
}
console.log(`Wrote ${path.relative(root, output)}`);
