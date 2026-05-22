# ⚠️ ROTAS MIGRADAS PARA NEXT.JS APP ROUTER

As rotas antigas nesta pasta foram **desabilitadas** e migradas para:

```
app/api/sensor/pulse/route.ts
app/api/sensor/heartbeat/route.ts
```

## Motivo
- Next.js App Router (estrutura moderna)
- Compatibilidade com Vercel
- Melhor suporte a TypeScript
- Erros 405 corrigidos

## Arquivos Antigos (desabilitados)
- ❌ `sensor/pulse.js` → ✅ `app/api/sensor/pulse/route.ts`
- ❌ `sensor/heartbeat.js` → ✅ `app/api/sensor/heartbeat/route.ts`

## Endpoints Ativos
```
POST https://app.techargos.com.br/api/sensor/pulse
POST https://app.techargos.com.br/api/sensor/heartbeat
```

## Headers Necessários
```
x-sensor-token: TOKEN_AQUI
Content-Type: application/json
```
