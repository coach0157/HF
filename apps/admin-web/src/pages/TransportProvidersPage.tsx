import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { TransportProvider, TransportProviderType } from '../lib/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import type { BadgeVariant } from '../components/Badge';
import { colors, radius, spacing } from '../theme';

// Epic 10 — Transport Directory (spec 2.7 / docs/PHASE2_BACKLOG.md Epic 10).
// Admin-only CRUD screen: "แอดมินเพิ่ม/แก้ไข/ลบ/เปิด-ปิดการแสดงผล
// รายชื่อผู้ให้บริการรถรับจ้าง". Pattern follows MembersPage.tsx/
// AnnouncementsPage.tsx (styled form + table via shared Button/Card/Badge).

const TYPE_LABEL: Record<TransportProviderType, string> = {
  MOTORCYCLE: 'วินมอเตอร์ไซค์',
  TAXI: 'แท็กซี่',
  VAN: 'รถตู้',
  OTHER: 'อื่นๆ',
};

const TYPE_BADGE_VARIANT: Record<TransportProviderType, BadgeVariant> = {
  MOTORCYCLE: 'info',
  TAXI: 'warning',
  VAN: 'success',
  OTHER: 'neutral',
};

interface FormState {
  name: string;
  type: TransportProviderType;
  phone: string;
  serviceArea: string;
}

const emptyForm: FormState = { name: '', type: 'MOTORCYCLE', phone: '', serviceArea: '' };

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

export function TransportProvidersPage() {
  const [providers, setProviders] = useState<TransportProvider[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<TransportProviderType | 'ALL'>('ALL');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function loadProviders(type: TransportProviderType | 'ALL') {
    setListError(null);
    try {
      // No `?active=` — admin's GET /transport-providers always returns every
      // row (active + inactive) per transport-provider.service.ts's list().
      const query = type === 'ALL' ? '' : `?type=${type}`;
      const data = await api.get<TransportProvider[]>(`/transport-providers${query}`);
      setProviders(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'โหลดทำเนียบรถรับจ้างไม่สำเร็จ');
    }
  }

  useEffect(() => {
    loadProviders(typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  function startEdit(p: TransportProvider) {
    setEditingId(p.id);
    setForm({ name: p.name, type: p.type, phone: p.phone, serviceArea: p.serviceArea ?? '' });
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('กรุณากรอกชื่อ/ชื่อเล่นคนขับ');
      return;
    }
    if (!/^0\d{9}$/.test(form.phone)) {
      setError('กรุณากรอกเบอร์โทรศัพท์ 10 หลัก ขึ้นต้นด้วย 0');
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      phone: form.phone.trim(),
      ...(form.serviceArea.trim() ? { serviceArea: form.serviceArea.trim() } : {}),
    };

    setLoading(true);
    try {
      if (editingId) {
        await api.patch(`/transport-providers/${editingId}`, payload);
      } else {
        await api.post('/transport-providers', payload);
      }
      cancelEdit();
      await loadProviders(typeFilter);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(p: TransportProvider) {
    try {
      await api.patch(`/transport-providers/${p.id}`, { isActive: !p.isActive });
      await loadProviders(typeFilter);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'เปลี่ยนสถานะการแสดงผลไม่สำเร็จ');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('ยืนยันลบผู้ให้บริการรายนี้? (การลบไม่สามารถย้อนกลับได้)')) return;
    try {
      await api.delete(`/transport-providers/${id}`);
      await loadProviders(typeFilter);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ');
    }
  }

  return (
    <div>
      <h1 style={{ color: colors.textPrimary }}>ทำเนียบรถรับจ้าง / เรียกรถโดยสาร</h1>

      <Card style={{ marginBottom: spacing.xl, maxWidth: 480 }}>
        <form onSubmit={handleSubmit}>
          <h2 style={{ marginTop: 0, fontSize: 18, color: colors.textPrimary }}>
            {editingId ? 'แก้ไขผู้ให้บริการ' : 'เพิ่มผู้ให้บริการใหม่'}
          </h2>

          <label style={labelStyle}>
            ชื่อ/ชื่อเล่นคนขับ
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            ประเภท
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TransportProviderType }))}
              style={inputStyle}
            >
              {(Object.keys(TYPE_LABEL) as TransportProviderType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            เบอร์โทรศัพท์
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="0811111111"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            พื้นที่ให้บริการ/หมายเหตุ (เช่น ราคาโดยประมาณ)
            <input
              type="text"
              value={form.serviceArea}
              onChange={(e) => setForm((f) => ({ ...f, serviceArea: e.target.value }))}
              style={inputStyle}
            />
          </label>

          {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

          <div style={{ display: 'flex', gap: spacing.sm }}>
            <Button type="submit" loading={loading} loadingText="กำลังบันทึก...">
              {editingId ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ให้บริการ'}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                ยกเลิก
              </Button>
            )}
          </div>
        </form>
      </Card>

      <label style={{ fontSize: 14, color: colors.textPrimary }}>
        กรองตามประเภท:{' '}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TransportProviderType | 'ALL')}
          style={{ padding: spacing.xs, borderRadius: radius.input, border: `1px solid ${colors.border}` }}
        >
          <option value="ALL">ทั้งหมด</option>
          {(Object.keys(TYPE_LABEL) as TransportProviderType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      {listError && <p style={{ color: colors.danger }}>{listError}</p>}
      {providers === null && !listError && <p style={{ color: colors.textSecondary }}>กำลังโหลด...</p>}
      {providers !== null && providers.length === 0 && <p style={{ color: colors.textSecondary }}>ยังไม่มีผู้ให้บริการ</p>}

      <Card style={{ marginTop: spacing.md, padding: 0, overflowX: 'auto' as const }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `2px solid ${colors.border}` }}>
              <th style={thStyle}>ชื่อ</th>
              <th style={thStyle}>ประเภท</th>
              <th style={thStyle}>เบอร์โทร</th>
              <th style={thStyle}>พื้นที่/หมายเหตุ</th>
              <th style={thStyle}>สถานะ</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {providers?.map((p) => (
              <tr key={p.id} style={{ borderBottom: `1px solid ${colors.border}`, opacity: p.isActive ? 1 : 0.55 }}>
                <td style={tdStyle}>{p.name}</td>
                <td style={tdStyle}>
                  <Badge variant={TYPE_BADGE_VARIANT[p.type]}>{TYPE_LABEL[p.type]}</Badge>
                </td>
                <td style={tdStyle}>{p.phone}</td>
                <td style={tdStyle}>{p.serviceArea ?? '—'}</td>
                <td style={tdStyle}>
                  <Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</Badge>
                </td>
                <td style={{ ...tdStyle, display: 'flex', gap: spacing.sm, flexWrap: 'wrap' as const }}>
                  <Button variant="secondary" onClick={() => startEdit(p)}>
                    แก้ไข
                  </Button>
                  <Button variant="secondary" onClick={() => toggleActive(p)}>
                    {p.isActive ? 'ปิดการแสดงผล' : 'เปิดการแสดงผล'}
                  </Button>
                  <Button variant="danger" onClick={() => handleDelete(p.id)}>
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
