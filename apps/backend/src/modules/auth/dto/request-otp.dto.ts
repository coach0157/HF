import { Matches } from 'class-validator';

export class RequestOtpDto {
  // Thai mobile numbers: 10 digits, starts with 0 (spec 3.4 recommends
  // phone+OTP auth over password for exactly this user base).
  @Matches(/^0\d{9}$/, { message: 'phone must be a 10-digit Thai phone number starting with 0' })
  phone!: string;
}
