const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { Client } = require('pg');
const request = require('supertest');
const argon2 = require('argon2');
let app, ds, admin, adminToken, clientToken, operatorToken, role, user;
const enabled = process.env.RUN_DB_TESTS === '1';
const database = 'msusers_test_' + randomUUID().replaceAll('-', '');
const password = randomBytes(18).toString('base64url');
const dbConfig = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT || 5432),
  user: process.env.TEST_DB_USER,
  password: process.env.TEST_DB_PASSWORD,
};
let created = false;
const api = (method, path, token) => {
  const r = request(app.getHttpServer())[method]('/api/v1' + path);
  return token ? r.auth(token, { type: 'bearer' }) : r;
};
const run = (name, fn) => {
  void test(name, { skip: !enabled }, fn);
};
before(async () => {
  if (!enabled) return;
  const control = new Client({ ...dbConfig, database: 'postgres' });
  await control.connect();
  try {
    await control.query(`CREATE DATABASE "${database}"`);
    created = true;
  } finally {
    await control.end();
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_HOST: dbConfig.host,
    DB_PORT: String(dbConfig.port),
    DB_USERNAME: dbConfig.user,
    DB_PASSWORD: dbConfig.password,
    DB_DATABASE: database,
    DB_SSL: 'false',
    JWT_SECRET: randomBytes(48).toString('hex'),
    JWT_ISSUER: 'user-service',
    JWT_AUDIENCE: 'secure-shop-api',
    RATE_LIMIT_MAX: '1000',
    RATE_LIMIT_TTL_MS: '60000',
    RATE_LIMIT_BLOCK_MS: '60000',
  });
  ds = require('../dist/database/data-source.js').default;
  await ds.initialize();
  await ds.runMigrations();
  // Fixtures locales, sin ejecutar la siembra ni modificar una base existente.
  for (const [i, username, rol] of [
    [1, 'testadmin', 'ADMIN'],
    [2, 'testclient', 'CLIENTE'],
    [3, 'testoperador', 'OPERADOR'],
  ]) {
    const r = await ds.query(
      'INSERT INTO roles (rol) VALUES ($1) RETURNING id',
      [rol],
    );
    const u = await ds.query(
      'INSERT INTO users (cedula,nombres,apellidos,fecha_nacimiento,username,email,telefono,password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [
        '100000000' + i,
        'Nombre',
        'Apellido',
        '1990-05-15',
        username,
        username + '@example.com',
        '090000000' + i,
        await argon2.hash(password),
      ],
    );
    await ds.query('INSERT INTO user_roles (user_id,role_id) VALUES ($1,$2)', [
      u[0].id,
      r[0].id,
    ]);
    if (i === 1) admin = u[0].id;
  }
  const { NestFactory } = require('@nestjs/core');
  app = await NestFactory.create(require('../dist/app.module.js').AppModule, {
    logger: false,
  });
  require('../dist/setup-app.js').setupApp(app);
  await app.init();
});
after(async () => {
  if (app) await app.close();
  if (ds?.isInitialized) await ds.destroy();
  if (created) {
    const c = new Client({ ...dbConfig, database: 'postgres' });
    await c.connect();
    try {
      await c.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    } finally {
      await c.end();
    }
  }
});
run('01 health público y X-Request-Id', async () => {
  const r = await api('get', '/health').expect(200);
  assert.equal(r.body.status, 'ok');
  assert.ok(r.headers['x-request-id']);
});
run('02 rutas protegidas requieren JWT', async () => {
  await api('get', '/users').expect(401);
});
run('03 login ADMIN y JWT sin roles', async () => {
  const r = await api('post', '/auth/login')
    .send({ identifier: 'TESTADMIN', password })
    .expect(200);
  adminToken = r.body.accessToken;
  const payload = JSON.parse(
    Buffer.from(adminToken.split('.')[1], 'base64url'),
  );
  assert.equal(payload.roles, undefined);
  assert.equal(payload.tokenVersion, 0);
  assert.deepEqual(r.body.user.roles, ['ADMIN']);
});
run('04 login CLIENTE y OPERADOR por email', async () => {
  clientToken = (
    await api('post', '/auth/login')
      .send({ identifier: 'testclient@example.com', password })
      .expect(200)
  ).body.accessToken;
  operatorToken = (
    await api('post', '/auth/login')
      .send({ identifier: 'testoperador', password })
      .expect(200)
  ).body.accessToken;
});
run('05 me expone roles vigentes', async () => {
  const r = await api('get', '/auth/me', adminToken).expect(200);
  assert.deepEqual(r.body.roles, ['ADMIN']);
});
run('06 CLIENTE 403; OPERADOR lectura 200 y escritura 403', async () => {
  await api('get', '/users', clientToken).expect(403);
  await api('get', '/users', operatorToken).expect(200);
  await api('post', '/users', operatorToken).send({}).expect(403);
});
run('07 crear rol normaliza admin/Supervisor', async () => {
  role = (
    await api('post', '/roles', adminToken)
      .send({ rol: ' supervisor ', estado: true })
      .expect(201)
  ).body;
  assert.equal(role.rol, 'SUPERVISOR');
  await api('post', '/roles', adminToken).send({ rol: 'Admin' }).expect(409);
});
run('08 consultar y actualizar rol; duplicado 409', async () => {
  await api('get', '/roles/' + role.id, adminToken).expect(200);
  assert.equal(
    (
      await api('patch', '/roles/' + role.id, adminToken)
        .send({ rol: 'supervisor_general' })
        .expect(200)
    ).body.rol,
    'SUPERVISOR_GENERAL',
  );
  await api('patch', '/roles/' + role.id, adminToken)
    .send({ rol: 'ADMIN' })
    .expect(409);
});
const userData = {
  cedula: '1712345678',
  nombres: 'Pedro Andrés',
  apellidos: 'Salazar Torres',
  fechaNacimiento: '1993-04-18',
  username: 'PSALAZAR',
  email: 'PSALAZAR@example.com',
  telefono: '0987654321',
  password: 'ClaveDePruebaSegura2026!',
  estado: true,
};
run('09 crear usuario sin exponer hash; Argon2id en PostgreSQL', async () => {
  user = (await api('post', '/users', adminToken).send(userData).expect(201))
    .body;
  assert.equal(user.username, 'psalazar');
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.password, undefined);
  const row = (
    await ds.query('SELECT password FROM users WHERE id=$1', [user.id])
  )[0];
  assert.ok(row.password.startsWith('$argon2id$'));
  assert.ok(await argon2.verify(row.password, userData.password));
});
run('10 consultas paginadas, UUID y cédula', async () => {
  const r = await api('get', '/users?page=1&limit=2', operatorToken).expect(
    200,
  );
  assert.equal(r.body.data.length, 2);
  assert.equal(r.body.meta.total, 4);
  await api('get', '/users/' + user.id, adminToken).expect(200);
  await api('get', '/users/cedula/' + userData.cedula, adminToken).expect(200);
  await api('get', '/roles?page=1&limit=20', adminToken).expect(200);
});
run('11 rechazar asignación masiva, UUID y paginación inválidos', async () => {
  await api('post', '/users', adminToken)
    .send({ ...userData, esAdministrador: true })
    .expect(400);
  await api('get', '/users/no-es-uuid', adminToken).expect(400);
  await api('get', '/users/cedula/abc', adminToken).expect(400);
  await api('get', '/users?limit=101', adminToken).expect(400);
  await api('post', '/users', adminToken).send(userData).expect(409);
});
run('12 actualizar usuario y contraseña; PATCH null se rechaza', async () => {
  await api('patch', '/users/' + user.id, adminToken)
    .send({ nombres: 'Pedro Alejandro', password: 'NuevaClavePrueba2026!' })
    .expect(200);
  const row = (
    await ds.query('SELECT password FROM users WHERE id=$1', [user.id])
  )[0];
  assert.ok(await argon2.verify(row.password, 'NuevaClavePrueba2026!'));
  await api('patch', '/users/' + user.id, adminToken)
    .send({ nombres: null })
    .expect(400);
});
run('13 asignar rol, consultar y rechazar doble asignación', async () => {
  await api('post', '/user-roles', adminToken)
    .send({ userId: user.id, roleId: role.id })
    .expect(201);
  const r = await api('get', '/user-roles/user/' + user.id, adminToken).expect(
    200,
  );
  assert.equal(r.body[0].role.id, role.id);
  await api('post', '/user-roles', adminToken)
    .send({ userId: user.id, roleId: role.id })
    .expect(409);
});
run('14 retirar rol', async () => {
  await api(
    'delete',
    '/user-roles/' + user.id + '/' + role.id,
    adminToken,
  ).expect(204);
  await api(
    'delete',
    '/user-roles/' + user.id + '/' + role.id,
    adminToken,
  ).expect(404);
});
run('15 cambios de roles y estados vigentes con el mismo JWT', async () => {
  const row = (
    await ds.query("SELECT id FROM users WHERE username='testoperador'")
  )[0];
  await ds.query('UPDATE user_roles SET estado=false WHERE user_id=$1', [
    row.id,
  ]);
  await api('get', '/users', operatorToken).expect(403);
  await ds.query('UPDATE user_roles SET estado=true WHERE user_id=$1', [
    row.id,
  ]);
  await api('get', '/users', operatorToken).expect(200);
  await ds.query("UPDATE roles SET estado=false WHERE rol='OPERADOR'");
  await api('get', '/users', operatorToken).expect(403);
  await ds.query("UPDATE roles SET estado=true WHERE rol='OPERADOR'");
  await ds.query('UPDATE users SET estado=false WHERE id=$1', [row.id]);
  await api('get', '/auth/me', operatorToken).expect(401);
});
run('16 bajas lógicas conservan filas y restringen consultas', async () => {
  await api('delete', '/users/' + user.id, adminToken).expect(204);
  await api('get', '/users/' + user.id, adminToken).expect(404);
  assert.ok(
    (
      await ds.query('SELECT fecha_eliminacion FROM users WHERE id=$1', [
        user.id,
      ])
    )[0].fecha_eliminacion,
  );
  await api('delete', '/roles/' + role.id, adminToken).expect(204);
  await api('get', '/roles/' + role.id, adminToken).expect(404);
});
run(
  '17 restricciones de BD evitan variantes admin/ADMIN y datos inválidos',
  async () => {
    await assert.rejects(ds.query("INSERT INTO roles (rol) VALUES ('admin')"), {
      code: '23514',
    });
    await assert.rejects(ds.query("INSERT INTO roles (rol) VALUES ('ADMIN')"), {
      code: '23505',
    });
  },
);
run(
  '18 JWT inválido, expirado o payload UUID inválido se rechaza',
  async () => {
    await api('get', '/auth/me', 'invalido').expect(401);
    const jwt = app.get(require('@nestjs/jwt').JwtService);
    for (const payload of [
      {
        sub: admin,
        username: 'testadmin',
        typ: 'access',
        tokenVersion: 0,
        expired: true,
      },
      {
        sub: 'invalido',
        username: 'testadmin',
        typ: 'access',
        tokenVersion: 0,
      },
    ]) {
      const { expired, ...claims } = payload;
      const token = await jwt.signAsync(
        claims,
        expired ? { expiresIn: -1 } : {},
      );
      await api('get', '/auth/me', token).expect(401);
    }
  },
);
run('19 logout invalida todos los JWT anteriores del usuario', async () => {
  await api('post', '/auth/logout', adminToken).expect(204);
  await api('get', '/auth/me', adminToken).expect(401);
  assert.equal(
    (await ds.query('SELECT token_version FROM users WHERE id=$1', [admin]))[0]
      .token_version,
    1,
  );
});
run(
  '20 credenciales inválidas respuesta genérica y sexto login 429',
  async () => {
    const a = await api('post', '/auth/login')
      .send({ identifier: 'testadmin', password: 'incorrecta' })
      .expect(401);
    const b = await api('post', '/auth/login')
      .send({ identifier: 'inexistente', password: 'incorrecta' })
      .expect(401);
    assert.deepEqual(a.body.message, b.body.message);
    await api('post', '/auth/login')
      .send({ identifier: 'testadmin', password })
      .expect(429);
  },
);
run('21 migración reversible en base temporal', async () => {
  await app.close();
  app = undefined;
  await ds.undoLastMigration();
  assert.equal(
    (await ds.query("SELECT to_regclass('public.users') AS table_name"))[0]
      .table_name,
    null,
  );
  await ds.runMigrations();
  assert.equal(
    (await ds.query('SELECT count(*)::int AS n FROM users'))[0].n,
    0,
  );
});
run(
  '22 seed crea datos de demostración y su repetición conserva cambios existentes',
  async () => {
    const { spawnSync } = require('node:child_process');
    const seedEnv = { ...process.env, SEED_PASSWORD: password };
    for (let i = 0; i < 2; i++) {
      const r = spawnSync(process.execPath, ['dist/database/seed.js'], {
        env: seedEnv,
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, 'Falló el seed en la base temporal');
      if (i === 0)
        await ds.query(
          "UPDATE users SET nombres='Nombre conservado' WHERE username='jperez'",
        );
    }
    assert.equal(
      (await ds.query('SELECT count(*)::int AS n FROM users'))[0].n,
      5,
    );
    assert.equal(
      (await ds.query('SELECT count(*)::int AS n FROM roles'))[0].n,
      3,
    );
    assert.equal(
      (await ds.query('SELECT count(*)::int AS n FROM user_roles'))[0].n,
      6,
    );
    assert.equal(
      (await ds.query("SELECT nombres FROM users WHERE username='jperez'"))[0]
        .nombres,
      'Nombre conservado',
    );
  },
);
