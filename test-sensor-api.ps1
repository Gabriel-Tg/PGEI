#!/usr/bin/env pwsh

# ================================================================================
# TESTE API SENSOR PULSE - Next.js App Router
# ================================================================================

Write-Host "`n🧪 TESTE API SENSOR PULSE" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Configurações
$API_URL = "http://app.techargos.com.br/api/sensor/pulse"
$TOKEN = "token123"
$MACHINE_ID = "P3"
$ESP32_ID = "argos_box_1"

Write-Host "`n📍 URL: $API_URL" -ForegroundColor Yellow
Write-Host "🔐 Token: $TOKEN" -ForegroundColor Yellow
Write-Host "🤖 Machine: $MACHINE_ID" -ForegroundColor Yellow
Write-Host "📡 ESP32: $ESP32_ID" -ForegroundColor Yellow

# Criar payload
$body = @{
    machine_id = $MACHINE_ID
    esp32_id = $ESP32_ID
    pulse_count = 1
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    event_id = "test_$(Get-Random -Minimum 1000 -Maximum 9999)"
} | ConvertTo-Json

Write-Host "`n📤 Body enviado:" -ForegroundColor Green
Write-Host $body -ForegroundColor Gray

# Fazer requisição
Write-Host "`n⏳ Enviando POST..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest `
        -Uri $API_URL `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "x-sensor-token" = $TOKEN
        } `
        -Body $body `
        -ErrorAction Stop

    Write-Host "`n✅ SUCESSO!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "`n📥 Response:" -ForegroundColor Green
    Write-Host ($response.Content | ConvertFrom-Json | ConvertTo-Json) -ForegroundColor Gray

} catch {
    Write-Host "`n❌ ERRO!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host "`n📥 Response:" -ForegroundColor Red
    
    try {
        $errorContent = $_.Exception.Response.Content.ReadAsStream() | Get-Content -Raw
        Write-Host $errorContent -ForegroundColor Gray
    } catch {
        Write-Host $_.Exception.Message -ForegroundColor Gray
    }
}

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "Para testar em produção, altere API_URL para:" -ForegroundColor Yellow
Write-Host "https://app.techargos.com.br/api/sensor/pulse" -ForegroundColor Cyan
Write-Host ""
