import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { AppUser, House, SosAlert, SosStatus } from '../lib/types';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import type { BadgeVariant } from '../components/Badge';
import { colors, radius, spacing } from '../theme';

const STATUS_LABEL: Record<SosStatus, string> = {
  PENDING: 'รอรับแจ้ง',
  ACKNOWLEDGED: 'รับแจ้งแล้ว',
  RESOLVED: 'จบเหตุแล้ว',
};

const STATUS_BADGE_VARIANT: Record<SosStatus, BadgeVariant> = {
  PENDING: 'danger',
  ACKNOWLEDGED: 'warning',
  RESOLVED: 'success',
};

const POLL_INTERVAL_MS = 5000;

const thStyle = { padding: spacing.sm, fontSize: 13, color: colors.textSecondary };
const tdStyle = { padding: spacing.sm, fontSize: 14, color: colors.textPrimary };

export function SosPage() {
  const [alerts, setAlerts] = useState<SosAlert[] | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<SosStatus | 'ALL'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadAlerts(status: SosStatus | 'ALL') {
    try {
      const query = status === 'ALL' ? '' : `?status=${status}`;
      const data = await api.get<SosAlert[]>(`/sos-alerts${query}`);
      setAlerts(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดรายการ SOS ไม่สำเร็จ');
    }
  }

  useEffect(() => {
    api.get<House[]>('/houses').then(setHouses).catch(() => setHouses([]));
    api
      .get<AppUser[]>('/users?role=RESIDENT')
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    loadAlerts(statusFilter);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => loadAlerts(statusFilter), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function houseNo(id: string): string {
    return houses.find((h) => h.id === id)?.houseNo ?? id;
  }

  function triggeredByPhone(userId: string): string | null {
    return users.find((u) => u.id === userId)?.phone ?? null;
  }

  function triggeredByName(userId: string): string {
    return users.find((u) => u.id === userId)?.name ?? '(ไม่ทราบชื่อ)';
  }

  return (
    <div>
      <h1 style={{ color: colors.textPrimary }}>SOS / เหตุฉุกเฉิน</h1>
      <p style={{ fontSize: 13, color: colors.textSecondary }}>
        รายการนี้อ่านอย่างเดียว — การรับแจ้ง (acknowledge) ทำโดย รปภ. ผ่านแอปหน้างานเท่านั้น
        (รีเฟรชอัตโนมัติทุก {POLL_INTERVAL_MS / 1000} วินาที)
      </p>

      <label style={{ fontSize: 14, color: colors.textPrimary }}>
        กรองตามสถานะ:{' '}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SosStatus | 'ALL')}
          style={{ padding: spacing.xs, borderRadius: radius.input, border: `1px solid ${colors.border}` }}
        >
          <option value="ALL">ทั้งหมด</option>
          <option value="PENDING">{STATUS_LABEL.PENDING}</option>
          <option value="ACKNOWLEDGED">{STATUS_LABEL.ACKNOWLEDGED}</option>
          <option value="RESOLVED">{STATUS_LABEL.RESOLVED}</option>
        </select>
      </label>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {alerts === null && !error && <p style={{ color: colors.textSecondary }}>กำลังโหลด...</p>}
      {alerts !== null && alerts.length === 0 && <p style={{ color: colors.textSecondary }}>ไม่มีรายการแจ้งเหตุ</p>}

      <Card style={{ marginTop: spacing.md, padding: 0, overflowX: 'auto' as const }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `2px solid ${colors.border}` }}>
              <th style={thStyle}>สถานะ</th>
              <th style={thStyle}>บ้านเลขที่</th>
              <th style={thStyle}>แจ้งโดย</th>
              <th style={thStyle}>พิกัด</th>
              <th style={thStyle}>เวลาแจ้ง</th>
              <th style={thStyle}>โทรกลับ</th>
            </tr>
          </thead>
          <tbody>
            {alerts?.map((a) => {
              const phone = triggeredByPhone(a.triggeredByUserId);
              return (
                <tr key={a.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={tdStyle}>
                    <Badge variant={STATUS_BADGE_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                  </td>
                  <td style={tdStyle}>{houseNo(a.houseId)}</td>
                  <td style={tdStyle}>{triggeredByName(a.triggeredByUserId)}</td>
                  <td style={tdStyle}>
                    {a.latitude && a.longitude ? (
                      <a
                        href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: colors.secondary }}
                      >
                        {a.latitude}, {a.longitude}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={tdStyle}>{new Date(a.createdAt).toLocaleString('th-TH')}</td>
                  <td style={tdStyle}>
                    {phone ? (
                      <a
                        href={`tel:${phone}`}
                        style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          border: `1px solid ${colors.secondary}`,
                          borderRadius: radius.button,
                          textDecoration: 'none',
                          color: colors.secondary,
                          fontSize: 13,
                        }}
                      >
                        โทร {phone}
                      </a>
                    ) : (
                      '—'
                    )}
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
