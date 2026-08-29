import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { EntryLog, House, Paginated } from '../lib/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { colors, radius, spacing } from '../theme';

const METHOD_LABEL: Record<'QR' | 'MANUAL', string> = { QR: 'สแกน QR', MANUAL: 'บันทึกด้วยมือ' };

const selectStyle = {
  display: 'block',
  padding: spacing.sm,
  marginTop: spacing.xs,
  borderRadius: radius.input,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
};
const thStyle = { padding: spacing.sm, fontSize: 13, color: colors.textSecondary };
const tdStyle = { padding: spacing.sm, fontSize: 14, color: colors.textPrimary };

/**
 * Entry log oversight view — spec 1.3 "รายงาน: export ประวัติเข้า-ออก",
 * MVP_BACKLOG.md Epic 5 (P1). Read-only for admins in MVP scope — see
 * apps/backend/src/modules/entry-log/entry-log.controller.ts's GET
 * /entry-logs (paginated, house_id/date filters).
 */
export function EntryLogsPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [houseId, setHouseId] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [result, setResult] = useState<Paginated<EntryLog> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<House[]>('/houses').then(setHouses).catch(() => setHouses([]));
  }, []);

  async function load() {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (houseId) params.set('house_id', houseId);
      if (date) params.set('date', date);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const data = await api.get<Paginated<EntryLog>>(`/entry-logs?${params.toString()}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดประวัติเข้า-ออกไม่สำเร็จ');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function houseNo(id: string): string {
    return houses.find((h) => h.id === id)?.houseNo ?? id;
  }

  function handleSearch() {
    setPage(1);
    load();
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div>
      <h1 style={{ color: colors.textPrimary }}>ประวัติเข้า-ออก</h1>

      <div style={{ display: 'flex', gap: spacing.md, alignItems: 'flex-end', marginBottom: spacing.lg, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 14, color: colors.textPrimary }}>
          บ้าน
          <select value={houseId} onChange={(e) => setHouseId(e.target.value)} style={selectStyle}>
            <option value="">ทั้งหมด</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.houseNo}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 14, color: colors.textPrimary }}>
          วันที่
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={selectStyle} />
        </label>
        <Button onClick={handleSearch}>ค้นหา</Button>
      </div>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {result === null && !error && <p style={{ color: colors.textSecondary }}>กำลังโหลด...</p>}
      {result !== null && result.items.length === 0 && <p style={{ color: colors.textSecondary }}>ไม่พบข้อมูล</p>}

      <Card style={{ padding: 0, overflowX: 'auto' as const }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `2px solid ${colors.border}`, background: colors.primaryLight }}>
              <th style={thStyle}>บ้าน</th>
              <th style={thStyle}>ผู้มาเยือน</th>
              <th style={thStyle}>ทะเบียนรถ</th>
              <th style={thStyle}>วิธีบันทึก</th>
              <th style={thStyle}>เวลาเข้า</th>
              <th style={thStyle}>เวลาออก</th>
            </tr>
          </thead>
          <tbody>
            {result?.items.map((log) => (
              <tr key={log.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td style={tdStyle}>{houseNo(log.houseId)}</td>
                <td style={tdStyle}>{log.visitorName ?? '—'}</td>
                <td style={tdStyle}>{log.vehiclePlate ?? '—'}</td>
                <td style={tdStyle}>{METHOD_LABEL[log.method]}</td>
                <td style={tdStyle}>{new Date(log.entryTime).toLocaleString('th-TH')}</td>
                <td style={tdStyle}>{log.exitTime ? new Date(log.exitTime).toLocaleString('th-TH') : 'ยังไม่ยืนยันออก'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {result && result.total > 0 && (
        <div style={{ marginTop: spacing.md, display: 'flex', gap: spacing.md, alignItems: 'center' }}>
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ก่อนหน้า
          </Button>
          <span style={{ fontSize: 14, color: colors.textPrimary }}>
            หน้า {page} / {totalPages} (ทั้งหมด {result.total} รายการ)
          </span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            ถัดไป
          </Button>
        </div>
      )}
    </div>
  );
}
