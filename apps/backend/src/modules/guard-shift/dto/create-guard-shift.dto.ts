import { IsOptional, IsUUID } from 'class-validator';

export class CreateGuardShiftDto {
  // Admin-only: assign a shift to a specific guard (Epic 5 "จัดการ guard
  // shift"). A guard starting their own shift omits this — the service
  // ignores/rejects it from a non-admin caller (see guard-shift.service.ts).
  @IsOptional()
  @IsUUID()
  guardUserId?: string;
}
