import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { AppUser, House, UserRole } from '../lib/types';

const ROLE_LABEL: Record<UserRole, string> = {
  RESIDENT: 'ลูกบ้าน',
  GUARD: 'รปภ.',
  ADMIN: 'แอดมิน',
};

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

interface UserFormState {
  name: string;
  phone: string;
  role: UserRole;
  houseId: string;
}

const emptyUserForm: UserFormState = { name: '', phone: '', role: 'RESIDENT', houseId: '' };

export function MembersPage() {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [newHouseNo, setNewHouseNo] = useState('');
  const [newHouseZone, setNewHouseZone] = useState('');
  const [houseError, setHouseError] = useState<string | null>(null);
  const [houseLoading, setHouseLoading] = useState(false);

  async function loadUsers(role: UserRole | 'ALL') {
    setListError(null);
    try {
      const query = role === 'ALL' ? '' : `?role=${role}`;
      const data = await api.get<AppUser[]>(`/users${query}`);
      setUsers(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'โหลดรายชื่อสมาชิกไม่สำเร็จ');
    }
  }

  async function loadHouses() {
    try {
      const data = await api.get<House[]>('/houses');
      setHouses(data);
    } catch {
      setHouses([]);
    }
  }

  useEffect(() => {
    loadUsers(roleFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  useEffect(() => {
    loadHouses();
  }, []);

  function startEdit(u: AppUser) {
    setEditingUserId(u.id);
    setUserForm({ name: u.name, phone: u.phone, role: u.role, houseId: u.houseId ?? '' });
    setUserError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingUserId(null);
    setUserForm(emptyUserForm);
    setUserError(null);
  }

  async function submitUser(e: FormEvent) {
    e.preventDefault();
    setUserError(null);

    if (!userForm.name.trim()) {
      setUserError('กรุณากรอกชื่อ');
      return;
    }
    if (!editingUserId && !/^0\d{9}$/.test(userForm.phone)) {
      setUserError('กรุณากรอกเบอร์โทรศัพท์ 10 หลัก ขึ้นต้นด้วย 0');
      return;
    }

    setLoading(true);
    try {
      if (editingUserId) {
        await api.patch(`/users/${editingUserId}`, {
          name: userForm.name.trim(),
          role: userForm.role,
          houseId: userForm.houseId || NIL_UUID,
        });
      } else {
        await api.post('/users', {
          name: userForm.name.trim(),
          phone: userForm.phone.trim(),
          role: userForm.role,
          ...(userForm.houseId ? { houseId: userForm.houseId } : {}),
        });
      }
      cancelEdit();
      await loadUsers(roleFilter);
    } catch (err) {
      setUserError(err instanceof ApiError ? err.message : 'บันทึกข้อมูลสมาชิกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function removeUser(id: string) {
    if (!window.confirm('ยืนยันลบสมาชิกนี้?')) return;
    try {
      await api.delete(`/users/${id}`);
      await loadUsers(roleFilter);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'ลบสมาชิกไม่สำเร็จ');
    }
  }

  async function submitHouse(e: FormEvent) {
    e.preventDefault();
    setHouseError(null);
    if (!newHouseNo.trim()) {
      setHouseError('กรุณากรอกเลขที่บ้าน');
      return;
    }
    setHouseLoading(true);
    try {
      await api.post('/houses', { houseNo: newHouseNo.trim(), ...(newHouseZone.trim() ? { zone: newHouseZone.trim() } : {}) });
      setNewHouseNo('');
      setNewHouseZone('');
      await loadHouses();
    } catch (err) {
      setHouseError(err instanceof ApiError ? err.message : 'เพิ่มบ้านไม่สำเร็จ');
    } finally {
      setHouseLoading(false);
    }
  }

  function houseLabel(id: string | null): string {
    if (!id) return '—';
    const house = houses.find((h) => h.id === id);
    return house ? `${house.houseNo}${house.zone ? ` (โซน ${house.zone})` : ''}` : id;
  }

  return (
    <div>
      <h1>จัดการสมาชิก/บ้าน</h1>

      <section style={{ marginBottom: 32 }}>
        <h2>บ้าน</h2>
        <form onSubmit={submitHouse} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
          <label>
            เลขที่บ้าน
            <input
              type="text"
              value={newHouseNo}
              onChange={(e) => setNewHouseNo(e.target.value)}
              style={{ display: 'block', padding: 6 }}
            />
          </label>
          <label>
            โซน (ถ้ามี)
            <input
              type="text"
              value={newHouseZone}
              onChange={(e) => setNewHouseZone(e.target.value)}
              style={{ display: 'block', padding: 6 }}
            />
          </label>
          <button type="submit" disabled={houseLoading}>
            {houseLoading ? 'กำลังเพิ่ม...' : 'เพิ่มบ้าน'}
          </button>
        </form>
        {houseError && <p style={{ color: 'crimson' }}>{houseError}</p>}
        <ul>
          {houses.map((h) => (
            <li key={h.id}>
              {h.houseNo} {h.zone ? `(โซน ${h.zone})` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>สมาชิก</h2>
        <form onSubmit={submitUser} style={{ border: '1px solid #ddd', padding: 16, marginBottom: 20, maxWidth: 480 }}>
          <h3 style={{ marginTop: 0 }}>{editingUserId ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิกใหม่'}</h3>

          <label style={{ display: 'block', marginBottom: 10 }}>
            ชื่อ
            <input
              type="text"
              value={userForm.name}
              onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
              style={{ display: 'block', width: '100%', padding: 6 }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 10 }}>
            เบอร์โทรศัพท์
            <input
              type="tel"
              value={userForm.phone}
              disabled={Boolean(editingUserId)}
              onChange={(e) => setUserForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="0811111111"
              style={{ display: 'block', width: '100%', padding: 6 }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 10 }}>
            บทบาท
            <select
              value={userForm.role}
              onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              style={{ display: 'block', width: '100%', padding: 6 }}
            >
              {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: 10 }}>
            บ้านเลขที่
            <select
              value={userForm.houseId}
              onChange={(e) => setUserForm((f) => ({ ...f, houseId: e.target.value }))}
              style={{ display: 'block', width: '100%', padding: 6 }}
            >
              <option value="">— ไม่ผูกบ้าน —</option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.houseNo} {h.zone ? `(โซน ${h.zone})` : ''}
                </option>
              ))}
            </select>
          </label>

          {userError && <p style={{ color: 'crimson' }}>{userError}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={loading}>
              {loading ? 'กำลังบันทึก...' : editingUserId ? 'บันทึกการแก้ไข' : 'เพิ่มสมาชิก'}
            </button>
            {editingUserId && (
              <button type="button" onClick={cancelEdit}>
                ยกเลิก
              </button>
            )}
          </div>
        </form>

        <label>
          กรองตามบทบาท:{' '}
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | 'ALL')}>
            <option value="ALL">ทั้งหมด</option>
            {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>

        {listError && <p style={{ color: 'crimson' }}>{listError}</p>}
        {users === null && !listError && <p>กำลังโหลด...</p>}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: 8 }}>ชื่อ</th>
              <th style={{ padding: 8 }}>เบอร์โทร</th>
              <th style={{ padding: 8 }}>บทบาท</th>
              <th style={{ padding: 8 }}>บ้าน</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{u.name}</td>
                <td style={{ padding: 8 }}>{u.phone}</td>
                <td style={{ padding: 8 }}>{ROLE_LABEL[u.role]}</td>
                <td style={{ padding: 8 }}>{houseLabel(u.houseId)}</td>
                <td style={{ padding: 8, display: 'flex', gap: 8 }}>
                  <button onClick={() => startEdit(u)}>แก้ไข</button>
                  <button onClick={() => removeUser(u.id)}>ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
