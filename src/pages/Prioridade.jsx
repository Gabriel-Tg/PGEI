import React from "react";
import { MAQUINAS } from "../domain/constants";
import "../styles/prioridade.css";

export default function Prioridade({ machinePriorities = {}, onChangePriority, loading, canEditPriorities = false }) {
  const canEdit = !!canEditPriorities;

  function toneClass(value) {
    if (value == null || Number.isNaN(Number(value))) return "priority-chip-gray";
    const n = Number(value);
    if (n >= 5) return "priority-chip-green";
    if (n >= 3) return "priority-chip-yellow";
    if (n >= 1) return "priority-chip-red";
    return "priority-chip-gray";
  }

  return (
    <div className="prioridade-page">
      <div className="prioridade-hero">
        <h1>Prioridades por Máquina</h1>
        <p>
        As prioridades aparecem no painel para todos. Somente usuários Admin podem alterar.
        </p>
      </div>

      {loading && <div className="prioridade-loading">Carregando prioridades…</div>}

      <div className="prioridade-grid">
        {MAQUINAS.map((m) => {
          const val = machinePriorities[m] ?? "";
          return (
            <div key={m} className="prioridade-card">
              <div className="prioridade-machine">{m}</div>
              <span className={`priority-chip ${toneClass(val)}`}>PRIORIDADE: {val === "" ? "-" : val}</span>
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                value={val}
                onChange={(e) => { if (canEdit) onChangePriority(m, e.target.value); }}
                className="priority-input prioridade-input"
                disabled={!canEdit}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
