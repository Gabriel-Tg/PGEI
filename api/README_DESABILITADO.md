# Rotas serverless ativas no Vercel

Este projeto e um app React + Vite. As rotas HTTP ativas para sensores ficam nesta pasta, no formato Serverless Functions do Vercel:

```
api/sensor/pulse.js
api/sensor/heartbeat.js
```

## Importante

- O build do front-end sai em `dist`.
- O projeto nao tem dependencia de Next.js; arquivos em `app/api/.../route.ts` nao devem ser considerados a fonte ativa das APIs neste app.
- O endpoint aceita apenas `POST`. Requisicoes `GET` retornam `405 Method not allowed` por design.

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
