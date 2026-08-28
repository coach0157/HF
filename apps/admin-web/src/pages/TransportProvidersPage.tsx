import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { TransportProvider, TransportProviderType } from '../lib/types';

// Epic 10 — Transport Directory (spec 2.7 / docs/PHASE2_BACKLOG.md Epic 10).
// Admin-only CRUD screen: "แอดมินเพิ่ม/แก้ไข/ลบ/เปิด-ปิดการแสดงผล
// รายชื่อผู้ให้บริการรถรับจ้าง". Pattern follows MembersPage.tsx/
// AnnouncementsPage.tsx (inline-styled form + table, no UI library).

const TYPE_LABEL: Record<TransportProviderType, string> = {
  MOTORCYCLE: 'วินมอเตอร์ไซค์',
  TAXI: 'แท็กซี่',
  VAN: 'รถตู้',
  OTHER: 'อื่นๆ',
};

interface FormState {
  name: string;
  type: TransportProviderType;
  phone: string;
  serviceArea: string;
}

const emptyForm: FormState = { name: '', type: 'MOTORCYCLE', phone: '', serviceArea: '' };

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
      <h1>ทำเนียบรถรับจ้าง / เรียกรถโดยสาร</h1>

      <form onSubmit={handleSubmit} style={{ border: '1px solid #ddd', padding: 16, marginBottom: 24, maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>{editingId ? 'แก้ไขผู้ให้บริการ' : 'เพิ่มผู้ให้บริการใหม่'}</h2>

        <label style={{ display: 'block', marginBottom: 10 }}>
          ชื่อ/ชื่อเล่นคนขับ
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={{ display: 'block', width: '100%', padding: 6 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 10 }}>
          ประเภท
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TransportProviderType }))}
            style={{ display: 'block', width: '100%', padding: 6 }}
          >
            {(Object.keys(TYPE_LABEL) as TransportProviderType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: 10 }}>
          เบอร์โทรศัพท์
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="0811111111"
            style={{ display: 'block', width: '100%', padding: 6 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 10 }}>
          พื้นที่ให้บริการ/หมายเหตุ (เช่น ราคาโดยประมาณ)
          <input
            type="text"
            value={form.serviceArea}
            onChange={(e) => setForm((f) => ({ ...f, serviceArea: e.target.value }))}
            style={{ display: 'block', width: '100%', padding: 6 }}
          />
        </label>

        {error && <p style={{ color: 'crimson' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={loading}>
            {loading ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ให้บริการ'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit}>
              ยกเลิก
            </button>
          )}
        </div>
      </form>

      <label>
        กรองตามประเภท:{' '}
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TransportProviderType | 'ALL')}>
          <option value="ALL">ทั้งหมด</option>
          {(Object.keys(TYPE_LABEL) as TransportProviderType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      {listError && <p style={{ color: 'crimson' }}>{listError}</p>}
      {providers === null && !listError && <p>กำลังโหลด...</p>}
      {providers !== null && providers.length === 0 && <p>ยังไม่มีผู้ให้บริการ</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
            <th style={{ padding: 8 }}>ชื่อ</th>
            <th style={{ padding: 8 }}>ประเภท</th>
            <th style={{ padding: 8 }}>เบอร์โทร</th>
            <th style={{ padding: 8 }}>พื้นที่/หมายเหตุ</th>
            <th style={{ padding: 8 }}>สถานะ</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {providers?.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid #eee', opacity: p.isActive ? 1 : 0.55 }}>
              <td style={{ padding: 8 }}>{p.name}</td>
              <td style={{ padding: 8 }}>{TYPE_LABEL[p.type]}</td>
              <td style={{ padding: 8 }}>{p.phone}</td>
              <td style={{ padding: 8 }}>{p.serviceArea ?? '—'}</td>
              <td style={{ padding: 8 }}>{p.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</td>
              <td style={{ padding: 8, display: 'flex', gap: 8 }}>
                <button onClick={() => startEdit(p)}>แก้ไข</button>
                <button onClick={() => toggleActive(p)}>{p.isActive ? 'ปิดการแสดงผล' : 'เปิดการแสดงผล'}</button>
                <button onClick={() => handleDelete(p.id)}>ลบ</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
