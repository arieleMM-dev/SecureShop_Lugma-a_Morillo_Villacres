import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { AppModule } from '../app.module.js';
import { User } from '../users/entities/user.entity.js';
import { Role } from '../roles/entities/role.entity.js';
import { UserRole } from '../user-roles/entities/user-role.entity.js';

async function seed() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Seed de demostración deshabilitado en producción');
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    if (app.get(ConfigService).get('NODE_ENV') === 'production')
      throw new Error('Seed de demostración deshabilitado en producción');
    const password = process.env.SEED_PASSWORD;
    if (!password || password.length < 12 || password.length > 128)
      throw new Error('Configurar SEED_PASSWORD con 12 a 128 caracteres');
    const samples = [
      [
        '1712345675',
        'Juan Carlos',
        'Pérez López',
        'jperez',
        '0991000001',
        ['ADMIN'],
      ],
      [
        '1723456784',
        'María Fernanda',
        'Gómez Ruiz',
        'mgomez',
        '0991000002',
        ['CLIENTE'],
      ],
      [
        '0503495350',
        'Carlos Andrés',
        'Vega Torres',
        'cvega',
        '0991000003',
        ['CLIENTE', 'OPERADOR'],
      ],
      [
        '1102345673',
        'Ana Lucía',
        'Mendoza Silva',
        'amendoza',
        '0991000004',
        ['OPERADOR'],
      ],
      [
        '0912345675',
        'Luis Alberto',
        'Castro Molina',
        'lcastro',
        '0991000005',
        ['CLIENTE'],
      ],
    ] as const;
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await app.get(DataSource).transaction(async (manager) => {
      const roles = new Map<string, Role>();
      for (const rol of ['ADMIN', 'CLIENTE', 'OPERADOR']) {
        let role = await manager.findOne(Role, {
          where: { rol },
          withDeleted: true,
        });
        if (role?.fechaEliminacion || role?.estado === false)
          throw new Error(
            'Rol de seed desactivado: no se restaura automáticamente',
          );
        role ??= await manager.save(
          Role,
          manager.create(Role, { rol, estado: true }),
        );
        roles.set(rol, role);
      }
      for (const [
        cedula,
        nombres,
        apellidos,
        username,
        telefono,
        roleNames,
      ] of samples) {
        // Una repetición no cambia cuentas, claves ni privilegios existentes.
        if (
          await manager.findOne(User, {
            where: { username },
            withDeleted: true,
          })
        )
          continue;
        const user = await manager.save(
          User,
          manager.create(User, {
            cedula,
            nombres,
            apellidos,
            username,
            telefono,
            email: `${username}@example.com`,
            fechaNacimiento: '1990-05-15',
            passwordHash: hash,
            estado: true,
          }),
        );
        for (const name of roleNames)
          await manager.insert(UserRole, {
            userId: user.id,
            roleId: roles.get(name)!.id,
            estado: true,
          });
      }
    });
    console.log(
      'Seed completado: jperez (ADMIN), mgomez (CLIENTE), cvega (CLIENTE/OPERADOR), amendoza (OPERADOR), lcastro (CLIENTE). Clave: SEED_PASSWORD local.',
    );
  } finally {
    await app.close();
  }
}
seed().catch(() => {
  console.error(
    'Seed falló. Revisar configuración, migraciones y posibles conflictos con cuentas existentes.',
  );
  process.exitCode = 1;
});
