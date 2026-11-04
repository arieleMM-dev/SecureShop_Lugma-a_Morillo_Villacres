import { startAuth } from './server.js';
void startAuth().catch(() => {
  console.error(
    'AUTH no pudo iniciar; revisar configuración y disponibilidad de servicios',
  );
  process.exitCode = 1;
});
