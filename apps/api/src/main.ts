import 'reflect-metadata';

import { createApp } from './app.js';
import { loadEnvironment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment();
  const app = await createApp();
  await app.listen(environment.port, environment.host);
}

void bootstrap();
