import { existsSync, mkdirSync } from 'node:fs';
import { run } from './pdf-toolchain.mjs';
mkdirSync('public/vendor/pdf-to-tex', { recursive: true });
run('cargo', ['build', '--manifest-path', 'native/Cargo.toml', '--locked', '--release', '-p', 'graphtotex-pdf-core', '--target', 'wasm32-unknown-unknown']);
const local = '.tools/wasm-bindgen-0.2.105-aarch64-apple-darwin/wasm-bindgen';
run(existsSync(local) ? local : 'wasm-bindgen', ['native/target/wasm32-unknown-unknown/release/graphtotex_pdf_core.wasm', '--target', 'web', '--out-dir', 'public/vendor/pdf-to-tex', '--out-name', 'graphtotex_pdf_core']);
