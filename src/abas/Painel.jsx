// src/pages/Painel.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MAQUINAS, STATUS } from "../domain/constants";
import { DateTime } from "luxon";
import { supabase } from "../lib/supabaseClient";
import { ACTIVE_TURNOS, getShiftWindowAt } from "../lib/shifts";
import { fetchAllPages } from "../lib/supabasePagination";
import { getSupabaseErrorMessage, saveMachineCavities } from "../lib/machineCavities";
import { parseBrNumber } from "../lib/utils";

function extractItemCodeFromOrderProduct(product) {
  if (!product) return null;
  return String(product).split("-")[0]?.trim() || null;
}

function formatCompactNumber(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(num);
}

function formatDecimal(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPercent(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${formatDecimal(num, digits)}%`;
}

function formatSeconds(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "-";
  return `${formatDecimal(num, 1)}s`;
}

function formatMaybe(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDurationShort(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  return `${minutes}min`;
}

function getElapsedSeconds(dateLike, fallbackSeconds = 0) {
  if (!dateLike) return fallbackSeconds;
  const started = DateTime.fromISO(String(dateLike));
  if (!started.isValid) return fallbackSeconds;
  return Math.max(0, Math.floor(DateTime.now().diff(started, "seconds").seconds));
}

function parsePiecesPerBox(value) {
  return parseBrNumber(value) || 0;
}

function getOrderPlannedPieces(order) {
  const boxes = parseBrNumber(order?.boxes) || 0;
  const piecesPerBox = parsePiecesPerBox(order?.standard);
  if (boxes > 0 && piecesPerBox > 0) return boxes * piecesPerBox;
  const plannedQty = parseBrNumber(order?.qty) || 0;
  if (plannedQty > 0) return plannedQty;
  return 0;
}

function getOrderRatePiecesPerHour(order, itemTechByCode) {
  const itemCode = extractItemCodeFromOrderProduct(order?.product);
  const tech = itemCode ? itemTechByCode?.[itemCode] : null;
  const cycleSeconds = Number(tech?.cycleSeconds || 0);
  const cavities = Number(tech?.cavities || 0);
  if (!(cycleSeconds > 0 && cavities > 0)) return 0;
  return (3600 / cycleSeconds) * cavities;
}

function isOrderOngoingStatus(status) {
  const normalized = String(status || "").toUpperCase();
  return Array.isArray(STATUS) && STATUS.includes(normalized);
}

function getDashboardPeriodRange(periodKey, customStart = "", customEnd = "") {
  const now = DateTime.now().setZone("America/Sao_Paulo");
  if (periodKey === "custom") {
    const start = DateTime.fromISO(String(customStart || ""), { zone: "America/Sao_Paulo" });
    const end = DateTime.fromISO(String(customEnd || customStart || ""), { zone: "America/Sao_Paulo" });
    if (start.isValid && end.isValid) {
      return {
        start: start.startOf("day"),
        end: end.endOf("day"),
        label: `${start.toFormat("dd/LL/yyyy")} a ${end.toFormat("dd/LL/yyyy")}`,
      };
    }
  }
  if (periodKey === "yesterday") {
    const day = now.minus({ days: 1 });
    return {
      start: day.startOf("day"),
      end: day.endOf("day"),
      label: "Ontem",
    };
  }
  if (periodKey === "week") {
    return {
      start: now.minus({ days: 6 }).startOf("day"),
      end: now.endOf("day"),
      label: "Últimos 7 dias",
    };
  }
  if (periodKey === "this_month") {
    return {
      start: now.startOf("month"),
      end: now.endOf("day"),
      label: "Este mês",
    };
  }
  return {
    start: now.startOf("day"),
    end: now.endOf("day"),
    label: "Hoje",
  };
}

function isDailyTrendPeriod(periodKey) {
  return !["today", "yesterday"].includes(String(periodKey || "today"));
}

function getShiftKeyForTimestamp(value) {
  return getShiftWindowAt(value)?.shiftKey || null;
}

function matchesShiftFilter(value, shiftFilter) {
  if (!shiftFilter || shiftFilter === "__ALL__") return true;
  return String(getShiftKeyForTimestamp(value) || "") === String(shiftFilter);
}

function getScrapItemCode(row) {
  return extractItemCodeFromOrderProduct(row?.order?.product || row?.product || row?.item || row?.code);
}

function getEffectiveProductionTimestamp(row) {
  return row?.sensor_last_pulse_at || row?.created_at || row?.updated_at || null;
}

function isDateTimeInRange(value, start, end) {
  const dt = DateTime.fromISO(String(value || "")).setZone("America/Sao_Paulo");
  return dt.isValid && dt >= start && dt <= end;
}

function getWorkdayStartMs(nowMs) {
  return DateTime.fromMillis(nowMs)
    .setZone("America/Sao_Paulo")
    .set({ hour: 7, minute: 0, second: 0, millisecond: 0 })
    .toMillis();
}

function sumClippedSeconds(rows, { machine, startMs, endMs, startField = "started_at", endField = "resumed_at" }) {
  const machineKey = String(machine || "").trim().toUpperCase();
  return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    if (machineKey && String(row?.machine_id || "").trim().toUpperCase() !== machineKey) return acc;
    const startedMs = DateTime.fromISO(String(row?.[startField] || "")).toMillis();
    if (!Number.isFinite(startedMs)) return acc;
    const rawEndMs = row?.[endField] ? DateTime.fromISO(String(row?.[endField] || "")).toMillis() : endMs;
    const finishedMs = Number.isFinite(rawEndMs) ? rawEndMs : endMs;
    const clippedStart = Math.max(startMs, startedMs);
    const clippedEnd = Math.min(endMs, finishedMs);
    if (clippedEnd <= clippedStart) return acc;
    return acc + Math.floor((clippedEnd - clippedStart) / 1000);
  }, 0);
}

function sumStopSecondsInWindow(rows, startMs, endMs) {
  if (!(Number.isFinite(startMs) && Number.isFinite(endMs)) || endMs <= startMs) return 0;
  return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    const startedMs = DateTime.fromISO(String(row?.started_at || "")).toMillis();
    if (!Number.isFinite(startedMs)) return acc;
    const rawEndMs = row?.resumed_at ? DateTime.fromISO(String(row.resumed_at)).toMillis() : endMs;
    const finishedMs = Number.isFinite(rawEndMs) ? rawEndMs : endMs;
    const clippedStart = Math.max(startMs, startedMs);
    const clippedEnd = Math.min(endMs, finishedMs);
    if (clippedEnd <= clippedStart) return acc;
    return acc + Math.floor((clippedEnd - clippedStart) / 1000);
  }, 0);
}

function clampPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

function positivePercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

function buildSensorCycleEntries(cycleRows, rangeStart, rangeEnd) {
  const entries = [];
  (Array.isArray(cycleRows) ? cycleRows : []).forEach((row) => {
    const timestamps = Array.isArray(row?.cycle_timestamps)
      ? row.cycle_timestamps
      : [];
    const timestampsInRange = timestamps.filter((value) => isDateTimeInRange(value, rangeStart, rangeEnd));
    if (!timestampsInRange.length) return;

    const producedQuantity = Number(row?.produced_quantity || 0);
    const piecesPerCycle = producedQuantity > 0 && timestamps.length > 0
      ? producedQuantity / timestamps.length
      : Number(row?.cavities_used || 0) || 1;
    const pulseCount = Number(row?.pulse_count || 0);
    const pulsesPerCycle = pulseCount > 0 && timestamps.length > 0 ? pulseCount / timestamps.length : 1;

    timestampsInRange.forEach((timestamp) => {
      entries.push({
        id: `${row?.id || row?.order_id}-${timestamp}`,
        created_at: timestamp,
        machine_id: row?.machine_id,
        order_id: row?.order_id,
        good_qty: piecesPerCycle,
        pulse_count: pulsesPerCycle,
        cavities_used: row?.cavities_used,
        source: "sensor",
        order: row?.order,
      });
    });
  });
  return entries;
}

function mergeEntriesWithSensorCycles(entries, cycleEntries) {
  const sensorCycleOrderIds = new Set(
    (Array.isArray(cycleEntries) ? cycleEntries : [])
      .map((entry) => String(entry?.order_id || ""))
      .filter(Boolean)
  );
  if (!sensorCycleOrderIds.size) return Array.isArray(entries) ? entries : [];

  return [
    ...(Array.isArray(entries) ? entries : []).filter((entry) => {
      if (String(entry?.source || "").toLowerCase() !== "sensor") return true;
      return !sensorCycleOrderIds.has(String(entry?.order_id || ""));
    }),
    ...(Array.isArray(cycleEntries) ? cycleEntries : []),
  ];
}

function buildTrendSeries(scans, entries, periodKey, rangeStart, rangeEnd) {
  const scanRows = Array.isArray(scans) ? scans : [];
  const entryRows = Array.isArray(entries) ? entries : [];
  const rows = [
    ...scanRows.map((row) => ({
      created_at: row?.created_at,
      boxes: 1,
      pieces: Number(row?.qty_pieces || 0),
    })),
    ...entryRows.map((row) => ({
      created_at: getEffectiveProductionTimestamp(row),
      boxes: 0,
      pieces: Number(row?.good_qty || 0),
    })),
  ];

  if (isDailyTrendPeriod(periodKey)) {
    const dayCount = Math.max(1, Math.floor(rangeEnd.startOf("day").diff(rangeStart.startOf("day"), "days").days) + 1);
    const labels = Array.from({ length: dayCount }, (_, idx) => rangeStart.plus({ days: idx }).toFormat("dd/LL"));
    const countBoxes = new Array(dayCount).fill(0);
    const countPieces = new Array(dayCount).fill(0);
    rows.forEach((scan) => {
      const dt = DateTime.fromISO(String(scan?.created_at || "")).setZone("America/Sao_Paulo");
      if (!dt.isValid) return;
      const idx = Math.max(0, Math.min(dayCount - 1, Math.floor(dt.startOf("day").diff(rangeStart.startOf("day"), "days").days)));
      countBoxes[idx] += Number(scan?.boxes || 0);
      countPieces[idx] += Number(scan?.pieces || 0);
    });
    const cumulativeBoxes = [];
    countBoxes.reduce((acc, val) => {
      const next = acc + val;
      cumulativeBoxes.push(next);
      return next;
    }, 0);
    const cumulativePieces = [];
    countPieces.reduce((acc, val) => {
      const next = acc + val;
      cumulativePieces.push(next);
      return next;
    }, 0);
    return { labels, trendBoxes: cumulativeBoxes, trendPieces: cumulativePieces, bucketBoxes: countBoxes, bucketPieces: countPieces };
  }

  const labels = Array.from({ length: 25 }, (_, idx) => `${String(idx).padStart(2, "0")}h`);
  const countBoxes = new Array(24).fill(0);
  const countPieces = new Array(24).fill(0);
  rows.forEach((scan) => {
    const dt = DateTime.fromISO(String(scan?.created_at || "")).setZone("America/Sao_Paulo");
    if (!dt.isValid) return;
    const diffHours = dt.diff(rangeStart, "hours").hours;
    const bucket = Math.max(0, Math.min(23, Math.floor(diffHours)));
    countBoxes[bucket] += Number(scan?.boxes || 0);
    countPieces[bucket] += Number(scan?.pieces || 0);
  });

  const trendBoxes = [0];
  countBoxes.reduce((acc, val) => {
    const next = acc + val;
    trendBoxes.push(next);
    return next;
  }, 0);

  const trendPieces = [0];
  countPieces.reduce((acc, val) => {
    const next = acc + val;
    trendPieces.push(next);
    return next;
  }, 0);

  return { labels, trendBoxes, trendPieces, bucketBoxes: countBoxes, bucketPieces: countPieces };
}

function buildShiftOutput(scans, entries) {
  const byShift = Object.fromEntries(
    ACTIVE_TURNOS.map((turno) => [turno.key, {
      key: turno.key,
      label: turno.label,
      boxes: 0,
      pieces: 0,
      pulses: 0,
    }])
  );

  (Array.isArray(scans) ? scans : []).forEach((scan) => {
    const shiftKey = getShiftWindowAt(scan?.created_at)?.shiftKey;
    if (!shiftKey || !byShift[shiftKey]) return;
    byShift[shiftKey].boxes += 1;
    byShift[shiftKey].pieces += Number(scan?.qty_pieces || 0);
  });

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const shiftKey = getShiftWindowAt(getEffectiveProductionTimestamp(entry))?.shiftKey;
    if (!shiftKey || !byShift[shiftKey]) return;
    byShift[shiftKey].pieces += Number(entry?.good_qty || 0);
    byShift[shiftKey].pulses += Number(entry?.pulse_count || 0);
  });

  const currentShiftKey = getShiftWindowAt()?.shiftKey || null;
  return ACTIVE_TURNOS.map((turno) => ({
    ...byShift[turno.key],
    active: turno.key === currentShiftKey,
  }));
}

function buildHourlyScrapSeries(scraps, rangeStart) {
  const countPieces = new Array(24).fill(0);
  (Array.isArray(scraps) ? scraps : []).forEach((row) => {
    const dt = DateTime.fromISO(String(row?.created_at || "")).setZone("America/Sao_Paulo");
    if (!dt.isValid) return;
    const diffHours = dt.diff(rangeStart, "hours").hours;
    const bucket = Math.max(0, Math.min(23, Math.floor(diffHours)));
    countPieces[bucket] += Number(row?.qty || 0);
  });
  return countPieces;
}

function buildHourlyStopSeries(stops, rangeStart, rangeEnd) {
  const seconds = new Array(24).fill(0);
  const startMs = rangeStart.toMillis();
  const endMs = rangeEnd.toMillis();
  (Array.isArray(stops) ? stops : []).forEach((stop) => {
    const stopStartMs = DateTime.fromISO(String(stop?.started_at || "")).toMillis();
    if (!Number.isFinite(stopStartMs)) return;
    const rawStopEndMs = stop?.resumed_at ? DateTime.fromISO(String(stop.resumed_at)).toMillis() : Date.now();
    const stopEndMs = Number.isFinite(rawStopEndMs) ? rawStopEndMs : Date.now();
    const clippedStart = Math.max(startMs, stopStartMs);
    const clippedEnd = Math.min(endMs, stopEndMs);
    if (clippedEnd <= clippedStart) return;

    for (let hour = 0; hour < 24; hour += 1) {
      const bucketStart = rangeStart.plus({ hours: hour }).toMillis();
      const bucketEnd = rangeStart.plus({ hours: hour + 1 }).toMillis();
      const overlapStart = Math.max(clippedStart, bucketStart);
      const overlapEnd = Math.min(clippedEnd, bucketEnd);
      if (overlapEnd > overlapStart) seconds[hour] += Math.floor((overlapEnd - overlapStart) / 1000);
    }
  });
  return seconds;
}

function buildDynamicGoalSeries({ periodKey, labels, periodStart, periodEnd, source, machineIds, itemTechByCode }) {
  const safeLabels = Array.isArray(labels) ? labels : [];
  const periodStartMs = periodStart.toMillis();
  const periodEndMs = periodEnd.toMillis();
  const pointsMs = safeLabels.map((_, idx) => {
    if (isDailyTrendPeriod(periodKey)) {
      return periodStart.plus({ days: idx + 1 }).toMillis();
    }
    return periodStart.plus({ hours: idx }).toMillis();
  });

  const goalBoxes = [];
  const goalPieces = [];

  pointsMs.forEach((pointMsRaw) => {
    const pointMs = Math.min(Math.max(pointMsRaw, periodStartMs), periodEndMs);
    let sumBoxes = 0;
    let sumPieces = 0;

    machineIds.forEach((machineId) => {
      const queue = Array.isArray(source?.[machineId]) ? source[machineId] : [];
      if (!queue.length) return;

      const first = queue[0];
      const firstStartRef = first?.started_at || first?.restarted_at || null;
      const firstStartMs = firstStartRef ? DateTime.fromISO(String(firstStartRef)).toMillis() : NaN;
      if (!Number.isFinite(firstStartMs)) return;

      let cursorMs = Math.max(firstStartMs, periodStartMs);
      if (pointMs <= cursorMs) return;

      for (let i = 0; i < queue.length; i += 1) {
        const order = queue[i];
        const ratePiecesPerHour = getOrderRatePiecesPerHour(order, itemTechByCode);
        const plannedPieces = getOrderPlannedPieces(order);
        const piecesPerBox = parsePiecesPerBox(order?.standard);
        if (!(ratePiecesPerHour > 0) || !(plannedPieces > 0)) continue;

        const orderDurationSec = plannedPieces / (ratePiecesPerHour / 3600);
        const availableSec = Math.max(0, (pointMs - cursorMs) / 1000);
        if (availableSec <= 0) break;

        const usedSec = Math.min(orderDurationSec, availableSec);
        const orderPieces = (usedSec / 3600) * ratePiecesPerHour;
        const orderBoxes = piecesPerBox > 0 ? (orderPieces / piecesPerBox) : 0;

        sumPieces += orderPieces;
        sumBoxes += orderBoxes;

        cursorMs += usedSec * 1000;
        if (usedSec < orderDurationSec) break;
      }
    });

    goalBoxes.push(Math.round(sumBoxes));
    goalPieces.push(Math.round(sumPieces));
  });

  return { goalBoxes, goalPieces };
}

export default function Painel({
  ativosPorMaquina,
  paradas,
  tick,
  onScanned, // opcional: callback do pai para re-fetch geral
  machineIds = MAQUINAS,
  tenantMachines = [],
  clientId = null,
  onMachineMetaUpdate,
}) {
  // localAtivos é o estado usado para render e será atualizado via realtime
  const [localAtivos, setLocalAtivos] = useState(ativosPorMaquina || {});
  const [itemTechByCode, setItemTechByCode] = useState({});
  const [periodFilter, setPeriodFilter] = useState("today");
  const [customPeriodStart, setCustomPeriodStart] = useState(() => DateTime.now().setZone("America/Sao_Paulo").toISODate());
  const [customPeriodEnd, setCustomPeriodEnd] = useState(() => DateTime.now().setZone("America/Sao_Paulo").toISODate());
  const [sectorFilter, setSectorFilter] = useState("__ALL__");
  const [machineFilter, setMachineFilter] = useState("__ALL__");
  const [shiftFilter, setShiftFilter] = useState("__ALL__");
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [sensorRuntimeByMachine, setSensorRuntimeByMachine] = useState({});
  const machineMetaByIdRef = useRef({});
  const [barTooltip, setBarTooltip] = useState(null);
  const [chartZoom, setChartZoom] = useState(null);
  const [chartDrag, setChartDrag] = useState(null);
  const [selectedMachineId, setSelectedMachineId] = useState(null);
  const [cavitiesModalMachineId, setCavitiesModalMachineId] = useState(null);
  const [cavitiesInput, setCavitiesInput] = useState("");
  const [savingCavities, setSavingCavities] = useState(false);
  const [periodData, setPeriodData] = useState({
    producedTotal: 0,
    producedBoxes: 0,
    producedPieces: 0,
    plannedTotal: 0,
    producingCount: 0,
    stoppedCount: 0,
    lowEffCount: 0,
    activeCount: 0,
    openStopCount: 0,
    openStopSeconds: 0,
    machineOutput: [],
    stopReasons: [],
    trendLabels: Array.from({ length: 25 }, (_, idx) => `${String(idx).padStart(2, "0")}h`),
    trendReal: Array(25).fill(0),
    trendGoal: Array(25).fill(0),
    trendRealPieces: Array(25).fill(0),
    trendGoalPieces: Array(25).fill(0),
    shiftOutput: ACTIVE_TURNOS.map((turno) => ({ ...turno, boxes: 0, pieces: 0, pulses: 0, active: false })),
    scrapPieces: 0,
    scrapPct: 0,
    scrapWeightKg: 0,
    scrapReasons: [],
    ongoingOrders: [],
    periodLabel: "Hoje",
    periodStartIso: null,
    periodEndIso: null,
  });
  const [periodRefreshNonce, setPeriodRefreshNonce] = useState(0);
  const source = useMemo(() => localAtivos || {}, [localAtivos]);

  useEffect(() => {
    const interval = window.setInterval(() => setLiveNowMs(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, []);

  const sectorOptions = useMemo(() => {
    const sectors = new Set();
    (tenantMachines || []).forEach((machine) => {
      const sector = String(machine?.sector || machine?.setor || "").trim();
      if (sector) sectors.add(sector);
    });
    return Array.from(sectors).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tenantMachines]);

  const filteredMachineIds = useMemo(() => {
    const tenantByCode = new Map((tenantMachines || []).map((machine) => [String(machine?.machine_code || "").trim().toUpperCase(), machine]));
    return machineIds.filter((machine) => {
      const machineCode = String(machine || "").trim().toUpperCase();
      const tenantMachine = tenantByCode.get(machineCode);
      const sector = String(tenantMachine?.sector || tenantMachine?.setor || "").trim();
      if (sectorFilter !== "__ALL__" && sector !== sectorFilter) return false;
      if (machineFilter !== "__ALL__" && machineCode !== String(machineFilter).toUpperCase()) return false;
      return true;
    });
  }, [machineFilter, machineIds, sectorFilter, tenantMachines]);

  const machineOptions = useMemo(() => {
    const tenantByCode = new Map((tenantMachines || []).map((machine) => [String(machine?.machine_code || "").trim().toUpperCase(), machine]));
    return machineIds.filter((machine) => {
      const tenantMachine = tenantByCode.get(String(machine || "").trim().toUpperCase());
      const sector = String(tenantMachine?.sector || tenantMachine?.setor || "").trim();
      return sectorFilter === "__ALL__" || sector === sectorFilter;
    });
  }, [machineIds, sectorFilter, tenantMachines]);

  const machineTypeById = useMemo(() => {
    const map = {};
    (tenantMachines || []).forEach((m) => {
      const code = String(m?.machine_code || "").trim().toUpperCase();
      if (!code) return;
      map[code] = String(m?.apontamento_tipo || "manual");
    });
    return map;
  }, [tenantMachines]);

  const machineMetaById = useMemo(() => {
    const mapped = {};
    (tenantMachines || []).forEach((machine) => {
      const code = String(machine?.machine_code || "").trim().toUpperCase();
      if (!code) return;
      mapped[code] = {
        ...machine,
        ...(sensorRuntimeByMachine[code] || {}),
      };
    });
    Object.entries(sensorRuntimeByMachine).forEach(([code, runtime]) => {
      if (!mapped[code]) mapped[code] = runtime;
    });
    return mapped;
  }, [tenantMachines, sensorRuntimeByMachine]);

  useEffect(() => {
    machineMetaByIdRef.current = machineMetaById;
  }, [machineMetaById]);

  // Sincroniza props -> localAtivos, mas preservando scanned_count vindo do realtime (merge)
  useEffect(() => {
    const incoming = ativosPorMaquina || {};
    setLocalAtivos((prev) => {
      if (!prev || Object.keys(prev).length === 0) return incoming;

      const merged = {};
      for (const m of Object.keys(incoming)) {
        const incomingList = incoming[m] || [];
        const prevList = prev[m] || [];
        merged[m] = incomingList.map((inItem) => {
          const match = prevList.find(
            (p) =>
              String(p?.id) === String(inItem?.id) ||
              String(p?.code) === String(inItem?.code) ||
              String(p?.op_code) === String(inItem?.op_code)
          );
          // Mantem o maior valor entre realtime local e payload novo do backend.
          // Assim evitamos travar contagem quando o payload atualizado chegar após troca de aba.
          const incomingCount =
            typeof inItem.scanned_count === "number"
              ? inItem.scanned_count
              : Number(inItem.scanned_count || 0);
          const prevCount =
            match && typeof match.scanned_count !== "undefined"
              ? Number(match.scanned_count || 0)
              : null;
          const incomingSensorPieces = Number(inItem.sensor_produced_pieces || 0);
          const prevSensorPieces = match
            ? Number(match.sensor_produced_pieces || 0)
            : 0;

          return {
            ...inItem,
            scanned_count:
              Number.isFinite(prevCount) && prevCount > incomingCount
                ? prevCount
                : incomingCount,
            sensor_produced_pieces: Math.max(incomingSensorPieces, prevSensorPieces),
            sensor_pulse_count: Math.max(
              Number(inItem.sensor_pulse_count || 0),
              Number(match?.sensor_pulse_count || 0)
            ),
            sensor_cavities_used: Number(inItem.sensor_cavities_used || 0) || Number(match?.sensor_cavities_used || 0) || 0,
          };
        });
      }
      // keep previous machines not present in incoming (rare)
      for (const m of Object.keys(prev)) {
        if (!(m in merged)) merged[m] = prev[m];
      }
      return merged;
    });
  }, [ativosPorMaquina]);

  const activeItemCodes = useMemo(() => {
    const codes = new Set();
    filteredMachineIds.forEach((m) => {
      const ativa = (localAtivos?.[m] || [])[0];
      const code = extractItemCodeFromOrderProduct(ativa?.product);
      if (code) codes.add(code);
    });
    return Array.from(codes);
  }, [localAtivos, filteredMachineIds]);

  useEffect(() => {
    let cancelled = false;

    async function loadItemTech() {
      if (!activeItemCodes.length) {
        setItemTechByCode({});
        return;
      }

      let query = supabase
        .from("items")
        .select("code, description, color, cycle_seconds, cavities, padrao, embalagem, part_weight_g, unit_value, resin, unidade, cliente")
        .in("code", activeItemCodes);

      if (clientId) query = query.eq("company_id", clientId);

      const { data, error } = await query;
      if (cancelled) return;

      if (error) {
        console.warn("Falha ao carregar ciclo/cavidades no painel:", error);
        return;
      }

      const mapped = {};
      (data || []).forEach((item) => {
        const code = String(item?.code || "").trim();
        if (!code) return;
        mapped[code] = {
          description: item?.description || "",
          color: item?.color || "",
          cycleSeconds: Number(item?.cycle_seconds || 0),
          cavities: Number(item?.cavities || 0),
          standard: Number(item?.padrao || 0),
          packaging: item?.embalagem || "",
          partWeightG: Number(item?.part_weight_g || 0),
          unitValue: Number(item?.unit_value || 0),
          resin: item?.resin || "",
          unit: item?.unidade || "",
          customer: item?.cliente || "",
        };
      });
      setItemTechByCode(mapped);
    }

    loadItemTech();
    return () => { cancelled = true; };
  }, [activeItemCodes, clientId]);

  useEffect(() => {
    const getActiveSensorOrders = () => filteredMachineIds
      .map((machineId) => {
        const machine = String(machineId || "").trim().toUpperCase();
        const apontamentoTipo = String(machineTypeById[machine] || "manual").toLowerCase();
        const ativa = (source[machine] || [])[0] || null;
        const orderId = ativa?.id ? String(ativa.id) : "";
        if (apontamentoTipo !== "sensor" || !machine || !orderId) return null;
        return { machine, orderId };
      })
      .filter(Boolean);

    let cancelled = false;

    async function syncSensorLiveState() {
      const activeSensorOrders = getActiveSensorOrders();
      if (!activeSensorOrders.length) return;

      const sensorMachines = [...new Set(activeSensorOrders.map((item) => item.machine))];
      const activeOrderIds = [...new Set(activeSensorOrders.map((item) => item.orderId))];

      let machinesQuery = supabase
        .from("machines")
        .select("machine_code, machine_name, sensor_status, sensor_last_pulse_at, sensor_last_cycle_seconds, sensor_cycle_count, sensor_last_heartbeat_at, sensor_auto_stopped, sensor_auto_stop_at")
        .in("machine_code", sensorMachines);

      if (clientId) {
        machinesQuery = machinesQuery.eq("company_id", clientId);
      }

      const [machinesRes, entriesRes] = await Promise.all([
        machinesQuery,
        fetchAllPages(() => {
          let query = supabase
            .from("injection_production_entries")
            .select("order_id, good_qty, pulse_count, cavities_used")
            .in("order_id", activeOrderIds);

          if (clientId) query = query.eq("company_id", clientId);
          return query;
        }),
      ]);
      if (cancelled) return;

      if (!machinesRes?.error) {
        setSensorRuntimeByMachine((prev) => {
          const next = { ...prev };
          (machinesRes?.data || []).forEach((row) => {
            const machine = String(row?.machine_code || "").trim().toUpperCase();
            if (!machine) return;
            next[machine] = {
              ...(next[machine] || {}),
              ...row,
              machine_code: machine,
            };
          });
          return next;
        });
      } else {
        console.warn("Falha ao sincronizar runtime dos sensores:", machinesRes.error);
      }

      if (!entriesRes?.error) {
        const totalsByOrder = {};
        (entriesRes?.data || []).forEach((row) => {
          const orderId = String(row?.order_id || "");
          if (!orderId) return;
          if (!totalsByOrder[orderId]) totalsByOrder[orderId] = { pieces: 0, pulses: 0, cavities: 0 };
          totalsByOrder[orderId].pieces += Number(row?.good_qty || 0);
          totalsByOrder[orderId].pulses += Number(row?.pulse_count || 0);
          const cavities = Number(row?.cavities_used || 0);
          if (cavities > 0) totalsByOrder[orderId].cavities = cavities;
        });

        setLocalAtivos((prev) => {
          if (!prev) return prev;
          let changed = false;
          const next = { ...prev };

          activeSensorOrders.forEach(({ machine, orderId }) => {
            const totals = totalsByOrder[orderId];
            if (!totals || !Array.isArray(next[machine])) return;

            next[machine] = next[machine].map((item) => {
              if (!matchesOrder(item, orderId)) return item;
              const currentPieces = Number(item?.sensor_produced_pieces || 0);
              const currentPulses = Number(item?.sensor_pulse_count || 0);
              const currentCavities = Number(item?.sensor_cavities_used || 0);
              if (
                currentPieces === totals.pieces &&
                currentPulses === totals.pulses &&
                currentCavities === totals.cavities
              ) {
                return item;
              }
              changed = true;
              return {
                ...item,
                sensor_produced_pieces: totals.pieces,
                sensor_pulse_count: totals.pulses,
                sensor_cavities_used: totals.cavities || currentCavities,
              };
            });
          });

          return changed ? next : prev;
        });
      } else {
        console.warn("Falha ao sincronizar produção dos sensores:", entriesRes.error);
      }
    }

    syncSensorLiveState();
    const interval = window.setInterval(syncSensorLiveState, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [clientId, filteredMachineIds, machineTypeById, source]);

  useEffect(() => {
    let cancelled = false;

    async function loadPeriodData() {
      const period = getDashboardPeriodRange(periodFilter, customPeriodStart, customPeriodEnd);
      const startIso = period.start.toUTC().toISO();
      const endIso = period.end.toUTC().toISO();

      let scansQuery = supabase
        .from("production_scans")
        .select("id, created_at, machine_id, order_id, scanned_box, qty_pieces, order:orders(id, code, product, boxes, qty, standard, status, finalized, machine_id)")
        .gte("created_at", startIso)
        .lte("created_at", endIso);

      let stopsQuery = supabase
        .from("machine_stops")
        .select("id, machine_id, order_id, reason, started_at, resumed_at")
        .lte("started_at", endIso)
        .or(`resumed_at.gte.${startIso},resumed_at.is.null`);

      let lowEffQuery = supabase
        .from("low_efficiency_logs")
        .select("id, machine_id, started_at, ended_at")
        .lte("started_at", endIso)
        .or(`ended_at.gte.${startIso},ended_at.is.null`);

      let scrapQuery = supabase
        .from("scrap_logs")
        .select("id, qty, reason, machine_id, order_id, created_at, order:orders(id, product)")
        .gte("created_at", startIso)
        .lte("created_at", endIso);

      if (clientId) {
        scansQuery = scansQuery.eq("company_id", clientId);
        stopsQuery = stopsQuery.eq("company_id", clientId);
        lowEffQuery = lowEffQuery.eq("company_id", clientId);
        scrapQuery = scrapQuery.eq("company_id", clientId);
      }

      if (filteredMachineIds.length > 0 && filteredMachineIds.length < machineIds.length) {
        scansQuery = scansQuery.in("machine_id", filteredMachineIds);
        stopsQuery = stopsQuery.in("machine_id", filteredMachineIds);
        lowEffQuery = lowEffQuery.in("machine_id", filteredMachineIds);
        scrapQuery = scrapQuery.in("machine_id", filteredMachineIds);
      }

      const [scansRes, entriesRes, sensorCyclesRes, stopsRes, lowEffRes, scrapRes] = await Promise.all([
        scansQuery,
        fetchAllPages(() => {
          let query = supabase
            .from("injection_production_entries")
            .select("id, created_at, updated_at, sensor_last_pulse_at, machine_id, order_id, good_qty, pulse_count, cavities_used, source, order:orders(id, code, product, boxes, qty, standard, status, finalized, machine_id)")
            .gte("created_at", startIso)
            .lte("created_at", endIso);

          if (clientId) query = query.eq("company_id", clientId);
          if (filteredMachineIds.length > 0 && filteredMachineIds.length < machineIds.length) {
            query = query.in("machine_id", filteredMachineIds);
          }
          return query;
        }),
        fetchAllPages(() => {
          let query = supabase
            .from("machine_sensor_order_cycles")
            .select("id, machine_id, order_id, produced_quantity, pulse_count, cavities_used, cycle_timestamps, first_pulse_at, last_pulse_at, order:orders(id, code, product, boxes, qty, standard, status, finalized, machine_id)")
            .lte("first_pulse_at", endIso)
            .gte("last_pulse_at", startIso);

          if (clientId) query = query.eq("company_id", clientId);
          if (filteredMachineIds.length > 0 && filteredMachineIds.length < machineIds.length) {
            query = query.in("machine_id", filteredMachineIds);
          }
          return query;
        }),
        stopsQuery,
        lowEffQuery,
        scrapQuery,
      ]);
      if (cancelled) return;

      const scans = (scansRes?.data || []).filter((row) => matchesShiftFilter(row?.created_at, shiftFilter));
      const entries = entriesRes?.data || [];
      const sensorCycleEntries = buildSensorCycleEntries(sensorCyclesRes?.data || [], period.start, period.end);
      const entriesForTimeline = mergeEntriesWithSensorCycles(entries, sensorCycleEntries)
        .filter((row) => matchesShiftFilter(getEffectiveProductionTimestamp(row), shiftFilter));
      const stops = (stopsRes?.data || []).filter((row) => matchesShiftFilter(row?.started_at, shiftFilter));
      const lowEff = (lowEffRes?.data || []).filter((row) => matchesShiftFilter(row?.started_at, shiftFilter));
      const scraps = (scrapRes?.data || []).filter((row) => matchesShiftFilter(row?.created_at, shiftFilter));

      const producedBoxesFromScans = scans.length;
      const producedPiecesFromScans = scans.reduce((acc, scan) => acc + Number(scan?.qty_pieces || 0), 0);
      const producedPiecesFromEntries = entriesForTimeline.reduce((acc, row) => acc + Number(row?.good_qty || 0), 0);
      const producedPieces = producedPiecesFromScans + producedPiecesFromEntries;
      const producedBoxes = producedBoxesFromScans;
      const producedTotal = producedBoxes;

      const machineOutputMap = Object.fromEntries(filteredMachineIds.map((m) => [m, { boxes: 0, pieces: 0 }]));
      scans.forEach((scan) => {
        const machine = String(scan?.machine_id || "").toUpperCase();
        if (!machineOutputMap[machine]) machineOutputMap[machine] = { boxes: 0, pieces: 0 };
        machineOutputMap[machine].boxes += 1;
        machineOutputMap[machine].pieces += Number(scan?.qty_pieces || 0);
      });
      entriesForTimeline.forEach((entry) => {
        const machine = String(entry?.machine_id || "").toUpperCase();
        if (!machineOutputMap[machine]) machineOutputMap[machine] = { boxes: 0, pieces: 0 };
        machineOutputMap[machine].pieces += Number(entry?.good_qty || 0);
      });
      const machineOutput = Object.entries(machineOutputMap).map(([machine, value]) => ({
        machine,
        value: Number(value?.pieces || 0),
        boxes: Number(value?.boxes || 0),
        pieces: Number(value?.pieces || 0),
      }));

      const scrapPieces = scraps.reduce((acc, row) => acc + Number(row?.qty || 0), 0);
      const scrapPct = producedPieces > 0 ? (scrapPieces / producedPieces) * 100 : 0;
      const scrapItemCodes = [...new Set(scraps.map(getScrapItemCode).filter(Boolean))];
      const scrapItemTechByCode = { ...itemTechByCode };
      const missingScrapItemCodes = scrapItemCodes.filter((code) => !scrapItemTechByCode[code]);
      if (missingScrapItemCodes.length) {
        let scrapItemsQuery = supabase
          .from("items")
          .select("code, part_weight_g")
          .in("code", missingScrapItemCodes);
        if (clientId) scrapItemsQuery = scrapItemsQuery.eq("company_id", clientId);
        const { data: scrapItems } = await scrapItemsQuery;
        (scrapItems || []).forEach((item) => {
          const code = String(item?.code || "").trim();
          if (!code) return;
          scrapItemTechByCode[code] = {
            ...(scrapItemTechByCode[code] || {}),
            partWeightG: Number(item?.part_weight_g || 0),
          };
        });
      }
      const scrapWeightKg = scraps.reduce((acc, row) => {
        const itemCode = getScrapItemCode(row);
        const partWeightG = itemCode ? Number(scrapItemTechByCode?.[itemCode]?.partWeightG || 0) : 0;
        return acc + ((Number(row?.qty || 0) * partWeightG) / 1000);
      }, 0);
      const scrapReasonMap = {};
      scraps.forEach((row) => {
        const reason = String(row?.reason || "Outro").trim() || "Outro";
        const itemCode = getScrapItemCode(row);
        const partWeightG = itemCode ? Number(scrapItemTechByCode?.[itemCode]?.partWeightG || 0) : 0;
        if (!scrapReasonMap[reason]) scrapReasonMap[reason] = { reason, pieces: 0, weightKg: 0, count: 0 };
        scrapReasonMap[reason].pieces += Number(row?.qty || 0);
        scrapReasonMap[reason].weightKg += (Number(row?.qty || 0) * partWeightG) / 1000;
        scrapReasonMap[reason].count += 1;
      });
      const scrapReasons = Object.values(scrapReasonMap)
        .sort((a, b) => Number(b.pieces || 0) - Number(a.pieces || 0))
        .map((item) => ({
          ...item,
          percent: scrapPieces > 0 ? Math.round((Number(item.pieces || 0) / scrapPieces) * 100) : 0,
        }));

      const activeOrders = filteredMachineIds
        .map((machine) => {
          const ativa = (source[machine] || [])[0] || null;
          if (!ativa) return null;
          return { machine, ativa };
        })
        .filter(Boolean);

      const activeOrderIds = activeOrders
        .map(({ ativa }) => String(ativa?.id || ""))
        .filter(Boolean);

      const activeScanByOrder = {};
      const activeEntryByOrder = {};
      const activePulseByOrder = {};
      const activeCavityByOrder = {};
      const activeScrapByOrder = {};
      const activeStopRowsByOrder = {};

      scraps.forEach((row) => {
        const key = String(row?.order_id || row?.order?.id || "");
        if (!key || !activeOrderIds.includes(key)) return;
        activeScrapByOrder[key] = (activeScrapByOrder[key] || 0) + Number(row?.qty || 0);
      });

      stops.forEach((row) => {
        const key = String(row?.order_id || "");
        if (!key || !activeOrderIds.includes(key)) return;
        if (!activeStopRowsByOrder[key]) activeStopRowsByOrder[key] = [];
        activeStopRowsByOrder[key].push(row);
      });

      if (activeOrderIds.length) {
        let activeScansQuery = supabase
          .from("production_scans")
          .select("order_id, qty_pieces")
          .in("order_id", activeOrderIds)
          .gte("created_at", startIso)
          .lte("created_at", endIso);

        if (clientId) {
          activeScansQuery = activeScansQuery.eq("company_id", clientId);
        }

        const [activeScansRes, activeEntriesRes] = await Promise.all([
          activeScansQuery,
          fetchAllPages(() => {
            let query = supabase
              .from("injection_production_entries")
              .select("order_id, good_qty, pulse_count, cavities_used")
              .in("order_id", activeOrderIds)
              .gte("created_at", startIso)
              .lte("created_at", endIso);

            if (clientId) query = query.eq("company_id", clientId);
            return query;
          }),
        ]);
        if (cancelled) return;

        (activeScansRes?.data || []).forEach((row) => {
          const key = String(row?.order_id || "");
          if (!key) return;
          if (!activeScanByOrder[key]) activeScanByOrder[key] = { pieces: 0 };
          activeScanByOrder[key].pieces += Number(row?.qty_pieces || 0);
        });

        (activeEntriesRes?.data || []).forEach((row) => {
          const key = String(row?.order_id || "");
          if (!key) return;
          activeEntryByOrder[key] = (activeEntryByOrder[key] || 0) + Number(row?.good_qty || 0);
          activePulseByOrder[key] = (activePulseByOrder[key] || 0) + Number(row?.pulse_count || 0);
          const cavities = Number(row?.cavities_used || 0);
          if (cavities > 0) activeCavityByOrder[key] = cavities;
        });
      }

      const ongoingOrders = activeOrders.map(({ machine, ativa }) => {
        const orderId = String(ativa?.id || "");
        const apontamentoTipo = String(machineTypeById[machine] || "manual");
        const plannedPieces = getOrderPlannedPieces(ativa);
        const stdPieces = parsePiecesPerBox(ativa?.standard);
        const scanPieces = Number(activeScanByOrder[orderId]?.pieces || 0);
        const entryPieces = Number(activeEntryByOrder[orderId] || 0);
        const fallbackScannedPieces = stdPieces > 0
          ? Number(ativa?.scanned_count || 0) * stdPieces
          : Number(ativa?.scanned_count || 0);

        const producedPieces = apontamentoTipo === "sensor"
          ? entryPieces
          : Math.max(scanPieces, fallbackScannedPieces);

        const plannedBoxes = Number(ativa?.boxes || 0);
        const producedBoxes = stdPieces > 0
          ? Math.round(producedPieces / stdPieces)
          : Number(ativa?.scanned_count || 0);

        const progress = plannedPieces > 0
          ? Math.min(100, Math.round((producedPieces / plannedPieces) * 100))
          : 0;

        return {
          machine,
          order: ativa?.code || ativa?.op_code || ativa?.id || "-",
          product: ativa?.product || "-",
          plannedBoxes,
          plannedPieces,
          producedBoxes,
          producedPieces,
          progress,
          status: ativa?.status || "AGUARDANDO",
          apontamentoTipo,
          pulses: Number(activePulseByOrder[orderId] || 0),
          cavitiesUsed: Number(activeCavityByOrder[orderId] || 0),
          scrapPieces: Number(activeScrapByOrder[orderId] || 0),
          stopRows: activeStopRowsByOrder[orderId] || [],
        };
      }).filter((row) => isOrderOngoingStatus(row.status));

      const plannedTotal = ongoingOrders.reduce((acc, row) => acc + Number(row.plannedPieces || 0), 0);
      const producingCount = machineOutput.filter((item) => Number(item.value || 0) > 0).length;
      const stoppedMachines = new Set(stops.map((s) => String(s.machine_id || "").toUpperCase()).filter(Boolean));
      const lowEffMachines = new Set(lowEff.map((s) => String(s.machine_id || "").toUpperCase()).filter(Boolean));

      const openStops = stops.filter((s) => !s.resumed_at);
      const nowMs = Date.now();
      const rangeStartMs = period.start.toMillis();
      const rangeEndMs = period.end.toMillis();
      const openStopSeconds = openStops.reduce((acc, p) => {
        const startedMs = DateTime.fromISO(String(p.started_at || "")).toMillis();
        if (!Number.isFinite(startedMs)) return acc;
        const ini = Math.max(rangeStartMs, startedMs);
        const fim = Math.min(rangeEndMs, nowMs);
        if (fim <= ini) return acc;
        return acc + Math.floor((fim - ini) / 1000);
      }, 0);

      const reasonCountMap = {};
      const reasonDurationMap = {};
      stops.forEach((item) => {
        const reason = String(item.reason || "Outro").trim() || "Outro";
        reasonCountMap[reason] = (reasonCountMap[reason] || 0) + 1;

        const ini = DateTime.fromISO(String(item.started_at || "")).toMillis();
        if (!Number.isFinite(ini)) return;
        const rawFim = item.resumed_at
          ? DateTime.fromISO(String(item.resumed_at || "")).toMillis()
          : nowMs;
        const fim = Number.isFinite(rawFim) ? rawFim : nowMs;
        const clipIni = Math.max(rangeStartMs, ini);
        const clipFim = Math.min(rangeEndMs, fim);
        if (clipFim <= clipIni) return;
        reasonDurationMap[reason] = (reasonDurationMap[reason] || 0) + (clipFim - clipIni);
      });
      const reasonTotalMs = Object.values(reasonDurationMap).reduce((acc, value) => acc + Number(value || 0), 0);
      const stopReasons = Object.entries(reasonDurationMap)
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
        .map(([reason, totalMs]) => ({
          reason,
          count: Number(reasonCountMap[reason] || 0),
          totalMs: Number(totalMs || 0),
          hours: Number(totalMs || 0) / (1000 * 60 * 60),
          percent: reasonTotalMs > 0 ? Math.round((Number(totalMs || 0) / reasonTotalMs) * 100) : 0,
        }));

      const trendBase = buildTrendSeries(scans, entriesForTimeline, periodFilter, period.start, period.end);
      const shiftOutput = buildShiftOutput(scans, entriesForTimeline);
      const dynamicGoal = buildDynamicGoalSeries({
        periodKey: periodFilter,
        labels: trendBase.labels,
        periodStart: period.start,
        periodEnd: period.end,
        source,
        machineIds: filteredMachineIds,
        itemTechByCode,
      });
      const trendGoal = dynamicGoal.goalBoxes;
      const trendGoalPieces = dynamicGoal.goalPieces;

      setPeriodData({
        producedTotal,
        producedBoxes,
        producedPieces,
        plannedTotal,
        producingCount,
        stoppedCount: stoppedMachines.size,
        lowEffCount: lowEffMachines.size,
        activeCount: producingCount,
        openStopCount: openStops.length,
        openStopSeconds,
        machineOutput,
        stopReasons,
        trendLabels: trendBase.labels,
        trendReal: trendBase.trendBoxes,
        trendGoal,
        trendRealPieces: trendBase.trendPieces,
        trendGoalPieces,
        shiftOutput,
        scrapPieces,
        scrapPct,
        scrapWeightKg,
        scrapReasons,
        ongoingOrders,
        periodLabel: period.label,
        periodStartIso: period.start.toISO(),
        periodEndIso: period.end.toISO(),
      });
    }

    loadPeriodData().catch((err) => {
      console.error("Falha ao carregar dados do periodo no painel:", err);
    });

    return () => { cancelled = true; };
  }, [periodFilter, customPeriodStart, customPeriodEnd, shiftFilter, clientId, machineIds, filteredMachineIds, machineTypeById, source, paradas, itemTechByCode, periodRefreshNonce]);

  // util helper para testar se um item corresponde a um order_id / code
  function matchesOrder(item, orderIdOrCode) {
    if (!item || !orderIdOrCode) return false;
    const candidates = [
      item?.id,
      item?.order_id,
      item?.ordem?.id,
      item?.order?.id,
      item?.o?.id,
      item?.op_code,
      item?.code,
      item?.ordem?.code,
    ]
      .filter(Boolean)
      .map(String);
    const target = String(orderIdOrCode);
    return candidates.includes(target);
  }

  // Realtime: scans, entradas de produção e eventos de sensor sem refresh manual
  useEffect(() => {
    const channel = supabase
      .channel("painel-rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "production_scans" },
        async (payload) => {
          try {
            const newRow = payload.new;
            if (!newRow) return;
            if (clientId && String(newRow.company_id || '') !== String(clientId)) return;

            // prefer machine_id informado no scan; se não vier, deixamos procurar em todas
            const scanOrderId = newRow.order_id;
            const scanMachineId = newRow.machine_id;

            // obtém count atual de production_scans para essa order_id
            let scannedCount = 0;
            try {
              const { error: countErr, count } = await supabase
                .from("production_scans")
                .select("*", { head: true, count: "exact" })
                .eq("order_id", scanOrderId)
                .eq("company_id", newRow.company_id || clientId || null);

              if (!countErr) scannedCount = Number(count || 0);
              else {
                console.warn("Painel: falha ao calcular scanned_count:", countErr);
              }
            } catch (err) {
              console.error("Painel: erro ao consultar scanned_count:", err);
            }

            // Atualiza localAtivos apenas na máquina afetada (se souber) ou procura em todas
            setLocalAtivos((prev) => {
              if (!prev) return prev;
              const copy = { ...prev };
              const orderIdStr = String(scanOrderId);
              let found = false;

              // prioridade: aplicar apenas na machine informada pelo scan (evita percorrer tudo)
              const machinesToCheck =
                scanMachineId && copy[scanMachineId]
                  ? [scanMachineId]
                  : Object.keys(copy);

              for (const machine of machinesToCheck) {
                copy[machine] = (copy[machine] || []).map((item) => {
                  if (matchesOrder(item, orderIdStr)) {
                    found = true;
                    return { ...item, scanned_count: scannedCount };
                  }
                  return item;
                });
              }

              // fallback: se não encontrou e scan não informou machine_id, tente procurar em todas
              if (!found) {
                for (const machine of Object.keys(copy)) {
                  copy[machine] = (copy[machine] || []).map((item) => {
                    if (matchesOrder(item, orderIdStr)) {
                      found = true;
                      return { ...item, scanned_count: scannedCount };
                    }
                    return item;
                  });
                }
              }

              // se nada for encontrado, retorna prev (sem alteração)
              return found ? copy : prev;
            });

            // opcional: avisa o pai (App) para, se quiser, refazer fetch completo
            if (typeof onScanned === "function") {
              try {
                onScanned(newRow);
              } catch (err) {
                console.warn("onScanned callback falhou:", err);
              }
            }

            setPeriodRefreshNonce((prev) => prev + 1);
          } catch (err) {
            console.error("Erro no handler realtime scans:", err);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "injection_production_entries" },
        (payload) => {
          if (payload?.eventType !== "INSERT" && payload?.eventType !== "UPDATE") return;
          const row = payload?.new;
          if (!row) return;
          if (clientId && String(row.company_id || "") !== String(clientId)) return;

          const orderId = String(row.order_id || "");
          const machine = String(row.machine_id || "").trim().toUpperCase();
          const isUpdate = payload?.eventType === "UPDATE";
          const goodQty = isUpdate
            ? Number(row.sensor_last_delta_qty || 0)
            : Number(row.good_qty || 0);
          const pulseCount = isUpdate
            ? Number(row.sensor_last_delta_pulse_count || 0)
            : Number(row.pulse_count || 0);
          const cavitiesUsed = Number(row.cavities_used || 0);
          if (!orderId || goodQty <= 0) {
            setPeriodRefreshNonce((prev) => prev + 1);
            return;
          }

          setLocalAtivos((prev) => {
            if (!prev) return prev;
            const copy = { ...prev };
            let found = false;

            for (const machine of Object.keys(copy)) {
              copy[machine] = (copy[machine] || []).map((item) => {
                if (matchesOrder(item, orderId)) {
                  found = true;
                  return {
                    ...item,
                    sensor_produced_pieces: Number(item?.sensor_produced_pieces || 0) + goodQty,
                    sensor_pulse_count: Number(item?.sensor_pulse_count || 0) + pulseCount,
                    sensor_cavities_used: cavitiesUsed || Number(item?.sensor_cavities_used || 0),
                  };
                }
                return item;
              });
            }

            return found ? copy : prev;
          });

          if (machine) {
            const pulseAt = row.sensor_last_pulse_at || row.updated_at || row.created_at || new Date().toISOString();
            const sensorEventId = row.sensor_event_id ? String(row.sensor_event_id) : null;
            setSensorRuntimeByMachine((prev) => {
              const baseMeta = machineMetaByIdRef.current[machine] || {};
              const current = prev[machine] || baseMeta || {};
              if (sensorEventId && String(current.sensor_last_event_id || "") === sensorEventId) return prev;

              const previousPulseAt = current.sensor_last_pulse_at || baseMeta.sensor_last_pulse_at || null;
              const previousPulseMs = previousPulseAt ? DateTime.fromISO(String(previousPulseAt)).toMillis() : NaN;
              const pulseMs = DateTime.fromISO(String(pulseAt)).toMillis();
              const previousCycle = Number.isFinite(previousPulseMs) && Number.isFinite(pulseMs) && pulseMs > previousPulseMs
                ? (pulseMs - previousPulseMs) / 1000
                : Number(current.sensor_last_cycle_seconds || baseMeta.sensor_last_cycle_seconds || 0);
              const cycleCount = Number(current.sensor_cycle_count || baseMeta.sensor_cycle_count || 0) + 1;
              return {
                ...prev,
                [machine]: {
                  ...current,
                  machine_code: machine,
                  sensor_last_event_id: sensorEventId || current.sensor_last_event_id || null,
                  sensor_last_pulse_at: pulseAt,
                  sensor_last_cycle_seconds: previousCycle,
                  sensor_cycle_count: cycleCount,
                  sensor_status: "recebendo_pulsos",
                },
              };
            });
          }

          setPeriodRefreshNonce((prev) => prev + 1);

          if (typeof onScanned === "function") {
            try {
              onScanned(row);
            } catch (err) {
              console.warn("onScanned callback falhou para apontamento por sensor:", err);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "machine_sensor_events" },
        (payload) => {
          const row = payload?.new;
          if (!row) return;
          if (clientId && String(row.company_id || "") !== String(clientId)) return;
          const machine = String(row.machine_id || "").trim().toUpperCase();
          const pulseAt = row.created_at || new Date().toISOString();
          const sensorEventId = row.id ? String(row.id) : null;
          if (machine) {
            setSensorRuntimeByMachine((prev) => {
              const baseMeta = machineMetaByIdRef.current[machine] || {};
              const current = prev[machine] || baseMeta || {};
              if (sensorEventId && String(current.sensor_last_event_id || "") === sensorEventId) return prev;

              const previousPulseAt = current.sensor_last_pulse_at || baseMeta.sensor_last_pulse_at || null;
              const previousPulseMs = previousPulseAt ? DateTime.fromISO(String(previousPulseAt)).toMillis() : NaN;
              const pulseMs = DateTime.fromISO(String(pulseAt)).toMillis();
              const previousCycle = Number.isFinite(previousPulseMs) && Number.isFinite(pulseMs) && pulseMs > previousPulseMs
                ? (pulseMs - previousPulseMs) / 1000
                : Number(current.sensor_last_cycle_seconds || baseMeta.sensor_last_cycle_seconds || 0);
              const cycleCount = Number(current.sensor_cycle_count || baseMeta.sensor_cycle_count || 0) + 1;
              return {
                ...prev,
                [machine]: {
                  ...current,
                  machine_code: machine,
                  sensor_last_event_id: sensorEventId || current.sensor_last_event_id || null,
                  sensor_last_pulse_at: pulseAt,
                  sensor_last_cycle_seconds: previousCycle,
                  sensor_cycle_count: cycleCount,
                  sensor_status: "recebendo_pulsos",
                },
              };
            });
          }
          setPeriodRefreshNonce((prev) => prev + 1);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "machines" },
        (payload) => {
          const row = payload?.new;
          if (!row) return;
          if (clientId && String(row.company_id || "") !== String(clientId)) return;
          const machine = String(row.machine_code || row.machine_id || "").trim().toUpperCase();
          if (machine) {
            setSensorRuntimeByMachine((prev) => ({
              ...prev,
              [machine]: {
                ...(prev[machine] || {}),
                ...row,
                machine_code: machine,
              },
            }));
          }
          setPeriodRefreshNonce((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (err) {
        console.warn("Falha ao remover canal realtime:", err);
      }
    };
  }, [clientId, onScanned]);

  const overview = useMemo(() => {
    const nowMs = Date.now() + (Number(tick || 0) * 0);
    const periodStartMs = periodData.periodStartIso ? DateTime.fromISO(String(periodData.periodStartIso)).toMillis() : NaN;
    const periodEndMs = periodData.periodEndIso ? DateTime.fromISO(String(periodData.periodEndIso)).toMillis() : NaN;
    const cappedNowMs = Number.isFinite(periodEndMs) ? Math.min(nowMs, periodEndMs) : nowMs;
    const activeOrderMap = new Map((periodData.ongoingOrders || []).map((row) => [String(row.machine || "").toUpperCase(), row]));

    // Eficiência dinâmica: compara produção real atual com meta acumulada até o horário atual,
    // limitada ao período filtrado e usando ciclo/cavidades do item.
    let dynamicProducedBoxes = 0;
    let dynamicProducedPieces = 0;
    let dynamicMetaBoxes = 0;
    let dynamicMetaPieces = 0;

    for (const machine of filteredMachineIds) {
      const ativa = (source[machine] || [])[0] || null;
      if (!ativa) continue;

      const startRef = ativa?.started_at || ativa?.restarted_at || null;
      const startMs = startRef ? DateTime.fromISO(String(startRef)).toMillis() : NaN;
      const windowStartMs = Number.isFinite(periodStartMs) ? Math.max(startMs, periodStartMs) : startMs;
      if (!Number.isFinite(windowStartMs) || windowStartMs >= cappedNowMs) continue;

      const itemCode = extractItemCodeFromOrderProduct(ativa?.product);
      const tech = itemCode ? itemTechByCode[itemCode] : null;
      const cycleSeconds = Number(tech?.cycleSeconds || 0);
      const cavities = Number(tech?.cavities || 0);
      if (!(cycleSeconds > 0 && cavities > 0)) continue;

      const elapsedSeconds = Math.max(0, (cappedNowMs - windowStartMs) / 1000);
      const piecesPerHour = (3600 / cycleSeconds) * cavities;
      const metaPiecesNow = (elapsedSeconds / 3600) * piecesPerHour;

      const piecesPerBox = parsePiecesPerBox(ativa?.standard);
      const activeOrder = activeOrderMap.get(String(machine || "").toUpperCase()) || null;
      const producedPieces = Number(activeOrder?.producedPieces || 0);
      const producedBoxes = piecesPerBox > 0
        ? producedPieces / piecesPerBox
        : Number(activeOrder?.producedBoxes || 0);
      const metaBoxesNow = piecesPerBox > 0 ? (metaPiecesNow / piecesPerBox) : 0;

      dynamicProducedBoxes += producedBoxes;
      dynamicProducedPieces += producedPieces;
      dynamicMetaBoxes += metaBoxesNow;
      dynamicMetaPieces += metaPiecesNow;
    }

    const producedTotal = Number(periodData.producedTotal || 0);
    const plannedTotal = Number(periodData.plannedTotal || 0);
    const efficiency = dynamicMetaBoxes > 0 ? (dynamicProducedBoxes / dynamicMetaBoxes) * 100 : 0;

    return {
      activeCount: Number(periodData.activeCount || 0),
      producingCount: Number(periodData.producingCount || 0),
      stoppedCount: Number(periodData.stoppedCount || 0),
      lowEffCount: Number(periodData.lowEffCount || 0),
      plannedTotal,
      producedTotal,
      producedBoxes: Number(periodData.producedBoxes || producedTotal),
      producedPieces: Number(periodData.producedPieces || 0),
      metaNowBoxes: dynamicMetaBoxes,
      metaNowPieces: dynamicMetaPieces,
      producedNowBoxes: dynamicProducedBoxes,
      producedNowPieces: dynamicProducedPieces,
      efficiency,
      openStopCount: Number(periodData.openStopCount || 0),
      openStopSeconds: Number(periodData.openStopSeconds || 0),
      stopReasons: periodData.stopReasons || [],
      machineOutput: periodData.machineOutput || [],
      trendReal: periodData.trendReal || [],
      trendGoal: periodData.trendGoal || [],
      trendRealPieces: periodData.trendRealPieces || [],
      trendGoalPieces: periodData.trendGoalPieces || [],
      shiftOutput: periodData.shiftOutput || [],
      scrapPieces: Number(periodData.scrapPieces || 0),
      scrapPct: Number(periodData.scrapPct || 0),
      scrapWeightKg: Number(periodData.scrapWeightKg || 0),
      scrapReasons: periodData.scrapReasons || [],
      trendLabels: periodData.trendLabels || [],
      periodLabel: periodData.periodLabel || "Hoje",
    };
  }, [filteredMachineIds, periodData, source, itemTechByCode, tick]);

  function getBucketDelta(values, index) {
    const current = Number(values?.[index] || 0);
    const previous = index > 0 ? Number(values?.[index - 1] || 0) : 0;
    return Math.max(0, current - previous);
  }

  const ongoingOrders = useMemo(() => {
    if (Array.isArray(periodData.ongoingOrders) && periodData.ongoingOrders.length > 0) {
      return periodData.ongoingOrders
        .map((row) => {
          const machine = String(row?.machine || "").toUpperCase();
          const ativa = (source[machine] || [])[0] || null;
          if (String(row?.apontamentoTipo || "").toLowerCase() !== "sensor" || !ativa) return row;

          const localPieces = Number(ativa?.sensor_produced_pieces || 0);
          const producedPieces = Math.max(Number(row?.producedPieces || 0), localPieces);
          const plannedPieces = Number(row?.plannedPieces || 0);
          return {
            ...row,
            producedPieces,
            progress: plannedPieces > 0 ? Math.min(100, Math.round((producedPieces / plannedPieces) * 100)) : 0,
            pulses: Math.max(Number(row?.pulses || 0), Number(ativa?.sensor_pulse_count || 0)),
            cavitiesUsed: Number(row?.cavitiesUsed || 0) || Number(ativa?.sensor_cavities_used || 0),
          };
        })
        .filter((row) => isOrderOngoingStatus(row?.status));
    }
    return filteredMachineIds
      .map((machine) => {
        const ativa = (source[machine] || [])[0] || null;
        if (!ativa) return null;

        const plannedQty = Number(ativa?.boxes || 0);
        const producedQty = Number(ativa?.scanned_count || 0);
        const stdPieces = parsePiecesPerBox(ativa?.standard);
        const plannedPieces = Number(ativa?.qty || (plannedQty > 0 && stdPieces > 0 ? plannedQty * stdPieces : 0));
        const apontamentoTipo = String(machineTypeById[machine] || "manual");
        const producedPieces = apontamentoTipo === "sensor"
          ? Number(ativa?.sensor_produced_pieces || 0)
          : (stdPieces > 0 ? producedQty * stdPieces : producedQty);
        const progress = plannedPieces > 0 ? Math.min(100, Math.round((producedPieces / plannedPieces) * 100)) : 0;

        return {
          machine,
          order: ativa?.code || ativa?.op_code || ativa?.id || "-",
          product: ativa?.product || "-",
          plannedBoxes: plannedQty,
          plannedPieces,
          producedBoxes: producedQty,
          producedPieces,
          progress,
          status: ativa?.status || "AGUARDANDO",
          apontamentoTipo,
          pulses: 0,
          cavitiesUsed: 0,
        };
      })
      .filter((row) => row && isOrderOngoingStatus(row.status));
  }, [filteredMachineIds, machineTypeById, source, periodData.ongoingOrders]);

  function getApontamentoLabel(tipo) {
    const normalized = String(tipo || "manual").toLowerCase();
    if (normalized === "sensor") return "Sensor";
    if (normalized === "bipagem") return "Bipagem";
    return "Manual";
  }

  const openStopsByMachine = useMemo(() => {
    const mapped = {};
    (Array.isArray(paradas) ? paradas : []).forEach((stop) => {
      if (stop?.resumed_at) return;
      const machine = String(stop?.machine_id || "").trim().toUpperCase();
      if (!machine) return;
      mapped[machine] = stop;
    });
    return mapped;
  }, [paradas]);

  const currentShift = getShiftWindowAt();

  function getMachineTone(status, reason) {
    const normalizedStatus = String(status || "").toUpperCase();
    const normalizedReason = String(reason || "").toUpperCase();
    if (normalizedStatus === "PARADA" && normalizedReason.includes("SET")) return "setup";
    if (normalizedStatus === "PARADA" && normalizedReason.includes("MANUT")) return "maintenance";
    if (normalizedStatus === "PARADA") return "stopped";
    if (normalizedStatus === "AGUARDANDO") return "standby";
    if (normalizedStatus === "SETUP") return "setup";
    if (normalizedStatus === "MANUTENCAO" || normalizedStatus === "MANUTENÇÃO") return "maintenance";
    if (normalizedStatus === "PRODUZINDO" || normalizedStatus === "BAIXA_EFICIENCIA") return "producing";
    return "standby";
  }

  const machineCards = useMemo(() => {
    const activeOrderMap = new Map((ongoingOrders || []).map((row) => [String(row.machine || "").toUpperCase(), row]));
    const periodStartMs = periodData.periodStartIso ? DateTime.fromISO(String(periodData.periodStartIso)).toMillis() : NaN;
    const periodEndMs = periodData.periodEndIso ? DateTime.fromISO(String(periodData.periodEndIso)).toMillis() : NaN;

    return filteredMachineIds.map((machineId) => {
      const machine = String(machineId || "").toUpperCase();
      const ativa = (source[machine] || [])[0] || null;
      const activeOrder = activeOrderMap.get(machine) || null;
      const itemCode = extractItemCodeFromOrderProduct(ativa?.product);
      const itemTech = itemCode ? itemTechByCode[itemCode] : null;
      const machineMeta = machineMetaById[machine] || {};
      const pointingMode = String(activeOrder?.apontamentoTipo || machineTypeById[machine] || "manual").toLowerCase();
      const machineName = String(machineMeta?.machine_name || "").trim();
      const currentStop = openStopsByMachine[machine] || null;
      const reason = currentStop?.reason || ativa?.reason || "";
      const status = ativa?.status || (ativa ? "AGUARDANDO" : "STANDBY");
      const tone = ativa ? getMachineTone(status, reason) : "standby";
      const statusLabel = tone === "producing"
        ? "Produzindo"
        : tone === "stopped"
          ? formatMaybe(reason, "Parada")
          : tone === "setup"
            ? formatMaybe(reason, "Setup")
            : tone === "maintenance"
              ? formatMaybe(reason, "Manutenção")
              : "Standby";

      const plannedPieces = Number(activeOrder?.plannedPieces || getOrderPlannedPieces(ativa) || 0);
      const piecesPerBox = parsePiecesPerBox(ativa?.standard);
      const producedPieces = Number(activeOrder?.producedPieces || 0);
      const producedBoxes = piecesPerBox > 0 ? Math.floor(producedPieces / piecesPerBox) : Number(activeOrder?.producedBoxes || ativa?.scanned_count || 0);
      const plannedBoxes = Number(ativa?.boxes || activeOrder?.plannedBoxes || 0);
      const progress = plannedPieces > 0 ? Math.min(100, Math.round((producedPieces / plannedPieces) * 100)) : 0;
      const remainingPieces = Math.max(0, plannedPieces - producedPieces);

      const startedAt = ativa?.restarted_at || ativa?.started_at || null;
      const startedMs = startedAt ? DateTime.fromISO(String(startedAt)).toMillis() : NaN;
      const cycleStandard = Number(itemTech?.cycleSeconds || 0);
      const itemCavities = Number(itemTech?.cavities || 0);
      const cavities = Number(machineMeta?.cavities || activeOrder?.cavitiesUsed || itemCavities || 0);
      const lastPulseAt = machineMeta?.sensor_last_pulse_at || null;
      const lastPulseMs = lastPulseAt ? DateTime.fromISO(String(lastPulseAt)).toMillis() : NaN;
      const oeeNowMs = pointingMode === "sensor" && Number.isFinite(lastPulseMs) && (!Number.isFinite(startedMs) || lastPulseMs >= startedMs)
        ? lastPulseMs
        : liveNowMs;
      const oeeWindowStartMs = Number.isFinite(periodStartMs) && Number.isFinite(startedMs) ? Math.max(startedMs, periodStartMs) : startedMs;
      const liveWindowEndMs = Number.isFinite(periodEndMs) ? Math.min(liveNowMs, periodEndMs) : liveNowMs;
      const oeeWindowEndMs = Number.isFinite(periodEndMs) ? Math.min(oeeNowMs, periodEndMs) : oeeNowMs;
      const liveElapsedSeconds = Number.isFinite(oeeWindowStartMs) ? Math.max(0, (liveWindowEndMs - oeeWindowStartMs) / 1000) : 0;
      const oeeElapsedSeconds = Number.isFinite(oeeWindowStartMs) ? Math.max(0, (oeeWindowEndMs - oeeWindowStartMs) / 1000) : 0;
      const currentCycle = tone === "producing" && Number.isFinite(lastPulseMs)
        ? Math.max(0, (liveNowMs - lastPulseMs) / 1000)
        : 0;
      const previousCycle = Number(machineMeta?.sensor_last_cycle_seconds || 0);
      const calculatedCycle = producedPieces > 0 && cavities > 0 && liveElapsedSeconds > 0
        ? (liveElapsedSeconds * cavities) / producedPieces
        : 0;
      const realCycle = currentCycle > 0 ? currentCycle : previousCycle || calculatedCycle;
      const cycleEfficiency = realCycle > 0 && cycleStandard > 0 ? (cycleStandard / realCycle) * 100 : 0;
      const stoppedSecondsForOee = sumStopSecondsInWindow(activeOrder?.stopRows || [], oeeWindowStartMs, oeeWindowEndMs);
      const availableSeconds = oeeElapsedSeconds;
      const productiveSecondsForOee = Math.max(0, availableSeconds - stoppedSecondsForOee);
      const theoreticalPieces = cycleStandard > 0 && cavities > 0 && productiveSecondsForOee > 0
        ? (productiveSecondsForOee / cycleStandard) * cavities
        : 0;
      const liveStoppedSeconds = sumStopSecondsInWindow(activeOrder?.stopRows || [], oeeWindowStartMs, liveWindowEndMs);
      const liveProductiveSeconds = Math.max(0, liveElapsedSeconds - liveStoppedSeconds);
      const liveTheoreticalPieces = cycleStandard > 0 && cavities > 0 && liveProductiveSeconds > 0
        ? (liveProductiveSeconds / cycleStandard) * cavities
        : 0;
      const scrapPieces = Number(activeOrder?.scrapPieces || 0);
      const availability = availableSeconds > 0 ? clampPercent((productiveSecondsForOee / availableSeconds) * 100) : 0;
      const performance = theoreticalPieces > 0 ? positivePercent((producedPieces / theoreticalPieces) * 100) : 0;
      const quality = producedPieces + scrapPieces > 0 ? clampPercent((producedPieces / (producedPieces + scrapPieces)) * 100) : 0;
      const oee = (availability * performance * quality) / 10000;
      const etaSeconds = cycleStandard > 0 && cavities > 0 && remainingPieces > 0
        ? (remainingPieces / (3600 / cycleStandard * cavities)) * 3600
        : 0;

      const stopSeconds = tone === "stopped" || tone === "maintenance"
        ? getElapsedSeconds(currentStop?.started_at || ativa?.interrupted_at)
        : 0;
      const setupSeconds = tone === "setup" ? getElapsedSeconds(currentStop?.started_at || ativa?.interrupted_at) : 0;
      const producingSeconds = tone === "producing" ? liveProductiveSeconds : 0;
      const cardTone = tone === "producing" && oee < 80 ? "low-oee" : tone;

      return {
        id: machine,
        displayName: machine,
        machineLabel: machineName && machineName.toUpperCase() !== machine ? machineName : machine,
        tone,
        cardTone,
        statusLabel,
        statusNote: status === "BAIXA_EFICIENCIA" ? "Baixa eficiência" : reason,
        orderNumber: ativa?.code || ativa?.op_code || activeOrder?.order || "-",
        productCode: itemCode || "-",
        productDescription: itemTech?.description || ativa?.product || "-",
        customer: ativa?.customer || itemTech?.customer || "-",
        plannedPieces,
        producedPieces,
        remainingPieces,
        plannedBoxes,
        producedBoxes,
        remainingBoxes: Math.max(0, plannedBoxes - producedBoxes),
        progress,
        oee,
        cycleStandard,
        realCycle,
        currentCycle,
        previousCycle,
        isCycleLate: cycleStandard > 0 && currentCycle > cycleStandard,
        cycleEfficiency,
        availability,
        performance,
        quality,
        partWeightG: Number(itemTech?.partWeightG || 0),
        channelWeightG: 0,
        cavities,
        itemCavities,
        machineRecordId: machineMeta?.id || null,
        mold: formatMaybe(ativa?.mold || ativa?.molde),
        operator: formatMaybe(ativa?.started_by || ativa?.restarted_by),
        shift: currentShift?.shiftLabel || currentShift?.label || "Turno atual",
        packagingType: itemTech?.packaging || ativa?.standard || "-",
        piecesPerBox,
        piecesPerPack: Number(itemTech?.standard || 0),
        palletization: "-",
        etaSeconds,
        metaPiecesNow: Math.round(liveTheoreticalPieces || 0),
        producingSeconds,
        stopSeconds,
        setupSeconds,
        pointingMode: getApontamentoLabel(pointingMode),
      };
    });
  }, [filteredMachineIds, source, ongoingOrders, itemTechByCode, machineMetaById, openStopsByMachine, currentShift, machineTypeById, liveNowMs, periodData.periodStartIso, periodData.periodEndIso]);

  const cavitiesModalMachine = useMemo(() => {
    if (!cavitiesModalMachineId) return null;
    return machineCards.find((machine) => machine.id === cavitiesModalMachineId) || null;
  }, [cavitiesModalMachineId, machineCards]);

  function openCavitiesModal(machine) {
    if (!machine) return;
    setCavitiesInput(String(machine.cavities || machine.itemCavities || ""));
    setCavitiesModalMachineId(machine.id);
  }

  async function saveCavitiesModal() {
    const machine = cavitiesModalMachine;
    const value = Number.parseInt(String(cavitiesInput || "").replace(/[^0-9]/g, ""), 10);
    if (!machine || !Number.isFinite(value) || value <= 0) return;
    if (Number(machine.itemCavities || 0) > 0 && value > Number(machine.itemCavities || 0)) {
      window.alert(`Máximo cadastrado para o item: ${machine.itemCavities}.`);
      return;
    }

    setSavingCavities(true);
    try {
      await saveMachineCavities({ machineId: machine.id, machineRecordId: machine.machineRecordId, clientId, value });

      setSensorRuntimeByMachine((prev) => ({
        ...prev,
        [machine.id]: {
          ...(prev[machine.id] || {}),
          cavities: value,
          machine_code: machine.id,
        },
      }));
      onMachineMetaUpdate && onMachineMetaUpdate(machine.id, { cavities: value });
      setCavitiesModalMachineId(null);
    } catch (error) {
      console.error("Falha ao salvar cavidades abertas:", error);
      window.alert(`Falha ao salvar cavidades abertas: ${getSupabaseErrorMessage(error)}`);
    } finally {
      setSavingCavities(false);
    }
  }

  const liveKpis = useMemo(() => {
    const productiveCards = machineCards.filter((card) => card.plannedPieces > 0 || card.producedPieces > 0);
    const avgOee = productiveCards.length
      ? productiveCards.reduce((acc, card) => acc + Number(card.oee || 0), 0) / productiveCards.length
      : Number(overview.efficiency || 0);
    const stopMinutes = Math.round(Number(overview.openStopSeconds || 0) / 60);
    return {
      avgOee,
      production: Number(overview.producedPieces || 0),
      stopMinutes,
    };
  }, [machineCards, overview]);

  const productionBuckets = useMemo(() => {
    const realValues = overview.trendRealPieces || [];
    const goalValues = overview.trendGoalPieces || [];
    const labels = overview.trendLabels || [];
    const rawBuckets = labels.map((label, index) => {
      const production = getBucketDelta(realValues, index);
      const goal = getBucketDelta(goalValues, index);
      const efficiency = goal > 0 ? (production / goal) * 100 : 0;
      const previousLabel = labels[index - 1];
      const displayLabel = periodFilter === "today" && previousLabel
        ? `${previousLabel} às ${label}`
        : label;
      return {
        id: `${label}-${index}`,
        label: displayLabel,
        production,
        goal,
        efficiency,
      };
    });
    const buckets = periodFilter === "today" ? rawBuckets.slice(1) : rawBuckets;
    const maxValue = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.production, bucket.goal)));
    return buckets.map((bucket) => ({
      ...bucket,
      height: Math.max(12, Math.round((bucket.production / maxValue) * 100)),
      goalHeight: Math.max(0, Math.round((bucket.goal / maxValue) * 100)),
    }));
  }, [overview.trendRealPieces, overview.trendGoalPieces, overview.trendLabels, periodFilter]);

  const scopedProductionBuckets = useMemo(() => {
    let buckets = productionBuckets;
    if (chartZoom && buckets.length > 1) {
      const start = Math.max(0, Math.min(chartZoom.start, buckets.length - 1));
      const end = Math.max(start, Math.min(chartZoom.end, buckets.length - 1));
      buckets = buckets.slice(start, end + 1);
    }

    return buckets.length ? buckets : productionBuckets;
  }, [chartZoom, productionBuckets]);

  const productionChart = useMemo(() => {
    const width = 1400;
    const height = 320;
    const top = 28;
    const right = 24;
    const bottom = 42;
    const left = 82;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxValue = Math.max(1, ...scopedProductionBuckets.map((bucket) => Math.max(bucket.production, bucket.goal)));
    const bucketWidth = scopedProductionBuckets.length > 0 ? plotWidth / scopedProductionBuckets.length : plotWidth;
    const barWidth = Math.max(8, Math.min(34, bucketWidth * 0.48));
    const scaleX = (index) => left + (bucketWidth * index) + (bucketWidth / 2);
    const scaleY = (value) => top + plotHeight - (Number(value || 0) / maxValue) * plotHeight;
    const points = scopedProductionBuckets.map((bucket, index) => ({
      ...bucket,
      index,
      x: scaleX(index),
      yProduction: scaleY(bucket.production),
      yGoal: scaleY(bucket.goal),
      barX: scaleX(index) - (barWidth / 2),
      barY: scaleY(bucket.production),
      barWidth,
      barHeight: Math.max(bucket.production > 0 ? 3 : 1, (Number(bucket.production || 0) / maxValue) * plotHeight),
      status: bucket.efficiency >= 100 ? "above" : bucket.efficiency >= 90 ? "near" : "below",
    }));
    const goalLine = points.map((point) => `${point.x},${point.yGoal}`).join(" ");
    const guideValues = [0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: top + plotHeight - (plotHeight * ratio),
      label: Math.round(maxValue * ratio),
    }));

    return { width, height, top, right, bottom, left, plotWidth, plotHeight, points, goalLine, guideValues };
  }, [scopedProductionBuckets]);

  const topStopReasons = useMemo(() => (overview.stopReasons || []).slice(0, 5), [overview.stopReasons]);
  const topScrapReasons = useMemo(() => (overview.scrapReasons || []).slice(0, 5), [overview.scrapReasons]);

  function getProductionChartPointerX(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
    const relativeX = Math.min(Math.max(0, clientX - rect.left), rect.width);
    const chartX = (relativeX / Math.max(1, rect.width)) * productionChart.width;
    return Math.min(
      productionChart.width - productionChart.right,
      Math.max(productionChart.left, chartX)
    );
  }

  function getProductionChartPlotPercent(event) {
    const chartX = getProductionChartPointerX(event);
    return ((chartX - productionChart.left) / Math.max(1, productionChart.plotWidth)) * 100;
  }

  function handleProductionChartPointer(event) {
    if (!productionChart.points.length) return;
    const chartX = getProductionChartPointerX(event);
    const point = productionChart.points.reduce((nearest, candidate) => {
      if (!nearest) return candidate;
      return Math.abs(candidate.x - chartX) < Math.abs(nearest.x - chartX) ? candidate : nearest;
    }, null);
    if (!point) return;
    setBarTooltip({ ...point, cursorPercent: (point.x / productionChart.width) * 100 });
  }

  function handleProductionChartPointerDown(event) {
    if (scopedProductionBuckets.length < 3) return;
    const startPercent = Math.min(100, Math.max(0, getProductionChartPlotPercent(event)));
    setChartDrag({ startPercent, endPercent: startPercent });
  }

  function handleProductionChartDrag(event) {
    handleProductionChartPointer(event);
    if (!chartDrag) return;
    const endPercent = Math.min(100, Math.max(0, getProductionChartPlotPercent(event)));
    setChartDrag((prev) => prev ? { ...prev, endPercent } : prev);
  }

  function handleProductionChartPointerUp() {
    if (!chartDrag || scopedProductionBuckets.length < 3) {
      setChartDrag(null);
      return;
    }
    const minPercent = Math.min(chartDrag.startPercent, chartDrag.endPercent);
    const maxPercent = Math.max(chartDrag.startPercent, chartDrag.endPercent);
    if (maxPercent - minPercent >= 8) {
      const sourceLength = scopedProductionBuckets.length;
      const start = Math.max(0, Math.floor((minPercent / 100) * (sourceLength - 1)));
      const end = Math.min(sourceLength - 1, Math.ceil((maxPercent / 100) * (sourceLength - 1)));
      if (end > start) setChartZoom({ start, end });
    }
    setChartDrag(null);
  }

  const selectedMachine = useMemo(
    () => machineCards.find((machine) => machine.id === selectedMachineId) || null,
    [machineCards, selectedMachineId]
  );

  useEffect(() => {
    if (!selectedMachineId) return;
    if (!machineCards.some((machine) => machine.id === selectedMachineId)) {
      setSelectedMachineId(machineCards[0]?.id || null);
    }
  }, [machineCards, selectedMachineId]);

  useEffect(() => {
    if (!selectedMachineId) return;
    function handleKeyDown(event) {
      if (event.key === "Escape") setSelectedMachineId(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedMachineId]);

  return (
    <div className="argos-monitor">
      <section className="monitor-top-panel">
        <div className="monitor-brand-row">
          <img src="/Argos sem fundo.png" alt="ARGOS" />
          <strong>Visão Geral</strong>
        </div>
        <div className="monitor-control-row">
          <select
            className="monitor-period-select"
            value={periodFilter}
            onChange={(event) => { setPeriodFilter(event.target.value); setChartZoom(null); }}
            aria-label="Filtrar período do dashboard"
          >
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="week">Últimos 7 dias</option>
            <option value="this_month">Este mês</option>
            <option value="custom">Período personalizado</option>
          </select>
          {periodFilter === "custom" && (
            <>
              <input className="monitor-date-input" type="date" value={customPeriodStart} onChange={(event) => { setCustomPeriodStart(event.target.value); setChartZoom(null); }} aria-label="Data inicial" />
              <input className="monitor-date-input" type="date" value={customPeriodEnd} onChange={(event) => { setCustomPeriodEnd(event.target.value); setChartZoom(null); }} aria-label="Data final" />
            </>
          )}
          <select
            className="monitor-filter-select"
            value={sectorFilter}
            onChange={(event) => { setSectorFilter(event.target.value); setMachineFilter("__ALL__"); setChartZoom(null); }}
            aria-label="Filtrar setor do dashboard"
          >
            <option value="__ALL__">Todos os setores</option>
            {sectorOptions.map((sector) => (
              <option value={sector} key={sector}>{sector}</option>
            ))}
          </select>
          <select
            className="monitor-filter-select"
            value={machineFilter}
            onChange={(event) => { setMachineFilter(event.target.value); setChartZoom(null); }}
            aria-label="Filtrar máquina do dashboard"
          >
            <option value="__ALL__">Todas as máquinas</option>
            {machineOptions.map((machine) => (
              <option value={machine} key={machine}>{machine}</option>
            ))}
          </select>
          <select
            className="monitor-filter-select"
            value={shiftFilter}
            onChange={(event) => { setShiftFilter(event.target.value); setChartZoom(null); }}
            aria-label="Filtrar turno do dashboard"
          >
            <option value="__ALL__">Todos os turnos</option>
            {ACTIVE_TURNOS.map((turno) => (
              <option value={turno.key} key={turno.key}>{turno.label}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="monitor-kpi-grid" aria-label="Indicadores principais">
        <article className="monitor-kpi-card">
          <span>OEE MÉDIO</span>
          <strong>{formatPercent(liveKpis.avgOee)}</strong>
          <small className={liveKpis.avgOee >= 80 ? "positive" : "negative"}>Meta 80% • {overview.periodLabel}</small>
        </article>
        <article className="monitor-kpi-card">
          <span>PRODUÇÃO</span>
          <strong>{formatCompactNumber(liveKpis.production)}</strong>
          <small className="positive">{overview.periodLabel} • dados reais</small>
        </article>
        <article className="monitor-kpi-card is-emphasis">
          <span>REFUGO</span>
          <strong>{formatPercent(overview.scrapPct, 2)}</strong>
          <small className={overview.scrapPct > 3 ? "negative" : "positive"}>{formatCompactNumber(overview.scrapPieces)} peças • {formatDecimal(overview.scrapWeightKg, 2)} kg</small>
        </article>
        <article className="monitor-kpi-card">
          <span>PARADAS (MIN)</span>
          <strong>{formatCompactNumber(liveKpis.stopMinutes)}</strong>
          <small className={liveKpis.stopMinutes > 0 ? "negative" : "positive"}>{liveKpis.stopMinutes > 0 ? `${overview.openStopCount} parada(s) abertas` : "Sem parada aberta"}</small>
        </article>
      </section>

      <section className="machine-status-panel">
        <header className="monitor-section-header">
          <h3>Status das Máquinas</h3>
          <span>ao vivo</span>
        </header>
        <div className="machine-card-grid">
          {machineCards.map((machine) => (
            <article
              className={`machine-monitor-card tone-${machine.cardTone || machine.tone}`}
              key={machine.id}
              tabIndex={0}
              role="button"
              aria-label={`Abrir detalhes da máquina ${machine.displayName}`}
              onClick={() => setSelectedMachineId(machine.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedMachineId(machine.id);
                }
              }}
            >
              <div className="machine-card-main">
                <div className="machine-card-head">
                  <strong>{machine.displayName}</strong>
                  <span>{machine.statusLabel}</span>
                </div>
                <div className="machine-card-metrics">
                  <p>OEE {formatPercent(machine.oee)}</p>
                  <p className={machine.isCycleLate ? "cycle-late" : ""}>Ciclo {formatSeconds(machine.realCycle)}</p>
                  <p>{formatCompactNumber(machine.producedPieces)} / {formatCompactNumber(machine.plannedPieces)} peças</p>
                </div>
                <div className="machine-progress-track" aria-label={`Progresso da OP ${machine.progress}%`}>
                  <div style={{ width: `${machine.progress}%` }} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedMachine && (
        <div
          className="machine-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Detalhes da máquina ${selectedMachine.displayName}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedMachineId(null);
          }}
        >
          <div className={`machine-detail-modal tone-${selectedMachine.cardTone || selectedMachine.tone}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className="machine-detail-modal-top">
              <select
                className="machine-modal-select"
                value={selectedMachine.id}
                onChange={(event) => setSelectedMachineId(event.target.value)}
                aria-label="Selecionar outra máquina"
              >
                {machineCards.map((machine) => (
                  <option value={machine.id} key={machine.id}>{machine.displayName} • {machine.statusLabel}</option>
                ))}
              </select>
              <button type="button" className="machine-modal-close" onClick={() => setSelectedMachineId(null)} aria-label="Fechar detalhes da máquina">×</button>
            </div>

            <div className="machine-detail-actions">
              <button type="button" onClick={() => openCavitiesModal(selectedMachine)}>
                Cavidades
              </button>
            </div>

            <div className="machine-detail-popover">
              <div className="popover-topline">
                <div>
                  <span>{selectedMachine.displayName} • {selectedMachine.machineLabel}</span>
                  <strong>{selectedMachine.orderNumber}</strong>
                </div>
                <b>{selectedMachine.progress}%</b>
              </div>

              <div className="popover-progress">
                <div style={{ width: `${selectedMachine.progress}%` }} />
              </div>

              <div className="popover-grid two-cols">
                <div><span>Código</span><strong>{selectedMachine.productCode}</strong></div>
                <div><span>Cliente</span><strong>{selectedMachine.customer}</strong></div>
                <div className="wide"><span>Descrição</span><strong>{selectedMachine.productDescription}</strong></div>
                <div><span>Programada</span><strong>{formatCompactNumber(selectedMachine.plannedPieces)} pç</strong></div>
                <div><span>Produzida</span><strong>{formatCompactNumber(selectedMachine.producedPieces)} pç</strong></div>
                <div><span>Restante</span><strong>{formatCompactNumber(selectedMachine.remainingPieces)} pç</strong></div>
                <div><span>Término estimado</span><strong>{selectedMachine.etaSeconds > 0 ? formatDurationShort(selectedMachine.etaSeconds) : "-"}</strong></div>
              </div>

              <div className="popover-block-title">Processo</div>
              <div className="popover-grid three-cols">
                <div><span>Ciclo padrão</span><strong>{formatSeconds(selectedMachine.cycleStandard)}</strong></div>
                <div className={selectedMachine.isCycleLate ? "metric-alert" : ""}><span>Ciclo real</span><strong>{formatSeconds(selectedMachine.realCycle)}</strong></div>
                <div><span>Ciclo anterior</span><strong>{formatSeconds(selectedMachine.previousCycle)}</strong></div>
                <div><span>Eficiência ciclo</span><strong>{formatPercent(selectedMachine.cycleEfficiency)}</strong></div>
                <div><span>Disponibilidade</span><strong>{formatPercent(selectedMachine.availability)}</strong></div>
                <div><span>Desempenho</span><strong>{formatPercent(selectedMachine.performance)}</strong></div>
                <div><span>Qualidade</span><strong>{formatPercent(selectedMachine.quality)}</strong></div>
                <div><span>Peso peça</span><strong>{selectedMachine.partWeightG > 0 ? `${formatDecimal(selectedMachine.partWeightG, 2)}g` : "-"}</strong></div>
                <div><span>Peso canal</span><strong>{selectedMachine.channelWeightG > 0 ? `${formatDecimal(selectedMachine.channelWeightG, 2)}g` : "-"}</strong></div>
                <div><span>Cavidades</span><strong>{selectedMachine.cavities || "-"}</strong></div>
                <div><span>Molde</span><strong>{selectedMachine.mold}</strong></div>
                <div><span>Máquina</span><strong>{selectedMachine.machineLabel}</strong></div>
                <div><span>Operador</span><strong>{selectedMachine.operator}</strong></div>
                <div><span>Turno</span><strong>{selectedMachine.shift}</strong></div>
                <div><span>Apontamento</span><strong>{selectedMachine.pointingMode}</strong></div>
              </div>

              <div className="popover-block-title">Embalagem</div>
              <div className="popover-grid three-cols">
                <div><span>Tipo</span><strong>{selectedMachine.packagingType}</strong></div>
                <div><span>Peças/caixa</span><strong>{selectedMachine.piecesPerBox ? formatCompactNumber(selectedMachine.piecesPerBox) : "-"}</strong></div>
                <div><span>Peças/pacote</span><strong>{selectedMachine.piecesPerPack ? formatCompactNumber(selectedMachine.piecesPerPack) : "-"}</strong></div>
                <div><span>Caixas produzidas</span><strong>{formatCompactNumber(selectedMachine.producedBoxes)}</strong></div>
                <div><span>Caixas restantes</span><strong>{formatCompactNumber(selectedMachine.remainingBoxes)}</strong></div>
                <div><span>Paletização</span><strong>{selectedMachine.palletization}</strong></div>
              </div>

              <div className="popover-time-grid">
                <div><span>Meta x realizado</span><strong>{formatCompactNumber(selectedMachine.metaPiecesNow)} / {formatCompactNumber(selectedMachine.producedPieces)}</strong></div>
                <div><span>Produzindo</span><strong>{formatDurationShort(selectedMachine.producingSeconds)}</strong></div>
                <div><span>Parada</span><strong>{formatDurationShort(selectedMachine.stopSeconds)}</strong></div>
                <div><span>Setup</span><strong>{formatDurationShort(selectedMachine.setupSeconds)}</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {cavitiesModalMachine && (
        <div
          className="machine-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Cavidades da máquina ${cavitiesModalMachine.displayName}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCavitiesModalMachineId(null);
          }}
        >
          <div className="machine-cavities-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="machine-detail-modal-top">
              <strong>Cavidades • {cavitiesModalMachine.displayName}</strong>
              <button type="button" className="machine-modal-close" onClick={() => setCavitiesModalMachineId(null)} aria-label="Fechar cavidades">×</button>
            </div>
            <div className="machine-cavities-body">
              <label htmlFor="machine-cavities-input">Cavidades abertas no momento</label>
              <input
                id="machine-cavities-input"
                value={cavitiesInput}
                onChange={(event) => setCavitiesInput(event.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                autoFocus
              />
              <p>Cadastrado no item: {cavitiesModalMachine.itemCavities || "-"} • Em uso: {cavitiesModalMachine.cavities || "-"}</p>
              <div className="machine-cavities-actions">
                <button type="button" onClick={() => setCavitiesModalMachineId(null)} disabled={savingCavities}>Cancelar</button>
                <button type="button" onClick={saveCavitiesModal} disabled={savingCavities || !cavitiesInput.trim()}>
                  {savingCavities ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="monitor-charts-row">
        <article className="monitor-chart-card bar-chart-card">
          <header className="monitor-section-header">
            <h3>{isDailyTrendPeriod(periodFilter) ? "Produção por Dia x Meta" : "Produção por Hora x Meta"}</h3>
            <div className="production-chart-actions">
              {chartZoom && <button type="button" onClick={() => setChartZoom(null)}>Reset zoom</button>}
              <span>{overview.periodLabel}</span>
            </div>
          </header>
          <div className="production-chart-meta">
            <span><i className="legend-real" />Produção</span>
            <span><i className="legend-goal" />Meta</span>
            <strong>{formatCompactNumber(scopedProductionBuckets.reduce((acc, bar) => acc + bar.production, 0))} peças</strong>
          </div>
          <div className="production-chart-frame">
            <div
              className="production-chart-plot line-chart-plot"
              role="img"
              aria-label="Produção por hora comparada com meta"
              onMouseEnter={handleProductionChartPointer}
              onMouseMove={handleProductionChartDrag}
              onMouseLeave={() => setBarTooltip(null)}
              onPointerEnter={handleProductionChartPointer}
              onPointerDown={handleProductionChartPointerDown}
              onPointerMove={handleProductionChartDrag}
              onPointerUp={handleProductionChartPointerUp}
              onPointerCancel={() => setChartDrag(null)}
              onPointerLeave={() => { setBarTooltip(null); setChartDrag(null); }}
              onTouchMove={handleProductionChartDrag}
            >
              <svg className="production-area-chart production-bar-chart" viewBox={`0 0 ${productionChart.width} ${productionChart.height}`} preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="productionBarGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#7ee8ff" stopOpacity="0.96" />
                    <stop offset="48%" stopColor="#22c7ff" stopOpacity="0.86" />
                    <stop offset="100%" stopColor="#266dff" stopOpacity="0.72" />
                  </linearGradient>
                </defs>
                {productionChart.guideValues.map((guide) => (
                  <g className="chart-guide" key={guide.y}>
                    <line x1={productionChart.left} x2={productionChart.width - productionChart.right} y1={guide.y} y2={guide.y} />
                    <text x={productionChart.left - 12} y={guide.y + 4}>{formatCompactNumber(guide.label)}</text>
                  </g>
                ))}
                {productionChart.goalLine && <polyline className="production-goal-line" points={productionChart.goalLine} />}
                {productionChart.points.map((point) => (
                  <rect
                    className={`production-column${barTooltip?.id === point.id ? " is-active" : ""}${point.production <= 0 ? " is-zero" : ""}`}
                    key={point.id}
                    x={point.barX}
                    y={point.barY}
                    width={point.barWidth}
                    height={point.barHeight}
                    rx="7"
                  />
                ))}
                {barTooltip && (
                  <g className="chart-crosshair">
                    <line x1={barTooltip.x} x2={barTooltip.x} y1={productionChart.top} y2={productionChart.top + productionChart.plotHeight} />
                  </g>
                )}
              </svg>
              <div className="production-chart-axis" aria-hidden="true">
                {productionChart.points.map((point, index) => (
                  <span key={point.id}>{index % Math.ceil(Math.max(1, productionChart.points.length) / 6) === 0 ? point.label.split(" ")[0] : ""}</span>
                ))}
              </div>
              {barTooltip && <div className="point-tooltip" style={{ left: `${barTooltip.cursorPercent}%`, top: `${Math.max(12, (barTooltip.yProduction / productionChart.height) * 100)}%` }}>{formatCompactNumber(barTooltip.production)}</div>}
              {chartDrag && (
                <div
                  className="chart-zoom-selection"
                  style={{
                    left: `${Math.min(chartDrag.startPercent, chartDrag.endPercent)}%`,
                    width: `${Math.abs(chartDrag.endPercent - chartDrag.startPercent)}%`,
                  }}
                />
              )}
              <aside className={`production-hover-card status-${barTooltip?.status || "idle"}`}>
                <span>{barTooltip ? barTooltip.label : "Passe o mouse no gráfico"}</span>
                <strong>{barTooltip ? `${formatCompactNumber(barTooltip.production)} peças` : "Aguardando ponto"}</strong>
                <div>
                  <p><b>Meta esperada</b><em>{barTooltip ? `${formatCompactNumber(barTooltip.goal)} peças` : "-"}</em></p>
                  <p><b>Diferença</b><em>{barTooltip ? `${barTooltip.production - barTooltip.goal >= 0 ? "+" : ""}${formatCompactNumber(barTooltip.production - barTooltip.goal)} peças` : "-"}</em></p>
                  <p><b>Eficiência</b><em>{barTooltip ? formatPercent(barTooltip.efficiency, 0) : "-"}</em></p>
                </div>
                <small>{barTooltip?.status === "above" ? "Acima da meta" : barTooltip?.status === "near" ? "Dentro da meta" : barTooltip?.status === "below" ? "Abaixo da meta" : "Sem seleção"}</small>
              </aside>
            </div>
          </div>
        </article>

        <article className="monitor-chart-card top-stops-card">
          <header className="monitor-section-header">
            <h3>Top 5 Paradas</h3>
            <span>tempo acumulado</span>
          </header>
          <div className="top-stops-list">
            {topStopReasons.length === 0 ? (
              <div className="top-stops-empty">Nenhuma parada registrada no período.</div>
            ) : topStopReasons.map((stop, index) => (
              <div className="top-stop-row" key={stop.reason}>
                <div className="top-stop-rank">{index + 1}</div>
                <div className="top-stop-main">
                  <div className="top-stop-head">
                    <strong>{stop.reason}</strong>
                    <span>{formatDurationShort(Number(stop.totalMs || 0) / 1000)}</span>
                  </div>
                  <div className="top-stop-bar"><div style={{ width: `${stop.percent}%` }} /></div>
                  <small>{stop.percent}% de participação • {stop.count} ocorrência(s)</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="monitor-chart-card top-stops-card top-scrap-card">
          <header className="monitor-section-header">
            <h3>Top 5 Motivos de Refugo</h3>
            <span>peças refugadas</span>
          </header>
          <div className="top-stops-list">
            {topScrapReasons.length === 0 ? (
              <div className="top-stops-empty">Nenhum refugo registrado no período.</div>
            ) : topScrapReasons.map((scrap, index) => (
              <div className="top-stop-row" key={scrap.reason}>
                <div className="top-stop-rank scrap-rank">{index + 1}</div>
                <div className="top-stop-main">
                  <div className="top-stop-head">
                    <strong>{scrap.reason}</strong>
                    <span>{formatCompactNumber(scrap.pieces)} pç</span>
                  </div>
                  <div className="top-stop-bar scrap-bar"><div style={{ width: `${scrap.percent}%` }} /></div>
                  <small>{scrap.percent}% do refugo • {formatDecimal(scrap.weightKg, 2)} kg</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

