# Correcao do erro 405 - API Sensor Pulse

## Diagnostico

O projeto atual e um app React + Vite, nao um app Next.js. No Vercel, os endpoints de sensor devem usar as Serverless Functions da pasta `api/`:

```text
api/sensor/pulse.js
api/sensor/heartbeat.js
```

O erro `405 Method Not Allowed` em producao era favorecido por uma configuracao inconsistente: `vercel.json` apontava `outputDirectory` para `.next`, que e saida de Next.js. Como o build real do Vite gera `dist`, a publicacao podia servir uma rota/aplicacao diferente da esperada.

## Correcao aplicada

`vercel.json` agora publica a saida correta do Vite:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

`api/sensor/pulse.js` aceita tanto `event_uid` quanto `event_id`, mantendo compatibilidade com o firmware e os exemplos existentes.

`test-sensor-api.ps1` agora trata respostas HTTP de erro dentro do `catch`, exibindo o corpo retornado pela API. Assim, quando o status for 401, 403, 405 ou 500, o script nao tenta executar `ConvertFrom-Json` em uma resposta nula.

## Como testar

```powershell
.\test-sensor-api.ps1
```

Para testar manualmente em producao:

```powershell
$body = @{
  machine_id = "P3"
  esp32_id = "argos_box_1"
  pulse_count = 1
  event_id = "test_001"
} | ConvertTo-Json

try {
  $response = Invoke-WebRequest `
    -Uri "https://app.techargos.com.br/api/sensor/pulse" `
    -Method POST `
    -Headers @{
      "Content-Type" = "application/json"
      "x-sensor-token" = "seu_token_real"
    } `
    -Body $body `
    -ErrorAction Stop

  $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $reader.ReadToEnd()
}
```

## Resultado esperado

- `200`: rota e token validos; pulso processado.
- `401`: token ausente.
- `403`: token/maquina/ESP32 nao correspondem ao cadastro.
- `405`: a requisicao nao chegou ao handler `api/sensor/pulse.js` como `POST`, ou o deploy ainda esta servindo uma versao antiga.

Depois do deploy, um `POST` com token invalido deve retornar `403`, nao `405`. Isso confirma que a rota correta esta ativa.
