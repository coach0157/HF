/**
 * Guard shift management — MVP_BACKLOG.md Epic 5 (P1, but needed before SOS
 * routing can be tested end-to-end since SOS only reaches on-duty guards).
 *
 * Dev agent TODO: toggle on_duty/off_duty per guard via
 * `POST/PATCH /guard-shifts` (see
 * apps/backend/src/modules/guard-shift/guard-shift.module.ts).
 */
export function GuardShiftsPage() {
  return (
    <div>
      <h1>จัดการเวรยาม (Guard Shifts)</h1>
      <p>TODO: on_duty/off_duty toggle per guard — see component doc comment.</p>
    </div>
  );
}
