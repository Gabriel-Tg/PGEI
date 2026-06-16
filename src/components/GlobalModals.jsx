// src/components/GlobalModals.jsx
import React, { useEffect } from 'react'
import Modal from '../components/Modal'
import { MAQUINAS, MOTIVOS_PARADA } from '../domain/constants'
import { DateTime } from 'luxon'

function safeDate(val){
  if (val && /^\d{4}-\d{2}-\d{2}$/.test(String(val))) return String(val)
  return DateTime.local().toFormat('yyyy-LL-dd')
}
function safeTime(val){
  if (val && /^\d{2}:\d{2}$/.test(String(val))) return String(val)
  return DateTime.local().toFormat('HH:mm')
}

function resolveModalOrder(modal) {
  return modal?.ordem || modal?.order || null
}

export default function GlobalModals({
  editando, setEditando, finalizando, setFinalizando, confirmData, setConfirmData,
  startModal, setStartModal, stopModal, setStopModal, resumeModal, setResumeModal,
  lowEffModal, setLowEffModal, lowEffEndModal, setLowEffEndModal,
  onUpdateOrder, onFinalize, onConfirmStart, onConfirmStop, onConfirmResume, onConfirmLowEffStart, onConfirmLowEffEnd
}){
  // Normaliza data/hora ao abrir cada modal, apenas na primeira renderização
  useEffect(() => {
    if (stopModal && !stopModal.__initApplied) {
      const now = DateTime.local();
      setStopModal(v => ({
        ...v,
        data: v?.autoStop && v?.data ? v.data : now.toFormat('yyyy-LL-dd'),
        hora: v?.autoStop && v?.hora ? v.hora : now.toFormat('HH:mm'),
        __initApplied: true,
      }));
    }
  }, [stopModal, setStopModal]);

  useEffect(() => {
    if (!stopModal?.autoStop) return undefined

    let audioContext = null
    let intervalId = null
    let cancelled = false

    const playAlert = () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (!AudioCtx) return
        audioContext = audioContext || new AudioCtx()
        if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})

        const oscillator = audioContext.createOscillator()
        const gain = audioContext.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime)
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.45)
        oscillator.connect(gain)
        gain.connect(audioContext.destination)
        oscillator.start()
        oscillator.stop(audioContext.currentTime + 0.5)
      } catch (err) {
        console.warn('Falha ao tocar alerta sonoro de parada automática:', err)
      }
    }

    playAlert()
    intervalId = window.setInterval(() => {
      if (!cancelled) playAlert()
    }, 1400)

    return () => {
      cancelled = true
      if (intervalId) window.clearInterval(intervalId)
      if (audioContext) audioContext.close().catch(() => {})
    }
  }, [stopModal?.autoStop])

  useEffect(() => {
    if (startModal && !startModal.__initApplied) {
      const now = DateTime.local();
      setStartModal(v => ({
        ...v,
        data: now.toFormat('yyyy-LL-dd'),
        hora: now.toFormat('HH:mm'),
        __initApplied: true,
      }));
    }
  }, [startModal, setStartModal]);

  useEffect(() => {
    if (resumeModal && !resumeModal.__initApplied) {
      const now = DateTime.local();
      setResumeModal(v => ({
        ...v,
        data: v?.autoResume && v?.data ? v.data : now.toFormat('yyyy-LL-dd'),
        hora: v?.autoResume && v?.hora ? v.hora : now.toFormat('HH:mm'),
        __initApplied: true,
      }));
    }
  }, [resumeModal, setResumeModal]);

  useEffect(() => {
    if (lowEffModal && !lowEffModal.__initApplied) {
      const now = DateTime.local();
      setLowEffModal(v => ({
        ...v,
        data: now.toFormat('yyyy-LL-dd'),
        hora: now.toFormat('HH:mm'),
        __initApplied: true,
      }));
    }
  }, [lowEffModal, setLowEffModal]);

  useEffect(() => {
    if (lowEffEndModal && !lowEffEndModal.__initApplied) {
      const now = DateTime.local();
      setLowEffEndModal(v => ({
        ...v,
        data: now.toFormat('yyyy-LL-dd'),
        hora: now.toFormat('HH:mm'),
        __initApplied: true,
      }));
    }
  }, [lowEffEndModal, setLowEffEndModal]);
  return (
    <>
      {/* Editar */}
      <Modal open={!!editando} onClose={()=>setEditando(null)} title={editando ? `Editar O.P ${editando.code}` : ''}>
        {editando && (
          <div className="grid">
            <div className="grid2">
              <div><div className="label">Número O.P</div><input className="input" value={editando.code} onChange={e=>setEditando(v=>({...v, code:e.target.value}))}/></div>
              <div><div className="label">Máquina</div><select className="select" value={editando.machine_id} onChange={e=>setEditando(v=>({...v, machine_id:e.target.value}))}>{MAQUINAS.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
              <div><div className="label">Cliente</div><input className="input" value={editando.customer||''} onChange={e=>setEditando(v=>({...v, customer:e.target.value}))}/></div>
              <div><div className="label">Produto</div><input className="input" value={editando.product||''} onChange={e=>setEditando(v=>({...v, product:e.target.value}))}/></div>
              <div><div className="label">Cor</div><input className="input" value={editando.color||''} onChange={e=>setEditando(v=>({...v, color:e.target.value}))}/></div>
              <div><div className="label">Quantidade</div><input className="input" value={editando.qty||''} onChange={e=>setEditando(v=>({...v, qty:e.target.value}))}/></div>
              <div><div className="label">Volumes</div><input className="input" value={editando.boxes||''} onChange={e=>setEditando(v=>({...v, boxes:e.target.value}))}/></div>
              <div><div className="label">Padrão</div><input className="input" value={editando.standard||''} onChange={e=>setEditando(v=>({...v, standard:e.target.value}))}/></div>
              <div><div className="label">Prazo de Entrega</div><input type="date" className="input" value={editando.due_date||''} onChange={e=>setEditando(v=>({...v, due_date:e.target.value}))}/></div>
              <div><div className="label">Observações</div><input className="input" value={editando.notes||''} onChange={e=>setEditando(v=>({...v, notes:e.target.value}))}/></div>
            </div>
            <div className="sep"></div>
            <div className="flex" style={{justifyContent:'flex-end'}}>
              <button className="btn ghost" onClick={()=>setEditando(null)}>Cancelar</button>
              <button className="btn primary" onClick={async ()=>{
                if (typeof onUpdateOrder === 'function') await onUpdateOrder(editando)
                setEditando(null)
              }}>Salvar</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Finalizar */}
      <Modal open={!!finalizando} onClose={()=>setFinalizando(null)} title={finalizando ? `Finalizar O.P ${finalizando.code}` : ''}>
        {finalizando && (
          <div className="grid">
            <div><div className="label">Finalizado por *</div><input className="input" value={confirmData.por} onChange={e=>setConfirmData(v=>({...v, por:e.target.value}))} placeholder="Nome do operador"/></div>
            <div className="grid2">
              <div><div className="label">Data *</div><input type="date" className="input" value={confirmData.data} onChange={e=>setConfirmData(v=>({...v, data:e.target.value}))}/></div>
              <div><div className="label">Hora *</div><input type="time" className="input" value={confirmData.hora} onChange={e=>setConfirmData(v=>({...v, hora:e.target.value}))}/></div>
            </div>
            <div className="sep"></div>
            <div className="flex" style={{justifyContent:'flex-end'}}>
              <button className="btn ghost" onClick={()=>setFinalizando(null)}>Cancelar</button>
              <button className="btn primary" onClick={async ()=>{
                if(!confirmData.por || !confirmData.data || !confirmData.hora) return;
                if (typeof onFinalize === 'function') await onFinalize(finalizando, confirmData)
                setFinalizando(null)
              }}>Confirmar</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Início Produção */}
      <Modal
        open={!!startModal}
        onClose={()=>setStartModal(null)}
        title={(() => {
          const order = resolveModalOrder(startModal)
          return startModal ? `Iniciar Produção • ${order?.machine_id || '-'} • O.P ${order?.code || '-'}` : ''
        })()}
      >
        {startModal && (
          <div className="grid">
            <div><div className="label">Operador *</div><input className="input" value={startModal.operador} onChange={e=>setStartModal(v=>({...v, operador:e.target.value}))} placeholder="Nome do operador"/></div>
            <div className="grid2">
              <div><div className="label">Data *</div><input type="date" className="input" value={startModal.data} onChange={e=>setStartModal(v=>({...v, data:e.target.value}))}/></div>
              <div><div className="label">Hora *</div><input type="time" className="input" value={startModal.hora} onChange={e=>setStartModal(v=>({...v, hora:e.target.value}))}/></div>
            </div>
            <div className="sep"></div>
            <div className="flex" style={{justifyContent:'flex-end', gap:8}}>
              <button className="btn ghost" onClick={()=>setStartModal(null)}>Cancelar</button>
              <button className="btn primary" onClick={async ()=>{
                if (typeof onConfirmStart === 'function') await onConfirmStart(startModal)
                setStartModal(null)
              }}>Iniciar</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Parada */}
      <Modal
        open={!!stopModal}
        onClose={()=>{}}
        closeOnBackdrop={false}
        title={(() => {
          const order = resolveModalOrder(stopModal)
          return stopModal ? `Parar máquina • ${order?.machine_id || '-'} • O.P ${order?.code || '-'}` : ''
        })()}
      >
        {stopModal && (
          <div className="grid">
            <div><div className="label">Operador {stopModal.autoStop ? '' : '*'}</div><input className="input" value={stopModal.operador} onChange={e=>setStopModal(v=>({...v, operador:e.target.value}))} placeholder="Nome do operador"/></div>
            <div className="grid2">
              <div><div className="label">Data *</div><input type="date" className="input" value={safeDate(stopModal.data)} onChange={e=>setStopModal(v=>({...v, data:e.target.value}))} disabled={stopModal.autoStop}/></div>
              <div><div className="label">Hora *</div><input type="time" className="input" value={safeTime(stopModal.hora)} onChange={e=>setStopModal(v=>({...v, hora:e.target.value}))} disabled={stopModal.autoStop}/></div>
            </div>
            <div>
              <div className="label">Motivo da Parada *</div>
              <select className="select" value={stopModal.motivo || ''} onChange={e=>setStopModal(v=>({...v, motivo:e.target.value}))}>
                <option value="">Selecione o motivo</option>
                {MOTIVOS_PARADA.map(m=> <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div className="label">Observações</div>
              <textarea className="textarea" rows={4} value={stopModal.obs} onChange={e=>setStopModal(v=>({...v, obs:e.target.value}))} placeholder="Detalhe o problema, se necessário..."/>
            </div>
            <div className="sep"></div>
            <div className="flex" style={{justifyContent:'flex-end', gap:8}}>
              <button className="btn primary" onClick={async ()=>{
                if (!String(stopModal.motivo || '').trim()) {
                  alert('Selecione o motivo da parada.')
                  return
                }
                const normalized = { ...stopModal, data: safeDate(stopModal.data), hora: safeTime(stopModal.hora) }
                const confirmed = typeof onConfirmStop === 'function' ? await onConfirmStop(normalized) : true
                if (confirmed !== false) setStopModal(null)
              }}>Confirmar Parada</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Retomada (de PARADA) */}
      <Modal
        open={!!resumeModal}
        onClose={()=>{}}
        closeOnBackdrop={false}
        title={(() => {
          const order = resolveModalOrder(resumeModal)
          return resumeModal ? `Retomar produção • ${order?.machine_id || '-'} • O.P ${order?.code || '-'}` : ''
        })()}
      >
        {resumeModal && (
          <div className="grid">
            <div><div className="label">Operador {resumeModal.autoResume ? '' : '*'}</div><input className="input" value={resumeModal.operador} onChange={e=>setResumeModal(v=>({...v, operador:e.target.value}))} placeholder="Nome do operador"/></div>
            <div className="grid2">
              <div><div className="label">Data *</div><input type="date" className="input" value={safeDate(resumeModal.data)} onChange={e=>setResumeModal(v=>({...v, data:e.target.value}))} disabled={resumeModal.autoResume}/></div>
              <div><div className="label">Hora *</div><input type="time" className="input" value={safeTime(resumeModal.hora)} onChange={e=>setResumeModal(v=>({...v, hora:e.target.value}))} disabled={resumeModal.autoResume}/></div>
            </div>
            {resumeModal.autoResume && (
              <div className="pet01-sensor-warning" style={{ marginBottom: 12 }}>
                Data e hora foram preenchidas pelo pulso que retomou a produção e não podem ser alteradas.
              </div>
            )}
            <div className="sep"></div>
            <div className="flex" style={{justifyContent:'flex-end', gap:8}}>
              <button className="btn primary" onClick={async ()=>{
                const normalized = { ...resumeModal, data: safeDate(resumeModal.data), hora: safeTime(resumeModal.hora) }
                const confirmed = typeof onConfirmResume === 'function' ? await onConfirmResume(normalized) : true
                if (confirmed !== false) setResumeModal(null)
              }}>Confirmar Retomada</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Baixa Eficiência — INÍCIO */}
      <Modal
        open={!!lowEffModal}
        onClose={()=>setLowEffModal(null)}
        title={(() => {
          const order = resolveModalOrder(lowEffModal)
          return lowEffModal ? `Baixa eficiência • ${order?.machine_id || '-'} • O.P ${order?.code || '-'}` : ''
        })()}
      >
        {lowEffModal && (
          <div className="grid">
            <div>
              <div className="label">Operador *</div>
              <input className="input" value={lowEffModal.operador} onChange={e=>setLowEffModal(v=>({...v, operador:e.target.value}))} placeholder="Nome do operador" />
            </div>
            <div className="grid2">
              <div><div className="label">Data *</div><input type="date" className="input" value={lowEffModal.data} onChange={e=>setLowEffModal(v=>({...v, data:e.target.value}))}/></div>
              <div><div className="label">Hora *</div><input type="time" className="input" value={lowEffModal.hora} onChange={e=>setLowEffModal(v=>({...v, hora:e.target.value}))}/></div>
            </div>
            <div>
              <div className="label">Observação</div>
              <textarea className="textarea" rows={3} value={lowEffModal.obs} onChange={e=>setLowEffModal(v=>({...v, obs:e.target.value}))} placeholder="Descreva o motivo da baixa eficiência, se desejar..." />
            </div>
            <div className="sep"></div>
            <div className="flex" style={{justifyContent:'flex-end', gap:8}}>
              <button className="btn ghost" onClick={()=>setLowEffModal(null)}>Cancelar</button>
              <button className="btn primary" onClick={async ()=>{
                if (typeof onConfirmLowEffStart === 'function') await onConfirmLowEffStart(lowEffModal)
                setLowEffModal(null)
              }}>Confirmar</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Encerrar Baixa Eficiência */}
      <Modal
        open={!!lowEffEndModal}
        onClose={()=>setLowEffEndModal(null)}
        title={(() => {
          const order = resolveModalOrder(lowEffEndModal)
          return lowEffEndModal ? `Encerrar baixa eficiência • ${order?.machine_id || '-'} • O.P ${order?.code || '-'}` : ''
        })()}
      >
        {lowEffEndModal && (
          <div className="grid">
            <div className="grid2">
              <div><div className="label">Data *</div><input type="date" className="input" value={lowEffEndModal.data} onChange={e=>setLowEffEndModal(v=>({...v, data:e.target.value}))}/></div>
              <div><div className="label">Hora *</div><input type="time" className="input" value={lowEffEndModal.hora} onChange={e=>setLowEffEndModal(v=>({...v, hora:e.target.value}))}/></div>
            </div>
            <div className="muted" style={{marginTop:6}}>As observações de baixa eficiência serão limpas ao confirmar.</div>
            <div className="sep"></div>
            <div className="flex" style={{justifyContent:'flex-end', gap:8}}>
              <button className="btn ghost" onClick={()=>setLowEffEndModal(null)}>Cancelar</button>
              <button className="btn primary" onClick={async ()=>{
                if (typeof onConfirmLowEffEnd === 'function') await onConfirmLowEffEnd(lowEffEndModal)
                setLowEffEndModal(null)
              }}>Confirmar</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
