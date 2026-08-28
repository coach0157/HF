import { IsEnum, IsOptional, IsUUID, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // To clear a user's house assignment, pass the nil UUID
  // "00000000-0000-0000-0000-000000000000"; the service treats that as null
  // (class-validator's @IsUUID() can't cleanly accept both a UUID and a
  // literal null in one field).
  @IsOptional()
  @IsUUID()
  houseId?: string;
}
