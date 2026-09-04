import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { BlockedVisitor } from '../lib/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { colors, radius, spacing } from '../theme';

// Blocklist add-on (user request, not in original spec — see
// docs/PHASE2_BACKLOG.md §6 (Epic 13)). Admin-only: add/remove entries. Checked
// server-side (blocked-visitor.service.ts's assertNotBlocked()) before a
// resident can create a VisitorPass QR and before a guard can record a
// QR-scan or manual entry — see visitor-pass.service.ts / entry-log.service.ts.
// Deliberately no edit action (delete + re-add is simpler for a 3-field row).

interface FormState {
  phone: string;
  vehiclePlate: string;
  reason: string;
}

const emptyForm: FormState = { phone: '', vehiclePlate: '', reason: '' };

const labelStyle = { display: 'block', marginBottom: spacing.md, fontSize: 14, color: colors.textPrimary };
const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: spacing.xs,
  padding: spacing.sm,
  borderRadius: radius.input,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
  boxSizing: 'border-box' as const,
  fontFamily: 'inherit',
};
const thStyle = { padding: spacing.sm, fontSize: 13, color: colors.textSecondary };
const tdStyle = { padding: spacing.sm, fontSize: 14, color: colors.textPrimary };

export function BlockedVisitorsPage() {
  const [entries, setEntries] = useState<BlockedVisitor[] | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function loadEntries() {
    setListError(null);
    try {
      const data = await api.get<BlockedVisitor[]>('/blocked-visitors');
      setEntries(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'โหลดบล็อกลิสต์ไม่สำเร็จ');
    }
  }

  useEffect(() => {
    loadEntries();
  }, []);

  function cancelForm() {
    setForm(emptyForm);
    setError(null);
    setShowForm(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.phone.trim() && !form.vehiclePlate.trim()) {
      setError('กรุณากรอกเบอร์โทรหรือทะเบียนรถอย่างน้อย 1 อย่าง');
      return;
    }
    if (form.phone.trim() && !/^0\d{9}$/.test(form.phone.trim())) {
      setError('กรุณากรอกเบอร์โทรศัพท์ 10 หลัก ขึ้นต้นด้วย 0');
      return;
    }

    const payload = {
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.vehiclePlate.trim() ? { vehiclePlate: form.vehiclePlate.trim() } : {}),
      ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
    };

    setLoading(true);
    try {
      await api.post('/blocked-visitors', payload);
      cancelForm();
      await loadEntries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('ยืนยันลบออกจากบล็อกลิสต์? (การลบไม่สามารถย้อนกลับได้)')) return;
    try {
      await api.delete(`/blocked-visitors/${id}`);
      await loadEntries();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ color: colors.textPrimary, margin: 0 }}>บล็อกลิสต์</h1>
          <p style={{ color: colors.textSecondary, fontSize: 14, marginTop: spacing.xs }}>
            เบอร์โทร/ทะเบียนรถที่อยู่ในรายการนี้จะสร้าง QR เชิญแขกไม่ได้ และยามบันทึกเข้าไม่ได้ (ทั้งสแกน QR และบันทึกด้วยมือ)
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <span aria-hidden>＋</span> เพิ่มรายการบล็อก
          </Button>
        )}
      </div>

      {showForm && (
        <Card style={{ marginTop: spacing.lg, marginBottom: spacing.xl, maxWidth: 480 }}>
          <form onSubmit={handleSubmit}>
            <h2 style={{ marginTop: 0, fontSize: 18, color: colors.textPrimary }}>เพิ่มรายการบล็อก</h2>

            <label style={labelStyle}>
              เบอร์โทรศัพท์
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="0812345678"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              ทะเบียนรถ
              <input
                type="text"
                value={form.vehiclePlate}
                onChange={(e) => setForm((f) => ({ ...f, vehiclePlate: e.target.value }))}
                placeholder="กข 1234"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              เหตุผล (ถ้ามี)
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="เช่น ก่อเหตุรบกวนลูกบ้าน"
                style={inputStyle}
              />
            </label>

            {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

            <div style={{ display: 'flex', gap: spacing.sm }}>
              <Button type="submit" loading={loading} loadingText="กำลังบันทึก...">
                เพิ่มรายการบล็อก
              </Button>
              <Button type="button" variant="secondary" onClick={cancelForm}>
                ยกเลิก
              </Button>
            </div>
          </form>
        </Card>
      )}

      {listError && <p style={{ color: colors.danger }}>{listError}</p>}
      {entries === null && !listError && <p style={{ color: colors.textSecondary }}>กำลังโหลด...</p>}
      {entries !== null && entries.length === 0 && <p style={{ color: colors.textSecondary }}>ยังไม่มีรายการบล็อก</p>}

      <Card style={{ marginTop: spacing.md, padding: 0, overflowX: 'auto' as const }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `2px solid ${colors.border}`, background: colors.primaryLight }}>
              <th style={thStyle}>เบอร์โทร</th>
              <th style={thStyle}>ทะเบียนรถ</th>
              <th style={thStyle}>เหตุผล</th>
              <th style={thStyle}>เพิ่มเมื่อ</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((e) => (
              <tr key={e.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td style={tdStyle}>{e.phone ?? '—'}</td>
                <td style={tdStyle}>{e.vehiclePlate ?? '—'}</td>
                <td style={tdStyle}>{e.reason ?? '—'}</td>
                <td style={tdStyle}>{new Date(e.createdAt).toLocaleDateString('th-TH')}</td>
                <td style={tdStyle}>
                  <Button variant="danger" onClick={() => handleDelete(e.id)}>
                    ลบ
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
