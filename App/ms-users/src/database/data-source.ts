import 'dotenv/config';
import { DataSource } from 'typeorm';
import { envSchema } from '../config/env.schema.js';
import { User } from '../users/entities/user.entity.js';
import { Role } from '../roles/entities/role.entity.js';
import { UserRole } from '../user-roles/entities/user-role.entity.js';
import { InitialSchema1793232000000 } from './migrations/1793232000000-InitialSchema.js';
const env = envSchema.parse(process.env);
export default new DataSource({
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  entities: [User, Role, UserRole],
  migrations: [InitialSchema1793232000000],
  synchronize: false,
  logging: false,
});
