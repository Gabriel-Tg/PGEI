// src/pages/Pet01.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Etiqueta from "../components/Etiqueta";
import FichaTecnicaModal from "../components/FichaTecnicaModal";
import { getTurnoAtual, statusClass } from "../lib/utils";
import { toBrazilTime } from "../lib/timezone";
import { DateTime } from "luxon";
import "../styles/Pet01.css";
import { REFUGO_MOTIVOS, MOTIVOS_PARADA } from "../domain/constants";
import { formatRunningCycleSeconds, getRunningCycleSeconds, runningCycleTone } from "../lib/sensorRuntime";

const AUTO_STOP_CYCLE_MULTIPLIER = 4;

export default function Pet01({
  registroGrupos,
  ativosP1,
  paradas,
  tick,
  onStatusChange,
  setStartModal,
  setStopModal,
  setLowEffModal,
  setLowEffEndModal,
  setResumeModal,
  setFinalizando,
  machineId: machineIdProp,
  machineMeta = null,
  itemTechByCode = {},
  clientId = null,
}) {
  const machineId = String(machineIdProp || "P1").toUpperCase();
  const withClient = (query) => (clientId ? query.eq('company_id', clientId) : query);
  // estados principais
  const [ativa, setAtiva] = useState(null);
  const [proximo, setProximo] = useState(null);
  const [scans, setScans] = useState([]);

  const [refugoForm, setRefugoForm] = useState({ operador: "", turno: "", quantidade: "", motivo: "",});

  const [showRefugo, setShowRefugo] = useState(false);
  const [shiftScrap, setShiftScrap] = useState({ good: 0, scrap: 0, pct: 0, loading: true, shiftKey: "" });
  // responsável do turno (P1)
  const [responsavelTurno, setResponsavelTurno] = useState("");
  const [responsavelModalOpen, setResponsavelModalOpen] = useState(false);
  const [responsavelInput, setResponsavelInput] = useState("");
  const [shiftInfo, setShiftInfo] = useState(null); // { shiftKey, start, end }
  const [responsavelKey, setResponsavelKey] = useState("");
  const [fichaModalOpen, setFichaModalOpen] = useState(false);
  const [autoStopPromptedOrderId, setAutoStopPromptedOrderId] = useState(null);
  const [sensorLastPulseAt, setSensorLastPulseAt] = useState(machineMeta?.sensor_last_pulse_at || null);
  const [sensorOperationMode, setSensorOperationMode] = useState(machineMeta?.sensor_operation_mode || 'automatic');
  const [sensorIgnoreCyclesLeft, setSensorIgnoreCyclesLeft] = useState(Number(machineMeta?.sensor_ignore_pulse_count || 0));
  const [ignoreCountInput, setIgnoreCountInput] = useState('');


  // toast de notificação superior
  const [toast, setToast] = useState({ visible: false, type: "ok", msg: "" });

  // listener de scanner: buffer e timestamps
  const scanBufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const autoStopInFlightRef = useRef(null);

  // turno atual (usado para gravar)
const [currentShift, setCurrentShift] = useState(() => {
  // pega o instante atual e converte para horário de São Paulo antes de decidir o turno
  const nowBr = toBrazilTime(new Date().toISOString());
  return getTurnoAtual(nowBr) ?? "Hora Extra";
});

  // Atualiza ativa/proximo sempre que ativos mudam (somente P1)
  useEffect(() => {
    if (!ativosP1) return;
    setAtiva(ativosP1[0] || null);
    setProximo(ativosP1[1] || null);
  }, [ativosP1]);

  // carrega scans existentes da ordem ativa
  async function loadScans(id) {
    if (!id) {
      setScans([]);
      return;
    }
    const { data } = await withClient(supabase
      .from("production_scans")
      .select("*"))
      .eq("order_id", id)
      .order("scanned_box", { ascending: true });
    setScans(data || []);
  }
  useEffect(() => { if (ativa?.id) loadScans(ativa.id); }, [ativa?.id]);

  const lidas = scans.length;
  const saldo = ativa ? Math.max(0, Number(ativa.boxes) - lidas) : 0;

    // cronômetros
  const paradaAberta = paradas?.find((p) => String(p.order_id) === String(ativa?.id) && !p.resumed_at);
  const stopReason = paradaAberta?.reason || "";
  const tempoParada = useMemo(() => {
    if (!ativa) return null;
    // mantém sua lógica: só mostra se a ordem está em PARADA
    if (ativa.status !== "PARADA") return null;
    // mas usa o timestamp real da parada aberta
    if (!paradaAberta?.started_at) return null;
    const _ = tick;
    const since = new Date(paradaAberta.started_at).getTime();
    const diff = Math.floor((Date.now() - since) / 1000);
    const hh = String(Math.floor(diff / 3600)).padStart(2, "0");
    const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const ss = String(diff % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }, [ativa, paradaAberta, tick]);


  const tempoLow = useMemo(() => {
    if (!ativa) return null;
    if (ativa.status !== "BAIXA_EFICIENCIA") return null;
    if (!ativa.loweff_started_at) return null;
    const _ = tick;
    const diff = Math.floor((Date.now() - new Date(ativa.loweff_started_at).getTime()) / 1000);
    const hh = String(Math.floor(diff / 3600)).padStart(2, "0");
    const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const ss = String(diff % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }, [ativa, tick]);

  // classe local para borda esquerda (verde/vermelho/amarelo)
  const pet01StatusClass = (s) => {
    if (!s) return "status-produzindo";
    const st = String(s).toUpperCase();
    if (st === "PARADA") return "status-parada";
    if (st.includes("BAIXA")) return "status-baixa";
    if (st === "PRODUZINDO" || st === "AGUARDANDO") return "status-produzindo";
    return "status-produzindo";
  };

  // ---------- TOAST helper ----------
  const showToast = useCallback((msg, type = "ok", ms = 2400) => {
    setToast({ visible: true, type, msg });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), ms);
  }, []);

  const formatCycleValue = useCallback((value) => {
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) return '—'
    return `${num.toFixed(3)}s`
  }, [])

  async function updateSensorOperation(mode, cycles = 0) {
    if (!machineMeta?.id) {
      showToast('Máquina não disponível para atualizar modo.', 'err')
      return
    }

    const payload = {
      sensor_operation_mode: mode,
      sensor_ignore_pulse_count: mode === 'semi_automatic' ? Math.max(0, Math.trunc(cycles)) : 0,
    }

    const { error } = await supabase
      .from('machines')
      .update(payload)
      .eq('id', machineMeta.id)

    if (error) {
      console.error('Erro ao atualizar modo do sensor:', error)
      showToast('Falha ao atualizar modo do sensor.', 'err')
      return
    }

    setSensorOperationMode(mode)
    setSensorIgnoreCyclesLeft(payload.sensor_ignore_pulse_count)
    setIgnoreCountInput('')
    showToast('Modo do sensor atualizado.', 'ok')
  }

  const activeItemCode = useMemo(() => String(ativa?.product || '').split('-')[0]?.trim() || '', [ativa?.product])
  const activeItemTech = activeItemCode ? itemTechByCode?.[activeItemCode] : null
  const configuredCycleSeconds = Number(machineMeta?.ciclo_cadastrado_seconds || activeItemTech?.cycleSeconds || 0) || null
  const runningCycleSeconds = getRunningCycleSeconds(sensorLastPulseAt, Date.now())
  const runningCycleClass = runningCycleTone(runningCycleSeconds, configuredCycleSeconds)

  const getSensorAutoStopTimestamp = useCallback(() => {
    const backendAutoStopAt = String(machineMeta?.sensor_auto_stop_at || '').trim()
    if (backendAutoStopAt) {
      const parsed = DateTime.fromISO(backendAutoStopAt, { zone: 'utc' })
      if (parsed.isValid) return parsed
    }

    const baseCycleSeconds = Number(configuredCycleSeconds || 0)
    if (!(baseCycleSeconds > 0) || !sensorLastPulseAt) return null

    const lastPulse = DateTime.fromISO(sensorLastPulseAt, { zone: 'utc' })
    if (!lastPulse.isValid) return null

    return lastPulse.plus({ seconds: baseCycleSeconds * AUTO_STOP_CYCLE_MULTIPLIER })
  }, [configuredCycleSeconds, machineMeta?.sensor_auto_stop_at, sensorLastPulseAt])

  useEffect(() => {
    setSensorLastPulseAt(machineMeta?.sensor_last_pulse_at || null)
    setSensorOperationMode(machineMeta?.sensor_operation_mode || 'automatic')
    setSensorIgnoreCyclesLeft(Number(machineMeta?.sensor_ignore_pulse_count || 0))
    setIgnoreCountInput('')
  }, [machineMeta?.sensor_last_pulse_at, machineMeta?.sensor_operation_mode, machineMeta?.sensor_ignore_pulse_count])

  useEffect(() => {
    if (!clientId || !machineId || machineMeta?.apontamento_tipo !== 'sensor') return undefined

    const channel = supabase
      .channel(`pet01-sensor-cycle-${clientId}-${machineId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'machine_sensor_events' },
        (payload) => {
          const row = payload?.new
          if (!row) return
          if (String(row.company_id || '') !== String(clientId)) return
          if (String(row.machine_id || '').toUpperCase() !== machineId) return
          setSensorLastPulseAt(row.created_at || new Date().toISOString())
        }
      )
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch (err) {
        console.warn('Falha ao remover canal de ciclo real PET-01:', err)
      }
    }
  }, [clientId, machineId, machineMeta?.apontamento_tipo])

  useEffect(() => {
    if (!ativa || !machineMeta || !onStatusChange) {
      setAutoStopPromptedOrderId(null)
      autoStopInFlightRef.current = null
      return
    }

    const autoStopTimestamp = getSensorAutoStopTimestamp()
    const sensorAutoStopped = Boolean(machineMeta.sensor_auto_stopped)
      || Boolean(autoStopTimestamp?.isValid && DateTime.now().toMillis() >= autoStopTimestamp.toMillis())
    const activeStatus = String(ativa.status || '').toUpperCase()
    const isProducing = activeStatus === 'PRODUZINDO' || activeStatus === 'BAIXA_EFICIENCIA'

    if (!sensorAutoStopped || !isProducing) {
      setAutoStopPromptedOrderId(null)
      autoStopInFlightRef.current = null
      return
    }
    if (autoStopPromptedOrderId === ativa.id) return
    if (autoStopInFlightRef.current === ativa.id) return

    const stopAt = autoStopTimestamp?.isValid
      ? autoStopTimestamp.setZone('America/Sao_Paulo')
      : DateTime.now().setZone('America/Sao_Paulo')

    const timestamp = stopAt.isValid ? stopAt : DateTime.now().setZone('America/Sao_Paulo')

    async function confirmSensorStop() {
      autoStopInFlightRef.current = ativa.id
      const statusResult = await onStatusChange(ativa, 'PARADA', { autoStop: true })
      const modalPayload = {
        ordem: ativa,
        operador: '',
        motivo: MOTIVOS_PARADA[0],
        obs: 'Parada detectada automaticamente pelo sensor. Registre o motivo da parada.',
        data: timestamp.toISODate(),
        hora: timestamp.toFormat('HH:mm'),
        autoStop: true,
      }

      if (statusResult?.action === 'openStopModal' || statusResult?.action === 'statusSet') {
        setStopModal(modalPayload)
        setAutoStopPromptedOrderId(ativa.id)
        showToast('Parada detectada pelo sensor. Complete o motivo no modal.', 'ok', 4200)
      }
    }

    confirmSensorStop().catch((err) => {
      autoStopInFlightRef.current = null
      console.error('Erro ao registrar parada automática do sensor:', err)
      showToast('Falha ao abrir parada automática do sensor.', 'err', 4200)
    })
  }, [ativa, machineMeta, onStatusChange, setStopModal, autoStopPromptedOrderId, showToast, getSensorAutoStopTimestamp, tick])

  const formatInt = useCallback((n) => {
    const num = Number(n) || 0;
    return num.toLocaleString("pt-BR");
  }, []);

  const parsePiecesPerBox = useCallback((val) => {
    if (val == null) return 0;
    const digitsOnly = String(val).replace(/[^0-9]/g, "");
    if (!digitsOnly) return 0;
    return parseInt(digitsOnly, 10);
  }, []);

  // Resolve janelas de turno considerando o dia e cruzamento de meia-noite
  const buildShiftIntervals = useCallback((nowBr, dayOffset = 0) => {
    const jsDay = (nowBr.weekday % 7 + dayOffset + 7) % 7; // 0 = domingo
    const base = nowBr.plus({ days: dayOffset }).startOf("day");
    const intervals = [];
    const pushInterval = (hIni, mIni, hFim, mFim, shiftKey) => {
      let start = base.set({ hour: hIni, minute: mIni, second: 0, millisecond: 0 });
      let end = base.set({ hour: hFim, minute: mFim, second: 0, millisecond: 0 });
      if (end <= start) end = end.plus({ days: 1 });
      intervals.push({ shiftKey, start, end });
    };

    if (jsDay >= 1 && jsDay <= 5) { // segunda a sexta
      pushInterval(5, 15, 13, 45, "1");
      pushInterval(13, 45, 22, 15, "2");
      pushInterval(22, 15, 5, 15, "3");
    } else if (jsDay === 6) { // sábado
      pushInterval(5, 15, 9, 15, "1");
      pushInterval(9, 15, 13, 15, "2");
    } else if (jsDay === 0) { // domingo
      pushInterval(23, 15, 5, 15, "3");
    }

    return intervals;
  }, []);

  const resolveCurrentShiftWindow = useCallback(() => {
    const nowBr = DateTime.now().setZone("America/Sao_Paulo");
    const intervals = [...buildShiftIntervals(nowBr, -1), ...buildShiftIntervals(nowBr, 0)];
    const match = intervals.find((it) => nowBr >= it.start && nowBr < it.end);
    if (!match) return null;
    return { shiftKey: match.shiftKey, start: match.start, end: match.end };
  }, [buildShiftIntervals]);

  const fetchRefugoTurno = useCallback(async () => {
    const windowInfo = resolveCurrentShiftWindow();
    if (!windowInfo) {
      setShiftScrap({ good: 0, scrap: 0, pct: 0, loading: false, shiftKey: "" });
      return;
    }

    const startIso = windowInfo.start.toUTC().toISO();
    const endIso = windowInfo.end.toUTC().toISO();
    setShiftScrap((prev) => ({ ...prev, loading: true, shiftKey: windowInfo.shiftKey }));

    try {
      const [bipRes, scrapRes, manualRes] = await Promise.all([
        withClient(supabase
          .from("production_scans")
          .select("order_id, machine_id, created_at")
          .eq("machine_id", machineId)
          .gte("created_at", startIso)
          .lt("created_at", endIso)),
        withClient(supabase
          .from("scrap_logs")
          .select("order_id, qty, machine_id, created_at")
          .eq("machine_id", machineId)
          .gte("created_at", startIso)
          .lt("created_at", endIso)),
        withClient(supabase
          .from("injection_production_entries")
          .select("order_id, good_qty, machine_id, created_at")
          .eq("machine_id", machineId)
          .gte("created_at", startIso)
          .lt("created_at", endIso)),
      ]);

      if (bipRes.error) throw bipRes.error;
      if (scrapRes.error) throw scrapRes.error;
      if (manualRes.error) throw manualRes.error;

      const scans = bipRes.data || [];
      const scraps = scrapRes.data || [];
      const manual = manualRes.data || [];

      const orderIds = new Set();
      scans.forEach((s) => { if (s.order_id != null) orderIds.add(String(s.order_id)); });
      manual.forEach((m) => { if (m.order_id != null) orderIds.add(String(m.order_id)); });

      let ordersMap = {};
      if (orderIds.size > 0) {
        const { data: ords, error: ordErr } = await withClient(supabase
          .from("orders")
          .select("id, standard"))
          .in("id", Array.from(orderIds));
        if (ordErr) throw ordErr;
        (ords || []).forEach((o) => { ordersMap[String(o.id)] = o; });
      }

      let goodPieces = 0;
      scans.forEach((s) => {
        const std = parsePiecesPerBox(ordersMap[String(s.order_id)]?.standard);
        goodPieces += std;
      });
      manual.forEach((m) => { goodPieces += Number(m.good_qty) || 0; });

      const scrapPieces = scraps.reduce((acc, r) => acc + (Number(r.qty) || 0), 0);
      const total = goodPieces + scrapPieces;
      const pct = total > 0 ? Number(((scrapPieces / total) * 100).toFixed(2)) : 0;

      setShiftScrap({ good: goodPieces, scrap: scrapPieces, pct, loading: false, shiftKey: windowInfo.shiftKey });
    } catch (err) {
      console.error("Erro ao calcular refugo do turno:", err);
      setShiftScrap((prev) => ({ ...prev, loading: false }));
    }
  }, [resolveCurrentShiftWindow, machineId, parsePiecesPerBox]);

  const fetchShiftResponsible = useCallback(async (info, key) => {
    try {
      const { data, error } = await withClient(supabase
        .from("shift_responsibles")
        .select("id, operator, responsible, responsavel, shift, machine_id, effective_date, created_at")
        .eq("machine_id", machineId)
        .eq("shift", String(info.shiftKey))
        .gte("created_at", info.start.toUTC().toISO())
        .lt("created_at", info.end.toUTC().toISO())
        .order("created_at", { ascending: false })
        .limit(1));

      if (error) throw error;
      const row = data && data[0];
      const nome = row?.operator || row?.responsible || row?.responsavel || "";
      if (nome) {
        setResponsavelTurno(nome);
        setResponsavelInput(nome);
        setResponsavelModalOpen(false);
      } else {
        setResponsavelTurno("");
        setResponsavelInput("");
        setResponsavelModalOpen(true);
      }
      setResponsavelKey(key);
    } catch (err) {
      console.warn("Erro ao buscar responsável do turno:", err);
      setResponsavelModalOpen(true);
      setResponsavelKey(key);
    }
  }, []);

  // força captura do responsável do turno no início de cada janela de turno
  useEffect(() => {
    let mounted = true;

    async function evaluateShiftResponsible() {
      const info = resolveCurrentShiftWindow();
      if (!mounted) return;
      setShiftInfo(info);
      if (!info || !info.shiftKey) {
        setResponsavelModalOpen(false);
        return;
      }

      const key = `${info.shiftKey}-${info.start.toISODate()}`;
      const needsFetch = responsavelKey !== key || !responsavelTurno;
      if (needsFetch) {
        await fetchShiftResponsible(info, key);
      }
    }

    evaluateShiftResponsible();
    const id = setInterval(evaluateShiftResponsible, 60000);
    return () => { mounted = false; clearInterval(id); };
  }, [resolveCurrentShiftWindow, fetchShiftResponsible, responsavelKey, responsavelTurno]);

  useEffect(() => {
    fetchRefugoTurno();
    const id = setInterval(fetchRefugoTurno, 45000);
    return () => clearInterval(id);
  }, [fetchRefugoTurno]);

  async function salvarResponsavelTurno() {
    if (!shiftInfo || !shiftInfo.shiftKey) return;
    const nome = (responsavelInput || "").trim();
    if (!nome) {
      showToast("Informe o operador responsável.", "err");
      return;
    }

    try {
      const nowBr = DateTime.now().setZone("America/Sao_Paulo");
      const payload = {
        ...(clientId ? { company_id: clientId } : {}),
        machine_id: machineId,
        shift: String(shiftInfo.shiftKey),
        operator: nome,
        effective_date: shiftInfo.start.toISODate(),
        created_at: nowBr.toUTC().toISO(),
      };

      const { error } = await supabase.from("shift_responsibles").insert([payload]);
      if (error) throw error;

      const updateOrdersQuery = withClient(supabase
        .from("orders")
        .update({ started_by: nome }))
        .eq("machine_id", machineId)
        .gte("started_at", shiftInfo.start.toUTC().toISO())
        .lt("started_at", shiftInfo.end.toUTC().toISO())
        .or("started_by.is.null,started_by.eq.");

      const { error: ordersError } = await updateOrdersQuery;
      if (ordersError) throw ordersError;

      setResponsavelTurno(nome);
      setAtiva((prev) => prev && !String(prev.started_by || "").trim()
        ? { ...prev, started_by: nome }
        : prev);
      setProximo((prev) => prev && !String(prev.started_by || "").trim() && prev.started_at
        ? { ...prev, started_by: nome }
        : prev);
      setResponsavelModalOpen(false);
      setResponsavelKey(`${shiftInfo.shiftKey}-${shiftInfo.start.toISODate()}`);
      showToast("Responsável registrado.", "ok");
    } catch (err) {
      console.error("Erro ao salvar responsável do turno:", err);
      showToast("Falha ao registrar responsável.", "err");
    }
  }

// Substitua sua função biparWithCode por esta (coloque no mesmo escopo)
async function biparWithCode(code) {
  const value = (code || "").trim();
  if (!ativa) {
    showToast("Nenhuma ordem ativa.", "err");
    return;
  }

  const reg = /^OS\s+(\d+)\s*-\s*(\d{3})$/i;
  const m = value.match(reg);
  if (!m) {
    showToast("Formato inválido. Use: OS 753 - 001", "err");
    return;
  }
  const op = m[1];
  const caixa = Number(m[2]);

  if (String(op) !== String(ativa.code)) {
    showToast(`Código não pertence à O.P ${ativa.code}`, "err");
    return;
  }
  if (caixa < 1 || caixa > Number(ativa.boxes)) {
    showToast("Caixa fora do intervalo.", "err");
    return;
  }

  // duplicidade
  const { data: dup, error: dupErr } = await supabase
    .from("production_scans")
    .select("id")
    .eq("company_id", ativa?.company_id || clientId)
    .eq("order_id", ativa.id)
    .eq("scanned_box", caixa)
    .maybeSingle();

  if (dupErr) {
    console.error("Erro ao verificar duplicidade:", dupErr);
    showToast("Erro ao verificar bipagem.", "err");
    return;
  }
  if (dup) {
    showToast("Caixa já bipada.", "err");
    return;
  }

  // Parse padrão (peças por caixa) aceitando separador de milhar brasileiro
  function parsePiecesPerBox(val) {
    if (val == null) return 0;
    const s = String(val).trim();
    if (!s) return 0;
    // Remove espaços e separadores não numéricos comuns
    // Regra: somente inteiros são válidos para padrão de peças/caixa
    const digitsOnly = s.replace(/[^0-9]/g, "");
    if (!digitsOnly) return 0;
    return parseInt(digitsOnly, 10);
  }

  const qtyPiecesPerBox = parsePiecesPerBox(ativa.standard);

  // --- FORÇA horário BR e calcula turno com BR ---
  const nowBr = DateTime.now().setZone("America/Sao_Paulo");
  const createdAtUtcIso = nowBr.toUTC().toISO(); // será gravado no supabase
  // sempre calcular com base no nowBr (não usar currentShift)
  const turnoCalc = String(getTurnoAtual(nowBr) || "Hora Extra");

  // logs detalhados antes do insert
  console.info("[biparWithCode] nowBr (BR):", nowBr.toISO());
  console.info("[biparWithCode] createdAtUtcIso (UTC):", createdAtUtcIso);
  console.info("[biparWithCode] turnoCalc (getTurnoAtual):", turnoCalc);

  const payload = {
    ...(clientId ? { company_id: clientId } : {}),
    created_at: createdAtUtcIso,
    machine_id: machineId,
    shift: turnoCalc,
    operator: (responsavelTurno || "").trim() || null,
    order_id: ativa.id,
    op_code: String(ativa.code),
    scanned_box: caixa,
    qty_pieces: qtyPiecesPerBox,
    code: value,
  };

  console.info("[biparWithCode] payload -> antes do insert:", payload);

  const { data: insertData, error } = await supabase
    .from("production_scans")
    .insert([payload])
    .select("*"); // retorna a linha inserida se permitido

  if (error) {
    console.error("Erro insert production_scans:", error);
    showToast("Erro ao registrar bipagem.", "err");
    return;
  }

  // Se o insert retornou dados, logue o que o banco devolveu
  if (Array.isArray(insertData) && insertData.length) {
    console.info("[biparWithCode] resposta do insert (db retornou):", insertData[0]);
  } else {
    console.warn("[biparWithCode] insert concluído, mas sem row retornada (verifique permissões SELECT).");
  }

  // Atualiza UI
  await loadScans(ativa.id);
  showToast(`Caixa ${String(caixa).padStart(3, "0")} registrada • Turno ${turnoCalc}`, "ok");

  if (saldo - 1 <= 0) {
    setFinalizando && setFinalizando(ativa);
  }
}

  // DEBUG: permitir bipagem manual pelo console
if (typeof window !== "undefined") {
  window.biparManual = biparWithCode;
}

  // ---------- Global scanner listener (HID) ----------
  useEffect(() => {
    function onGlobalKey(e) {
      // ignore modifier keys
      if (e.key === "Shift" || e.key === "Alt" || e.key === "Meta" || e.key === "CapsLock") return;

      const now = Date.now();

      // threshold between characters of scanner (ms)
      const THRESHOLD = 120;

      if (now - lastKeyTimeRef.current > THRESHOLD) {
        scanBufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      // if Enter -> finalize
      if (e.key === "Enter") {
        const code = (scanBufferRef.current || "").trim();
        if (code) {
          // call bipar
          biparWithCode(code);
        }
        scanBufferRef.current = "";
        // prevent default so Enter doesn't submit forms
        e.preventDefault();
        return;
      }

      // If user typing in an input and modal isn't open, don't capture
      const active = document.activeElement;
      const activeTag = active && active.tagName ? active.tagName.toUpperCase() : null;
      const activeIsInput = activeTag === "INPUT" || activeTag === "TEXTAREA" || active?.isContentEditable;

      const modalOpen = !!document.querySelector(".pet01-modal-bg");
      if (!modalOpen && activeIsInput) {
        // user's typing — do not intercept
        return;
      }

      // add printable characters only (length === 1)
      if (e.key.length === 1) {
        scanBufferRef.current += e.key;
        // prevent typing anywhere that would show text (if modal not open)
        if (!modalOpen) e.preventDefault();
      }
    }

    window.addEventListener("keydown", onGlobalKey, true);
    return () => window.removeEventListener("keydown", onGlobalKey, true);
  }, [ativa, scans, currentShift, saldo]); // deps: ativa so buffer relevant

  // ---------- status change handler (keeps behavior) ----------
  function handleStatusChange(targetStatus) {
    if (!ativa) return;
    const before = ativa.status;
    const jaIniciouLocal = !!ativa.started_at;
    if (jaIniciouLocal && targetStatus === "AGUARDANDO") {
      alert('Após iniciar a produção, não é permitido voltar para "Aguardando".');
      return;
    }

    if (targetStatus === "BAIXA_EFICIENCIA" && before !== "BAIXA_EFICIENCIA") {
                              const nowBr = DateTime.now().setZone("America/Sao_Paulo");
                              setLowEffModal({
                                ordem: ativa,
                                operador: "",
                                data: nowBr.toISODate(), 
                                hora: nowBr.toFormat("HH:mm"),
                              })
      return;
    }
    
    if (before === "BAIXA_EFICIENCIA" && targetStatus !== "BAIXA_EFICIENCIA") {
                              const nowBr = DateTime.now().setZone("America/Sao_Paulo");
                              setLowEffEndModal({
                                ordem: ativa,
                                operador: "",
                                data: nowBr.toISODate(),
                                hora: nowBr.toFormat("HH:mm"),
                              })
      return;
    }

    if (targetStatus === "PARADA" && before !== "PARADA") {
                              const nowBr = DateTime.now().setZone("America/Sao_Paulo");
                              setStopModal({
                                ordem: ativa,
                                operador: "",
                                data: nowBr.toISODate(), 
                                hora: nowBr.toFormat("HH:mm"),
                              })
      return;
    }

    if (before === "PARADA" && targetStatus !== "PARADA") {
                              const nowBr = DateTime.now().setZone("America/Sao_Paulo");
                              setResumeModal({
                                ordem: ativa,
                                operador: "",
                                data: nowBr.toISODate(), 
                                hora: nowBr.toFormat("HH:mm"),
                              })
      return;
    }

    try {
      onStatusChange && onStatusChange(ativa, targetStatus);
    } catch (err) {
      console.error("Erro onStatusChange:", err);
    }
  }

  // ---------- render ----------
  return (
    <div className="pet01-wrapper pet01-wrapper--p1">
      {/* Top toast notification */}
      <div className={`pet01-toast ${toast.type === "ok" ? "ok" : "err"} ${toast.visible ? "show" : ""}`} role="status" aria-live="polite">
        {toast.msg}
      </div>

      <h1 className="pet01-title">Apontamento — Máquina {machineId}</h1>

      {/* Buttons: keep only Refugo (we removed Apontar Produção button per your request) */}
      <div className="pet01-buttons" style={{ marginBottom: 12 }}>
        <button className="pet01-btn orange" onClick={() => setShowRefugo(true)}>Apontar Refugo</button>
      </div>

      <div className="pet01-operator-row">
        <span>Operador: <strong>{responsavelTurno || '—'}</strong></span>
        <button
          className="pet01-operator-icon"
          onClick={() => {
            setResponsavelInput(responsavelTurno || "");
            setResponsavelModalOpen(true);
          }}
          title="Trocar operador"
          aria-label="Trocar operador"
        >
          ↻
        </button>
      </div>
      {/* CARD PRINCIPAL */}
      <div className={`pet01-card ${pet01StatusClass(ativa?.status)}`}>
        <div className="pet01-card-header">
          <div className="left">
            {ativa?.status === "PARADA" && tempoParada && (
              <span className="rotas-parada-timer">{tempoParada}</span>
            )}
            {ativa?.status === "BAIXA_EFICIENCIA" && tempoLow && (
              <span className="rotas-loweff-timer">{tempoLow}</span>
            )}
            {ativa?.status === "SEM_PROGRAMACAO" && tempoSemProg && (
              <span className="rotas-semprog-timer">{tempoSemProg}</span>
            )}
          </div>

          <div className="right">
            <div className="op-inline">O.P - {ativa?.code}</div>
            <button
              className="btn ghost"
              style={{ marginLeft: 8 }}
              onClick={() => setFichaModalOpen(true)}
              disabled={!ativa?.code}
            >
              Ficha Técnica
            </button>
          </div>
        </div>

        <div className="pet01-inline-metrics">
          <div className="pet01-metric-card">
            <div>
              <div className="pet01-metric-label">Refugo no turno {shiftScrap.shiftKey ? `(Turno ${shiftScrap.shiftKey})` : ''}</div>
              <div className="pet01-metric-sub">
                {shiftScrap.loading ? "Atualizando..." : `${formatInt(shiftScrap.scrap)} ref • ${formatInt(shiftScrap.good)} ok`}
              </div>
            </div>
            <div className={`pet01-metric-value ${shiftScrap.loading ? '' : (shiftScrap.pct > 5 ? 'red' : 'green')}`}>
              {shiftScrap.loading ? "—" : `${shiftScrap.pct}%`}
            </div>
          </div>
        </div>

        {machineMeta?.apontamento_tipo === 'sensor' && (
          <div className="pet01-sensor-panel">
            <div>
              <div className="pet01-sensor-label">Modo de operação</div>
              <div className="pet01-sensor-mode-buttons">
                <button
                  type="button"
                  className={`pet01-sensor-mode-btn ${sensorOperationMode === 'automatic' ? 'active' : ''}`}
                  onClick={() => updateSensorOperation('automatic', 0)}
                >
                  Automático
                </button>
                <button
                  type="button"
                  className={`pet01-sensor-mode-btn ${sensorOperationMode === 'semi_automatic' ? 'active' : ''}`}
                  onClick={() => setSensorOperationMode('semi_automatic')}
                >
                  Semi-automático
                </button>
              </div>
              {sensorOperationMode === 'semi_automatic' && (
                <div className="pet01-sensor-ignore-block">
                  <div className="pet01-sensor-ignore-text">
                    {sensorIgnoreCyclesLeft > 0
                      ? `Ignorar próximos ${sensorIgnoreCyclesLeft} pulso${sensorIgnoreCyclesLeft === 1 ? '' : 's'}`
                      : 'Defina quantos ciclos ignorar'}
                  </div>
                  <div className="pet01-sensor-ignore-controls">
                    <input
                      type="number"
                      min="1"
                      className="pet01-sensor-ignore-input"
                      value={ignoreCountInput}
                      onChange={(e) => setIgnoreCountInput(e.target.value)}
                      placeholder="Ciclos"
                    />
                    <button
                      type="button"
                      className="pet01-sensor-ignore-apply"
                      onClick={() => {
                        const count = Number(ignoreCountInput)
                        if (!count || count <= 0) {
                          showToast('Informe um número válido de ciclos.', 'err')
                          return
                        }
                        updateSensorOperation('semi_automatic', count)
                      }}
                      disabled={!ignoreCountInput || Number(ignoreCountInput) <= 0}
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <div className="pet01-sensor-label">Ciclo cadastrado</div>
              <div className="pet01-sensor-value">{configuredCycleSeconds ? `${configuredCycleSeconds}s` : '—'}</div>
            </div>
            <div>
              <div className="pet01-sensor-label">Ciclo real</div>
              <div className={`pet01-sensor-value pet01-cycle-timer ${runningCycleClass}`}>{formatRunningCycleSeconds(runningCycleSeconds)}</div>
            </div>
            <div>
              <div className="pet01-sensor-label">Ciclo médio</div>
              <div className="pet01-sensor-value">{formatCycleValue(machineMeta.sensor_avg_cycle_seconds)}</div>
            </div>
            {machineMeta.sensor_auto_stopped && (
              <div className="pet01-sensor-warning">
                Parada automática detectada pelo sensor. Complete o motivo no modal.
              </div>
            )}
          </div>
        )}

        <div className={statusClass(ativa?.status)}>
          <Etiqueta o={ativa} variant="pet01" saldoCaixas={saldo} lidasCaixas={lidas} />
                            {ativa?.status === "PARADA" && stopReason && (
                  <div className="stop-reason-below-p1">{stopReason}</div>
                  )}
        </div>
                  
        <div className="sep" style={{ marginTop: 12 }} />

        <div className="pet01-field" style={{ marginTop: 10 }}>
          <label style={{ minWidth: 90 }}>Situação</label>
          <select value={ativa?.status || "AGUARDANDO"} onChange={(e) => handleStatusChange(e.target.value)}>
            <option value="PRODUZINDO">Produzindo</option>
            <option value="BAIXA_EFICIENCIA">Baixa Eficiência</option>
            <option value="PARADA">Parada</option>
          </select>

          <div style={{ marginLeft: 12 }}>
            {ativa?.status === "AGUARDANDO" && (
          <button
              className="btn small primary"
                onClick={() => {
                 if (!setStartModal) return;
                  const n = DateTime.now().setZone("America/Sao_Paulo");
                   setStartModal({
                     ordem: ativa,
                     operador: "",
                     data: n.toISODate(),          // YYYY-MM-DD
                     hora: n.toFormat("HH:mm"),    // HH:mm
                   });
                 }}>
                Iniciar Produção
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Próximo item */}
      <div className="pet01-next">
        <h2>Próximo Item</h2>
        {proximo ? (
          <div className="pet01-next-card">
            <Etiqueta o={proximo} variant="fila" saldoCaixas={null} lidasCaixas={null} />
          </div>
        ) : (
          <div className="pet01-no-next">Nenhum item na fila</div>
        )}
      </div>

{/* MODAL — RESPONSÁVEL DO TURNO */}
{responsavelModalOpen && (
  <div className="pet01-modal-bg" role="dialog" aria-modal>
    <div className="pet01-modal">
      <h3>Responsável do Turno</h3>
      <p className="pet01-modal-description">
        Informe o operador responsável da {machineId} para o Turno {shiftInfo?.shiftKey || ""}. Este passo é obrigatório no início do turno.
      </p>

      <label style={{ marginTop: 12 }}>Operador *</label>
      <input
        className="input"
        value={responsavelInput}
        onChange={(e) => setResponsavelInput(e.target.value)}
        autoFocus
      />

      <div className="pet01-modal-buttons" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button
          type="button"
          className="orange"
          onClick={salvarResponsavelTurno}
          disabled={!responsavelInput.trim()}
        >
          Confirmar
        </button>
      </div>
    </div>
  </div>
)}
{/* MODAL — REFUGO (FINAL E CORRIGIDO) */}
{showRefugo && (
  <div className="pet01-modal-bg" role="dialog" aria-modal>
    <div className="pet01-modal">
      <h3>Apontar Refugo</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ativa) {
            showToast("Nenhuma ordem ativa.", "err");
            return;
          }

          const { operador, quantidade, motivo } = refugoForm;

          if (!operador?.trim()) {
            showToast("Preencha o operador.", "err");
            return;
          }
          if (!quantidade || Number(quantidade) <= 0) {
            showToast("Informe uma quantidade válida.", "err");
            return;
          }

          // calcula aqui o instante em São Paulo e converte para UTC para gravar
          const nowBr = DateTime.now().setZone('America/Sao_Paulo');
          const createdAtUtcIso = nowBr.toUTC().toISO();

          // calcula o turno com base em nowBr (sempre recalculado no submit)
          const turnoCalc = String(getTurnoAtual(nowBr) || "Hora Extra");

          // payload final compatível com scrap_logs
            const payload = {
          ...(clientId ? { company_id: clientId } : {}),
    created_at: createdAtUtcIso,           // grava o UTC correspondente ao horário BR
    machine_id: ativa.machine_id,
    shift: turnoCalc,
    operator: operador.trim(),
    order_id: ativa.id,
    op_code: String(ativa.code),
    qty: Number(quantidade),
    reason: motivo,
  };

   console.log("Payload Refugo:", payload);

   const { error } = await supabase.from("scrap_logs").insert([payload]);

       if (error) {
            console.error("Erro insert scrap_logs:", error);
            showToast("Erro ao registrar refugo: " + error.message, "err");
          return;
         } 

           await fetchRefugoTurno();
           setShowRefugo(false);
           setRefugoForm({ operador: "", quantidade: "", motivo: REFUGO_MOTIVOS[0] });
           showToast("Refugo registrado.", "ok");
       }}
      >

        <label>Operador *</label>
        <input
          className="input"
          value={refugoForm.operador}
          onChange={(e) =>
            setRefugoForm((f) => ({ ...f, operador: e.target.value }))
          }
          autoFocus
        />

        <label>Quantidade (peças) *</label>
        <input
          className="input"
          type="number"
          min="1"
          value={refugoForm.quantidade}
          onChange={(e) =>
            setRefugoForm((f) => ({ ...f, quantidade: e.target.value }))
          }
        />

        <label>Motivo *</label>
        <select
          className="input"
          value={refugoForm.motivo}
          onChange={(e) =>
            setRefugoForm((f) => ({ ...f, motivo: e.target.value }))
          }
        >
          {REFUGO_MOTIVOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <div className="pet01-modal-buttons" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="gray"
            onClick={() => setShowRefugo(false)}
          >
            Cancelar
          </button>
          <button type="submit" className="orange">
            Registrar
          </button>
        </div>
      </form>
    </div>
  </div>
)}

      <FichaTecnicaModal
        open={fichaModalOpen}
        onClose={() => setFichaModalOpen(false)}
        machineId={machineId}
        itemCode={(ativa?.product || '').split('-')[0]?.trim() || ''}
      />

    </div>
  );
}

