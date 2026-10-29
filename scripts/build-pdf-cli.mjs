import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { run } from './pdf-toolchain.mjs';
const target = process.env.PDFTOTEX_TARGET;
run('cargo', ['build', '--manifest-path', 'native/Cargo.toml', '--locked', '--release', '-p', 'graphtotex-pdf', ...(target ? ['--target', target] : [])]);
const platform = target || `${process.arch}-${process.platform}`;
const windows = platform.includes('windows') || process.platform === 'win32';
const filename = `graphtotex-pdf${windows ? '.exe' : ''}`;
const binary = `native/target/${target ? `${target}/` : ''}release/${filename}`;
mkdirSync('public/downloads', { recursive: true });
writeFileSync(`public/downloads/graphtotex-pdf-${platform}.zip`, zipSync({
  [filename]: [new Uint8Array(readFileSync(binary)), { attrs: 0o100755 << 16, os: 3 }],
  'README.md': strToU8(readFileSync('native/README.md', 'utf8')),
  'LICENSE': new Uint8Array(readFileSync('LICENSE')),
  'pdf-extract-LICENSE': new Uint8Array(readFileSync('native/vendor/pdf-extract/LICENSE'))
}, { level: 9 }));
// The site's build step creates the combined download manifest.
