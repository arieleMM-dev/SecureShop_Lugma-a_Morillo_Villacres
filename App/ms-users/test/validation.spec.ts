import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRoleDto } from '../src/roles/dto/create-role.dto.js';
import { UpdateRoleDto } from '../src/roles/dto/update-role.dto.js';
import { envSchema } from '../src/config/env.schema.js';

describe('Validación del taller', () => {
  it.each(['admin', 'Admin', ' ADMIN '])('normaliza %s', async (rol) => {
    const dto = plainToInstance(CreateRoleDto, { rol });
    expect(dto.rol).toBe('ADMIN');
    expect(await validate(dto)).toHaveLength(0);
  });
  it('rechaza PATCH null', async () => {
    expect(
      (await validate(plainToInstance(UpdateRoleDto, { rol: null }))).length,
    ).toBeGreaterThan(0);
  });
  it('permite PATCH parcial', async () => {
    expect(
      await validate(plainToInstance(UpdateRoleDto, { estado: false })),
    ).toHaveLength(0);
  });
  it('rechaza clave JWT corta', () => {
    expect(
      envSchema.safeParse({
        DB_HOST: '127.0.0.1',
        DB_USERNAME: 'test',
        DB_PASSWORD: '0123456789abcdef',
        DB_DATABASE: 'test',
        JWT_SECRET: 'corta',
      }).success,
    ).toBe(false);
  });
});
