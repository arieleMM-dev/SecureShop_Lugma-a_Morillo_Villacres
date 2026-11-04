import ds from './data-source.js';
async function migrate() {
  await ds.initialize();
  try {
    await ds.runMigrations();
  } finally {
    await ds.destroy();
  }
}
void migrate().catch(() => {
  console.error(
    'Migración fallida: revisar esquema y configuración antes de continuar',
  );
  process.exitCode = 1;
});
