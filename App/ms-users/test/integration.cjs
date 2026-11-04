const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { Client } = require('pg');
const request = require('supertest');
const argon2 = require('argon2');
const enabled = process.env.RUN_DB_TESTS === '1';
const database = 'msusers_test_' + randomUUID().replaceAll('-', '');
const password = randomBytes(18).toString('base64url');
const serviceToken = randomBytes(32).toString('hex');
const dbConfig = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT || 5432),
  user: process.env.TEST_DB_USER,
  password: process.env.TEST_DB_PASSWORD,
};
let app,
  ds,
  tls,
  created = false,
  admin,
  analyst,
  normal,
  adminToken,
  analystToken,
  userToken,
  role,
  user,
  assignment;
const api = (method, path, token) => {
  const r = request(app.getHttpServer())[method]('/api/v1' + path);
  return token ? r.auth(token, { type: 'bearer' }) : r;
};
const internal = (
  token,
  action = 'steganography.analyze',
  extra = {},
  credential = serviceToken,
) =>
  request('https://127.0.0.1:' + tls.address().port)
    .post('/internal/authorization/check')
    .ca(readFileSync('secrets/ca.crt'))
    .set('X-Service-Token', credential)
    .send({ subject_token: token, action, ...extra });
const run = (name, fn) => {
  void test(name, { skip: !enabled }, fn);
};
before(async () => {
  if (!enabled) return;
  const c = new Client({ ...dbConfig, database: 'postgres' });
  await c.connect();
  try {
    await c.query(`CREATE DATABASE "${database}"`);
    created = true;
  } finally {
    await c.end();
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_HOST: dbConfig.host,
    DB_PORT: String(dbConfig.port),
    DB_USERNAME: dbConfig.user,
    DB_PASSWORD: dbConfig.password,
    DB_DATABASE: database,
    DB_SSL: 'false',
    STEGO_SERVICE_TOKEN: serviceToken,
    JWT_PRIVATE_KEY_PATH: 'secrets/jwt-private.pem',
    JWT_PUBLIC_KEY_PATH: 'secrets/jwt-public.pem',
    JWT_ISSUER: 'auth-service',
    JWT_AUDIENCE: 'chat-backend',
    RATE_LIMIT_MAX: '1000',
    RATE_LIMIT_TTL_MS: '60000',
    RATE_LIMIT_BLOCK_MS: '60000',
  });
  ds = require('../dist/database/data-source.js').default;
  await ds.initialize();
  await ds.runMigrations();
  for (const [i, username, name] of [
    [1, 'testadmin', 'ADMIN'],
    [2, 'testanalyst', 'ANALYST'],
    [3, 'testuser', 'USER'],
  ]) {
    const r = (
      await ds.query(
        'INSERT INTO roles (name,description) VALUES ($1,$2) RETURNING id',
        [name, 'Rol para pruebas ' + name],
      )
    )[0];
    const u = (
      await ds.query(
        'INSERT INTO users (cedula,nombres,apellidos,fecha_nacimiento,username,email,telefono,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
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
      )
    )[0];
    await ds.query('INSERT INTO user_roles (user_id,role_id) VALUES ($1,$2)', [
      u.id,
      r.id,
    ]);
    if (i === 1) admin = u.id;
    else if (i === 2) analyst = u.id;
    else normal = u.id;
  }
  const { NestFactory } = require('@nestjs/core');
  app = await NestFactory.create(require('../dist/app.module.js').AppModule, {
    logger: false,
  });
  require('../dist/setup-app.js').setupApp(app);
  await app.init();
  tls = require('node:https').createServer(
    {
      minVersion: 'TLSv1.3',
      cert: readFileSync('secrets/auth-tls.crt'),
      key: readFileSync('secrets/auth-tls.key'),
    },
    app.getHttpAdapter().getInstance(),
  );
  await new Promise((resolve) => tls.listen(0, '127.0.0.1', resolve));
});
after(async () => {
  if (tls?.listening) await new Promise((resolve) => tls.close(resolve));
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
run('01 health y correlación de solicitud', async () => {
  const r = await api('get', '/health').expect(200);
  assert.equal(r.body.status, 'ok');
  assert.ok(r.headers['x-request-id']);
});
run('02 acceso administrativo sin token devuelve 401', async () => {
  await api('get', '/users').expect(401);
});
run(
  '03 login ADMIN: firma RS256, claims y ausencia de roles en JWT',
  async () => {
    const r = await api('post', '/auth/login')
      .send({ identifier: 'TESTADMIN', password })
      .expect(200);
    adminToken = r.body.accessToken;
    const [header, payload] = adminToken
      .split('.')
      .slice(0, 2)
      .map((x) => JSON.parse(Buffer.from(x, 'base64url')));
    assert.equal(header.alg, 'RS256');
    assert.equal(payload.sub, admin);
    assert.equal(payload.roles, undefined);
    assert.equal(payload.iss, 'auth-service');
    assert.equal(payload.aud, 'chat-backend');
    assert.equal(payload.exp - payload.iat, 900);
    const publicJwt = new (require('@nestjs/jwt').JwtService)({
      publicKey: readFileSync('secrets/jwt-public.pem'),
    });
    assert.equal(
      (
        await publicJwt.verifyAsync(adminToken, {
          algorithms: ['RS256'],
          issuer: 'auth-service',
          audience: 'chat-backend',
        })
      ).sub,
      admin,
    );
    await assert.rejects(
      publicJwt.signAsync({ sub: admin }, { algorithm: 'RS256' }),
    );
  },
);
run('04 login ANALYST y USER por username/email', async () => {
  analystToken = (
    await api('post', '/auth/login')
      .send({ identifier: 'testanalyst', password })
      .expect(200)
  ).body.accessToken;
  userToken = (
    await api('post', '/auth/login')
      .send({ identifier: 'testuser@example.com', password })
      .expect(200)
  ).body.accessToken;
});
run('05 perfil autenticado y alias me', async () => {
  for (const path of ['/auth/profile', '/auth/me']) {
    const r = await api('get', path, adminToken).expect(200);
    assert.equal(r.body.userId, admin);
    assert.deepEqual(r.body.roles, ['ADMIN']);
  }
});
run(
  '06 mínimo privilegio: ANALYST y USER no administran identidades',
  async () => {
    for (const token of [analystToken, userToken])
      for (const path of ['/users', '/roles', '/user-roles/user/' + normal])
        await api('get', path, token).expect(403);
    await api('get', '/auth/profile', userToken).expect(200);
  },
);
run('07 crear rol normaliza mayúsculas y guarda descripción', async () => {
  role = (
    await api('post', '/roles', adminToken)
      .send({
        rol: ' supervisor ',
        description: 'Supervisión local',
        estado: true,
      })
      .expect(201)
  ).body;
  assert.equal(role.rol, 'SUPERVISOR');
  assert.equal(role.description, 'Supervisión local');
  await api('post', '/roles', adminToken)
    .send({ rol: 'Admin', description: 'Duplicado' })
    .expect(409);
});
run('08 consultar y modificar rol, rechazar duplicados', async () => {
  await api('get', '/roles/' + role.id, adminToken).expect(200);
  await api('patch', '/roles/' + role.id, adminToken)
    .send({ rol: 'SUPERVISOR_GENERAL', description: 'Otra descripción' })
    .expect(200);
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
run('09 crear usuario: Argon2id persistido sin hash en respuesta', async () => {
  user = (await api('post', '/users', adminToken).send(userData).expect(201))
    .body;
  assert.equal(user.username, 'psalazar');
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.password, undefined);
  const row = (
    await ds.query('SELECT password_hash FROM users WHERE id=$1', [user.id])
  )[0];
  assert.ok(row.password_hash.startsWith('$argon2id$'));
  assert.ok(await argon2.verify(row.password_hash, userData.password));
});
run('10 listar, paginar y consultar usuario por UUID/cédula', async () => {
  const r = await api('get', '/users?page=1&limit=2', adminToken).expect(200);
  assert.equal(r.body.data.length, 2);
  assert.equal(r.body.meta.total, 4);
  await api('get', '/users/' + user.id, adminToken).expect(200);
  await api('get', '/users/cedula/' + userData.cedula, adminToken).expect(200);
  await api('get', '/roles', adminToken).expect(200);
});
run(
  '11 validar asignación masiva, UUID, cédula, paginación y duplicados',
  async () => {
    await api('post', '/users', adminToken)
      .send({ ...userData, esAdministrador: true })
      .expect(400);
    await api('get', '/users/incorrecto', adminToken).expect(400);
    await api('get', '/users/' + '-'.repeat(36), adminToken).expect(400);
    await api('get', '/users/cedula/abc', adminToken).expect(400);
    await api('get', '/users?limit=101', adminToken).expect(400);
    await api('post', '/users', adminToken).send(userData).expect(409);
  },
);
run(
  '12 actualización parcial y cambio de contraseña; null inválido',
  async () => {
    await api('patch', '/users/' + user.id, adminToken)
      .send({ nombres: 'Pedro Alejandro', password: 'NuevaClavePrueba2026!' })
      .expect(200);
    const row = (
      await ds.query('SELECT password_hash FROM users WHERE id=$1', [user.id])
    )[0];
    assert.ok(await argon2.verify(row.password_hash, 'NuevaClavePrueba2026!'));
    await api('patch', '/users/' + user.id, adminToken)
      .send({ nombres: null })
      .expect(400);
  },
);
run('13 asignación con id propio y duplicado 409', async () => {
  assignment = (
    await api('post', '/user-roles', adminToken)
      .send({ userId: user.id, roleId: role.id })
      .expect(201)
  ).body;
  assert.match(assignment.id, /^[a-f0-9-]{36}$/);
  const list = (
    await api('get', '/user-roles/user/' + user.id, adminToken).expect(200)
  ).body;
  assert.equal(list[0].id, assignment.id);
  await api('post', '/user-roles', adminToken)
    .send({ userId: user.id, roleId: role.id })
    .expect(409);
});
run('14 retirar asignación por id', async () => {
  await api('delete', '/user-roles/' + assignment.id, adminToken).expect(204);
  await api('delete', '/user-roles/' + assignment.id, adminToken).expect(404);
});
run('15 N:M: dos roles a un usuario y un rol a dos usuarios; FK', async () => {
  const analystRole = (
    await ds.query("SELECT id FROM roles WHERE name='ANALYST'")
  )[0].id;
  await api('post', '/user-roles', adminToken)
    .send({ userId: normal, roleId: analystRole })
    .expect(201);
  const roles = (
    await api('get', '/user-roles/user/' + normal, adminToken).expect(200)
  ).body;
  assert.equal(roles.length, 2);
  assert.equal(
    (
      await ds.query(
        'SELECT count(*)::int AS n FROM user_roles WHERE role_id=$1',
        [analystRole],
      )
    )[0].n,
    2,
  );
  await assert.rejects(
    ds.query('INSERT INTO user_roles(user_id,role_id) VALUES ($1,$2)', [
      randomUUID(),
      analystRole,
    ]),
    { code: '23503' },
  );
  await api(
    'delete',
    '/user-roles/' + roles.find((r) => r.roleId === analystRole).id,
    adminToken,
  ).expect(204);
});
run(
  '16 JWT inválido, expirado, emisor/audiencia/algoritmo incorrectos',
  async () => {
    await api('get', '/auth/profile', 'invalido').expect(401);
    const jwt = app.get(require('@nestjs/jwt').JwtService);
    const payload = {
      sub: admin,
      username: 'testadmin',
      typ: 'access',
      tokenVersion: 0,
    };
    for (const options of [
      { expiresIn: -1 },
      { issuer: 'otro' },
      { audience: 'otra' },
    ])
      await api(
        'get',
        '/auth/profile',
        await jwt.signAsync(payload, options),
      ).expect(401);
    const wrong = require('jsonwebtoken').sign(
      payload,
      randomBytes(32).toString('hex'),
      { algorithm: 'HS256', expiresIn: 900 },
    );
    await api('get', '/auth/profile', wrong).expect(401);
  },
);
run('17 no admitir token con sub inválido ni sin exp', async () => {
  const jwt = app.get(require('@nestjs/jwt').JwtService);
  await api(
    'get',
    '/auth/profile',
    await jwt.signAsync({ sub: 'invalido', typ: 'access', tokenVersion: 0 }),
  ).expect(401);
  const noExp = require('jsonwebtoken').sign(
    { sub: admin, typ: 'access', tokenVersion: 0 },
    readFileSync('secrets/jwt-private.pem'),
    { algorithm: 'RS256', issuer: 'auth-service', audience: 'chat-backend' },
  );
  await api('get', '/auth/profile', noExp).expect(401);
});
run('18 canal interno rechaza HTTP y X-Forwarded-Proto falso', async () => {
  await request(app.getHttpServer())
    .post('/internal/authorization/check')
    .set('X-Service-Token', serviceToken)
    .set('X-Forwarded-Proto', 'https')
    .send({ subject_token: adminToken, action: 'steganography.analyze' })
    .expect(401);
});
run('19 TLS válido requiere credencial de servicio válida', async () => {
  await internal(adminToken, 'steganography.analyze', {}, 'incorrecta').expect(
    401,
  );
  await request('https://127.0.0.1:' + tls.address().port)
    .post('/internal/authorization/check')
    .ca(readFileSync('secrets/ca.crt'))
    .send({ subject_token: adminToken, action: 'steganography.analyze' })
    .expect(401);
});
run(
  '20 contrato interno: ADMIN y ANALYST permitidos, USER denegado',
  async () => {
    for (const token of [adminToken, analystToken]) {
      const r = await internal(token).expect(200);
      assert.equal(r.body.allowed, true);
      assert.ok(r.body.subject_id);
    }
    assert.equal((await internal(userToken).expect(200)).body.allowed, false);
  },
);
run('21 autorización interna valida nuevamente token y esquema', async () => {
  await internal('inventado').expect(401);
  await internal(adminToken, 'accion_no_permitida').expect(400);
  await internal(adminToken, 'steganography.analyze', { allowed: true }).expect(
    400,
  );
  await internal(adminToken, 'steganography.results.read').expect(400);
});
run(
  '22 propiedad del recurso: ANALYST propio permitido, ajeno denegado',
  async () => {
    const resource = randomUUID();
    assert.equal(
      (
        await internal(analystToken, 'steganography.results.read', {
          resource_id: resource,
          resource_owner_id: analyst,
        }).expect(200)
      ).body.allowed,
      true,
    );
    assert.equal(
      (
        await internal(analystToken, 'steganography.results.read', {
          resource_id: resource,
          resource_owner_id: normal,
        }).expect(200)
      ).body.allowed,
      false,
    );
    assert.equal(
      (
        await internal(adminToken, 'steganography.results.read', {
          resource_id: resource,
          resource_owner_id: normal,
        }).expect(200)
      ).body.allowed,
      true,
    );
  },
);
run(
  '23 retirar rol mediante API revoca decisión con el MISMO JWT no vencido',
  async () => {
    const pair = (
      await ds.query('SELECT id FROM user_roles WHERE user_id=$1', [analyst])
    )[0];
    await api('delete', '/user-roles/' + pair.id, adminToken).expect(204);
    assert.equal(
      (await internal(analystToken).expect(200)).body.allowed,
      false,
    );
    const r = (await ds.query("SELECT id FROM roles WHERE name='ANALYST'"))[0];
    await api('post', '/user-roles', adminToken)
      .send({ userId: analyst, roleId: r.id })
      .expect(201);
    assert.equal((await internal(analystToken).expect(200)).body.allowed, true);
    const adminAssignment = (
      await ds.query('SELECT id,role_id FROM user_roles WHERE user_id=$1', [
        admin,
      ])
    )[0];
    await api('delete', '/user-roles/' + adminAssignment.id, adminToken).expect(
      204,
    );
    await api('get', '/users', adminToken).expect(403);
    await ds.query('INSERT INTO user_roles(user_id,role_id) VALUES ($1,$2)', [
      admin,
      adminAssignment.role_id,
    ]);
    await api('get', '/users', adminToken).expect(200);
  },
);
run(
  '24 desactivar asignación, rol y usuario produce efectos actuales',
  async () => {
    for (const table of ['user_roles', 'roles']) {
      const where = table === 'user_roles' ? 'user_id=$1' : "name='ANALYST'";
      const values = table === 'user_roles' ? [analyst] : [];
      await ds.query(`UPDATE ${table} SET status=false WHERE ${where}`, values);
      assert.equal(
        (await internal(analystToken).expect(200)).body.allowed,
        false,
      );
      await ds.query(`UPDATE ${table} SET status=true WHERE ${where}`, values);
    }
    await api('patch', '/users/' + analyst, adminToken)
      .send({ estado: false })
      .expect(200);
    await internal(analystToken).expect(401);
    await api('patch', '/users/' + analyst, adminToken)
      .send({ estado: true })
      .expect(200);
  },
);
run('25 baja lógica de usuario y rol', async () => {
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
run('26 restricción canónica y unicidad SQL', async () => {
  await assert.rejects(
    ds.query(
      "INSERT INTO roles (name,description) VALUES ('admin','Inválido')",
    ),
    { code: '23514' },
  );
  await assert.rejects(
    ds.query(
      "INSERT INTO roles (name,description) VALUES ('ADMIN','Duplicado')",
    ),
    { code: '23505' },
  );
});
run('27 logout invalida perfil y autorización interna', async () => {
  await api('post', '/auth/logout', adminToken).expect(204);
  await api('get', '/auth/profile', adminToken).expect(401);
  await internal(adminToken).expect(401);
  assert.equal(
    (await ds.query('SELECT token_version FROM users WHERE id=$1', [admin]))[0]
      .token_version,
    1,
  );
});
run('28 mensaje genérico y rate limit del sexto login', async () => {
  const a = await api('post', '/auth/login')
    .send({ identifier: 'testadmin', password: 'incorrecta' })
    .expect(401);
  const b = await api('post', '/auth/login')
    .send({ identifier: 'inexistente', password: 'incorrecta' })
    .expect(401);
  assert.equal(a.body.message, b.body.message);
  await api('post', '/auth/login')
    .send({ identifier: 'testadmin', password })
    .expect(429);
});
run('29 auditoría persistida, decisiones y ausencia de secretos', async () => {
  await new Promise((r) => setTimeout(r, 200));
  const logs = await ds.query('SELECT * FROM auth_audit_events');
  assert.ok(logs.length > 25);
  assert.ok(logs.some((x) => x.service_id === 'STEGO' && x.allowed === false));
  assert.ok(logs.some((x) => x.service_id === 'STEGO' && x.allowed === true));
  assert.ok(logs.some((x) => x.status_code === 401));
  const text = JSON.stringify(logs);
  for (const secret of [
    password,
    serviceToken,
    adminToken,
    analystToken,
    userData.password,
  ])
    assert.equal(text.includes(secret), false);
});
run('30 OpenAPI incluye contratos y esquemas de seguridad', async () => {
  const schema = require('@nestjs/swagger').SwaggerModule.createDocument(
    app,
    new (require('@nestjs/swagger').DocumentBuilder)()
      .addBearerAuth()
      .addApiKey(
        { type: 'apiKey', in: 'header', name: 'X-Service-Token' },
        'ServiceToken',
      )
      .build(),
  );
  for (const route of [
    '/api/v1/auth/profile',
    '/api/v1/user-roles/{id}',
    '/internal/authorization/check',
  ])
    assert.ok(schema.paths[route], route);
  assert.ok(schema.components.schemas.CheckAuthorizationDto);
});
run(
  '31 migración V2 preserva registros y asignaciones de V1; reversión',
  async () => {
    await new Promise((resolve) => tls.close(resolve));
    await app.close();
    app = undefined;
    const count = (
      await ds.query('SELECT count(*)::int AS n FROM user_roles')
    )[0].n;
    await ds.undoLastMigration();
    assert.equal(
      (
        await ds.query(
          "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_roles' AND column_name='id') AS yes",
        )
      )[0].yes,
      false,
    );
    await ds.runMigrations();
    assert.equal(
      (await ds.query('SELECT count(*)::int AS n FROM user_roles'))[0].n,
      count,
    );
    assert.equal(
      (await ds.query('SELECT id FROM users WHERE id=$1', [admin]))[0].id,
      admin,
    );
    await ds.undoLastMigration();
    await ds.undoLastMigration();
    await ds.runMigrations();
  },
);
run(
  '32 seed ADMIN/ANALYST/USER repetible sin cambiar cuentas existentes',
  async () => {
    const { spawnSync } = require('node:child_process');
    for (let i = 0; i < 2; i++) {
      const r = spawnSync(process.execPath, ['dist/database/seed.js'], {
        env: { ...process.env, SEED_PASSWORD: password },
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, 'Falló seed sobre base temporal');
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
      (await ds.query('SELECT count(*)::int AS n FROM user_roles'))[0].n,
      6,
    );
    assert.deepEqual(
      (await ds.query('SELECT name FROM roles ORDER BY name')).map(
        (x) => x.name,
      ),
      ['ADMIN', 'ANALYST', 'USER'],
    );
    assert.equal(
      (await ds.query("SELECT nombres FROM users WHERE username='jperez'"))[0]
        .nombres,
      'Nombre conservado',
    );
  },
);
