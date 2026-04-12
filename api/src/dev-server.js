import { createApp } from './app.js';
import { config } from './config.js';

const app = await createApp();
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`API corriendo en http://localhost:${config.port}`);
