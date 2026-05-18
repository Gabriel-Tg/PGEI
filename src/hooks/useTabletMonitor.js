import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { machineToTabletCode, normalizeTabletCode } from '../lib/tabletCode';

const HEARTBEAT_INTERVAL_MS = 30000;

function buildFallbackDeviceId() {
  return `tb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateDeviceId(machineId) {
  if (!machineId) return '';
  const key = `tablet-device-id-${String(machineId).toUpperCase()}`;
  try {
    const saved = window.localStorage.getItem(key);
    if (saved) return saved;
    const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : buildFallbackDeviceId();
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return buildFallbackDeviceId();
  }
}

async function readBatteryState() {
  try {
    if (!navigator || typeof navigator.getBattery !== 'function') {
      return { batteryLevel: null, isCharging: null };
    }
    const battery = await navigator.getBattery();
    const level = Number.isFinite(battery?.level) ? Math.round(Number(battery.level) * 100) : null;
    const charging = typeof battery?.charging === 'boolean' ? battery.charging : null;
    return { batteryLevel: level, isCharging: charging };
  } catch {
    return { batteryLevel: null, isCharging: null };
  }
}

export default function useTabletMonitor({ machineId, operatorName }) {
  const [deviceId, setDeviceId] = useState('');
  const [isActivated, setIsActivated] = useState(false);
  const [savedActivationCode, setSavedActivationCode] = useState('');
  const lastBeepAtRef = useRef(null);
  const operatorNameRef = useRef('');

  const expectedCode = useMemo(() => machineToTabletCode(machineId), [machineId]);

  const appCommit = useMemo(() => {
    const commit = import.meta.env.VITE_APP_COMMIT || import.meta.env.VERCEL_GIT_COMMIT_SHA || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA;
    if (!commit) return 'dev-local';
    return String(commit).slice(0, 12);
  }, []);

  useEffect(() => {
    operatorNameRef.current = String(operatorName || '').trim();
  }, [operatorName]);

  useEffect(() => {
    if (typeof window === 'undefined' || !machineId) {
      setDeviceId('');
      setIsActivated(false);
      setSavedActivationCode('');
      return;
    }

    const activationKey = `tablet-activation-code-${String(machineId).toUpperCase()}`;
    try {
      const storedCode = normalizeTabletCode(window.localStorage.getItem(activationKey));
      const expected = normalizeTabletCode(expectedCode);
      const activated = Boolean(storedCode) && storedCode === expected;
      setSavedActivationCode(storedCode || '');
      setIsActivated(activated);
    } catch {
      setSavedActivationCode('');
      setIsActivated(false);
    }

    const resolved = getOrCreateDeviceId(machineId);
    setDeviceId(resolved);
  }, [expectedCode, machineId]);

  const activateDevice = useCallback((inputCode) => {
    if (!machineId) return { ok: false, message: 'Máquina inválida.' };

    const typed = normalizeTabletCode(inputCode);
    const expected = normalizeTabletCode(expectedCode);
    if (!typed) return { ok: false, message: 'Informe o código do tablet.' };
    if (typed !== expected) return { ok: false, message: 'Código inválido para esta máquina.' };

    const activationKey = `tablet-activation-code-${String(machineId).toUpperCase()}`;
    try {
      window.localStorage.setItem(activationKey, typed);
    } catch {
      return { ok: false, message: 'Não foi possível salvar a ativação neste dispositivo.' };
    }

    setSavedActivationCode(typed);
    setIsActivated(true);
    return { ok: true, message: 'Tablet ativado com sucesso.' };
  }, [expectedCode, machineId]);

  const deactivateDevice = useCallback(async () => {
    if (!machineId) return { ok: false, message: 'Máquina inválida.' };

    const activationKey = `tablet-activation-code-${String(machineId).toUpperCase()}`;
    try {
      window.localStorage.removeItem(activationKey);
    } catch {
      return { ok: false, message: 'Não foi possível desativar neste dispositivo.' };
    }

    const nowIso = new Date().toISOString();
    const payload = {
      machine_id: String(machineId).toUpperCase(),
      device_id: deviceId || getOrCreateDeviceId(machineId),
      route_path: typeof window !== 'undefined' ? window.location.pathname : null,
      last_seen_at: nowIso,
      last_beep_at: lastBeepAtRef.current,
      operator_name: operatorNameRef.current || null,
      battery_level: null,
      is_charging: null,
      is_online: false,
      app_commit: appCommit,
    };

    try {
      await supabase.from('tablet_status').upsert(payload, { onConflict: 'machine_id' });
    } catch {
      // sem bloqueio para desativação local
    }

    setSavedActivationCode('');
    setIsActivated(false);
    return { ok: true, message: 'Tablet desativado.' };
  }, [appCommit, deviceId, machineId]);

  const sendHeartbeat = useCallback(async ({ beepAt = undefined } = {}) => {
    if (!machineId || !deviceId || !isActivated) return;

    const nowIso = new Date().toISOString();
    const { batteryLevel, isCharging } = await readBatteryState();
    const payload = {
      machine_id: String(machineId).toUpperCase(),
      device_id: deviceId,
      route_path: typeof window !== 'undefined' ? window.location.pathname : null,
      last_seen_at: nowIso,
      last_beep_at: beepAt ?? lastBeepAtRef.current,
      operator_name: operatorNameRef.current || null,
      battery_level: batteryLevel,
      is_charging: isCharging,
      is_online: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
      app_commit: appCommit,
    };

    const { error } = await supabase
      .from('tablet_status')
      .upsert(payload, { onConflict: 'machine_id' });

    if (error) {
      console.warn('Falha ao enviar heartbeat do tablet:', error);
    }
  }, [appCommit, deviceId, isActivated, machineId]);

  const markBeep = useCallback(() => {
    const nowIso = new Date().toISOString();
    lastBeepAtRef.current = nowIso;
    sendHeartbeat({ beepAt: nowIso });
  }, [sendHeartbeat]);

  useEffect(() => {
    if (!isActivated || !machineId || !deviceId) return;
    sendHeartbeat();
  }, [deviceId, isActivated, machineId, operatorName, sendHeartbeat]);

  useEffect(() => {
    if (!machineId || !deviceId || !isActivated) return undefined;

    sendHeartbeat();

    const intervalId = window.setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    const onOnline = () => sendHeartbeat();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [deviceId, isActivated, machineId, sendHeartbeat]);

  return {
    deviceId,
    markBeep,
    sendHeartbeat,
    isActivated,
    expectedCode,
    savedActivationCode,
    activateDevice,
    deactivateDevice,
  };
}
