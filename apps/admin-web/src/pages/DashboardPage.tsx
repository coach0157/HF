/**
 * Dashboard — spec 1.3: "กราฟสรุปรถเข้า-ออกวันนี้, จำนวนแจ้งเหตุ, ค้างชำระค่าส่วนกลาง".
 *
 * Dev agent TODO: the "ค้างชำระค่าส่วนกลาง" (unpaid bills) widget depends on
 * the Billing module which is Phase 3 / out of MVP scope — stub that widget
 * or omit it until Epic/Phase 3 lands; don't block the rest of the
 * dashboard on it. Entry-count and SOS-count widgets can call
 * `GET /entry-logs` and `GET /sos-alerts` (or a future summary endpoint)
 * respectively.
 */
export function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>TODO: summary widgets — see component doc comment.</p>
    </div>
  );
}
