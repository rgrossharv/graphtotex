import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
export const env = { ...process.env };
if (existsSync('.tools/cargo/bin/cargo')) {
  env.CARGO_HOME = resolve('.tools/cargo'); env.RUSTUP_HOME = resolve('.tools/rustup');
  env.PATH = `${resolve('.tools/cargo/bin')}${process.platform === 'win32' ? ';' : ':'}${env.PATH}`;
}
export function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status || 1);
}
