import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

type Schema = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>[string];

const uuid = { type: 'string', format: 'uuid' };
const text = { type: 'string' };
const integer = { type: 'integer' };
const boolean = { type: 'boolean' };
const dateTime = { type: 'string', format: 'date-time' };
const ref = (name: string): Schema => ({ $ref: '#/components/schemas/' + name });
const array = (items: Schema): Schema => ({ type: 'array', items });
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties });
const auditFields = { version: integer, fechaCreacion: dateTime, fechaActualizacion: dateTime };
const paginated = (name: string) => object({
  data: array(ref(name)),
  meta: object({ page: integer, limit: integer, total: integer, totalPages: integer }),
});

const errorDescriptions: Record<number, string> = {
  400: 'Entrada o parámetro inválido',
  401: 'Credenciales, sesión o identidad de servicio inválidas',
  403: 'La sesión no tiene permiso',
  404: 'Entidad no encontrada',
  409: 'Conflicto de unicidad',
  413: 'Carga excesiva',
  415: 'Codificación no admitida',
  429: 'Límite de solicitudes excedido',
  500: 'Error interno',
};

const exampleTime = '2026-11-04T12:00:00.000Z';
const exampleUserId = '87d1619e-af9e-4f57-84f2-f93f04690812';
const exampleRoleId = 'd42d2919-4ed3-4c9d-9205-55adbb7bdb82';
const exampleRole = { id: exampleRoleId, rol: 'ANALYST', description: 'Rol de análisis', estado: true };
const exampleUser = {
  id: exampleUserId,
  cedula: '1799999001',
  nombres: 'Cuenta',
  apellidos: 'Demostracion',
  fechaNacimiento: '1998-04-18',
  username: 'amendoza',
  email: 'analista@example.com',
  telefono: '0990009001',
  estado: true,
};
const exampleAssignment = {
  id: '556a6466-9615-4ad2-841a-8f69006b3c18',
  userId: exampleUserId,
  roleId: exampleRoleId,
  fechaAsignacion: exampleTime,
  estado: true,
};
const examplePage = { page: 1, limit: 20, total: 1, totalPages: 1 };
const examples: Record<string, unknown> = {
  Health: { status: 'ok', service: 'user-service', timestamp: exampleTime },
  User: exampleUser,
  Role: exampleRole,
  Assignment: exampleAssignment,
  UsersPage: { data: [exampleUser], meta: examplePage },
  RolesPage: { data: [exampleRole], meta: examplePage },
};
const exampleProfile = {
  userId: exampleUserId,
  username: exampleUser.username,
  email: exampleUser.email,
  roles: ['ANALYST'],
};

