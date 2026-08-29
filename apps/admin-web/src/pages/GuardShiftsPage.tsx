import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { AppUser, GuardShift } from '../lib/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { colors, spacing } from '../theme';

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

const thStyle = { padding: spacing.sm, fontSize: 13, color: colors.textSecondary };
const tdStyle = { padding: spacing.sm, fontSize: 14, color: colors.textPrimary };

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
      <h1 style={{ color: colors.textPrimary }}>จัดการเวรยาม (Guard Shifts)</h1>
      <p style={{ fontSize: 13, color: colors.textSecondary }}>
        เฉพาะ รปภ. ที่สถานะ "กำลังปฏิบัติหน้าที่" เท่านั้นที่จะได้รับแจ้งเหตุ SOS
      </p>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {guards === null && !error && <p style={{ color: colors.textSecondary }}>กำลังโหลด...</p>}
      {guards !== null && guards.length === 0 && <p style={{ color: colors.textSecondary }}>ยังไม่มีบัญชี รปภ. ในระบบ</p>}

      <Card style={{ marginTop: spacing.md, padding: 0, overflowX: 'auto' as const }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `2px solid ${colors.border}`, background: colors.primaryLight }}>
              <th style={thStyle}>ชื่อ</th>
              <th style={thStyle}>เบอร์โทร</th>
              <th style={thStyle}>สถานะ</th>
              <th style={thStyle}>เริ่มเวรล่าสุด</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {guards?.map((g) => {
              const open = openShiftFor(g.id);
              const onDuty = Boolean(open);
              return (
                <tr key={g.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={tdStyle}>{g.name}</td>
                  <td style={tdStyle}>{g.phone}</td>
                  <td style={tdStyle}>
                    <Badge variant={onDuty ? 'success' : 'neutral'}>{onDuty ? 'กำลังปฏิบัติหน้าที่' : 'นอกเวร'}</Badge>
                  </td>
                  <td style={tdStyle}>{open ? new Date(open.shiftStart).toLocaleString('th-TH') : '—'}</td>
                  <td style={tdStyle}>
                    <Button
                      variant={onDuty ? 'secondary' : 'primary'}
                      onClick={() => toggle(g)}
                      loading={busyGuardId === g.id}
                      loadingText="กำลังบันทึก..."
                    >
                      {onDuty ? 'สิ้นสุดเวร' : 'เริ่มเวร'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
