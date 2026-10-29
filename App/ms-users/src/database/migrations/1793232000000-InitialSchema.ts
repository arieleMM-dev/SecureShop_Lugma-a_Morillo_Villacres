import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableCheck,
} from 'typeorm';

export class InitialSchema1793232000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    for (const table of ['users', 'roles', 'user_roles']) {
      if (await q.hasTable(table))
        throw new Error(
          'Esquema existente: respaldar y reconciliar antes de ejecutar InitialSchema; no se modificaron las tablas existentes.',
        );
    }
    const uuid = (name: string) => ({
      name,
      type: 'uuid',
      isPrimary: true,
      default: 'gen_random_uuid()',
    });
    const text = (name: string, length: string) => ({
      name,
      type: 'varchar',
      length,
    });
    const active = { name: 'estado', type: 'boolean', default: true };
    const version = { name: 'version', type: 'integer', default: 1 };
    const timestamps = [
      { name: 'fecha_creacion', type: 'timestamp', default: 'now()' },
      { name: 'fecha_actualizacion', type: 'timestamp', default: 'now()' },
      { name: 'fecha_eliminacion', type: 'timestamp', isNullable: true },
    ];
    await q.createTable(
      new Table({
        name: 'users',
        columns: [
          uuid('id'),
          text('cedula', '10'),
          text('nombres', '100'),
          text('apellidos', '100'),
          { name: 'fecha_nacimiento', type: 'date' },
          text('username', '50'),
          text('email', '150'),
          text('telefono', '10'),
          text('password', '255'),
          active,
          { name: 'token_version', type: 'integer', default: 0 },
          version,
          ...timestamps,
        ],
      }),
    );
    await q.createTable(
      new Table({
        name: 'roles',
        columns: [
          uuid('id'),
          text('rol', '50'),
          active,
          version,
          ...timestamps,
        ],
      }),
    );
    await q.createTable(
      new Table({
        name: 'user_roles',
        columns: [
          { name: 'user_id', type: 'uuid', isPrimary: true },
          { name: 'role_id', type: 'uuid', isPrimary: true },
          active,
          version,
          { name: 'fecha_asignacion', type: 'timestamp', default: 'now()' },
          { name: 'fecha_actualizacion', type: 'timestamp', default: 'now()' },
        ],
      }),
    );
    for (const field of ['cedula', 'username', 'email', 'telefono']) {
      await q.createIndex(
        'users',
        new TableIndex({
          name: `UQ_users_${field}`,
          columnNames: [field],
          isUnique: true,
        }),
      );
    }
    await q.createIndex(
      'roles',
      new TableIndex({
        name: 'UQ_roles_rol',
        columnNames: ['rol'],
        isUnique: true,
      }),
    );
    for (const [name, column, table] of [
      ['user', 'user_id', 'users'],
      ['role', 'role_id', 'roles'],
    ]) {
      await q.createIndex(
        'user_roles',
        new TableIndex({
          name: `IDX_user_roles_${name}`,
          columnNames: [column],
        }),
      );
      await q.createForeignKey(
        'user_roles',
        new TableForeignKey({
          columnNames: [column],
          referencedTableName: table,
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
    for (const [table, name, expression] of [
      ['users', 'CHK_users_cedula', `"cedula" ~ '^[0-9]{10}$'`],
      ['users', 'CHK_users_telefono', `"telefono" ~ '^[0-9]{10}$'`],
      [
        'users',
        'CHK_users_username_canonical',
        `"username" ~ '^[a-z0-9._-]{4,50}$'`,
      ],
      ['users', 'CHK_users_email_canonical', `"email" = lower(btrim("email"))`],
      ['roles', 'CHK_roles_canonical', `"rol" ~ '^[A-Z0-9_]{2,50}$'`],
    ])
      await q.createCheckConstraint(
        table,
        new TableCheck({ name, expression }),
      );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.dropTable('user_roles');
    await q.dropTable('roles');
    await q.dropTable('users');
  }
}
