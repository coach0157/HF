import { IsOptional, IsUUID, Matches } from "class-validator";

export class LoginDto {
  @Matches(/^0\d{9}$/, {
    message: "phone must be a 10-digit Thai phone number starting with 0",
  })
  phone!: string;

  @Matches(/^\d{6}$/, { message: "otp must be a 6-digit code" })
  otp!: string;

  // Only needed when the same phone number is registered in more than one
  // village (users.phone is unique per-village, not globally — see
  // schema.prisma comment and auth.module.ts TODO). Omit on the first
  // attempt; the API responds 409 with the candidate villages if disambiguation
  // is required.
  @IsOptional()
  @IsUUID()
  villageId?: string;
}
