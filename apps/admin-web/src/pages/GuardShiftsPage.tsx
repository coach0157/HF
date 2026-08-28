import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { AppUser, GuardShift } from '../lib/types';

/**
 * Guard shift management — MVP_BACKLOG.md Epic 5 (P1, but needed before SOS
 * routing can be tested end-to-end since SOS only reaches on-duty guards,
 * see apps/backend/src/modules/sos/sos.service.ts's trigger()).
 *
 * "Current status" is derived client-side: the guard with an open shift
 * (status=ON_DUTY, shiftEnd=null) in the /guard-shifts list is on duty.
 * Toggling calls POST /guard-shifts (start, admin passes guardUserId) or
 * PATCH /guard-shifts/:id (end, using that guard's open shift id).
 */
export function GuardShiftsPage() {
  const [guards, setGuards] = useState<AppUser[] | null>(null);
  const [shifts, setShifts] = useState<GuardShift[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyGuardId, setBusyGuardId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [guardUsers, shiftRows] = await Promise.all([
        api.get<AppUser[]>('/users?role=GUARD'),
        api.get<GuardShift[]>('/guard-shifts'),
      ]);
      setGuards(guardUsers);
      setShifts(shiftRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลเวรยามไม่สำเร็จ');
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openShiftFor(guardId: string): GuardShift | undefined {
    return shifts.find((s) => s.guardUserId === guardId && s.status === 'ON_DUTY' && !s.shiftEnd);
  }

  async function toggle(guard: AppUser) {
    setBusyGuardId(guard.id);
    setError(null);
    try {
      const open = openShiftFor(guard.id);
      if (open) {
        await api.patch(`/guard-shifts/${open.id}`, {});
      } else {
        await api.post('/guard-shifts', { guardUserId: guard.id });
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เปลี่ยนสถานะเวรยามไม่สำเร็จ');
    } finally {
      setBusyGuardId(null);
    }
  }

  return (
    <div>
      <h1>จัดการเวรยาม (Guard Shifts)</h1>
      <p style={{ fontSize: 13, color: '#666' }}>
        เฉพาะ รปภ. ที่สถานะ "กำลังปฏิบัติหน้าที่" เท่านั้นที่จะได้รับแจ้งเหตุ SOS
      </p>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {guards === null && !error && <p>กำลังโหลด...</p>}
      {guards !== null && guards.length === 0 && <p>ยังไม่มีบัญชี รปภ. ในระบบ</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
            <th style={{ padding: 8 }}>ชื่อ</th>
            <th style={{ padding: 8 }}>เบอร์โทร</th>
            <th style={{ padding: 8 }}>สถานะ</th>
            <th style={{ padding: 8 }}>เริ่มเวรล่าสุด</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {guards?.map((g) => {
            const open = openShiftFor(g.id);
            const onDuty = Boolean(open);
            return (
              <tr key={g.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{g.name}</td>
                <td style={{ padding: 8 }}>{g.phone}</td>
                <td style={{ padding: 8, color: onDuty ? '#2e7d32' : '#888', fontWeight: 'bold' }}>
                  {onDuty ? 'กำลังปฏิบัติหน้าที่' : 'นอกเวร'}
                </td>
                <td style={{ padding: 8 }}>
                  {open ? new Date(open.shiftStart).toLocaleString('th-TH') : '—'}
                </td>
                <td style={{ padding: 8 }}>
                  <button onClick={() => toggle(g)} disabled={busyGuardId === g.id}>
                    {busyGuardId === g.id ? 'กำลังบันทึก...' : onDuty ? 'สิ้นสุดเวร' : 'เริ่มเวร'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
