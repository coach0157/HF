import { IsEnum, IsOptional, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Matches(/^0\d{9}$/, { message: 'phone must be a 10-digit Thai phone number starting with 0' })
  phone!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsUUID()
  houseId?: string;
}
