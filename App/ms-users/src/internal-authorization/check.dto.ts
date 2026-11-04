import { IsIn, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
export class CheckAuthorizationDto {
  @IsString() @MaxLength(8192) subject_token!: string;
  @IsIn(['steganography.analyze', 'steganography.results.read'])
  action!: string;
  @ValidateIf((_o, value) => value !== undefined && value !== null)
  @IsUUID('4')
  resource_id?: string | null;
  @ValidateIf((_o, value) => value !== undefined && value !== null)
  @IsUUID('4')
  resource_owner_id?: string | null;
}
