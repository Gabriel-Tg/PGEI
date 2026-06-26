// src/pages/Painel.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MAQUINAS, STATUS } from "../domain/constants";
import { DateTime } from "luxon";
import { supabase } from "../lib/supabaseClient";
import { ACTIVE_TURNOS, getShiftWindowAt, getShiftWindowsInRange } from "../lib/shifts";
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

function formatClock(value) {
  const dt = DateTime.fromISO(String(value || "")).setZone("America/Sao_Paulo");
  return dt.isValid ? dt.toFormat("HH:mm") : "--:--";
}

function getIsoMs(value) {
  const ms = DateTime.fromISO(String(value || "")).toMillis();
  return Number.isFinite(ms) ? ms : NaN;
}

function clipIntervalMs(startValue, endValue, rangeStartMs, rangeEndMs, fallbackEndMs = Date.now()) {
  const startMs = getIsoMs(startValue);
  if (!Number.isFinite(startMs)) return null;
  const rawEndMs = endValue ? getIsoMs(endValue) : fallbackEndMs;
  const endMs = Number.isFinite(rawEndMs) ? rawEndMs : fallbackEndMs;
  const clippedStart = Math.max(rangeStartMs, startMs);
  const clippedEnd = Math.min(rangeEndMs, endMs);
  if (clippedEnd <= clippedStart) return null;
  return { startMs: clippedStart, endMs: clippedEnd };
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

function mapItemTechRow(item) {
  return {
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

function buildMetricWindows({ periodStartIso, periodEndIso, shiftFilter, sessionStartMs, endMs }) {
  const periodStart = periodStartIso ? DateTime.fromISO(String(periodStartIso)).setZone("America/Sao_Paulo") : null;
  const periodEnd = periodEndIso ? DateTime.fromISO(String(periodEndIso)).setZone("America/Sao_Paulo") : null;
  const periodStartMs = periodStart?.isValid ? periodStart.toMillis() : NaN;
  const periodEndMs = periodEnd?.isValid ? periodEnd.toMillis() : NaN;
  if (!(Number.isFinite(periodStartMs) && Number.isFinite(periodEndMs) && periodEndMs > periodStartMs)) return [];

  const baseWindows = shiftFilter && shiftFilter !== "__ALL__"
    ? getShiftWindowsInRange(periodStart, periodEnd, { shiftKeys: [shiftFilter] })
    : [[periodStartMs, periodEndMs]];

  const capEndMs = Number.isFinite(endMs) ? Math.min(endMs, periodEndMs) : periodEndMs;
  const capStartMs = Number.isFinite(sessionStartMs) ? Math.max(sessionStartMs, periodStartMs) : periodStartMs;

  return baseWindows
    .map(([start, end]) => [Math.max(Number(start), capStartMs), Math.min(Number(end), capEndMs)])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start);
}

function sumMetricWindowSeconds(windows) {
  return (Array.isArray(windows) ? windows : []).reduce((acc, [start, end]) => acc + Math.max(0, (end - start) / 1000), 0);
}

function sumStopSecondsInWindows(rows, windows) {
  if (!Array.isArray(windows) || !windows.length) return 0;
  return windows.reduce((total, [windowStart, windowEnd]) => total + sumStopSecondsInWindow(rows, windowStart, windowEnd), 0);
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

function getCavitiesWithinMold(openCavities, moldCavities, fallback = 0) {
  const open = Number(openCavities || 0);
  const mold = Number(moldCavities || 0);
  const base = open > 0 ? open : Number(fallback || 0);
  if (mold > 0) return Math.min(base > 0 ? base : mold, mold);
  return base > 0 ? base : 0;
}

function buildMetricNote(title, formula, calculation) {
  return { title, formula, calculation };
}

function MetricWithNote({ label, value, note }) {
  return (
    <div className="metric-note-item" tabIndex={0} aria-label={`${label}: ${note.calculation}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <span className="metric-note" role="tooltip">
        <b>{note.title}</b>
        <span>{note.formula}</span>
        <em>{note.calculation}</em>
      </span>
    </div>
  );
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

function normalizeSensorEntriesByItemCavities(entries, itemTechByCode) {
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const isSensorEntry = String(entry?.source || "").toLowerCase() === "sensor" || Number(entry?.pulse_count || 0) > 0;
    if (!isSensorEntry) return entry;

    const itemCode = extractItemCodeFromOrderProduct(entry?.order?.product || entry?.product || entry?.code);
    const itemCavities = itemCode ? Number(itemTechByCode?.[itemCode]?.cavities || 0) : 0;
    const pulseCount = Number(entry?.pulse_count || 0);
    if (!(itemCavities > 0 && pulseCount > 0)) return entry;
    const effectiveCavities = getCavitiesWithinMold(entry?.cavities_used, itemCavities, itemCavities);

    return {
      ...entry,
      good_qty: pulseCount * effectiveCavities,
      cavities_used: effectiveCavities,
    };
  });
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

function buildMachineTimelineSegments(stops, machine, rangeStartMs, rangeEndMs) {
  const machineKey = String(machine || "").trim().toUpperCase();
  const stopIntervals = (Array.isArray(stops) ? stops : [])
    .filter((stop) => String(stop?.machine_id || "").trim().toUpperCase() === machineKey)
    .map((stop) => {
      const interval = clipIntervalMs(stop?.started_at, stop?.resumed_at, rangeStartMs, rangeEndMs);
      if (!interval) return null;
      return { ...interval, type: "stop", reason: String(stop?.reason || "Parada").trim() || "Parada" };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs);

  const segments = [];
  let cursor = rangeStartMs;
  stopIntervals.forEach((stop) => {
    if (stop.startMs > cursor) segments.push({ type: "production", startMs: cursor, endMs: stop.startMs });
    segments.push(stop);
    cursor = Math.max(cursor, stop.endMs);
  });
  if (cursor < rangeEndMs) segments.push({ type: "production", startMs: cursor, endMs: rangeEndMs });
  return segments;
}

function uniqueNonEmpty(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function getGoalEventOrder(row) {
  return row?.order || {
    id: row?.order_id,
    product: row?.product || row?.code,
    standard: row?.standard,
  };
}

function getGoalEventTimestamp(row) {
  return getEffectiveProductionTimestamp(row) || row?.created_at;
}

function getOrderStartMs(order) {
  const startedMs = DateTime.fromISO(String(order?.started_at || "")).toMillis();
  const restartedMs = DateTime.fromISO(String(order?.restarted_at || "")).toMillis();
  if (Number.isFinite(startedMs) && Number.isFinite(restartedMs)) return Math.max(startedMs, restartedMs);
  if (Number.isFinite(restartedMs)) return restartedMs;
  return Number.isFinite(startedMs) ? startedMs : NaN;
}

function getOrderEndMs(order) {
  const finalizedMs = DateTime.fromISO(String(order?.finalized_at || "")).toMillis();
  if (Number.isFinite(finalizedMs)) return finalizedMs;
  const status = String(order?.status || "").toUpperCase();
  if (status === "PRODUZINDO" || status === "BAIXA_EFICIENCIA") return NaN;
  const interruptedMs = DateTime.fromISO(String(order?.interrupted_at || "")).toMillis();
  return Number.isFinite(interruptedMs) ? interruptedMs : NaN;
}

function buildHistoricalGoalSegments({ scans, entries, periodStartMs, periodEndMs, itemTechByCode }) {
  const rows = [
    ...(Array.isArray(scans) ? scans : []),
    ...(Array.isArray(entries) ? entries : []),
  ]
    .map((row) => {
      const order = getGoalEventOrder(row);
      const eventMs = DateTime.fromISO(String(getGoalEventTimestamp(row) || "")).toMillis();
      const machine = String(row?.machine_id || order?.machine_id || "").trim().toUpperCase();
      const itemCode = extractItemCodeFromOrderProduct(order?.product || row?.product || row?.code);
      if (!machine || !itemCode || !Number.isFinite(eventMs)) return null;
      return { row, order, eventMs, machine, itemCode };
    })
    .filter(Boolean)
    .sort((a, b) => a.eventMs - b.eventMs);

  const byMachine = new Map();
  rows.forEach((event) => {
    if (!byMachine.has(event.machine)) byMachine.set(event.machine, []);
    byMachine.get(event.machine).push(event);
  });

  const segments = [];
  byMachine.forEach((events) => {
    let current = null;

    events.forEach((event) => {
      const orderKey = String(event.order?.id || event.row?.order_id || "");
      const sameOrder = current && current.orderKey && current.orderKey === orderKey;
      const sameItem = current && current.itemCode === event.itemCode;
      if (current && (sameOrder || sameItem)) {
        current.lastEventMs = event.eventMs;
        const orderEndMs = getOrderEndMs(event.order);
        if (Number.isFinite(orderEndMs)) current.endMs = Math.min(current.endMs || periodEndMs, orderEndMs);
        return;
      }

      if (current) {
        current.endMs = Math.min(current.endMs || periodEndMs, event.eventMs);
        segments.push(current);
      }

      const orderStartMs = getOrderStartMs(event.order);
      const orderEndMs = getOrderEndMs(event.order);
      const startMs = current
        ? event.eventMs
        : Number.isFinite(orderStartMs)
          ? orderStartMs
          : periodStartMs;
      current = {
        machine: event.machine,
        itemCode: event.itemCode,
        orderKey,
        startMs: Math.max(periodStartMs, startMs),
        endMs: Number.isFinite(orderEndMs) ? Math.min(periodEndMs, orderEndMs) : periodEndMs,
        lastEventMs: event.eventMs,
        order: event.order,
      };
    });

    if (current) segments.push(current);
  });

  return segments
    .map((segment) => {
      const ratePiecesPerHour = getOrderRatePiecesPerHour(segment.order, itemTechByCode);
      const piecesPerBox = parsePiecesPerBox(segment.order?.standard);
      const tech = segment.itemCode ? itemTechByCode?.[segment.itemCode] : null;
      if (!(ratePiecesPerHour > 0) || segment.endMs <= segment.startMs) return null;
      return {
        ...segment,
        ratePiecesPerHour,
        piecesPerBox,
        cycleSeconds: Number(tech?.cycleSeconds || 0),
        cavities: Number(tech?.cavities || 0),
        product: segment.order?.product || segment.itemCode,
        itemLabel: `${segment.itemCode}${tech?.description ? ` - ${tech.description}` : ""}`,
      };
    })
    .filter(Boolean);
}

function buildDynamicGoalSeries({ periodKey, labels, periodStart, periodEnd, source, machineIds, itemTechByCode, scans, entries }) {
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
  const historicalSegments = buildHistoricalGoalSegments({ scans, entries, periodStartMs, periodEndMs, itemTechByCode });

  if (historicalSegments.length) {
    pointsMs.forEach((pointMsRaw) => {
      const pointMs = Math.min(Math.max(pointMsRaw, periodStartMs), periodEndMs);
      let sumBoxes = 0;
      let sumPieces = 0;

      historicalSegments.forEach((segment) => {
        const startMs = Math.max(segment.startMs, periodStartMs);
        const endMs = Math.min(segment.endMs, pointMs);
        if (endMs <= startMs) return;
        const hours = (endMs - startMs) / 1000 / 60 / 60;
        const pieces = hours * segment.ratePiecesPerHour;
        sumPieces += pieces;
        if (segment.piecesPerBox > 0) sumBoxes += pieces / segment.piecesPerBox;
      });

      goalBoxes.push(Math.round(sumBoxes));
      goalPieces.push(Math.round(sumPieces));
    });

    return { goalBoxes, goalPieces, goalSegments: historicalSegments };
  }

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

  return { goalBoxes, goalPieces, goalSegments: [] };
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
  const [selectedProductionBucketId, setSelectedProductionBucketId] = useState(null);
  const [hourlyCycleTooltip, setHourlyCycleTooltip] = useState(null);
  const [hourlyMachineFilter, setHourlyMachineFilter] = useState("__NONE__");
  const preserveHourlyMachineOnBucketChangeRef = useRef(false);
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
    trendStopSeconds: Array(24).fill(0),
    shiftOutput: ACTIVE_TURNOS.map((turno) => ({ ...turno, boxes: 0, pieces: 0, pulses: 0, active: false })),
    scrapPieces: 0,
    scrapPct: 0,
    scrapWeightKg: 0,
    scrapReasons: [],
    ongoingOrders: [],
    productionEvents: [],
    stopEvents: [],
    scrapEvents: [],
    operatorEvents: [],
    goalSegments: [],
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
        mapped[code] = mapItemTechRow(item);
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
        const itemCode = extractItemCodeFromOrderProduct(ativa?.product);
        const itemCavities = itemCode ? Number(itemTechByCode?.[itemCode]?.cavities || 0) : 0;
        return { machine, orderId, itemCavities };
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
        .select("machine_code, machine_name, cavities, sensor_status, sensor_last_pulse_at, sensor_last_cycle_seconds, sensor_cycle_count, sensor_last_heartbeat_at, sensor_auto_stopped, sensor_auto_stop_at")
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
        const cavitiesByOrder = Object.fromEntries(activeSensorOrders.map((item) => [item.orderId, Number(item.itemCavities || 0)]));
        (entriesRes?.data || []).forEach((row) => {
          const orderId = String(row?.order_id || "");
          if (!orderId) return;
          if (!totalsByOrder[orderId]) totalsByOrder[orderId] = { pieces: 0, pulses: 0, cavities: 0 };
          const pulses = Number(row?.pulse_count || 0);
          const cavities = Number(row?.cavities_used || 0);
          const itemCavities = Number(cavitiesByOrder[orderId] || 0);
          const effectiveCavities = getCavitiesWithinMold(cavities, itemCavities, itemCavities);
          totalsByOrder[orderId].pieces += pulses > 0 && effectiveCavities > 0
            ? pulses * effectiveCavities
            : Number(row?.good_qty || 0);
          totalsByOrder[orderId].pulses += pulses;
          if (effectiveCavities > 0) totalsByOrder[orderId].cavities = effectiveCavities;
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
  }, [clientId, filteredMachineIds, itemTechByCode, machineTypeById, source]);

  useEffect(() => {
    let cancelled = false;

    async function loadPeriodData() {
      const period = getDashboardPeriodRange(periodFilter, customPeriodStart, customPeriodEnd);
      const startIso = period.start.toUTC().toISO();
      const endIso = period.end.toUTC().toISO();

      let scansQuery = supabase
        .from("production_scans")
        .select("id, created_at, machine_id, order_id, scanned_box, qty_pieces, op_code, code, order:orders(id, code, product, boxes, qty, standard, status, finalized, machine_id, started_at, restarted_at, interrupted_at, finalized_at, started_by, restarted_by)")
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

      let operatorQuery = supabase
        .from("shift_responsibles")
        .select("id, machine_id, shift, operator, responsible, responsavel, effective_date, created_at")
        .lte("created_at", endIso)
        .gte("created_at", period.start.minus({ days: 1 }).toUTC().toISO());

      if (clientId) {
        scansQuery = scansQuery.eq("company_id", clientId);
        stopsQuery = stopsQuery.eq("company_id", clientId);
        lowEffQuery = lowEffQuery.eq("company_id", clientId);
        scrapQuery = scrapQuery.eq("company_id", clientId);
        operatorQuery = operatorQuery.eq("company_id", clientId);
      }

      if (filteredMachineIds.length > 0 && filteredMachineIds.length < machineIds.length) {
        scansQuery = scansQuery.in("machine_id", filteredMachineIds);
        stopsQuery = stopsQuery.in("machine_id", filteredMachineIds);
        lowEffQuery = lowEffQuery.in("machine_id", filteredMachineIds);
        scrapQuery = scrapQuery.in("machine_id", filteredMachineIds);
        operatorQuery = operatorQuery.in("machine_id", filteredMachineIds);
      }

      const [scansRes, entriesRes, sensorCyclesRes, stopsRes, lowEffRes, scrapRes, operatorRes] = await Promise.all([
        scansQuery,
        fetchAllPages(() => {
          let query = supabase
            .from("injection_production_entries")
            .select("id, created_at, updated_at, sensor_last_pulse_at, machine_id, order_id, good_qty, pulse_count, cavities_used, source, order:orders(id, code, product, boxes, qty, standard, status, finalized, machine_id, started_at, restarted_at, interrupted_at, finalized_at, started_by, restarted_by)")
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
            .select("id, machine_id, order_id, produced_quantity, pulse_count, cavities_used, cycle_timestamps, first_pulse_at, last_pulse_at, order:orders(id, code, product, boxes, qty, standard, status, finalized, machine_id, started_at, restarted_at, interrupted_at, finalized_at, started_by, restarted_by)")
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
        operatorQuery,
      ]);
      if (cancelled) return;

      const scans = (scansRes?.data || []).filter((row) => matchesShiftFilter(row?.created_at, shiftFilter));
      const entries = entriesRes?.data || [];
      const sensorCycleEntries = buildSensorCycleEntries(sensorCyclesRes?.data || [], period.start, period.end);
      let entriesForTimeline = mergeEntriesWithSensorCycles(entries, sensorCycleEntries)
        .filter((row) => matchesShiftFilter(getEffectiveProductionTimestamp(row), shiftFilter));
      const stops = (stopsRes?.data || []).filter((row) => matchesShiftFilter(row?.started_at, shiftFilter));
      const lowEff = (lowEffRes?.data || []).filter((row) => matchesShiftFilter(row?.started_at, shiftFilter));
      const scraps = (scrapRes?.data || []).filter((row) => matchesShiftFilter(row?.created_at, shiftFilter));
      const operatorEvents = (operatorRes?.data || [])
        .map((row) => ({
          id: row?.id,
          machine_id: row?.machine_id,
          shift: row?.shift,
          operator: String(row?.operator || row?.responsible || row?.responsavel || "").trim(),
          created_at: row?.created_at,
        }))
        .filter((row) => row.operator && row.created_at);

      const periodItemCodes = uniqueNonEmpty([
        ...scans.map((row) => extractItemCodeFromOrderProduct(row?.order?.product || row?.code)),
        ...entriesForTimeline.map((row) => extractItemCodeFromOrderProduct(row?.order?.product || row?.product || row?.code)),
      ]);
      const periodItemTechByCode = { ...itemTechByCode };
      const missingPeriodItemCodes = periodItemCodes.filter((code) => !periodItemTechByCode[code]);
      if (missingPeriodItemCodes.length) {
        let periodItemsQuery = supabase
          .from("items")
          .select("code, description, color, cycle_seconds, cavities, padrao, embalagem, part_weight_g, unit_value, resin, unidade, cliente")
          .in("code", missingPeriodItemCodes);
        if (clientId) periodItemsQuery = periodItemsQuery.eq("company_id", clientId);
        const { data: periodItems, error: periodItemsError } = await periodItemsQuery;
        if (periodItemsError) {
          console.warn("Falha ao carregar ciclo/cavidades historicos no painel:", periodItemsError);
        }
        (periodItems || []).forEach((item) => {
          const code = String(item?.code || "").trim();
          if (!code) return;
          periodItemTechByCode[code] = mapItemTechRow(item);
        });
      }

      entriesForTimeline = normalizeSensorEntriesByItemCavities(entriesForTimeline, periodItemTechByCode);

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
        scans.forEach((row) => {
          const key = String(row?.order_id || "");
          if (!key || !activeOrderIds.includes(key)) return;
          if (!activeScanByOrder[key]) activeScanByOrder[key] = { pieces: 0 };
          activeScanByOrder[key].pieces += Number(row?.qty_pieces || 0);
        });

        entriesForTimeline.forEach((row) => {
          const key = String(row?.order_id || "");
          if (!key || !activeOrderIds.includes(key)) return;
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
        const totalSensorPieces = Number(ativa?.sensor_produced_pieces || 0);
        const totalScannedPieces = stdPieces > 0
          ? Number(ativa?.scanned_count || 0) * stdPieces
          : Number(ativa?.scanned_count || 0);

        const filteredProducedPieces = apontamentoTipo === "sensor"
          ? entryPieces
          : scanPieces;
        const producedPieces = apontamentoTipo === "sensor"
          ? totalSensorPieces
          : totalScannedPieces;

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
          filteredProducedPieces,
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
      const trendStopSeconds = isDailyTrendPeriod(periodFilter)
        ? []
        : buildHourlyStopSeries(stops, period.start, period.end);
      const shiftOutput = buildShiftOutput(scans, entriesForTimeline);
      const dynamicGoal = buildDynamicGoalSeries({
        periodKey: periodFilter,
        labels: trendBase.labels,
        periodStart: period.start,
        periodEnd: period.end,
        source,
        machineIds: filteredMachineIds,
        itemTechByCode: periodItemTechByCode,
        scans,
        entries: entriesForTimeline,
      });
      const trendGoal = dynamicGoal.goalBoxes;
      const trendGoalPieces = dynamicGoal.goalPieces;
      const productionEvents = [
        ...scans.map((row) => ({
          id: row?.id,
          created_at: row?.created_at,
          machine_id: row?.machine_id,
          order_id: row?.order_id,
          orderCode: row?.order?.code || row?.op_code || "-",
          product: row?.order?.product || row?.code || "-",
          pieces: Number(row?.qty_pieces || 0),
          cycles: 1,
          operator: row?.order?.restarted_by || row?.order?.started_by || "",
          source: "bipagem",
        })),
        ...entriesForTimeline.map((row) => ({
          id: row?.id,
          created_at: getEffectiveProductionTimestamp(row),
          machine_id: row?.machine_id,
          order_id: row?.order_id,
          orderCode: row?.order?.code || "-",
          product: row?.order?.product || row?.product || "-",
          pieces: Number(row?.good_qty || 0),
          cycles: Number(row?.pulse_count || 0) || 1,
          operator: row?.order?.restarted_by || row?.order?.started_by || "",
          source: String(row?.source || "sensor"),
        })),
      ];

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
        trendStopSeconds,
        shiftOutput,
        scrapPieces,
        scrapPct,
        scrapWeightKg,
        scrapReasons,
        ongoingOrders,
        productionEvents,
        stopEvents: stops,
        scrapEvents: scraps,
        operatorEvents,
        goalSegments: dynamicGoal.goalSegments || [],
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
                  const itemCode = extractItemCodeFromOrderProduct(item?.product);
                  const itemCavities = itemCode ? Number(itemTechByCode?.[itemCode]?.cavities || 0) : 0;
                  const effectiveCavities = getCavitiesWithinMold(cavitiesUsed, itemCavities, itemCavities);
                  const effectiveGoodQty = pulseCount > 0 && effectiveCavities > 0
                    ? pulseCount * effectiveCavities
                    : goodQty;
                  return {
                    ...item,
                    sensor_produced_pieces: Number(item?.sensor_produced_pieces || 0) + effectiveGoodQty,
                    sensor_pulse_count: Number(item?.sensor_pulse_count || 0) + pulseCount,
                    sensor_cavities_used: effectiveCavities || Number(item?.sensor_cavities_used || 0),
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
  }, [clientId, itemTechByCode, onScanned]);

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
      const itemCavities = Number(tech?.cavities || 0);
      const activeOrder = activeOrderMap.get(String(machine || "").toUpperCase()) || null;
      const machineMeta = machineMetaById[String(machine || "").toUpperCase()] || {};
      const cavities = getCavitiesWithinMold(machineMeta?.cavities || activeOrder?.cavitiesUsed, itemCavities, itemCavities);
      if (!(cycleSeconds > 0 && cavities > 0)) continue;

      const elapsedSeconds = Math.max(0, (cappedNowMs - windowStartMs) / 1000);
      const piecesPerHour = (3600 / cycleSeconds) * cavities;
      const metaPiecesNow = (elapsedSeconds / 3600) * piecesPerHour;

      const piecesPerBox = parsePiecesPerBox(ativa?.standard);
      const producedPieces = Number(activeOrder?.filteredProducedPieces ?? activeOrder?.producedPieces ?? 0);
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
      trendStopSeconds: periodData.trendStopSeconds || [],
      goalSegments: periodData.goalSegments || [],
      shiftOutput: periodData.shiftOutput || [],
      scrapPieces: Number(periodData.scrapPieces || 0),
      scrapPct: Number(periodData.scrapPct || 0),
      scrapWeightKg: Number(periodData.scrapWeightKg || 0),
      scrapReasons: periodData.scrapReasons || [],
      trendLabels: periodData.trendLabels || [],
      periodLabel: periodData.periodLabel || "Hoje",
    };
  }, [filteredMachineIds, periodData, source, itemTechByCode, machineMetaById, tick]);

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

          const producedPieces = Number(row?.producedPieces || 0);
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
      const filteredProducedPieces = Number(activeOrder?.filteredProducedPieces ?? producedPieces);
      const producedBoxes = piecesPerBox > 0 ? Math.floor(producedPieces / piecesPerBox) : Number(activeOrder?.producedBoxes || ativa?.scanned_count || 0);
      const plannedBoxes = Number(ativa?.boxes || activeOrder?.plannedBoxes || 0);
      const progress = plannedPieces > 0 ? Math.min(100, Math.round((producedPieces / plannedPieces) * 100)) : 0;
      const remainingPieces = Math.max(0, plannedPieces - producedPieces);

      const startedAt = ativa?.started_at || ativa?.restarted_at || null;
      const startedMs = startedAt ? DateTime.fromISO(String(startedAt)).toMillis() : NaN;
      const cycleStandard = Number(itemTech?.cycleSeconds || 0);
      const itemCavities = Number(itemTech?.cavities || 0);
      const cavities = getCavitiesWithinMold(machineMeta?.cavities || activeOrder?.cavitiesUsed, itemCavities, itemCavities);
      const theoreticalCavities = cavities;
      const lastPulseAt = machineMeta?.sensor_last_pulse_at || null;
      const lastPulseMs = lastPulseAt ? DateTime.fromISO(String(lastPulseAt)).toMillis() : NaN;
      const oeeNowMs = pointingMode === "sensor" && Number.isFinite(lastPulseMs) && (!Number.isFinite(startedMs) || lastPulseMs >= startedMs)
        ? lastPulseMs
        : liveNowMs;
      const liveWindows = buildMetricWindows({
        periodStartIso: periodData.periodStartIso,
        periodEndIso: periodData.periodEndIso,
        shiftFilter,
        sessionStartMs: startedMs,
        endMs: liveNowMs,
      });
      const oeeWindows = buildMetricWindows({
        periodStartIso: periodData.periodStartIso,
        periodEndIso: periodData.periodEndIso,
        shiftFilter,
        sessionStartMs: startedMs,
        endMs: oeeNowMs,
      });
      const liveElapsedSeconds = sumMetricWindowSeconds(liveWindows);
      const oeeElapsedSeconds = sumMetricWindowSeconds(oeeWindows);
      const currentCycle = tone === "producing" && Number.isFinite(lastPulseMs)
        ? Math.max(0, (liveNowMs - lastPulseMs) / 1000)
        : 0;
      const previousCycle = Number(machineMeta?.sensor_last_cycle_seconds || 0);
      const calculatedCycle = filteredProducedPieces > 0 && cavities > 0 && liveElapsedSeconds > 0
        ? (liveElapsedSeconds * cavities) / filteredProducedPieces
        : 0;
      const realCycle = currentCycle > 0 ? currentCycle : previousCycle || calculatedCycle;
      const cycleEfficiency = realCycle > 0 && cycleStandard > 0 ? (cycleStandard / realCycle) * 100 : 0;
      const stoppedSecondsForOee = sumStopSecondsInWindows(activeOrder?.stopRows || [], oeeWindows);
      const availableSeconds = oeeElapsedSeconds;
      const productiveSecondsForOee = Math.max(0, availableSeconds - stoppedSecondsForOee);
      const theoreticalPieces = cycleStandard > 0 && theoreticalCavities > 0 && productiveSecondsForOee > 0
        ? (productiveSecondsForOee / cycleStandard) * theoreticalCavities
        : 0;
      const liveStoppedSeconds = sumStopSecondsInWindows(activeOrder?.stopRows || [], liveWindows);
      const liveProductiveSeconds = Math.max(0, liveElapsedSeconds - liveStoppedSeconds);
      const liveTheoreticalPieces = cycleStandard > 0 && theoreticalCavities > 0 && liveProductiveSeconds > 0
        ? (liveProductiveSeconds / cycleStandard) * theoreticalCavities
        : 0;
      const scrapPieces = Number(activeOrder?.scrapPieces || 0);
      const availability = availableSeconds > 0 ? clampPercent((productiveSecondsForOee / availableSeconds) * 100) : 0;
      const performance = theoreticalPieces > 0 ? positivePercent((filteredProducedPieces / theoreticalPieces) * 100) : 0;
      const quality = filteredProducedPieces + scrapPieces > 0 ? clampPercent((filteredProducedPieces / (filteredProducedPieces + scrapPieces)) * 100) : 0;
      const oee = (availability * performance * quality) / 10000;
      const totalQualityPieces = filteredProducedPieces + scrapPieces;
      const metricNotes = {
        availability: buildMetricNote(
          "Cálculo da disponibilidade",
          "Tempo produtivo / Tempo disponível x 100",
          `${formatDurationShort(productiveSecondsForOee)} / ${formatDurationShort(availableSeconds)} x 100 = ${formatDecimal(availability, 2)}%`
        ),
        performance: buildMetricNote(
          "Cálculo do desempenho",
          "Peças produzidas / produção teórica * 100",
          `${formatCompactNumber(filteredProducedPieces)} / ${formatDecimal(theoreticalPieces, 2)} x 100 = ${formatDecimal(performance, 2)}%`
        ),
        quality: buildMetricNote(
          "Cálculo da qualidade",
          "Peças boas / Produção total x 100",
          `${formatCompactNumber(filteredProducedPieces)} / ${formatCompactNumber(totalQualityPieces)} x 100 = ${formatDecimal(quality, 2)}%`
        ),
      };
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
        filteredProducedPieces,
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
        metricNotes,
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
  }, [filteredMachineIds, source, ongoingOrders, itemTechByCode, machineMetaById, openStopsByMachine, currentShift, machineTypeById, liveNowMs, periodData.periodStartIso, periodData.periodEndIso, shiftFilter]);

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
      await saveMachineCavities({ machineId: machine.id, machineRecordId: machine.machineRecordId, clientId, value, maxCavities: machine.itemCavities });

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
    const stopValues = overview.trendStopSeconds || [];
    const goalSegments = overview.goalSegments || [];
    const showStopStack = !isDailyTrendPeriod(periodFilter) && machineFilter !== "__ALL__";
    const labels = overview.trendLabels || [];
    const rawBuckets = labels.map((label, index) => {
      const production = getBucketDelta(realValues, index);
      const goal = getBucketDelta(goalValues, index);
      const stopSeconds = showStopStack && index > 0 ? Number(stopValues[index - 1] || 0) : 0;
      const stopLoss = goal > 0 ? (stopSeconds / 3600) * goal : 0;
      const efficiency = goal > 0 ? (production / goal) * 100 : 0;
      const previousLabel = labels[index - 1];
      const displayLabel = !isDailyTrendPeriod(periodFilter) && previousLabel
        ? `${previousLabel} às ${label}`
        : label;
      const periodStart = periodData.periodStartIso ? DateTime.fromISO(String(periodData.periodStartIso)).setZone("America/Sao_Paulo") : null;
      const bucketStart = periodStart?.isValid && !isDailyTrendPeriod(periodFilter)
        ? periodStart.plus({ hours: Math.max(0, index - 1) })
        : null;
      const bucketEnd = periodStart?.isValid && !isDailyTrendPeriod(periodFilter)
        ? periodStart.plus({ hours: index })
        : null;
      const bucketStartMs = bucketStart?.isValid ? bucketStart.toMillis() : NaN;
      const bucketEndMs = bucketEnd?.isValid ? bucketEnd.toMillis() : NaN;
      const itemSegments = Number.isFinite(bucketStartMs) && Number.isFinite(bucketEndMs)
        ? goalSegments
          .filter((segment) => Math.min(bucketEndMs, Number(segment.endMs || 0)) > Math.max(bucketStartMs, Number(segment.startMs || 0)))
          .map((segment) => ({
            machine: segment.machine,
            itemCode: segment.itemCode,
            itemLabel: segment.itemLabel || segment.itemCode || "-",
            product: segment.product || segment.itemLabel || segment.itemCode || "-",
            cycleSeconds: Number(segment.cycleSeconds || 0),
            cavities: Number(segment.cavities || 0),
            startMs: Number(segment.startMs || 0),
            endMs: Number(segment.endMs || 0),
          }))
        : [];
      const itemLabels = uniqueNonEmpty(itemSegments.map((segment) => segment.itemLabel));
      const itemSummary = itemLabels.length ? itemLabels.join(" / ") : "";
      return {
        id: `${label}-${index}`,
        bucketIndex: index,
        label: displayLabel,
        production,
        goal,
        stopSeconds,
        stopLoss,
        efficiency,
        startIso: bucketStart?.isValid ? bucketStart.toISO() : null,
        endIso: bucketEnd?.isValid ? bucketEnd.toISO() : null,
        itemSegments,
        itemSummary,
      };
    });
    const buckets = !isDailyTrendPeriod(periodFilter) ? rawBuckets.slice(1) : rawBuckets;
    const maxValue = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.production + bucket.stopLoss, bucket.goal)));
    return buckets.map((bucket) => ({
      ...bucket,
      height: Math.max(12, Math.round((bucket.production / maxValue) * 100)),
      stopHeight: Math.max(bucket.stopLoss > 0 ? 3 : 0, Math.round((bucket.stopLoss / maxValue) * 100)),
      goalHeight: Math.max(0, Math.round((bucket.goal / maxValue) * 100)),
    }));
  }, [machineFilter, overview.goalSegments, overview.trendRealPieces, overview.trendGoalPieces, overview.trendLabels, overview.trendStopSeconds, periodFilter, periodData.periodStartIso]);

  const scopedProductionBuckets = useMemo(() => {
    return productionBuckets.length ? productionBuckets : [];
  }, [productionBuckets]);

  const productionChart = useMemo(() => {
    const width = 1400;
    const height = 320;
    const top = 28;
    const right = 24;
    const bottom = 42;
    const left = 82;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxValue = Math.max(1, ...scopedProductionBuckets.map((bucket) => Math.max(bucket.production + bucket.stopLoss, bucket.goal)));
    const bucketWidth = scopedProductionBuckets.length > 0 ? plotWidth / scopedProductionBuckets.length : plotWidth;
    const barWidth = Math.max(8, Math.min(34, bucketWidth * 0.48));
    const scaleX = (index) => left + (bucketWidth * index) + (bucketWidth / 2);
    const scaleY = (value) => top + plotHeight - (Number(value || 0) / maxValue) * plotHeight;
    const points = scopedProductionBuckets.map((bucket, index) => ({
      ...bucket,
      index,
      x: scaleX(index),
      yProduction: scaleY(bucket.production),
      yStack: scaleY(bucket.production + bucket.stopLoss),
      yGoal: scaleY(bucket.goal),
      barX: scaleX(index) - (barWidth / 2),
      barY: scaleY(bucket.production),
      barWidth,
      barHeight: Math.max(bucket.production > 0 ? 3 : 1, (Number(bucket.production || 0) / maxValue) * plotHeight),
      stopBarY: scaleY(bucket.production + bucket.stopLoss),
      stopBarHeight: bucket.stopLoss > 0 ? Math.max(3, (Number(bucket.stopLoss || 0) / maxValue) * plotHeight) : 0,
      status: bucket.efficiency >= 100 ? "above" : bucket.efficiency >= 90 ? "near" : "below",
    }));
    const roundedRectPath = ({ x, y, width, height, radius = 7, roundTop = true, roundBottom = true }) => {
      const safeHeight = Math.max(0, Number(height || 0));
      const safeWidth = Math.max(0, Number(width || 0));
      const r = Math.min(Number(radius || 0), safeWidth / 2, safeHeight / 2);
      if (!(safeHeight > 0 && safeWidth > 0)) return "";
      const top = roundTop ? r : 0;
      const bottom = roundBottom ? r : 0;
      return [
        `M ${x + top} ${y}`,
        `H ${x + safeWidth - top}`,
        top ? `Q ${x + safeWidth} ${y} ${x + safeWidth} ${y + top}` : `L ${x + safeWidth} ${y}`,
        `V ${y + safeHeight - bottom}`,
        bottom ? `Q ${x + safeWidth} ${y + safeHeight} ${x + safeWidth - bottom} ${y + safeHeight}` : `L ${x + safeWidth} ${y + safeHeight}`,
        `H ${x + bottom}`,
        bottom ? `Q ${x} ${y + safeHeight} ${x} ${y + safeHeight - bottom}` : `L ${x} ${y + safeHeight}`,
        `V ${y + top}`,
        top ? `Q ${x} ${y} ${x + top} ${y}` : `L ${x} ${y}`,
        "Z",
      ].join(" ");
    };
    points.forEach((point) => {
      const isStacked = point.stopBarHeight > 0;
      point.productionPath = roundedRectPath({
        x: point.barX,
        y: point.barY,
        width: point.barWidth,
        height: point.barHeight,
        roundTop: !isStacked,
        roundBottom: true,
      });
      point.stopPath = isStacked ? roundedRectPath({
        x: point.barX,
        y: point.stopBarY,
        width: point.barWidth,
        height: point.stopBarHeight,
        roundTop: true,
        roundBottom: false,
      }) : "";
    });
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

  function handleProductionChartDrag(event) {
    handleProductionChartPointer(event);
  }

  const selectedProductionBucket = useMemo(() => {
    if (!selectedProductionBucketId) return null;
    return productionBuckets.find((bucket) => bucket.id === selectedProductionBucketId) || null;
  }, [productionBuckets, selectedProductionBucketId]);

  const selectedProductionBucketIndex = useMemo(() => {
    if (!selectedProductionBucketId) return -1;
    return productionBuckets.findIndex((bucket) => bucket.id === selectedProductionBucketId);
  }, [productionBuckets, selectedProductionBucketId]);

  useEffect(() => {
    if (preserveHourlyMachineOnBucketChangeRef.current) {
      preserveHourlyMachineOnBucketChangeRef.current = false;
    } else {
      setHourlyMachineFilter("__NONE__");
    }
    setHourlyCycleTooltip(null);
  }, [selectedProductionBucketId]);

  function navigateHourlyBucket(direction) {
    if (selectedProductionBucketIndex < 0) return;
    const nextIndex = selectedProductionBucketIndex + direction;
    if (nextIndex < 0 || nextIndex >= productionBuckets.length) return;
    preserveHourlyMachineOnBucketChangeRef.current = true;
    setHourlyCycleTooltip(null);
    setSelectedProductionBucketId(productionBuckets[nextIndex].id);
  }

  const hourlyProductionReport = useMemo(() => {
    if (!selectedProductionBucket?.startIso || !selectedProductionBucket?.endIso) return null;
    const start = DateTime.fromISO(String(selectedProductionBucket.startIso)).setZone("America/Sao_Paulo");
    const end = DateTime.fromISO(String(selectedProductionBucket.endIso)).setZone("America/Sao_Paulo");
    if (!start.isValid || !end.isValid || end <= start) return null;

    const startMs = start.toMillis();
    const endMs = end.toMillis();
    const productionEvents = (periodData.productionEvents || [])
      .filter((row) => {
        const ms = getIsoMs(row?.created_at);
        return Number.isFinite(ms) && ms >= startMs && ms < endMs;
      })
      .sort((a, b) => getIsoMs(a.created_at) - getIsoMs(b.created_at));
    const stopEvents = (periodData.stopEvents || [])
      .map((stop) => {
        const interval = clipIntervalMs(stop?.started_at, stop?.resumed_at, startMs, endMs);
        if (!interval) return null;
        return { ...stop, ...interval };
      })
      .filter(Boolean)
      .sort((a, b) => a.startMs - b.startMs);
    const scrapEvents = (periodData.scrapEvents || [])
      .filter((row) => {
        const ms = getIsoMs(row?.created_at);
        return Number.isFinite(ms) && ms >= startMs && ms < endMs;
      });
    const bucketItemSegments = (selectedProductionBucket.itemSegments || [])
      .filter((segment) => Math.min(endMs, Number(segment.endMs || 0)) > Math.max(startMs, Number(segment.startMs || 0)))
      .map((segment) => ({
        ...segment,
        startMs: Math.max(startMs, Number(segment.startMs || 0)),
        endMs: Math.min(endMs, Number(segment.endMs || 0)),
      }));
    const productionItemSegmentsByMachine = new Map();
    uniqueNonEmpty(productionEvents.map((row) => row.machine_id)).forEach((machine) => {
      const machineRows = productionEvents
        .filter((row) => String(row?.machine_id || "").trim().toUpperCase() === machine)
        .map((row) => ({ ...row, ms: getIsoMs(row?.created_at) }))
        .filter((row) => Number.isFinite(row.ms))
        .sort((a, b) => a.ms - b.ms);
      const segments = [];
      let current = null;

      machineRows.forEach((row) => {
        const itemCode = extractItemCodeFromOrderProduct(row?.product);
        if (!itemCode) return;
        const tech = itemTechByCode?.[itemCode] || null;
        if (current && current.itemCode === itemCode) {
          current.endMs = Math.max(current.endMs, row.ms);
          return;
        }
        if (current) {
          current.endMs = Math.max(current.startMs + 1, row.ms);
          segments.push(current);
        }
        current = {
          machine,
          itemCode,
          itemLabel: `${itemCode}${tech?.description ? ` - ${tech.description}` : ""}`,
          product: row?.product || itemCode,
          cycleSeconds: Number(tech?.cycleSeconds || 0),
          cavities: Number(tech?.cavities || 0),
          startMs: segments.length ? row.ms : startMs,
          endMs,
        };
      });

      if (current) {
        current.endMs = Math.max(current.startMs + 1, endMs);
        segments.push(current);
      }
      if (segments.length) productionItemSegmentsByMachine.set(machine, segments);
    });
    const machines = uniqueNonEmpty([
      ...productionEvents.map((row) => row.machine_id),
      ...stopEvents.map((row) => row.machine_id),
      ...bucketItemSegments.map((row) => row.machine),
      ...Array.from(productionItemSegmentsByMachine.keys()),
    ]);
    const selectedHourlyMachine = machines.includes(hourlyMachineFilter) ? hourlyMachineFilter : "__NONE__";
    const chartMachines = selectedHourlyMachine === "__NONE__" ? [] : [selectedHourlyMachine];
    const resolvedBucketItemSegments = selectedHourlyMachine === "__NONE__"
      ? []
      : bucketItemSegments.filter((segment) => String(segment.machine || "").trim().toUpperCase() === selectedHourlyMachine);
    const fallbackItemSegments = selectedHourlyMachine === "__NONE__"
      ? []
      : productionItemSegmentsByMachine.get(selectedHourlyMachine) || [];
    const chartItemSegments = resolvedBucketItemSegments.length ? resolvedBucketItemSegments : fallbackItemSegments;
    const itemChips = uniqueNonEmpty(chartItemSegments.map((segment) => segment.itemLabel))
      .map((label) => {
        const segment = chartItemSegments.find((item) => item.itemLabel === label) || {};
        return {
          label,
          detail: `${formatSeconds(segment.cycleSeconds)} • ${Number(segment.cavities || 0) || "-"} cav.`,
        };
      });
    const totalProduction = productionEvents.reduce((acc, row) => acc + Number(row?.pieces || 0), 0);
    const totalCycles = productionEvents.reduce((acc, row) => acc + Number(row?.cycles || 0), 0);
    const totalScrap = scrapEvents.reduce((acc, row) => acc + Number(row?.qty || 0), 0);
    const stopSeconds = stopEvents.reduce((acc, stop) => acc + Math.max(0, (stop.endMs - stop.startMs) / 1000), 0);
    const goal = Number(selectedProductionBucket.goal || 0);
    const goalPerBin = goal / 12;
    const chartWidth = 720;
    const chartHeight = 180;
    const chartTop = 16;
    const chartLeft = 38;
    const chartRight = 14;
    const plotHeight = 136;
    const plotWidth = chartWidth - chartLeft - chartRight;
    const stopOverlapsInterval = (machine, fromMs, toMs) => stopEvents.some((stop) => {
      if (String(stop?.machine_id || "").trim().toUpperCase() !== String(machine || "").trim().toUpperCase()) return false;
      return Math.min(toMs, stop.endMs) > Math.max(fromMs, stop.startMs);
    });
    const targetCycleValues = chartItemSegments.map((segment) => Number(segment.cycleSeconds || 0)).filter((value) => value > 0);
    const cyclePointsByMachine = chartMachines.map((machine) => {
      const rows = productionEvents
        .filter((row) => String(row?.machine_id || "").trim().toUpperCase() === machine)
        .map((row) => ({ ...row, ms: getIsoMs(row?.created_at) }))
        .filter((row) => Number.isFinite(row.ms))
        .sort((a, b) => a.ms - b.ms);
      let previous = null;
      return rows.map((row) => {
        const itemCode = extractItemCodeFromOrderProduct(row?.product);
        const targetCycleSeconds = itemCode ? Number(itemTechByCode?.[itemCode]?.cycleSeconds || 0) : 0;
        if (targetCycleSeconds > 0) targetCycleValues.push(targetCycleSeconds);
        const cycles = Math.max(1, Number(row?.cycles || 1));
        const fromMs = previous?.ms;
        previous = row;
        if (!Number.isFinite(fromMs) || row.ms <= fromMs || stopOverlapsInterval(machine, fromMs, row.ms)) return null;
        const cycleSeconds = (row.ms - fromMs) / 1000 / cycles;
        if (!(cycleSeconds > 0)) return null;
        return {
          id: `${row.id || row.order_id}-${row.ms}`,
          machine,
          orderCode: row.orderCode || "-",
          product: row.product || "-",
          time: DateTime.fromMillis(row.ms).setZone("America/Sao_Paulo").toISO(),
          ms: row.ms,
          pieces: Number(row?.pieces || 0),
          cycles,
          cycleSeconds,
          targetCycleSeconds,
        };
      }).filter(Boolean);
    });
    const cyclePoints = cyclePointsByMachine.flat();
    const targetCycleSeconds = targetCycleValues.length
      ? targetCycleValues.reduce((acc, value) => acc + value, 0) / targetCycleValues.length
      : 0;
    const maxCycleValue = Math.max(1, targetCycleSeconds, ...targetCycleValues, ...cyclePoints.map((point) => Number(point.cycleSeconds || 0))) * 1.15;
    const scaleX = (ms) => chartLeft + ((ms - startMs) / Math.max(1, endMs - startMs)) * plotWidth;
    const scaleY = (value) => chartTop + plotHeight - (Number(value || 0) / maxCycleValue) * plotHeight;
    const baselineY = chartTop + plotHeight;
    const cycleSegments = cyclePointsByMachine.flatMap((points, machineIndex) => points.slice(1).map((point, index) => {
      const previous = points[index];
      const x1 = scaleX(previous.ms);
      const y1 = scaleY(previous.cycleSeconds);
      const x2 = scaleX(point.ms);
      const y2 = scaleY(point.cycleSeconds);
      const line = `M ${x1} ${y1} L ${x2} ${y2}`;
      const area = `M ${x1} ${baselineY} L ${x1} ${y1} L ${x2} ${y2} L ${x2} ${baselineY} Z`;
      const isOver = Number(point.targetCycleSeconds || 0) > 0 && Number(point.cycleSeconds || 0) > Number(point.targetCycleSeconds || 0);
      return {
        id: `cycle-segment-${machineIndex}-${index}`,
        path: line,
        area,
        tone: isOver ? "over" : "ok",
      };
    }));
    const cyclePointDots = cyclePoints.map((point) => ({
      ...point,
      x: scaleX(point.ms),
      y: scaleY(point.cycleSeconds),
    }));
    const targetCycleLine = targetCycleSeconds > 0
      ? `${chartLeft},${scaleY(targetCycleSeconds)} ${chartLeft + plotWidth},${scaleY(targetCycleSeconds)}`
      : "";
    const targetCycleSegments = chartItemSegments
      .filter((segment) => Number(segment.cycleSeconds || 0) > 0)
      .map((segment, index) => ({
        id: `target-cycle-${selectedHourlyMachine}-${index}`,
        x1: scaleX(segment.startMs),
        x2: scaleX(segment.endMs),
        y: scaleY(segment.cycleSeconds),
        label: segment.itemLabel,
        cycleSeconds: segment.cycleSeconds,
      }));
    const cycleGuides = [0.33, 0.66, 1].map((ratio) => ({
      y: scaleY(maxCycleValue * ratio),
      label: maxCycleValue * ratio,
    }));
    const stopBands = stopEvents.map((stop) => ({
      id: stop.id,
      x: chartLeft + ((stop.startMs - startMs) / Math.max(1, endMs - startMs)) * plotWidth,
      width: Math.max(2, ((stop.endMs - stop.startMs) / Math.max(1, endMs - startMs)) * plotWidth),
    }));
    const timelineRows = machines.map((machine) => ({
      machine,
      production: productionEvents.filter((row) => String(row?.machine_id || "").trim().toUpperCase() === machine).reduce((acc, row) => acc + Number(row?.pieces || 0), 0),
      segments: buildMachineTimelineSegments(stopEvents, machine, startMs, endMs).map((segment) => ({
        ...segment,
        left: ((segment.startMs - startMs) / Math.max(1, endMs - startMs)) * 100,
        width: ((segment.endMs - segment.startMs) / Math.max(1, endMs - startMs)) * 100,
      })),
    }));
    const scrapByReason = Object.values(scrapEvents.reduce((acc, row) => {
      const reason = String(row?.reason || "Outro").trim() || "Outro";
      if (!acc[reason]) acc[reason] = { reason, qty: 0, count: 0 };
      acc[reason].qty += Number(row?.qty || 0);
      acc[reason].count += 1;
      return acc;
    }, {})).sort((a, b) => Number(b.qty || 0) - Number(a.qty || 0));
    const operatorRows = (periodData.operatorEvents || [])
      .map((row) => ({ ...row, ms: getIsoMs(row?.created_at) }))
      .filter((row) => Number.isFinite(row.ms))
      .sort((a, b) => a.ms - b.ms);
    const operatorTimeline = machines.flatMap((machine) => {
      const machineEvents = operatorRows.filter((row) => String(row?.machine_id || "").trim().toUpperCase() === machine);
      const currentAtStart = [...machineEvents].reverse().find((row) => row.ms <= startMs);
      const changes = machineEvents.filter((row) => row.ms > startMs && row.ms < endMs);
      const fallbackOperators = uniqueNonEmpty(productionEvents
        .filter((row) => String(row?.machine_id || "").trim().toUpperCase() === machine)
        .map((row) => row.operator));
      const rows = [];
      if (currentAtStart) rows.push({ machine, operator: currentAtStart.operator, time: start.toISO(), type: "inicio" });
      changes.forEach((row) => rows.push({ machine, operator: row.operator, time: row.created_at, type: "troca" }));
      if (!rows.length) fallbackOperators.forEach((operator) => rows.push({ machine, operator, time: start.toISO(), type: "ordem" }));
      return rows;
    });

    return {
      label: `${start.toFormat("HH:mm")} às ${end.toFormat("HH:mm")}`,
      totalProduction,
      totalCycles,
      totalScrap,
      goal,
      efficiency: goal > 0 ? (totalProduction / goal) * 100 : 0,
      stopSeconds,
      stopEvents,
      scrapByReason,
      timelineRows,
      operatorTimeline,
      itemChips,
      machines,
      selectedHourlyMachine,
      bins: Array.from({ length: 12 }, (_, index) => ({
        id: `${selectedProductionBucket.id}-bin-${index}`,
        label: DateTime.fromMillis(startMs + index * 5 * 60 * 1000).setZone("America/Sao_Paulo").toFormat("HH:mm"),
      })),
      chart: { width: chartWidth, height: chartHeight, cycleSegments, cyclePointDots, targetCycleLine, targetCycleSegments, cycleGuides, stopBands },
    };
  }, [hourlyMachineFilter, itemTechByCode, periodData.operatorEvents, periodData.productionEvents, periodData.scrapEvents, periodData.stopEvents, selectedProductionBucket]);

  function handleHourlyCyclePointer(event) {
    const points = hourlyProductionReport?.chart?.cyclePointDots || [];
    if (!points.length) {
      setHourlyCycleTooltip(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
    const chartX = ((clientX - rect.left) / Math.max(1, rect.width)) * hourlyProductionReport.chart.width;
    const nearest = points.reduce((best, point) => {
      if (!best) return point;
      return Math.abs(point.x - chartX) < Math.abs(best.x - chartX) ? point : best;
    }, null);
    if (!nearest) return;
    setHourlyCycleTooltip({
      ...nearest,
      leftPercent: (nearest.x / hourlyProductionReport.chart.width) * 100,
      topPercent: (nearest.y / hourlyProductionReport.chart.height) * 100,
    });
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
            onChange={(event) => { setPeriodFilter(event.target.value); setSelectedProductionBucketId(null); }}
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
              <input className="monitor-date-input" type="date" value={customPeriodStart} onChange={(event) => { setCustomPeriodStart(event.target.value); setSelectedProductionBucketId(null); }} aria-label="Data inicial" />
              <input className="monitor-date-input" type="date" value={customPeriodEnd} onChange={(event) => { setCustomPeriodEnd(event.target.value); setSelectedProductionBucketId(null); }} aria-label="Data final" />
            </>
          )}
          <select
            className="monitor-filter-select"
            value={sectorFilter}
            onChange={(event) => { setSectorFilter(event.target.value); setMachineFilter("__ALL__"); setSelectedProductionBucketId(null); }}
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
            onChange={(event) => { setMachineFilter(event.target.value); setSelectedProductionBucketId(null); }}
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
            onChange={(event) => { setShiftFilter(event.target.value); setSelectedProductionBucketId(null); }}
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
          <small className="positive">{overview.periodLabel}</small>
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
                <MetricWithNote label="Disponibilidade" value={formatPercent(selectedMachine.availability)} note={selectedMachine.metricNotes.availability} />
                <MetricWithNote label="Desempenho" value={formatPercent(selectedMachine.performance)} note={selectedMachine.metricNotes.performance} />
                <MetricWithNote label="Qualidade" value={formatPercent(selectedMachine.quality)} note={selectedMachine.metricNotes.quality} />
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
              {selectedProductionBucket && <button type="button" onClick={() => { setSelectedProductionBucketId(null); setHourlyMachineFilter("__NONE__"); }}>Voltar ao gráfico</button>}
              <span>{overview.periodLabel}</span>
            </div>
          </header>
          <div className="production-chart-meta">
            <span><i className="legend-real" />{hourlyProductionReport ? "Ciclo registrado" : "Produção"}</span>
            <span><i className="legend-goal" />{hourlyProductionReport ? "Ciclo padrão" : "Meta"}</span>
            <span><i className="legend-stop" />Parada</span>
            <strong>{hourlyProductionReport ? `${formatCompactNumber(hourlyProductionReport.totalCycles)} ciclos` : `${formatCompactNumber(scopedProductionBuckets.reduce((acc, bar) => acc + bar.production, 0))} peças`}</strong>
          </div>
          <div className="production-chart-frame">
            {hourlyProductionReport ? (
              <div className="hourly-production-report">
                <div className="hourly-report-head">
                  <div>
                    <span>Relatório horário</span>
                    <strong>{hourlyProductionReport.label}</strong>
                  </div>
                  <label className="hourly-machine-filter">
                    <span>Máquina do gráfico</span>
                    <div className="hourly-machine-nav">
                      <button type="button" onClick={() => navigateHourlyBucket(-1)} disabled={selectedProductionBucketIndex <= 0} aria-label="Hora anterior">‹</button>
                      <select value={hourlyProductionReport.selectedHourlyMachine} onChange={(event) => { setHourlyMachineFilter(event.target.value); setHourlyCycleTooltip(null); }}>
                        <option value="__NONE__">Máquina</option>
                        {hourlyProductionReport.machines.map((machine) => (
                          <option value={machine} key={machine}>{machine}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => navigateHourlyBucket(1)} disabled={selectedProductionBucketIndex < 0 || selectedProductionBucketIndex >= productionBuckets.length - 1} aria-label="Próxima hora">›</button>
                    </div>
                  </label>
                  <div className="hourly-report-kpis">
                    <p><b>Produção</b><em>{formatCompactNumber(hourlyProductionReport.totalProduction)} pç</em></p>
                    <p><b>Meta</b><em>{formatCompactNumber(hourlyProductionReport.goal)} pç</em></p>
                    <p><b>Eficiência</b><em>{formatPercent(hourlyProductionReport.efficiency, 0)}</em></p>
                    <p><b>Refugo</b><em>{formatCompactNumber(hourlyProductionReport.totalScrap)} pç</em></p>
                    <p><b>Parada</b><em>{formatDurationShort(hourlyProductionReport.stopSeconds)}</em></p>
                  </div>
                </div>

                <div className="hourly-area-wrap">
                  {hourlyProductionReport.selectedHourlyMachine === "__NONE__" && (
                    <div className="hourly-chart-empty">Selecione uma máquina para visualizar os ciclos.</div>
                  )}
                    {hourlyProductionReport.itemChips.length > 0 && hourlyProductionReport.selectedHourlyMachine !== "__NONE__" && (
                      <div className="hourly-cycle-items" aria-label="Itens produzidos na hora">
                        {hourlyProductionReport.itemChips.map((item) => (
                          <span key={item.label}><b>{item.label}</b><em>{item.detail}</em></span>
                        ))}
                      </div>
                    )}
                  <svg
                    className="hourly-area-chart"
                    viewBox={`0 0 ${hourlyProductionReport.chart.width} ${hourlyProductionReport.chart.height}`}
                    preserveAspectRatio="none"
                    aria-label={`Tempo de ciclo das ${hourlyProductionReport.label}`}
                    role="img"
                    onMouseMove={handleHourlyCyclePointer}
                    onPointerMove={handleHourlyCyclePointer}
                    onTouchMove={handleHourlyCyclePointer}
                    onMouseLeave={() => setHourlyCycleTooltip(null)}
                    onPointerLeave={() => setHourlyCycleTooltip(null)}
                  >
                    <defs>
                      <linearGradient id="hourlyAreaGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#56dcff" stopOpacity="0.66" />
                        <stop offset="100%" stopColor="#1d64d8" stopOpacity="0.08" />
                      </linearGradient>
                    </defs>
                    {hourlyProductionReport.chart.cycleGuides.map((guide) => (
                      <g className="hourly-cycle-guide" key={guide.y}>
                        <line x1="38" x2={hourlyProductionReport.chart.width - 14} y1={guide.y} y2={guide.y} />
                      </g>
                    ))}
                    {hourlyProductionReport.chart.stopBands.map((band) => (
                      <rect key={band.id} className="hourly-stop-band" x={band.x} y="16" width={band.width} height="136" />
                    ))}
                    {hourlyProductionReport.chart.cycleSegments.map((segment) => (
                      <path key={`${segment.id}-area`} className={`hourly-cycle-area is-${segment.tone}`} d={segment.area} />
                    ))}
                    {hourlyProductionReport.chart.targetCycleSegments.length > 0
                      ? hourlyProductionReport.chart.targetCycleSegments.map((segment) => (
                        <line key={segment.id} className="hourly-goal-line" x1={segment.x1} x2={segment.x2} y1={segment.y} y2={segment.y} />
                      ))
                      : hourlyProductionReport.chart.targetCycleLine && <polyline className="hourly-goal-line" points={hourlyProductionReport.chart.targetCycleLine} />}
                    {hourlyProductionReport.chart.cycleSegments.map((segment) => (
                      <path key={segment.id} className={`hourly-cycle-line is-${segment.tone}`} d={segment.path} />
                    ))}
                    {hourlyProductionReport.chart.cyclePointDots.map((point) => (
                      <circle key={point.id} className="hourly-cycle-dot" cx={point.x} cy={point.y} r="4.5" />
                    ))}
                    {hourlyProductionReport.chart.stopBands.map((band) => (
                      <rect key={`${band.id}-cover`} className="hourly-stop-band-cover" x={band.x} y="16" width={band.width} height="136" />
                    ))}
                  </svg>
                  {hourlyCycleTooltip && (
                    <div className="hourly-cycle-tooltip" style={{ left: `${hourlyCycleTooltip.leftPercent}%`, top: `${hourlyCycleTooltip.topPercent}%` }}>
                      <strong>{formatSeconds(hourlyCycleTooltip.cycleSeconds)}</strong>
                    </div>
                  )}
                  <div className="hourly-bin-axis">
                    {hourlyProductionReport.bins.map((bin, index) => <span key={bin.id}>{index % 2 === 0 ? bin.label : ""}</span>)}
                  </div>
                </div>

                <div className="hourly-report-grid">
                  <div className="hourly-section wide">
                    <h4>Produção e paradas por máquina</h4>
                    <div className="hourly-timeline-list">
                      {hourlyProductionReport.timelineRows.length === 0 ? (
                        <p className="hourly-empty">Sem produção ou parada registrada nessa hora.</p>
                      ) : hourlyProductionReport.timelineRows.map((row) => (
                        <div className="hourly-machine-row" key={row.machine}>
                          <div className="hourly-machine-label"><strong>{row.machine}</strong><span>{formatCompactNumber(row.production)} pç</span></div>
                          <div className="hourly-timeline-track">
                            {row.segments.map((segment, index) => (
                              <span
                                key={`${row.machine}-${segment.type}-${index}`}
                                className={`hourly-segment ${segment.type === "stop" ? "is-stop" : "is-production"}`}
                                style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
                                title={`${segment.type === "stop" ? segment.reason : "Produção"}: ${formatClock(DateTime.fromMillis(segment.startMs).toISO())} às ${formatClock(DateTime.fromMillis(segment.endMs).toISO())}`}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="hourly-section">
                    <h4>Operadores</h4>
                    {hourlyProductionReport.operatorTimeline.length === 0 ? <p className="hourly-empty">Sem operador informado.</p> : hourlyProductionReport.operatorTimeline.map((row, index) => (
                      <p key={`${row.machine}-${row.operator}-${index}`}><b>{formatClock(row.time)}</b><span>{row.machine} • {row.operator}</span><em>{row.type === "troca" ? "troca" : "início"}</em></p>
                    ))}
                  </div>

                  <div className="hourly-section">
                    <h4>Refugo</h4>
                    {hourlyProductionReport.scrapByReason.length === 0 ? <p className="hourly-empty">Sem refugo nessa hora.</p> : hourlyProductionReport.scrapByReason.map((row) => (
                      <p key={row.reason}><b>{row.reason}</b><span>{formatCompactNumber(row.qty)} pç</span><em>{row.count} reg.</em></p>
                    ))}
                  </div>

                  <div className="hourly-section wide">
                    <h4>Ocorrências de parada</h4>
                    {hourlyProductionReport.stopEvents.length === 0 ? <p className="hourly-empty">Sem parada nessa hora.</p> : hourlyProductionReport.stopEvents.map((stop) => (
                      <p key={stop.id}><b>{stop.machine_id}</b><span>{formatClock(DateTime.fromMillis(stop.startMs).toISO())} às {formatClock(DateTime.fromMillis(stop.endMs).toISO())} • {stop.reason || "Parada"}</span><em>{formatDurationShort((stop.endMs - stop.startMs) / 1000)}</em></p>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
            <div
              className="production-chart-plot line-chart-plot"
              role="img"
              aria-label="Produção por hora comparada com meta"
              onMouseEnter={handleProductionChartPointer}
              onMouseMove={handleProductionChartDrag}
              onMouseLeave={() => setBarTooltip(null)}
              onPointerEnter={handleProductionChartPointer}
              onPointerMove={handleProductionChartDrag}
              onPointerLeave={() => setBarTooltip(null)}
              onTouchMove={handleProductionChartDrag}
            >
              <svg className="production-area-chart production-bar-chart" viewBox={`0 0 ${productionChart.width} ${productionChart.height}`} preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="productionBarGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#7ee8ff" stopOpacity="0.96" />
                    <stop offset="48%" stopColor="#22c7ff" stopOpacity="0.86" />
                    <stop offset="100%" stopColor="#266dff" stopOpacity="0.72" />
                  </linearGradient>
                  <linearGradient id="productionStopGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#ff9aa8" stopOpacity="0.96" />
                    <stop offset="42%" stopColor="#ff5c72" stopOpacity="0.88" />
                    <stop offset="100%" stopColor="#d82743" stopOpacity="0.78" />
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
                  <path
                    className={`production-column${barTooltip?.id === point.id ? " is-active" : ""}${point.production <= 0 ? " is-zero" : ""}`}
                    key={point.id}
                    d={point.productionPath}
                    role="button"
                    tabIndex="0"
                    onClick={() => {
                      if (!isDailyTrendPeriod(periodFilter)) setSelectedProductionBucketId(point.id);
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === "Enter" || event.key === " ") && !isDailyTrendPeriod(periodFilter)) setSelectedProductionBucketId(point.id);
                    }}
                  />
                ))}
                {productionChart.points.map((point) => point.stopBarHeight > 0 && (
                  <path
                    className={`production-stop-column${barTooltip?.id === point.id ? " is-active" : ""}`}
                    key={`${point.id}-stop`}
                    d={point.stopPath}
                    onClick={() => {
                      if (!isDailyTrendPeriod(periodFilter)) setSelectedProductionBucketId(point.id);
                    }}
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
              {barTooltip && <div className="point-tooltip" style={{ left: `${barTooltip.cursorPercent}%`, top: `${Math.max(12, (barTooltip.yStack / productionChart.height) * 100)}%` }}>{formatCompactNumber(barTooltip.production)} pç • {formatDurationShort(barTooltip.stopSeconds)}</div>}
            </div>
            )}
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

