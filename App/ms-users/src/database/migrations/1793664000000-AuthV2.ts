import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableUnique,
} from 'typeorm';
export class AuthV21793664000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    for (const [table, oldName, newName] of [
      ['users', 'password', 'password_hash'],
      ['users', 'estado', 'status'],
      ['users', 'fecha_creacion', 'created_at'],
      ['users', 'fecha_actualizacion', 'updated_at'],
      ['roles', 'rol', 'name'],
      ['roles', 'estado', 'status'],
      ['roles', 'fecha_creacion', 'created_at'],
      ['roles', 'fecha_actualizacion', 'updated_at'],
      ['user_roles', 'estado', 'status'],
      ['user_roles', 'fecha_asignacion', 'assigned_at'],
      ['user_roles', 'fecha_actualizacion', 'updated_at'],
    ])
      await q.renameColumn(table, oldName, newName);
    await q.addColumn(
      'roles',
      new TableColumn({
        name: 'description',
        type: 'varchar',
        length: '500',
        default: "'Rol existente'",
      }),
    );
    await q.query(`UPDATE roles SET description = 'Rol existente: ' || name`);
    await q.changeColumn(
      'roles',
      'description',
      new TableColumn({ name: 'description', type: 'varchar', length: '500' }),
    );
    await q.dropPrimaryKey('user_roles');
    await q.addColumn(
      'user_roles',
      new TableColumn({
        name: 'id',
        type: 'uuid',
        default: 'gen_random_uuid()',
      }),
    );
    await q.createPrimaryKey('user_roles', ['id']);
    await q.createUniqueConstraint(
      'user_roles',
      new TableUnique({
        name: 'UQ_user_roles_pair',
        columnNames: ['user_id', 'role_id'],
      }),
    );
    await q.query(`CREATE TABLE auth_audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), occurred_at timestamptz NOT NULL DEFAULT now(),
      request_id varchar(64) NOT NULL, actor_id uuid NULL, service_id varchar(30) NULL,
      method varchar(10) NOT NULL, route varchar(200) NOT NULL, status_code integer NOT NULL,
      action varchar(80) NULL, resource_id uuid NULL, allowed boolean NULL
    )`);
    await q.query(
      'CREATE INDEX IDX_audit_time ON auth_audit_events(occurred_at)',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.dropTable('auth_audit_events');
    await q.dropUniqueConstraint('user_roles', 'UQ_user_roles_pair');
    await q.dropPrimaryKey('user_roles');
    await q.dropColumn('user_roles', 'id');
    await q.createPrimaryKey('user_roles', ['user_id', 'role_id']);
    await q.dropColumn('roles', 'description');
    for (const [table, oldName, newName] of [
      ['users', 'password_hash', 'password'],
      ['users', 'status', 'estado'],
      ['users', 'created_at', 'fecha_creacion'],
      ['users', 'updated_at', 'fecha_actualizacion'],
      ['roles', 'name', 'rol'],
      ['roles', 'status', 'estado'],
      ['roles', 'created_at', 'fecha_creacion'],
      ['roles', 'updated_at', 'fecha_actualizacion'],
      ['user_roles', 'status', 'estado'],
      ['user_roles', 'assigned_at', 'fecha_asignacion'],
      ['user_roles', 'updated_at', 'fecha_actualizacion'],
    ])
      await q.renameColumn(table, oldName, newName);
  }
}
