import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { EntryLog, House, Paginated } from '../lib/types';

const METHOD_LABEL: Record<'QR' | 'MANUAL', string> = { QR: 'สแกน QR', MANUAL: 'บันทึกด้วยมือ' };

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
      <h1>ประวัติเข้า-ออก</h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
        <label>
          บ้าน
          <select value={houseId} onChange={(e) => setHouseId(e.target.value)} style={{ display: 'block', padding: 6 }}>
            <option value="">ทั้งหมด</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.houseNo}
              </option>
            ))}
          </select>
        </label>
        <label>
          วันที่
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ display: 'block', padding: 6 }} />
        </label>
        <button onClick={handleSearch}>ค้นหา</button>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result === null && !error && <p>กำลังโหลด...</p>}
      {result !== null && result.items.length === 0 && <p>ไม่พบข้อมูล</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
            <th style={{ padding: 8 }}>บ้าน</th>
            <th style={{ padding: 8 }}>ผู้มาเยือน</th>
            <th style={{ padding: 8 }}>ทะเบียนรถ</th>
            <th style={{ padding: 8 }}>วิธีบันทึก</th>
            <th style={{ padding: 8 }}>เวลาเข้า</th>
            <th style={{ padding: 8 }}>เวลาออก</th>
          </tr>
        </thead>
        <tbody>
          {result?.items.map((log) => (
            <tr key={log.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{houseNo(log.houseId)}</td>
              <td style={{ padding: 8 }}>{log.visitorName ?? '—'}</td>
              <td style={{ padding: 8 }}>{log.vehiclePlate ?? '—'}</td>
              <td style={{ padding: 8 }}>{METHOD_LABEL[log.method]}</td>
              <td style={{ padding: 8 }}>{new Date(log.entryTime).toLocaleString('th-TH')}</td>
              <td style={{ padding: 8 }}>
                {log.exitTime ? new Date(log.exitTime).toLocaleString('th-TH') : 'ยังไม่ยืนยันออก'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {result && result.total > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ก่อนหน้า
          </button>
          <span>
            หน้า {page} / {totalPages} (ทั้งหมด {result.total} รายการ)
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            ถัดไป
          </button>
        </div>
      )}
    </div>
  );
}
