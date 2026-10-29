const { spawnSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const name = 'ms-users-tests-' + randomUUID().slice(0, 8);
const password = randomBytes(24).toString('hex');
const run = (args) =>
  spawnSync('docker', args, { encoding: 'utf8', windowsHide: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  let created = false;
  try {
    const started = run([
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-p',
      '127.0.0.1::5432',
      'postgres:18-alpine',
    ]);
    if (started.status !== 0)
      throw new Error(
        started.stderr || 'Iniciar Docker Desktop antes de probar',
      );
    created = true;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (run(['exec', name, 'pg_isready', '-U', 'postgres']).status === 0) {
        ready = true;
        break;
      }
      await wait(1000);
    }
    if (!ready) throw new Error('PostgreSQL temporal no inició a tiempo');
    const port = JSON.parse(run(['inspect', name]).stdout)[0].NetworkSettings
      .Ports['5432/tcp'][0].HostPort;
    const r = spawnSync(process.execPath, ['--test', 'test/integration.cjs'], {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        RUN_DB_TESTS: '1',
        TEST_DB_HOST: '127.0.0.1',
        TEST_DB_PORT: port,
        TEST_DB_USER: 'postgres',
        TEST_DB_PASSWORD: password,
      },
    });
    process.exitCode = r.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (created) run(['stop', name]);
  }
})();
