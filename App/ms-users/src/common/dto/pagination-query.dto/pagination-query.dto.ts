import { Type } from 'class-transformer';

import { IsInt, ValidateIf, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
