import { createApp } from './app.js';

const app = await createApp();
const port = Number(process.env.PORT) || 3001;
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`API corriendo en http://localhost:${port}`);
