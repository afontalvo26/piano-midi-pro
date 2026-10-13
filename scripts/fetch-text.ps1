<#
.SYNOPSIS
  Descarga una URL y guarda el TEXTO PLANO legible (sin HTML) en .logs/.
  Uso: pwsh -File scripts/fetch-text.ps1 -Url "https://..." -Label "nombre"
       pwsh -File scripts/fetch-text.ps1 -Url "https://...pdf" -Label "x" -Pdf
#>
param(
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][string]$Label,
  [switch]$Pdf
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir  = Join-Path $root '.logs'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

$stamp = Get-Date -Format 'yyyy-MM-dd'
$safe  = ($Label -replace '[^A-Za-z0-9_\-]', '_')
$out   = Join-Path $dir "$stamp-$safe.txt"

$tmp = Join-Path $env:TEMP ("dshfetch-" + [guid]::NewGuid().ToString('N'))

try {
  Invoke-WebRequest -Uri $Url -OutFile $tmp -UseBasicParsing -TimeoutSec 60 -Headers @{
    'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
    'Accept-Language' = 'es-ES,es;q=0.9,en;q=0.8'
  }

  $text = $null

  if ($Pdf -or $tmp.ToLower().EndsWith('.pdf')) {
    # Intentar con pdftotext si existe; si no, extraer streams de texto crudos
    $pdftotext = Get-Command pdftotext -ErrorAction SilentlyContinue
    if ($pdftotext) {
      & $pdftotext.Source -enc UTF-8 -layout $tmp $out 2>$null
      Write-Output "OK(pdftotext) -> $out  ($((Get-Item $out).Length) bytes)"
      return
    }
    # Fallback: leer bytes y rescatar texto de los streams FlateDecode no es viable sin lib.
    # Usar el motor de Windows: convertir con Word COM no disponible en sandbox.
    $bytes = [System.IO.File]::ReadAllBytes($tmp)
    $latin = [System.Text.Encoding]::Latin1.GetString($bytes)
    $sb = New-Object System.Text.StringBuilder
    foreach ($m in [regex]::Matches($latin, '\((?:\\.|[^\\()])*\)')) {
      [void]$sb.AppendLine($m.Value.Trim('(', ')'))
    }
    # Buscar texto en objetos sin comprimir
    $rawText = [regex]::Replace($sb.ToString(), '\\([()\\])', '$1')
    Set-Content -Path $out -Value $rawText -Encoding UTF8
    Write-Output "OK(pdf-fallback-bruto) -> $out  ($((Get-Item $out).Length) bytes)"
    return
  }

  $raw = Get-Content -Path $tmp -Raw -Encoding UTF8

  # Quitar script/style/head
  $raw = [regex]::Replace($raw, '(?is)<script.*?</script>', ' ')
  $raw = [regex]::Replace($raw, '(?is)<style.*?</style>', ' ')
  $raw = [regex]::Replace($raw, '(?is)<noscript.*?</noscript>', ' ')
  $raw = [regex]::Replace($raw, '(?is)<svg.*?</svg>', ' ')
  $raw = [regex]::Replace($raw, '(?is)<head.*?</head>', ' ')

  # Saltos de bloque
  $raw = [regex]::Replace($raw, '(?i)</(p|div|li|tr|h1|h2|h3|h4|h5|br|section|article|blockquote|td)>', "`n")
  $raw = [regex]::Replace($raw, '(?i)<br\s*/?>', "`n")

  # Quitar el resto de etiquetas
  $raw = [regex]::Replace($raw, '(?s)<[^>]+>', ' ')

  # Entidades
  $raw = [System.Net.WebUtility]::HtmlDecode($raw)

  # Normalizar espacios
  $raw = [regex]::Replace($raw, '[ \t\u00A0]+', ' ')
  $raw = [regex]::Replace($raw, '(\r?\n\s*){2,}', "`n`n")
  $raw = $raw.Trim()

  Set-Content -Path $out -Value $raw -Encoding UTF8
  Write-Output "OK(html) -> $out  ($((Get-Item $out).Length) bytes, $((Get-Content $out).Count) lineas)"
}
finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}
