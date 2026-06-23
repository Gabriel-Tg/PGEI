import { DateTime } from "luxon";
import { getTurnoAtual as resolveTurnoAtual } from './shifts';

// Retorna 1, 2, 3 ou null quando estiver sem programacao.
// Aceita: nothing (usa agora), ISO string, JS Date, ou Luxon DateTime
export function getTurnoAtual(dateInput = null) {
  return resolveTurnoAtual(dateInput);
}

// src/lib/utils.js
export function statusClass(s){
  const status = String(s || '').trim().toUpperCase()
  if(status === 'AGUARDANDO') return 'card gray'
  if(status === 'PRODUZINDO') return 'card green'
  if(status === 'BAIXA_EFICIENCIA') return 'card yellow'
  if(status === 'PARADA') return 'card red'
  return 'card'
}

export function fmtDateTime(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    const dia = d.toLocaleDateString('pt-BR')
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return `${dia} ${hora}`
  } catch { return ts }
}

export function parseBrNumber(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const raw = String(value).trim()
  if (!raw) return null

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, '')
      : raw

  const num = Number(normalized)
  return Number.isFinite(num) ? num : null
}

export function formatQuantity(value, options = {}) {
  const { fallback = '', maximumFractionDigits = 2 } = options
  const num = parseBrNumber(value)
  if (num == null) return value == null || value === '' ? fallback : String(value)

  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })
}

export function formatHHMMSS(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0))
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function fmtElapsedSince(startIso, currentTimeMs = Date.now()) {
  if (!startIso) return null
  const startMs = new Date(startIso).getTime()
  if (!Number.isFinite(startMs)) return null
  return formatHHMMSS(Math.floor((currentTimeMs - startMs) / 1000))
}

export function getProductionStartedAt(ordem) {
  return ordem?.active_session_started_at || ordem?.restarted_at || ordem?.started_at || null
}

export function getOrderStopDisplay(ordem, paradas = []) {
  if (!ordem) {
    return { openStop: null, stopReason: '', stopStartedAt: null }
  }

  const orderId = String(ordem?.source_order_id || ordem?.id || '')
  const openStop = Array.isArray(paradas)
    ? paradas.find((parada) => String(parada?.order_id || '') === orderId && !parada?.resumed_at)
    : null

  return {
    openStop,
    stopReason: openStop?.reason || ordem?.reason || '',
    stopStartedAt: openStop?.started_at || ordem?.scheduled_stop_started_at || ordem?.active_stop_started_at || null,
  }
}

// Converte data/hora local digitada -> ISO UTC
export function localDateTimeToISO(dateStr, timeStr) {
  const [Y, M, D] = String(dateStr).split('-').map(Number);
  const [h, m] = String(timeStr).split(':').map(Number);
  // Constrói o horário no fuso de São Paulo, preservando o horário digitado
  const dtBr = DateTime.fromObject(
    { year: Y, month: M, day: D, hour: h, minute: m, second: 0 },
    { zone: 'America/Sao_Paulo' }
  );
  // Retorna ISO com offset (-03:00), evitando virar o dia ao converter
  return dtBr.toISO();
}

// Util: a ordem JÁ iniciou produção?
export function jaIniciou(ordem) { return Boolean(ordem?.started_at) }

export function fmtDuracao(startIso, endIso){
  if(!startIso || !endIso) return '-'
  const sec = Math.max(0, Math.floor((new Date(endIso) - new Date(startIso))/1000))
  return formatHHMMSS(sec)
}