export function createAuthOpenApi(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('AUTH Backend V1')
      .setVersion('2.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Service-Token' }, 'ServiceToken')
      .build(),
  );
  const schemas = (document.components ??= {}).schemas ??= {};
  Object.assign(schemas, {
    AuthError: {
      ...object({
        statusCode: integer,
        message: { oneOf: [text, array(text)] },
        timestamp: dateTime, path: text, requestId: text,
      }),
      required: ['statusCode', 'message', 'timestamp', 'path'],
    },
    Health: object({ status: text, service: text, timestamp: dateTime }),
    Role: object({
      id: uuid, rol: text, description: text, estado: boolean,
      ...auditFields, fechaEliminacion: { ...dateTime, nullable: true },
    }),
    Assignment: object({
      id: uuid, userId: uuid, roleId: uuid, fechaAsignacion: dateTime,
      estado: boolean, version: integer, fechaActualizacion: dateTime, role: ref('Role'),
    }),
    User: object({
      id: uuid, cedula: text, nombres: text, apellidos: text, username: text,
      email: { type: 'string', format: 'email' }, telefono: text,
      fechaNacimiento: { type: 'string', format: 'date' },
      estado: boolean, tokenVersion: integer, ...auditFields,
      fechaEliminacion: { ...dateTime, nullable: true }, userRoles: array(ref('Assignment')),
    }),
    UsersPage: paginated('User'),
    RolesPage: paginated('Role'),
  });
  const paths = document.paths;
  for (const [path, item] of Object.entries(paths)) {
    for (const method of ['get', 'post', 'patch', 'delete'] as const) {
      const operation = item[method];
      if (!operation) continue;
      const admin = /^\/api\/v1\/(users|roles|user-roles)(\/|$)/.test(path);
      const health = path.endsWith('/health');
      const login = path.endsWith('/login');
      const internal = path === '/internal/authorization/check';
      const errors = [429, 500];
      if (method === 'post' || method === 'patch') errors.push(413, 415);
      if (!health) errors.push(401);
      if (admin) errors.push(403);
      if (admin || login || internal) errors.push(400);
      if (admin && (path.includes('{') || path.endsWith('/user-roles'))) errors.push(404);
      if (admin && (method === 'patch' || method === 'post')) errors.push(409);
      for (const code of errors) {
        const previous = operation.responses[code];
        operation.responses[code] = {
          description: previous && 'description' in previous ? previous.description : errorDescriptions[code],
          content: {
            'application/json': {
              schema: ref('AuthError'),
              example: {
                statusCode: code,
                message: code === 400 ? ['Entrada o parámetro inválido'] : errorDescriptions[code],
                timestamp: exampleTime,
                path,
                requestId: 'ejemplo-auth',
              },
            },
          },
        };
      }

      for (const parameter of operation.parameters ?? []) {
        if ('in' in parameter && parameter.in === 'query' && ['page', 'limit'].includes(parameter.name)) {
          parameter.schema = { ...parameter.schema, type: 'integer' };
        }
      }

      let result: Schema | undefined;
      if (health) result = ref('Health');
      if (path.includes('/users')) result = ref(path.endsWith('/users') && method === 'get' ? 'UsersPage' : 'User');
      if (path.includes('/roles')) result = ref(path.endsWith('/roles') && method === 'get' ? 'RolesPage' : 'Role');
      if (path.includes('/user-roles')) result = method === 'get' ? array(ref('Assignment')) : ref('Assignment');
      if (result && method !== 'delete') {
        const example = '$ref' in result
          ? examples[result.$ref.split('/').pop() ?? '']
          : [{ ...exampleAssignment, role: exampleRole }];
        operation.responses[method === 'post' ? 201 : 200] = {
          description: method === 'post' ? 'Recurso creado' : 'Operación exitosa',
          content: { 'application/json': { schema: result, example } },
        };
      }

      const success = operation.responses[200];
      if (success && 'content' in success && success.content?.['application/json']) {
        const json = success.content['application/json'];
        if (login) {
          json.example = {
            accessToken: '<JWT>',
            tokenType: 'Bearer',
            expiresIn: 900,
            user: { id: exampleUserId, username: exampleUser.username, email: exampleUser.email, roles: ['ANALYST'] },
          };
        } else if (path.endsWith('/profile') || path.endsWith('/me')) {
          json.example = exampleProfile;
        } else if (internal) {
          const decision = {
            subject_id: exampleUserId,
            action: 'steganography.analyze',
            resource_id: null,
          };
          json.examples = {
            permitido: { value: { ...decision, allowed: true, reason: 'active_role_grants_permission' } },
            denegado: { value: { ...decision, allowed: false, reason: 'active_role_does_not_grant_permission' } },
          };
        }
      }
      if (method === 'delete' || path.endsWith('/logout')) {
        operation.responses[204] = { description: 'Operación exitosa sin contenido' };
      }
    }
  }
  const internalSchema = schemas.CheckAuthorizationDto;
  if (internalSchema && 'properties' in internalSchema && internalSchema.properties) {
    internalSchema.properties.action = {
      type: 'string', enum: ['steganography.analyze', 'steganography.results.read'],
    };
    for (const field of ['resource_id', 'resource_owner_id']) {
      internalSchema.properties[field] = { ...uuid, nullable: true };
    }
    internalSchema.description = 'Para results.read ambos UUID son obligatorios. En analyze pueden omitirse.';
  }
  return document;
}
