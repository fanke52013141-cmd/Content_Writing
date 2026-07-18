import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const compose = await readFile(resolve(root, 'compose.yaml'), 'utf8');
const baseline = await readFile(resolve(root, 'docs/product/v1.1-baseline.md'), 'utf8');

const requiredServices = ['postgres', 'redis', 'migrate', 'api', 'worker', 'web'];
for (const service of requiredServices) {
  if (!compose.includes(`  ${service}:`)) throw new Error(`Missing Compose service: ${service}`);
}

for (const binding of ['127.0.0.1:3000:3000', '127.0.0.1:3100:3100']) {
  if (!compose.includes(binding)) throw new Error(`Missing loopback binding: ${binding}`);
}

if (!compose.includes('condition: service_completed_successfully')) {
  throw new Error('Application services must wait for successful migrations.');
}
if (/image:\s+\S+:latest(?:\s|$)/u.test(compose)) {
  throw new Error('Compose must not use latest image tags.');
}
if (!baseline.includes('WeChat hot topics or WeChat Index')) {
  throw new Error('The V1.1 scope exclusion is missing.');
}

const wrappers = ['启动平台.cmd', '停止平台.cmd', '备份数据.cmd'];
for (const wrapper of wrappers) {
  await readFile(resolve(root, wrapper), 'utf8');
}

console.log('RUNTIME_CONFIG_OK');
