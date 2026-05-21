// src/components/Etiqueta.jsx

export default function Etiqueta({ o, variant = 'painel', saldoCaixas, lidasCaixas, compactPills = false }) {
  if (!o) return null

  const opCode = o.code || o.op_code || o.o?.code || o.ordem?.code

  const temObsLowEff = !!o.loweff_notes
  const interrompida = o.status === 'AGUARDANDO' && !!o.interrupted_at
  const isWeekendStop = o.status === 'PARADA' && o.reason === 'FIM DE SEMANA'
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '-')

  const toNum = (value) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : 0
  }

  const plannedPiecesFromOrder = (() => {
    const qty = toNum(o.qty)
    if (qty > 0) return qty

    const boxes = toNum(o.boxes)
    if (boxes > 0) return boxes

    if (typeof lidasCaixas === 'number' && typeof saldoCaixas === 'number') {
      return Math.max(0, toNum(lidasCaixas) + toNum(saldoCaixas))
    }

    return 0
  })()

  const producedPieces = (() => {
    const sensorPieces = toNum(o.sensor_produced_pieces)
    if (sensorPieces > 0) return sensorPieces

    const boxesPlanned = toNum(o.boxes)
    const lidas = typeof lidasCaixas === 'number' ? toNum(lidasCaixas) : toNum(o.scanned_count)

    if (lidas > 0 && boxesPlanned > 0 && plannedPiecesFromOrder > 0) {
      return Math.round((lidas / boxesPlanned) * plannedPiecesFromOrder)
    }

    return lidas
  })()

  const progressPct = plannedPiecesFromOrder > 0
    ? Math.min(100, Math.round((producedPieces / plannedPiecesFromOrder) * 100))
    : 0

  const showQtdApontada = producedPieces > 0 || plannedPiecesFromOrder > 0

  function renderQtdApontada(extraClass = '') {
    if (!showQtdApontada) return null

    return (
      <div className={`qtd-apontada-block ${extraClass}`.trim()}>
        <div className="qtd-apontada-line">
          <span>Qtd Apontada:</span>
          <strong>{producedPieces.toLocaleString('pt-BR')} / {plannedPiecesFromOrder.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="qtd-apontada-progress" aria-label={`Progresso ${progressPct}%`}>
          <div className="qtd-apontada-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="qtd-apontada-percent">{progressPct}%</div>
      </div>
    )
  }

  // ===== variante FILA =====
  if (variant === 'fila') {
    return (
      <div className={`small etiqueta-fila-flex ${isWeekendStop ? 'etiqueta-weekend' : ''}`}>
        <div className="etiqueta-fila-main">
          {interrompida && <div className="badge-interrompida">⚠️ Produção Interrompida</div>}
          {opCode && <div><b>O.P:</b> {opCode}</div>}
          {o.customer && <div><b>Cliente:</b> {o.customer}</div>}
          {o.product && <div><b>Produto:</b> {o.product}</div>}
          {o.color && <div><b>Cor:</b> {o.color}</div>}
          {o.qty && <div><b>Qtd:</b> {o.qty}</div>}
          {o.boxes && <div><b>Volumes:</b> {o.boxes}</div>}
          {o.standard && <div><b>Padrão:</b> {o.standard}</div>}
          {o.due_date && <div><b>Prazo:</b> {fmtDate(o.due_date)}</div>}
          {temObsLowEff && <div><b>Baixa Eficiência:</b> {o.loweff_notes}</div>}
          {o.notes && <div className="muted">{o.notes}</div>}
        </div>
        {renderQtdApontada('qtd-apontada-fila')}
      </div>
    )
  }

    // ===== variante pet01 =====
  if (variant === 'pet01') {
  return (
    <div className={`small ${isWeekendStop ? 'etiqueta-weekend' : ''}`}>
      {interrompida && <div className="badge-interrompida">⚠️ Produção Interrompida</div>}

      {o.customer && <div><b>Cliente:</b> {o.customer}</div>}
      {o.product && <div><b>Produto:</b> {o.product}</div>}
      {o.color && <div><b>Cor:</b> {o.color}</div>}
      {o.qty && <div><b>Qtd:</b> {o.qty}</div>}

      {o.boxes && <div><b>Volumes:</b> {o.boxes}</div>}

      {o.standard && <div><b>Padrão:</b> {o.standard}</div>}
      {o.due_date && <div><b>Prazo:</b> {fmtDate(o.due_date)}</div>}

      {temObsLowEff && <div><b>Baixa Eficiência:</b> {o.loweff_notes}</div>}
      {o.notes && <div className="muted">{o.notes}</div>}
      {renderQtdApontada()}
    </div>
   )
  }

  // ===== variante PAINEL =====
  return (
    <div
      className={`small ${isWeekendStop ? 'etiqueta-weekend' : ''} ${compactPills ? 'compact-pills-layout' : ''}`}
      style={{ position: 'relative' }}
    >
      {interrompida && <div className="badge-interrompida">⚠️ Produção Interrompida</div>}
 
      {o.customer && <div><b>Cliente:</b> {o.customer}</div>}
      {o.product && <div><b>Produto:</b> {o.product}</div>}
      {o.color && <div><b>Cor:</b> {o.color}</div>}
      {o.qty && <div><b>Qtd:</b> {o.qty}</div>}

      {o.boxes && <div><b>Volumes:</b> {o.boxes}</div>}

      {o.standard && <div><b>Padrão:</b> {o.standard}</div>}
      {o.due_date && <div><b>Prazo:</b> {fmtDate(o.due_date)}</div>}

      {temObsLowEff && <div><b>Baixa Eficiência:</b> {o.loweff_notes}</div>}
      {o.notes && <div className="muted">{o.notes}</div>}
      {renderQtdApontada(compactPills ? 'qtd-apontada-compact' : '')}
    </div>
  )
}
