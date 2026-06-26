import { supabase } from './supabaseClient'

export function getSupabaseErrorMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return error.message || error.details || error.hint || error.code || 'Erro desconhecido'
}

function isMissingRpc(error) {
  const message = getSupabaseErrorMessage(error).toLowerCase()
  const code = String(error?.code || '')
  return code === '42883' || code === 'PGRST202' || message.includes('function') || message.includes('schema cache')
}

export async function saveMachineCavities({ machineId, machineRecordId, clientId, value, maxCavities = 0 }) {
  const machineCode = String(machineId || '').trim().toUpperCase()
  const cavities = Number.parseInt(String(value || '').replace(/[^0-9]/g, ''), 10)
  if (!machineCode || !Number.isFinite(cavities) || cavities <= 0) {
    throw new Error('Cavidades abertas inválidas.')
  }
  const max = Number.parseInt(String(maxCavities || '').replace(/[^0-9]/g, ''), 10)
  if (Number.isFinite(max) && max > 0 && cavities > max) {
    throw new Error(`Cavidades abertas não pode ser maior que o molde (${max}).`)
  }

  if (clientId) {
    const rpcResult = await supabase.rpc('set_machine_cavities', {
      p_company_id: clientId,
      p_machine_code: machineCode,
      p_cavities: cavities,
    })

    if (!rpcResult.error) return cavities
    if (!isMissingRpc(rpcResult.error)) throw rpcResult.error
  }

  let query = supabase.from('machines').update({ cavities })
  if (machineRecordId) {
    query = query.eq('id', machineRecordId)
  } else {
    query = query.eq('machine_code', machineCode)
    if (clientId) query = query.eq('company_id', clientId)
  }

  const { error } = await query
  if (error) throw error
  return cavities
}
