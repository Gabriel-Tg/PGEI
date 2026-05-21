// src/pages/Painel.jsx

import React, { useEffect, useMemo, useState } from "react";
import Etiqueta from "../components/Etiqueta";
import { MAQUINAS, STATUS } from "../domain/constants";
import { statusClass, jaIniciou } from "../lib/utils";
import { DateTime } from "luxon";
import { supabase } from "../lib/supabaseClient";

// Helper para formatar HH:MM:SS
function formatHHMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function extractItemCodeFromOrderProduct(product) {
  if (!product) return null;
  return String(product).split("-")[0]?.trim() || null;
}

function formatCompactNumber(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(num);
}

function buildLinePath(points, width, height, maxValue) {
  if (!points.length || maxValue <= 0) return "";
  const step = points.length > 1 ? width / (points.length - 1) : width;
  return points
    .map((val, index) => {
      const x = index * step;
      const y = height - (val / maxValue) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function parsePiecesPerBox(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  if (!digits) return 0;
  return Number.parseInt(digits, 10) || 0;
}

function getOrderPlannedPieces(order) {
  const boxes = Number(order?.boxes || 0);
  const piecesPerBox = parsePiecesPerBox(order?.standard);
  if (boxes > 0 && piecesPerBox > 0) return boxes * piecesPerBox;
  const plannedQty = Number(order?.qty || 0);
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

function getDashboardPeriodRange(periodKey) {
  const now = DateTime.now().setZone("America/Sao_Paulo");
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
      start: now.startOf("week"),
      end: now.endOf("week"),
      label: "Esta semana",
    };
  }
  if (periodKey === "month") {
    return {
      start: now.startOf("month"),
      end: now.endOf("month"),
      label: "Este mes",
    };
  }
  return {
    start: now.startOf("day"),
    end: now.endOf("day"),
    label: "Hoje",
  };
}

function buildTrendSeries(scans, periodKey, rangeStart) {
  const rows = Array.isArray(scans) ? scans : [];

  if (periodKey === "week") {
    const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
    const countBoxes = new Array(7).fill(0);
    const countPieces = new Array(7).fill(0);
    rows.forEach((scan) => {
      const dt = DateTime.fromISO(String(scan?.created_at || "")).setZone("America/Sao_Paulo");
      if (!dt.isValid) return;
      const idx = Math.max(0, Math.min(6, dt.weekday - 1));
      countBoxes[idx] += 1;
      countPieces[idx] += Number(scan?.qty_pieces || 0);
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
    return { labels, trendBoxes: cumulativeBoxes, trendPieces: cumulativePieces };
  }

  if (periodKey === "month") {
    const daysInMonth = Math.max(28, Number(rangeStart?.daysInMonth || 30));
    const labels = Array.from({ length: daysInMonth }, (_, idx) => String(idx + 1).padStart(2, "0"));
    const countBoxes = new Array(daysInMonth).fill(0);
    const countPieces = new Array(daysInMonth).fill(0);
    rows.forEach((scan) => {
      const dt = DateTime.fromISO(String(scan?.created_at || "")).setZone("America/Sao_Paulo");
      if (!dt.isValid) return;
      const dayIdx = Math.max(0, Math.min(daysInMonth - 1, Number(dt.day || 1) - 1));
      countBoxes[dayIdx] += 1;
      countPieces[dayIdx] += Number(scan?.qty_pieces || 0);
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
    return { labels, trendBoxes: cumulativeBoxes, trendPieces: cumulativePieces };
  }

  const labels = ["00h", "03h", "06h", "09h", "12h", "15h", "18h", "21h", "24h"];
  const countBoxes = new Array(8).fill(0);
  const countPieces = new Array(8).fill(0);
  rows.forEach((scan) => {
    const dt = DateTime.fromISO(String(scan?.created_at || "")).setZone("America/Sao_Paulo");
    if (!dt.isValid) return;
    const diffHours = dt.diff(rangeStart, "hours").hours;
    const bucket = Math.max(0, Math.min(7, Math.floor(diffHours / 3)));
    countBoxes[bucket] += 1;
    countPieces[bucket] += Number(scan?.qty_pieces || 0);
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

  return { labels, trendBoxes, trendPieces };
}

function buildDynamicGoalSeries({ periodKey, labels, periodStart, periodEnd, source, machineIds, itemTechByCode }) {
  const safeLabels = Array.isArray(labels) ? labels : [];
  const nowMs = Date.now();
  const periodStartMs = periodStart.toMillis();
  const periodEndMs = periodEnd.toMillis();
  const pointsMs = safeLabels.map((_, idx) => {
    if (periodKey === "week") {
      return periodStart.plus({ days: idx + 1 }).toMillis();
    }
    if (periodKey === "month") {
      return periodStart.plus({ days: idx + 1 }).toMillis();
    }
    // Hoje/Ontem: 0h..24h em passos de 3h
    return periodStart.plus({ hours: idx * 3 }).toMillis();
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

      // Para pontos no passado, mantém a curva de meta acumulada desde o início da ordem.
      if (pointMs <= nowMs) {
        let cursorMsPast = Math.max(firstStartMs, periodStartMs);
        if (pointMs <= cursorMsPast) return;

        for (let i = 0; i < queue.length; i += 1) {
          const order = queue[i];
          const ratePiecesPerHour = getOrderRatePiecesPerHour(order, itemTechByCode);
          const plannedPieces = getOrderPlannedPieces(order);
          const piecesPerBox = parsePiecesPerBox(order?.standard);
          if (!(ratePiecesPerHour > 0) || !(plannedPieces > 0)) continue;

          const orderDurationSec = plannedPieces / (ratePiecesPerHour / 3600);
          const availableSec = Math.max(0, (pointMs - cursorMsPast) / 1000);
          if (availableSec <= 0) break;

          const usedSec = Math.min(orderDurationSec, availableSec);
          const orderPieces = (usedSec / 3600) * ratePiecesPerHour;
          const orderBoxes = piecesPerBox > 0 ? (orderPieces / piecesPerBox) : 0;

          sumPieces += orderPieces;
          sumBoxes += orderBoxes;

          cursorMsPast += usedSec * 1000;
          if (usedSec < orderDurationSec) break;
        }
        return;
      }

      // Para projeção futura, parte do produzido atual e simula APENAS o restante da fila.
      let cursorMsFuture = Math.max(nowMs, periodStartMs, firstStartMs);
      if (pointMs <= cursorMsFuture) return;

      for (let i = 0; i < queue.length; i += 1) {
        const order = queue[i];
        const ratePiecesPerHour = getOrderRatePiecesPerHour(order, itemTechByCode);
        const plannedPieces = getOrderPlannedPieces(order);
        const piecesPerBox = parsePiecesPerBox(order?.standard);
        if (!(ratePiecesPerHour > 0) || !(plannedPieces > 0)) continue;

        const producedBoxes = Number(order?.scanned_count || 0);
        const producedPieces = piecesPerBox > 0 ? producedBoxes * piecesPerBox : 0;
        const remainingPieces = Math.max(0, plannedPieces - producedPieces);
        if (remainingPieces <= 0) continue;

        const orderDurationSec = remainingPieces / (ratePiecesPerHour / 3600);
        const availableSec = Math.max(0, (pointMs - cursorMsFuture) / 1000);
        if (availableSec <= 0) break;

        const usedSec = Math.min(orderDurationSec, availableSec);
        const orderPieces = (usedSec / 3600) * ratePiecesPerHour;
        const orderBoxes = piecesPerBox > 0 ? (orderPieces / piecesPerBox) : 0;

        sumPieces += orderPieces;
        sumBoxes += orderBoxes;

        cursorMsFuture += usedSec * 1000;
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
  onStatusChange,
  setStartModal,
  setFinalizando,
  lastFinalizadoPorMaquina,
  onScanned, // opcional: callback do pai para re-fetch geral
  authUser,
  machinePriorities = {},
  machineIds = MAQUINAS,
  clientId = null,
  readOnly = false,
}) {
  // localAtivos é o estado usado para render e será atualizado via realtime
  const [localAtivos, setLocalAtivos] = useState(ativosPorMaquina || {});
  const [itemTechByCode, setItemTechByCode] = useState({});
  const [periodFilter, setPeriodFilter] = useState("today");
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
    trendLabels: ["00h", "03h", "06h", "09h", "12h", "15h", "18h", "21h", "24h"],
    trendReal: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    trendGoal: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    trendRealPieces: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    trendGoalPieces: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    scrapPieces: 0,
    scrapPct: 0,
    ongoingOrders: [],
    periodLabel: "Hoje",
  });
  const [trendHoverIndex, setTrendHoverIndex] = useState(null);
  const [donutHoverMachine, setDonutHoverMachine] = useState(null);
  const [stopReasonHover, setStopReasonHover] = useState(null);
  const source = localAtivos || {};

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

          return {
            ...inItem,
            scanned_count:
              Number.isFinite(prevCount) && prevCount > incomingCount
                ? prevCount
                : incomingCount,
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
    machineIds.forEach((m) => {
      const ativa = (localAtivos?.[m] || [])[0];
      const code = extractItemCodeFromOrderProduct(ativa?.product);
      if (code) codes.add(code);
    });
    return Array.from(codes);
  }, [localAtivos, machineIds]);

  useEffect(() => {
    let cancelled = false;

    async function loadItemTech() {
      if (!activeItemCodes.length) {
        setItemTechByCode({});
        return;
      }

      let query = supabase
        .from("items")
        .select("code, cycle_seconds, cavities")
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
          cycleSeconds: Number(item?.cycle_seconds || 0),
          cavities: Number(item?.cavities || 0),
        };
      });
      setItemTechByCode(mapped);
    }

    loadItemTech();
    return () => { cancelled = true; };
  }, [activeItemCodes, clientId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPeriodData() {
      const period = getDashboardPeriodRange(periodFilter);
      const startIso = period.start.toUTC().toISO();
      const endIso = period.end.toUTC().toISO();

      let scansQuery = supabase
        .from("production_scans")
        .select("id, created_at, machine_id, order_id, scanned_box, qty_pieces, order:orders(id, code, product, boxes, qty, standard, status, machine_id)")
        .gte("created_at", startIso)
        .lte("created_at", endIso);

      let stopsQuery = supabase
        .from("machine_stops")
        .select("id, machine_id, reason, started_at, resumed_at")
        .lte("started_at", endIso)
        .or(`resumed_at.gte.${startIso},resumed_at.is.null`);

      let lowEffQuery = supabase
        .from("low_efficiency_logs")
        .select("id, machine_id, started_at, ended_at")
        .lte("started_at", endIso)
        .or(`ended_at.gte.${startIso},ended_at.is.null`);

      let scrapQuery = supabase
        .from("scrap_logs")
        .select("qty")
        .gte("created_at", startIso)
        .lte("created_at", endIso);

      if (clientId) {
        scansQuery = scansQuery.eq("company_id", clientId);
        stopsQuery = stopsQuery.eq("company_id", clientId);
        lowEffQuery = lowEffQuery.eq("company_id", clientId);
        scrapQuery = scrapQuery.eq("company_id", clientId);
      }

      const [scansRes, stopsRes, lowEffRes, scrapRes] = await Promise.all([scansQuery, stopsQuery, lowEffQuery, scrapQuery]);
      if (cancelled) return;

      const scans = scansRes?.data || [];
      const stops = stopsRes?.data || [];
      const lowEff = lowEffRes?.data || [];
      const scraps = scrapRes?.data || [];

      const producedBoxes = scans.length;
      const producedPieces = scans.reduce((acc, scan) => acc + Number(scan?.qty_pieces || 0), 0);
      const producedTotal = producedBoxes;
      const machineOutputMap = Object.fromEntries(machineIds.map((m) => [m, { boxes: 0, pieces: 0 }]));
      scans.forEach((scan) => {
        const machine = String(scan?.machine_id || "").toUpperCase();
        if (!machineOutputMap[machine]) machineOutputMap[machine] = { boxes: 0, pieces: 0 };
        machineOutputMap[machine].boxes += 1;
        machineOutputMap[machine].pieces += Number(scan?.qty_pieces || 0);
      });
      const machineOutput = Object.entries(machineOutputMap).map(([machine, value]) => ({
        machine,
        value: Number(value?.boxes || 0),
        boxes: Number(value?.boxes || 0),
        pieces: Number(value?.pieces || 0),
      }));

      const scrapPieces = scraps.reduce((acc, row) => acc + Number(row?.qty || 0), 0);
      const scrapPctBase = producedPieces + scrapPieces;
      const scrapPct = scrapPctBase > 0 ? (scrapPieces / scrapPctBase) * 100 : 0;

      const orderMap = new Map();
      scans.forEach((scan) => {
        const ord = scan?.order || null;
        const key = String(ord?.id || scan?.order_id || `${scan?.machine_id || "SEM"}-${scan?.id}`);
        if (!orderMap.has(key)) {
          const plannedBoxes = Number(ord?.boxes || 0);
          const stdPieces = parsePiecesPerBox(ord?.standard);
          const plannedPieces = Number(ord?.qty || (plannedBoxes > 0 && stdPieces > 0 ? plannedBoxes * stdPieces : 0));
          orderMap.set(key, {
            machine: String(scan?.machine_id || ord?.machine_id || "-").toUpperCase(),
            order: ord?.code || scan?.order_id || "-",
            product: ord?.product || "-",
            plannedBoxes,
            plannedPieces,
            producedBoxes: 0,
            producedPieces: 0,
            status: ord?.status || "AGUARDANDO",
          });
        }
        const curr = orderMap.get(key);
        curr.producedBoxes += 1;
        curr.producedPieces += Number(scan?.qty_pieces || 0);
      });
      const ongoingOrders = Array.from(orderMap.values()).map((row) => ({
        ...row,
        progress: row.plannedBoxes > 0 ? Math.min(100, Math.round((row.producedBoxes / row.plannedBoxes) * 100)) : 0,
      }));

      const plannedTotal = ongoingOrders.reduce((acc, row) => acc + Number(row.plannedBoxes || 0), 0);
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

      const trendBase = buildTrendSeries(scans, periodFilter, period.start);
      const dynamicGoal = buildDynamicGoalSeries({
        periodKey: periodFilter,
        labels: trendBase.labels,
        periodStart: period.start,
        periodEnd: period.end,
        source,
        machineIds,
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
        scrapPieces,
        scrapPct,
        ongoingOrders,
        periodLabel: period.label,
      });
    }

    loadPeriodData().catch((err) => {
      console.error("Falha ao carregar dados do periodo no painel:", err);
    });

    return () => { cancelled = true; };
  }, [periodFilter, clientId, machineIds, source, paradas, itemTechByCode]);

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

  // Realtime subscription: quando houver INSERT em production_scans, atualiza counted scans e chama onScanned
  useEffect(() => {
    const channel = supabase
      .channel("scans-ch")
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
          } catch (err) {
            console.error("Erro no handler realtime scans:", err);
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Estado para armazenar o started_at do log aberto de baixa eficiência por máquina
  const [lowEffStartedAt, setLowEffStartedAt] = useState({});

  function priorityTone(value) {
    if (value == null || Number.isNaN(Number(value))) return "priority-chip-gray";
    const n = Number(value);
    if (n >= 5) return "priority-chip-green";
    if (n >= 3) return "priority-chip-yellow";
    if (n >= 1) return "priority-chip-red";
    return "priority-chip-gray";
  }

  // Efeito para buscar o log aberto de baixa eficiência para cada máquina ativa
  useEffect(() => {
    async function fetchLowEffLogs() {
      const result = {};
      for (const m of machineIds) {
        const lista = (localAtivos && localAtivos[m]) || [];
        const ativa = lista[0] || null;
        if (ativa && ativa.status === "BAIXA_EFICIENCIA") {
          // Busca log aberto para essa ordem/máquina
          let query = supabase
            .from("low_efficiency_logs")
            .select("started_at")
            .is("ended_at", null)
            .eq("machine_id", m);
          if (ativa.id) query = query.eq("order_id", ativa.id);
          const { data, error } = await query;
          if (!error && data && data.length > 0) {
            result[m] = data[0].started_at;
          }
        }
      }
      setLowEffStartedAt(result);
    }
    fetchLowEffLogs();
    // Executa sempre que localAtivos ou status mudam
  }, [localAtivos, tick, machineIds]);
  
  async function insertLowEfficiencyLog({ order_id = null, machine_id, started_by = null, notes = null }) {
    try {
      const payload = {
        order_id: order_id || null,
        machine_id,
        started_at: new Date().toISOString(),
        started_by,
        notes,
      };
      const { data, error } = await supabase.from("low_efficiency_logs").insert(payload).select();
      if (error) {
        console.error("Erro inserindo low_efficiency_logs:", error);
        return { error };
      }
      return { data };
    } catch (err) {
      console.error("Exception insertLowEfficiencyLog:", err);
      return { error: err };
    }
  }

  async function endLowEfficiencyLog({ order_id = null, machine_id, ended_by = null, notes = null }) {
    try {
      const updates = {
        ended_at: new Date().toISOString(),
        ended_by,
        notes,
      };

      // Se order_id estiver disponível, preferimos usá-lo para encontrar o log aberto.
      // Caso contrário, usamos machine_id e ended_at IS NULL.
      let query = supabase.from("low_efficiency_logs").update(updates).is("ended_at", null);

      if (order_id) {
        query = query.eq("order_id", order_id);
      } else {
        query = query.eq("machine_id", machine_id);
      }

      // Executa update
      const { data, error } = await query.select();
      if (error) {
        console.error("Erro ao encerrar low_efficiency_logs:", error);
        return { error };
      }
      return { data };
    } catch (err) {
      console.error("Exception endLowEfficiencyLog:", err);
      return { error: err };
    }
  }

  const overview = useMemo(() => {
    const machineCount = machineIds.length || 1;
    const nowMs = Date.now();

    // Eficiência dinâmica: compara produção real atual com meta acumulada até o horário atual,
    // partindo do started_at e usando ciclo/cavidades do item.
    let dynamicProducedBoxes = 0;
    let dynamicProducedPieces = 0;
    let dynamicMetaBoxes = 0;
    let dynamicMetaPieces = 0;

    for (const machine of machineIds) {
      const ativa = (source[machine] || [])[0] || null;
      if (!ativa) continue;

      const startRef = ativa?.started_at || ativa?.restarted_at || null;
      const startMs = startRef ? DateTime.fromISO(String(startRef)).toMillis() : NaN;
      if (!Number.isFinite(startMs) || startMs >= nowMs) continue;

      const itemCode = extractItemCodeFromOrderProduct(ativa?.product);
      const tech = itemCode ? itemTechByCode[itemCode] : null;
      const cycleSeconds = Number(tech?.cycleSeconds || 0);
      const cavities = Number(tech?.cavities || 0);
      if (!(cycleSeconds > 0 && cavities > 0)) continue;

      const elapsedSeconds = Math.max(0, (nowMs - startMs) / 1000);
      const piecesPerHour = (3600 / cycleSeconds) * cavities;
      const metaPiecesNow = (elapsedSeconds / 3600) * piecesPerHour;

      const producedBoxes = Number(ativa?.scanned_count || 0);
      const piecesPerBox = parsePiecesPerBox(ativa?.standard);
      const producedPieces = piecesPerBox > 0 ? producedBoxes * piecesPerBox : 0;
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
      scrapPieces: Number(periodData.scrapPieces || 0),
      scrapPct: Number(periodData.scrapPct || 0),
      trendLabels: periodData.trendLabels || [],
      periodLabel: periodData.periodLabel || "Hoje",
    };
  }, [machineIds, periodData, source, itemTechByCode, tick]);

  const lineChartWidth = 560;
  const lineChartHeight = 220;
  const lineMax = Math.max(1, ...overview.trendGoal, ...overview.trendReal);
  const realPath = buildLinePath(overview.trendReal, lineChartWidth, lineChartHeight, lineMax);
  const goalPath = buildLinePath(overview.trendGoal, lineChartWidth, lineChartHeight, lineMax);
  const trendLen = Math.max(1, overview.trendLabels.length);
  const trendStep = trendLen > 1 ? lineChartWidth / (trendLen - 1) : lineChartWidth;

  function clampTrendIndex(idx) {
    return Math.max(0, Math.min(overview.trendLabels.length - 1, idx));
  }

  function handleTrendMove(evt) {
    const rect = evt.currentTarget.getBoundingClientRect();
    if (!rect.width || overview.trendLabels.length === 0) return;
    const x = evt.clientX - rect.left;
    const ratio = x / rect.width;
    const idx = clampTrendIndex(Math.round(ratio * (overview.trendLabels.length - 1)));
    setTrendHoverIndex(idx);
  }

  const effectiveTrendIndex = trendHoverIndex == null ? null : clampTrendIndex(trendHoverIndex);
  const trendTooltip = effectiveTrendIndex == null ? null : {
    idx: effectiveTrendIndex,
    label: overview.trendLabels[effectiveTrendIndex],
    real: Number(overview.trendReal[effectiveTrendIndex] || 0),
    goal: Number(overview.trendGoal[effectiveTrendIndex] || 0),
    realPieces: Number(overview.trendRealPieces[effectiveTrendIndex] || 0),
    goalPieces: Number(overview.trendGoalPieces[effectiveTrendIndex] || 0),
    x: trendStep * effectiveTrendIndex,
    realY: lineChartHeight - ((Number(overview.trendReal[effectiveTrendIndex] || 0) / lineMax) * lineChartHeight),
    goalY: lineChartHeight - ((Number(overview.trendGoal[effectiveTrendIndex] || 0) / lineMax) * lineChartHeight),
  };

  const donutTotal = Math.max(1, overview.machineOutput.reduce((acc, item) => acc + item.value, 0));
  const donutColors = ["#19d3ff", "#5b7cff", "#5effa8", "#be6dff", "#f9bf4f", "#2ee8d6", "#ff7d7d"];
  const donutGradient = overview.machineOutput
    .filter((item) => item.value > 0)
    .reduce(
      (acc, item, idx) => {
        const part = (item.value / donutTotal) * 100;
        const from = acc.cursor;
        const to = Math.min(100, from + part);
        acc.stops.push(`${donutColors[idx % donutColors.length]} ${from.toFixed(2)}% ${to.toFixed(2)}%`);
        acc.cursor = to;
        return acc;
      },
      { cursor: 0, stops: [] }
    ).stops;

  const donutBackground = donutGradient.length
    ? `conic-gradient(${donutGradient.join(", ")})`
    : "conic-gradient(#24324d 0% 100%)";
  const activeDonutItem = overview.machineOutput.find((item) => item.machine === donutHoverMachine)
    || overview.machineOutput.find((item) => Number(item.value || 0) > 0)
    || overview.machineOutput[0]
    || null;

  const ongoingOrders = useMemo(() => {
    if (Array.isArray(periodData.ongoingOrders) && periodData.ongoingOrders.length > 0) {
      return periodData.ongoingOrders;
    }
    return machineIds
      .map((machine) => {
        const ativa = (source[machine] || [])[0] || null;
        if (!ativa) return null;

        const plannedQty = Number(ativa?.boxes || 0);
        const producedQty = Number(ativa?.scanned_count || 0);
        const stdPieces = parsePiecesPerBox(ativa?.standard);
        const plannedPieces = Number(ativa?.qty || (plannedQty > 0 && stdPieces > 0 ? plannedQty * stdPieces : 0));
        const producedPieces = producedQty * (stdPieces || 0);
        const progress = plannedQty > 0 ? Math.min(100, Math.round((producedQty / plannedQty) * 100)) : 0;

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
        };
      })
      .filter(Boolean);
  }, [machineIds, source, periodData.ongoingOrders]);

  function getStatusBadge(status) {
    const normalized = String(status || "").toUpperCase();
    if (normalized === "PRODUZINDO") return "status-badge producing";
    if (normalized === "PARADA") return "status-badge stopped";
    if (normalized === "BAIXA_EFICIENCIA") return "status-badge low-efficiency";
    if (normalized === "FINALIZADA") return "status-badge finished";
    if (normalized === "AGUARDANDO") return "status-badge waiting";
    return "status-badge default";
  }

  function getStatusLabel(status) {
    const normalized = String(status || "").toUpperCase();
    if (normalized === "PRODUZINDO") return "Produzindo";
    if (normalized === "PARADA") return "Parada";
    if (normalized === "BAIXA_EFICIENCIA") return "Baixa Eficiência";
    if (normalized === "FINALIZADA") return "Finalizada";
    if (normalized === "AGUARDANDO") return "Aguardando";
    return status || "-";
  }

  return (
    <div className="board-wrapper">
      <section className="dashboard-overview">
        <div className="kpi-grid">
          <article className="kpi-card">
            <p className="kpi-label">Produção no Período</p>
            <strong className="kpi-value">{formatCompactNumber(overview.producedPieces)} peças</strong>
            <span className="kpi-meta">{formatCompactNumber(overview.producedBoxes)} caixas</span>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Refugo</p>
            <strong className="kpi-value">{overview.scrapPct.toFixed(1)}%</strong>
            <span className={`kpi-trend ${overview.scrapPct <= 5 ? 'up' : 'down'}`}>
              {formatCompactNumber(overview.scrapPieces)} peças refugadas
            </span>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Eficiência</p>
            <strong className="kpi-value">{overview.efficiency.toFixed(1)}%</strong>
            <span className={`kpi-trend ${overview.efficiency >= 80 ? 'up' : 'down'}`}>
              {overview.efficiency >= 80 ? 'Dentro da meta' : 'Abaixo da meta'}
            </span>
            <span className="kpi-meta">
              Meta agora: {formatCompactNumber(Math.round(overview.metaNowBoxes || 0))} cx • {formatCompactNumber(Math.round(overview.metaNowPieces || 0))} pç
            </span>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Paradas</p>
            <strong className="kpi-value">{overview.openStopCount}</strong>
            <span className="kpi-meta">
              {overview.openStopCount > 0 ? `${formatHHMMSS(overview.openStopSeconds)} em aberto` : 'Nenhuma parada aberta'}
            </span>
          </article>
        </div>

        <div className="dashboard-charts-grid">
          <article className="overview-chart-card">
            <header>
              <h3>Produção por Período</h3>
              <div className="chart-filter-row">
                <span>Real x Meta</span>
                <select
                  className="chart-filter-select"
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                  aria-label="Filtrar periodo do dashboard"
                >
                  <option value="today">Hoje</option>
                  <option value="yesterday">Ontem</option>
                  <option value="week">Esta semana</option>
                  <option value="month">Este mes</option>
                </select>
              </div>
            </header>
            <div className="line-chart-wrap" role="img" aria-label="Grafico de linha de producao por periodo">
              <svg
                viewBox={`0 0 ${lineChartWidth} ${lineChartHeight}`}
                preserveAspectRatio="none"
                className="line-chart-svg"
                onMouseMove={handleTrendMove}
                onMouseDown={handleTrendMove}
                onMouseLeave={() => setTrendHoverIndex(null)}
              >
                {overview.trendLabels.map((_, idx) => {
                  const divisor = Math.max(1, overview.trendLabels.length - 1);
                  const x = (lineChartWidth / divisor) * idx;
                  return (
                    <line
                      key={`grid-${idx}`}
                      x1={x}
                      y1="0"
                      x2={x}
                      y2={lineChartHeight}
                      className="line-grid"
                    />
                  );
                })}
                <path d={goalPath} className="line-goal" />
                <path d={realPath} className="line-real" />
                {trendTooltip && (
                  <>
                    <line
                      x1={trendTooltip.x}
                      y1="0"
                      x2={trendTooltip.x}
                      y2={lineChartHeight}
                      className="line-hover-guide"
                    />
                    <circle cx={trendTooltip.x} cy={trendTooltip.realY} r="5" className="line-point-real" />
                    <circle cx={trendTooltip.x} cy={trendTooltip.goalY} r="5" className="line-point-goal" />
                  </>
                )}
              </svg>
              {trendTooltip && (
                <div className="chart-tooltip line-tooltip">
                  <strong>{trendTooltip.label}</strong>
                  <span>Produzido: {formatCompactNumber(trendTooltip.real)} caixas</span>
                  <span>Meta: {formatCompactNumber(trendTooltip.goal)} caixas</span>
                  <span>Produzido: {formatCompactNumber(trendTooltip.realPieces)} peças</span>
                  <span>Meta: {formatCompactNumber(trendTooltip.goalPieces)} peças</span>
                </div>
              )}
              <div className="line-chart-legend">
                <span><i className="dot dot-real" />Produção real</span>
                <span><i className="dot dot-goal" />Meta</span>
              </div>
              <div
                className="line-chart-labels"
                style={{ gridTemplateColumns: `repeat(${Math.max(1, overview.trendLabels.length)}, minmax(0, 1fr))` }}
              >
                {overview.trendLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
          </article>

          <article className="overview-chart-card donut-card">
            <header>
              <h3>Produção por Máquina</h3>
              <span>Distribuição do volume atual</span>
            </header>
            <div className="donut-wrap">
              <div className="donut-chart" style={{ background: donutBackground }}>
                <div className="donut-center">
                  <small>{activeDonutItem ? activeDonutItem.machine : "TOTAL"}</small>
                  <strong>{formatCompactNumber(activeDonutItem ? activeDonutItem.value : donutTotal)}</strong>
                  <span className="donut-center-sub">
                    {activeDonutItem
                      ? `${formatCompactNumber(activeDonutItem.pieces || 0)} pecas`
                      : `${formatCompactNumber(donutTotal)} caixas`}
                  </span>
                </div>
              </div>
              <ul className="donut-legend">
                {overview.machineOutput.map((item, idx) => (
                  <li
                    key={item.machine}
                    className={donutHoverMachine === item.machine ? "is-active" : ""}
                    onMouseEnter={() => setDonutHoverMachine(item.machine)}
                    onMouseLeave={() => setDonutHoverMachine(null)}
                    onFocus={() => setDonutHoverMachine(item.machine)}
                    onBlur={() => setDonutHoverMachine(null)}
                    tabIndex={0}
                  >
                    <i style={{ background: donutColors[idx % donutColors.length] }} />
                    <span>{item.machine}</span>
                    <strong>{formatCompactNumber(item.value)}</strong>
                  </li>
                ))}
              </ul>
            </div>
            {activeDonutItem && (
              <div className="chart-tooltip donut-tooltip">
                <strong>{activeDonutItem.machine}</strong>
                <span>{formatCompactNumber(activeDonutItem.boxes || activeDonutItem.value || 0)} caixas</span>
                <span>{formatCompactNumber(activeDonutItem.pieces || 0)} pecas</span>
              </div>
            )}
          </article>
        </div>

        <section className="orders-layout">
          <div className="orders-table-card">
            <header>
              <div>
                <h3>Produção por Ordem</h3>
                <span>Resumo de desempenho em {overview.periodLabel.toLowerCase()}</span>
              </div>
              <span className="orders-meta">{ongoingOrders.length} ordens no periodo</span>
            </header>

            <div className="orders-table-responsive">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Ordem</th>
                    <th>Produto</th>
                    <th>Qtd Planejada</th>
                    <th>Qtd Produzida</th>
                    <th>Progresso</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ongoingOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="orders-empty">
                        Nenhuma ordem em andamento no momento.
                      </td>
                    </tr>
                  ) : (
                    ongoingOrders.map((order) => (
                      <tr key={`${order.machine}-${order.order}`}>
                        <td>{order.order}</td>
                        <td>{order.product}</td>
                        <td>{order.plannedBoxes.toLocaleString('pt-BR')} cx • {order.plannedPieces.toLocaleString('pt-BR')} pç</td>
                        <td>{order.producedBoxes.toLocaleString('pt-BR')} cx • {order.producedPieces.toLocaleString('pt-BR')} pç</td>
                        <td className="progress-cell">
                          <div className="progress-bar" aria-label={`Progresso ${order.progress}%`}>
                            <div className="progress-bar-fill" style={{ width: `${order.progress}%` }} />
                          </div>
                          <span className="progress-label">{order.progress}%</span>
                        </td>
                        <td>
                          <span className={getStatusBadge(order.status)}>
                            {getStatusLabel(order.status)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="stop-reason-card">
            <header>
              <div>
                <h3>Paradas por Motivo</h3>
                <span>Distribuição de paradas</span>
              </div>
            </header>
            <div className="stop-reason-list">
              {overview.stopReasons.length === 0 ? (
                <div className="orders-empty">Nenhuma parada registrada.</div>
              ) : (
                overview.stopReasons.map((item) => (
                  <div
                    key={item.reason}
                    className={`stop-reason-item ${stopReasonHover === item.reason ? "is-active" : ""}`}
                    onMouseEnter={() => setStopReasonHover(item.reason)}
                    onMouseLeave={() => setStopReasonHover(null)}
                  >
                    <div className="stop-reason-label">
                      <strong>{item.reason}</strong>
                      <span>{item.hours.toFixed(2)}h</span>
                    </div>
                    <div className="stop-reason-bar">
                      <div className="stop-reason-bar-fill" style={{ width: `${item.percent}%` }} />
                    </div>
                    <div className="stop-reason-meta">{item.percent}% • {item.count} ocorrência(s)</div>
                    {stopReasonHover === item.reason && (
                      <div className="chart-tooltip stop-tooltip">
                        <strong>{item.reason}</strong>
                        <span>Tempo total: {item.hours.toFixed(2)}h</span>
                        <span>Ocorrências: {item.count}</span>
                        <span>Participação: {item.percent}%</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}

