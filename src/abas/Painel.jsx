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
          if (match && typeof match.scanned_count !== "undefined") {
            return { ...inItem, scanned_count: match.scanned_count };
          }
          // normalize scanned_count to number (0 if missing)
          return {
            ...inItem,
            scanned_count:
              typeof inItem.scanned_count === "number"
                ? inItem.scanned_count
                : Number(inItem.scanned_count || 0),
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

            // prefer machine_id informado no scan; se não vier, deixamos procurar em todas
            const scanOrderId = newRow.order_id;
            const scanMachineId = newRow.machine_id;

            // obtém count atual de production_scans para essa order_id
            let scannedCount = 0;
            try {
              const { error: countErr, count } = await supabase
                .from("production_scans")
                .select("*", { head: true, count: "exact" })
                .eq("order_id", scanOrderId);

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

  const source = localAtivos || {};

  const overview = useMemo(() => {
    const snapshots = machineIds.map((m) => ({ machine: m, ativa: (source[m] || [])[0] || null }));
    const machineCount = machineIds.length || 1;
    const activeCount = snapshots.filter((entry) => !!entry.ativa).length;
    const producingCount = snapshots.filter((entry) => entry.ativa?.status === "PRODUZINDO").length;
    const stoppedCount = snapshots.filter((entry) => entry.ativa?.status === "PARADA").length;
    const lowEffCount = snapshots.filter((entry) => entry.ativa?.status === "BAIXA_EFICIENCIA").length;

    const plannedTotal = snapshots.reduce((acc, entry) => acc + Number(entry.ativa?.boxes || 0), 0);
    const producedTotal = snapshots.reduce((acc, entry) => acc + Number(entry.ativa?.scanned_count || 0), 0);

    const efficiency = plannedTotal > 0 ? (producedTotal / plannedTotal) * 100 : 0;
    const availability = (producingCount / machineCount) * 100;
    const oee = (efficiency * availability) / 100;

    const downtimeSeconds = (paradas || [])
      .filter((p) => !p.resumed_at)
      .reduce((acc, p) => {
        const started = new Date(p.started_at).getTime();
        if (!Number.isFinite(started)) return acc;
        return acc + Math.max(0, Math.floor((Date.now() - started) / 1000));
      }, 0);

    const machineOutput = snapshots.map((entry) => ({
      machine: entry.machine,
      value: Number(entry.ativa?.scanned_count || 0),
    }));

    const fractions = [0.12, 0.22, 0.34, 0.45, 0.58, 0.71, 0.84, 0.92, 1];
    const trendReal = fractions.map((f, idx) => {
      const slopeBoost = 0.8 + idx * 0.04;
      return Math.round(producedTotal * f * slopeBoost * 0.95);
    });
    const trendGoal = fractions.map((f) => Math.round(plannedTotal * f));

    return {
      activeCount,
      producingCount,
      stoppedCount,
      lowEffCount,
      plannedTotal,
      producedTotal,
      efficiency,
      availability,
      oee,
      downtimeSeconds,
      machineOutput,
      trendReal,
      trendGoal,
      trendLabels: ["00h", "03h", "06h", "09h", "12h", "15h", "18h", "21h", "24h"],
    };
  }, [machineIds, source, paradas, tick]);

  const lineChartWidth = 560;
  const lineChartHeight = 220;
  const lineMax = Math.max(1, ...overview.trendGoal, ...overview.trendReal);
  const realPath = buildLinePath(overview.trendReal, lineChartWidth, lineChartHeight, lineMax);
  const goalPath = buildLinePath(overview.trendGoal, lineChartWidth, lineChartHeight, lineMax);

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

  return (
    <div className="board-wrapper">
      <section className="dashboard-overview">
        <div className="kpi-grid">
          <article className="kpi-card">
            <p className="kpi-label">Producao Real</p>
            <strong className="kpi-value">{formatCompactNumber(overview.producedTotal)}</strong>
            <span className="kpi-meta">caixas apontadas hoje</span>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Producao Planejada</p>
            <strong className="kpi-value">{formatCompactNumber(overview.plannedTotal)}</strong>
            <span className="kpi-meta">meta operacional</span>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Eficiencia</p>
            <strong className="kpi-value">{overview.efficiency.toFixed(1)}%</strong>
            <span className={`kpi-trend ${overview.efficiency >= 80 ? 'up' : 'down'}`}>
              {overview.efficiency >= 80 ? 'Acima da faixa' : 'Abaixo da faixa'}
            </span>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Disponibilidade</p>
            <strong className="kpi-value">{overview.availability.toFixed(1)}%</strong>
            <span className={`kpi-trend ${overview.availability >= 70 ? 'up' : 'down'}`}>
              {overview.producingCount} produzindo | {overview.stoppedCount} paradas
            </span>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">OEE Estimado</p>
            <strong className="kpi-value">{overview.oee.toFixed(1)}%</strong>
            <span className="kpi-meta">integrado em tempo real</span>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Paradas Abertas</p>
            <strong className="kpi-value">{formatHHMMSS(overview.downtimeSeconds)}</strong>
            <span className={`kpi-trend ${overview.lowEffCount > 0 ? 'down' : 'up'}`}>
              {overview.lowEffCount} baixa eficiencia | {overview.activeCount} maquinas ativas
            </span>
          </article>
        </div>

        <div className="dashboard-charts-grid">
          <article className="overview-chart-card">
            <header>
              <h3>Producao por Periodo</h3>
              <span>Real x Meta (janela operacional)</span>
            </header>
            <div className="line-chart-wrap" role="img" aria-label="Grafico de linha de producao por periodo">
              <svg viewBox={`0 0 ${lineChartWidth} ${lineChartHeight}`} preserveAspectRatio="none" className="line-chart-svg">
                {overview.trendLabels.map((_, idx) => {
                  const x = (lineChartWidth / (overview.trendLabels.length - 1)) * idx;
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
              </svg>
              <div className="line-chart-legend">
                <span><i className="dot dot-real" />Producao real</span>
                <span><i className="dot dot-goal" />Meta</span>
              </div>
              <div className="line-chart-labels">
                {overview.trendLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
          </article>

          <article className="overview-chart-card donut-card">
            <header>
              <h3>Producao por Maquina</h3>
              <span>Distribuicao do volume atual</span>
            </header>
            <div className="donut-wrap">
              <div className="donut-chart" style={{ background: donutBackground }}>
                <div className="donut-center">
                  <small>TOTAL</small>
                  <strong>{formatCompactNumber(donutTotal)}</strong>
                </div>
              </div>
              <ul className="donut-legend">
                {overview.machineOutput.map((item, idx) => (
                  <li key={item.machine}>
                    <i style={{ background: donutColors[idx % donutColors.length] }} />
                    <span>{item.machine}</span>
                    <strong>{formatCompactNumber(item.value)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </div>
      </section>

      <div className="board">
        {machineIds.map((m) => {
          const lista = source[m] ?? [];
          const ativa = lista[0] || null;

          const openStop = ativa
            ? paradas.find((p) => p.order_id === String(ativa.id) && !p.resumed_at)
            : null;

          const sinceMs = openStop ? new Date(openStop.started_at).getTime() : null;

          const durText = sinceMs
            ? (() => {
                const _ = tick;
                const total = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
                return formatHHMMSS(total);
              })()
            : null;

          // Timer de baixa eficiência usando started_at do log aberto
          const lowEffText =
            ativa?.status === "BAIXA_EFICIENCIA" && lowEffStartedAt[m]
              ? (() => {
                  const _ = tick;
                  const secs =
                    (Date.now() - new Date(lowEffStartedAt[m]).getTime()) / 1000;
                  return formatHHMMSS(secs);
                })()
              : null;

          let semProgText = null;
          // Mostrar cronômetro "Sem Programação" quando não há ativa
          // ou quando a ordem está em "AGUARDANDO" (antes de iniciar produção)
          if (!ativa || ativa.status === "AGUARDANDO") {
            const lastFinISO = lastFinalizadoPorMaquina?.[m] || null;
            if (lastFinISO) {
              const _ = tick;
              const since = new Date(lastFinISO).getTime();
              const total = Math.max(0, Math.floor((Date.now() - since) / 1000));
              semProgText = formatHHMMSS(total);
            }
          }

          const opCode = ativa?.code || ativa?.o?.code || ativa?.op_code || "";
          const itemCode = extractItemCodeFromOrderProduct(ativa?.product);
          const itemTech = itemCode ? itemTechByCode[itemCode] : null;
          const cycleSeconds = Number(itemTech?.cycleSeconds || 0);
          const cavities = Number(itemTech?.cavities || 0);

          // lidas / saldo: scanned_count agora pode vir do fetch inicial ou do realtime
          const lidas = Number(ativa?.scanned_count || 0);
          const saldo = ativa ? Math.max(0, (Number(ativa.boxes) || 0) - lidas) : 0;

          const priorityValue = machinePriorities?.[m];

          return (
            <div key={m} className="column">
              <div
                className={
                  "column-header " +
                  (ativa?.status === "PARADA" ? "blink-red" : "")
                }
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <div className="hdr-left" style={{ display: "flex", gap: 8 }}>
                  {m}

                  {ativa?.status === "PARADA" && durText && (
                    <span className="parada-timer">{durText}</span>
                  )}

                  {lowEffText && (
                    <span className="loweff-timer">{lowEffText}</span>
                  )}

                  {semProgText && (
                    <span className="semprog-timer">{semProgText}</span>
                  )}
                </div>
                <div className="hdr-right" style={{ marginLeft: "auto" }}>
                  <span className={`priority-chip ${priorityTone(priorityValue)}`}>
                    PRIORIDADE: {priorityValue ?? "-"}
                  </span>
                </div>
              </div>

              <div className="column-body">
                {ativa ? (
                  <div className={statusClass(ativa.status)}>
                      {opCode && (
                      <div className="hdr-right op-inline" style={{ marginBottom: 4, textAlign: 'left' }}>
                        O.P - {opCode}
                      </div>
                    )}
                    <Etiqueta
                      o={ativa}
                      variant="painel"
                      lidasCaixas={["P1", "P2", "P3"].includes(m) ? lidas : undefined}
                      saldoCaixas={["P1", "P2", "P3"].includes(m) ? saldo : undefined}
                      paradaReason={openStop?.reason}
                      paradaNotes={openStop?.notes}
                    />

                    {ativa?.status === "PARADA" && openStop?.reason && (
                      <div className="stop-reason-below">{openStop.reason}</div>
                    )}

                    {ativa?.status === "BAIXA_EFICIENCIA" && ativa?.loweff_notes && (
                      <div className="loweff-info-below">
                        <div className="loweff-reason-below">
                          {ativa.loweff_notes}
                        </div>
                      </div>
                    )}

                    <div className="sep" />

                    <div className="grid2">
                      <div>
                        <div className="label">Situação</div>

                        <select
                          className="select"
                          value={ativa.status}
                          onChange={async (e) => {
                            if (readOnly) return;
                            const novoStatus = e.target.value;
                            // chama callback pai para atualizar status (mantém comportamento atual)
                            try {
                              onStatusChange(ativa, novoStatus);
                            } catch (err) {
                              console.warn("onStatusChange falhou:", err);
                            }
                          }}
                          disabled={readOnly || ativa.status === "AGUARDANDO"}
                        >
                          {STATUS.filter((s) =>
                            jaIniciou(ativa) ? s !== "AGUARDANDO" : true
                          ).map((s) => (
                            <option key={s} value={s}>
                              {s === "AGUARDANDO"
                                ? "Aguardando"
                                : s === "PRODUZINDO"
                                ? "Produzindo"
                                : s === "BAIXA_EFICIENCIA"
                                ? "Baixa Eficiência"
                                : "Parada"}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex" style={{ justifyContent: "flex-end", gap: 8 }}>
                        {ativa.status === "AGUARDANDO" ? (
                          <button
                            className="btn"
                            disabled={readOnly}
                            onClick={() => {
                              if (readOnly) return;
                              const nowBr = DateTime.now().setZone("America/Sao_Paulo");
                              setStartModal({
                                ordem: ativa,
                                operador: "",
                                data: nowBr.toISODate(),
                                hora: nowBr.toFormat("HH:mm"),
                              });
                            }}
                          >
                            Iniciar Produção
                          </button>
                        ) : (
                          <button className="btn" disabled={readOnly} onClick={() => { if (!readOnly) setFinalizando(ativa) }}>
                            Finalizar
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid2 painel-tech-grid" style={{ marginTop: 12 }}>
                      <div>
                        <div className="label">Ciclo</div>
                        <div className="small painel-tech-value">
                          {cycleSeconds > 0 ? `${cycleSeconds} s` : "-"}
                        </div>
                      </div>
                      <div>
                        <div className="label">Cavidades</div>
                        <div className="small painel-tech-value">{cavities > 0 ? cavities : "-"}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="muted">Sem Programação</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

