#!/usr/bin/env pwsh

# ================================================================================
# TESTE API SENSOR PULSE - Vercel Serverless Function
# ================================================================================

Write-Host "`nTESTE API SENSOR PULSE" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Configuracoes
$API_URL = "https://app.techargos.com.br/api/sensor/pulse"
$TOKEN = "token123"
$MACHINE_ID = "P3"
$ESP32_ID = "argos_box_1"

Write-Host "`nURL: $API_URL" -ForegroundColor Yellow
Write-Host "Token: $TOKEN" -ForegroundColor Yellow
Write-Host "Machine: $MACHINE_ID" -ForegroundColor Yellow
Write-Host "ESP32: $ESP32_ID" -ForegroundColor Yellow

# Criar payload
$body = @{
    machine_id = $MACHINE_ID
    esp32_id = $ESP32_ID
    pulse_count = 1
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    event_id = "test_$(Get-Random -Minimum 1000 -Maximum 9999)"
} | ConvertTo-Json

Write-Host "`nBody enviado:" -ForegroundColor Green
Write-Host $body -ForegroundColor Gray

# Fazer requisicao
Write-Host "`nEnviando POST..." -ForegroundColor Cyan

Add-Type -AssemblyName System.Net.Http

$client = [System.Net.Http.HttpClient]::new()
$content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, "application/json")
$content.Headers.ContentType.CharSet = $null
$request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, $API_URL)
$request.Headers.Add("x-sensor-token", $TOKEN)
$request.Content = $content

$response = $client.SendAsync($request).Result
$responseBody = $response.Content.ReadAsStringAsync().Result
$statusCode = [int]$response.StatusCode

if ($response.IsSuccessStatusCode) {
    Write-Host "`nSUCESSO!" -ForegroundColor Green
} else {
    Write-Host "`nERRO!" -ForegroundColor Red
}

Write-Host "Status: $statusCode $($response.ReasonPhrase)" -ForegroundColor Yellow
Write-Host "`nResponse:" -ForegroundColor Yellow

if ($responseBody) {
    try {
        Write-Host ($responseBody | ConvertFrom-Json | ConvertTo-Json -Depth 10) -ForegroundColor Gray
    } catch {
        Write-Host $responseBody -ForegroundColor Gray
    }
}

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "Teste executado em producao:" -ForegroundColor Yellow
Write-Host $API_URL -ForegroundColor Cyan
Write-Host ""
