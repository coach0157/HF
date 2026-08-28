/**
 * SOS dashboard — spec 1.3 + 2.2, MVP_BACKLOG.md Epic 5 (P0, view-only —
 * acknowledge is done by the Guard app/API, not here).
 *
 * Dev agent TODO: list `sos_alerts` (pending/acknowledged/resolved) with
 * house number + coordinates, a `tel:` callback link, ideally polling or
 * WebSocket for real-time updates (see apps/backend/src/modules/sos for the
 * backend real-time delivery mechanism once chosen).
 */
export function SosPage() {
  return (
    <div>
      <h1>SOS / เหตุฉุกเฉิน</h1>
      <p>TODO: real-time SOS list — see component doc comment.</p>
    </div>
  );
}
