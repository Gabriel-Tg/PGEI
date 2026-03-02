export function machineToTabletCode(machineId) {
  const machine = String(machineId || '').toUpperCase();
  const digits = (machine.match(/\d+/) || [''])[0];
  if (!digits) return 'ARG-PET';
  return `ARG-PET${Number(digits)}`;
}

export function normalizeTabletCode(code) {
  return String(code || '').trim().toUpperCase();
}
