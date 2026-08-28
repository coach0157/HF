import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { AppUser, House, SosAlert, SosStatus } from '../lib/types';

const STATUS_LABEL: Record<SosStatus, string> = {
  PENDING: 'รอรับแจ้ง',
  ACKNOWLEDGED: 'รับแจ้งแล้ว',
  RESOLVED: 'จบเหตุแล้ว',
};

const STATUS_COLOR: Record<SosStatus, string> = {
  PENDING: '#c0392b',
  ACKNOWLEDGED: '#b8860b',
  RESOLVED: '#2e7d32',
};

const POLL_INTERVAL_MS = 5000;

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
      <h1>SOS / เหตุฉุกเฉิน</h1>
      <p style={{ fontSize: 13, color: '#666' }}>
        รายการนี้อ่านอย่างเดียว — การรับแจ้ง (acknowledge) ทำโดย รปภ. ผ่านแอปหน้างานเท่านั้น
        (รีเฟรชอัตโนมัติทุก {POLL_INTERVAL_MS / 1000} วินาที)
      </p>

      <label>
        กรองตามสถานะ:{' '}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SosStatus | 'ALL')}>
          <option value="ALL">ทั้งหมด</option>
          <option value="PENDING">{STATUS_LABEL.PENDING}</option>
          <option value="ACKNOWLEDGED">{STATUS_LABEL.ACKNOWLEDGED}</option>
          <option value="RESOLVED">{STATUS_LABEL.RESOLVED}</option>
        </select>
      </label>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {alerts === null && !error && <p>กำลังโหลด...</p>}
      {alerts !== null && alerts.length === 0 && <p>ไม่มีรายการแจ้งเหตุ</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
            <th style={{ padding: 8 }}>สถานะ</th>
            <th style={{ padding: 8 }}>บ้านเลขที่</th>
            <th style={{ padding: 8 }}>แจ้งโดย</th>
            <th style={{ padding: 8 }}>พิกัด</th>
            <th style={{ padding: 8 }}>เวลาแจ้ง</th>
            <th style={{ padding: 8 }}>โทรกลับ</th>
          </tr>
        </thead>
        <tbody>
          {alerts?.map((a) => {
            const phone = triggeredByPhone(a.triggeredByUserId);
            return (
              <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8, color: STATUS_COLOR[a.status], fontWeight: 'bold' }}>
                  {STATUS_LABEL[a.status]}
                </td>
                <td style={{ padding: 8 }}>{houseNo(a.houseId)}</td>
                <td style={{ padding: 8 }}>{triggeredByName(a.triggeredByUserId)}</td>
                <td style={{ padding: 8 }}>
                  {a.latitude && a.longitude ? (
                    <a
                      href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.latitude}, {a.longitude}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ padding: 8 }}>{new Date(a.createdAt).toLocaleString('th-TH')}</td>
                <td style={{ padding: 8 }}>
                  {phone ? (
                    <a
                      href={`tel:${phone}`}
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        border: '1px solid #333',
                        borderRadius: 4,
                        textDecoration: 'none',
                        color: 'inherit',
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
    </div>
  );
}
