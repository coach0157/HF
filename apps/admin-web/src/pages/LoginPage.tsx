import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { setSession } from '../lib/auth';
import type { AppUser } from '../lib/types';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AppUser;
}

const PHONE_PATTERN = /^0\d{9}$/;

export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PHONE_PATTERN.test(phone)) {
      setError('กรุณากรอกเบอร์โทรศัพท์ 10 หลัก ขึ้นต้นด้วย 0');
      return;
    }
    setLoading(true);
    try {
      await api.post<void>('/auth/otp/request', { phone });
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ขอ OTP ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }

  async function submitLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp)) {
      setError('กรุณากรอกรหัส OTP 6 หลัก');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/auth/login', { phone, otp });
      if (res.user.role !== 'ADMIN') {
        setError(
          'บัญชีนี้ไม่ใช่บัญชีแอดมิน — แดชบอร์ดนี้ใช้ได้เฉพาะแอดมินเท่านั้น (ลูกบ้าน/รปภ. กรุณาใช้แอปมือถือ)',
        );
        return;
      }
      setSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        role: 'ADMIN',
        villageId: res.user.villageId,
        userId: res.user.id,
        name: res.user.name,
        phone: res.user.phone,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>เข้าสู่ระบบ (Admin)</h1>

      {step === 'phone' && (
        <form onSubmit={requestOtp}>
          <label>
            เบอร์โทรศัพท์
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.trim())}
              placeholder="0800000000"
              maxLength={10}
              style={{ display: 'block', width: '100%', margin: '4px 0 12px', padding: 8 }}
              autoFocus
            />
          </label>
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
            {loading ? 'กำลังส่ง OTP...' : 'ขอรหัส OTP'}
          </button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={submitLogin}>
          <p>
            ส่งรหัส OTP ไปยัง {phone} แล้ว (ระบบ dev นี้พิมพ์รหัสไว้ใน console log ของ backend)
          </p>
          <label>
            รหัส OTP (6 หลัก)
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.trim())}
              placeholder="000000"
              maxLength={6}
              style={{ display: 'block', width: '100%', margin: '4px 0 12px', padding: 8 }}
              autoFocus
            />
          </label>
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setOtp('');
              setError(null);
            }}
            style={{ width: '100%', padding: 10, marginTop: 8 }}
          >
            เปลี่ยนเบอร์โทรศัพท์
          </button>
        </form>
      )}
    </div>
  );
}
