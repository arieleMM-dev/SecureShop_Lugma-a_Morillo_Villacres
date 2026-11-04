import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { UserRole } from '../../user-roles/entities/user-role.entity.js';

@Entity({
  name: 'roles',
})
@Index('UQ_roles_rol', ['rol'], {
  unique: true,
})
@Check('CHK_roles_canonical', `"name" ~ '^[A-Z0-9_]{2,50}$'`)
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'name',
  })
  rol!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({
    name: 'status',
    type: 'boolean',
    default: true,
  })
  estado!: boolean;

  @VersionColumn({
    name: 'version',
  })
  version!: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
  })
  fechaCreacion!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
  })
  fechaActualizacion!: Date;

  @DeleteDateColumn({
    name: 'fecha_eliminacion',
    type: 'timestamp',
    nullable: true,
  })
  fechaEliminacion!: Date | null;

  @OneToMany(() => UserRole, (userRole) => userRole.role)
  userRoles!: Relation<UserRole[]>;
}
