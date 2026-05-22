# Generates a multi-resolution piano icon (.ico) using GDI+.
# Drawn vector-style: dark glassy background, white piano keys with violet accent.
# Resolutions: 16, 32, 48, 64, 128, 256.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function New-PianoIcon {
    param(
        [int]$Size,
        [string]$OutPath
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Background: dark gradient with rounded corners
    $cornerRadius = [Math]::Max(2, $Size * 0.12)
    $bgRect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bgPath.AddArc($bgRect.X, $bgRect.Y, $cornerRadius * 2, $cornerRadius * 2, 180, 90)
    $bgPath.AddArc($bgRect.Right - $cornerRadius * 2, $bgRect.Y, $cornerRadius * 2, $cornerRadius * 2, 270, 90)
    $bgPath.AddArc($bgRect.Right - $cornerRadius * 2, $bgRect.Bottom - $cornerRadius * 2, $cornerRadius * 2, $cornerRadius * 2, 0, 90)
    $bgPath.AddArc($bgRect.X, $bgRect.Bottom - $cornerRadius * 2, $cornerRadius * 2, $cornerRadius * 2, 90, 90)
    $bgPath.CloseFigure()

    $bgGradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect,
        [System.Drawing.Color]::FromArgb(255, 26, 18, 51),
        [System.Drawing.Color]::FromArgb(255, 8, 8, 14),
        45.0
    )
    $g.FillPath($bgGradient, $bgPath)
    $bgGradient.Dispose()

    $innerGlowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(80, 139, 92, 246), [Math]::Max(1, $Size / 64))
    $g.DrawPath($innerGlowPen, $bgPath)
    $innerGlowPen.Dispose()

    # Piano keys area
    $padding = $Size * 0.16
    $keysWidth = $Size - 2 * $padding
    $keysHeight = $Size * 0.5
    $keysTop = ($Size - $keysHeight) / 2 + $Size * 0.04
    $keysLeft = $padding

    $whiteKeyCount = 7
    $whiteKeyWidth = $keysWidth / $whiteKeyCount
    $blackKeyHeight = $keysHeight * 0.6
    $blackKeyWidth = $whiteKeyWidth * 0.6

    for ($i = 0; $i -lt $whiteKeyCount; $i++) {
        [single]$x = $keysLeft + $i * $whiteKeyWidth
        $keyRect = New-Object System.Drawing.RectangleF([single]($x + 0.5), [single]$keysTop, [single]($whiteKeyWidth - 1), [single]$keysHeight)

        $keyGradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            $keyRect,
            [System.Drawing.Color]::White,
            [System.Drawing.Color]::FromArgb(255, 220, 220, 230),
            90.0
        )
        $cornerR = [Math]::Max(1, $Size * 0.02)
        $keyPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $keyPath.AddArc($keyRect.X, $keyRect.Y, $cornerR * 2, $cornerR * 2, 180, 90)
        $keyPath.AddArc($keyRect.Right - $cornerR * 2, $keyRect.Y, $cornerR * 2, $cornerR * 2, 270, 90)
        $keyPath.AddArc($keyRect.Right - $cornerR * 2, $keyRect.Bottom - $cornerR * 2, $cornerR * 2, $cornerR * 2, 0, 90)
        $keyPath.AddArc($keyRect.X, $keyRect.Bottom - $cornerR * 2, $cornerR * 2, $cornerR * 2, 90, 90)
        $keyPath.CloseFigure()

        $g.FillPath($keyGradient, $keyPath)

        if ($i -lt $whiteKeyCount - 1) {
            $sepPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 0, 0, 0), [Math]::Max(0.5, $Size / 256))
            $g.DrawLine($sepPen, [single]($keyRect.Right), [single]$keysTop, [single]($keyRect.Right), [single]($keysTop + $keysHeight))
            $sepPen.Dispose()
        }

        $keyGradient.Dispose()
        $keyPath.Dispose()
    }

    # Black keys: between white keys 0-1, 1-2, 3-4, 4-5, 5-6
    $blackPositions = @(0, 1, 3, 4, 5)
    foreach ($pos in $blackPositions) {
        [single]$cx = $keysLeft + ($pos + 1) * $whiteKeyWidth
        [single]$bx = $cx - $blackKeyWidth / 2
        $blackRect = New-Object System.Drawing.RectangleF([single]$bx, [single]$keysTop, [single]$blackKeyWidth, [single]$blackKeyHeight)

        $blackGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            $blackRect,
            [System.Drawing.Color]::FromArgb(255, 30, 30, 40),
            [System.Drawing.Color]::Black,
            90.0
        )
        $bCornerR = [Math]::Max(0.5, $Size * 0.015)
        $blackPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $blackPath.AddArc($blackRect.X, $blackRect.Y, $bCornerR * 2, $bCornerR * 2, 180, 90)
        $blackPath.AddArc($blackRect.Right - $bCornerR * 2, $blackRect.Y, $bCornerR * 2, $bCornerR * 2, 270, 90)
        $blackPath.AddArc($blackRect.Right - $bCornerR * 2, $blackRect.Bottom - $bCornerR * 2, $bCornerR * 2, $bCornerR * 2, 0, 90)
        $blackPath.AddArc($blackRect.X, $blackRect.Bottom - $bCornerR * 2, $bCornerR * 2, $bCornerR * 2, 90, 90)
        $blackPath.CloseFigure()

        $g.FillPath($blackGrad, $blackPath)

        # Top violet velvet strip
        $velvetRect = New-Object System.Drawing.RectangleF($blackRect.X, $blackRect.Y, $blackRect.Width, [Math]::Max(1, $Size / 64))
        $velvetBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 139, 92, 246))
        $g.FillRectangle($velvetBrush, $velvetRect)
        $velvetBrush.Dispose()

        $blackGrad.Dispose()
        $blackPath.Dispose()
    }

    # Glow accent above the keys
    if ($Size -ge 32) {
        $glowRect = New-Object System.Drawing.RectangleF(
            [single]($keysLeft + $whiteKeyWidth * 1.5),
            [single]($keysTop - $Size * 0.18),
            [single]($whiteKeyWidth * 4),
            [single]($Size * 0.12)
        )
        $glowBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            $glowRect,
            [System.Drawing.Color]::FromArgb(0, 139, 92, 246),
            [System.Drawing.Color]::FromArgb(140, 167, 139, 250),
            90.0
        )
        $g.FillEllipse($glowBrush, $glowRect)
        $glowBrush.Dispose()
    }

    $outerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 60, 50, 100), [Math]::Max(1, $Size / 128))
    $g.DrawPath($outerPen, $bgPath)
    $outerPen.Dispose()

    $g.Dispose()
    $bgPath.Dispose()

    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host ("  [OK] Generated " + $Size + "x" + $Size + " -> " + $OutPath)
}

function ConvertTo-IcoFromPngs {
    param(
        [string[]]$PngPaths,
        [string]$OutIco
    )

    $images = @()
    foreach ($png in $PngPaths) {
        $bytes = [System.IO.File]::ReadAllBytes($png)
        $bmp = [System.Drawing.Bitmap]::new($png)
        $images += [PSCustomObject]@{
            Bytes  = $bytes
            Width  = $bmp.Width
            Height = $bmp.Height
            Size   = $bytes.Length
        }
        $bmp.Dispose()
    }

    $stream = [System.IO.File]::Create($OutIco)
    $writer = New-Object System.IO.BinaryWriter($stream)

    # ICONDIR: reserved=0, type=1 (icon), count
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$images.Count)

    $headerSize = 6
    $entrySize = 16
    $offset = $headerSize + $entrySize * $images.Count

    foreach ($img in $images) {
        $w = if ($img.Width -ge 256) { 0 } else { [byte]$img.Width }
        $h = if ($img.Height -ge 256) { 0 } else { [byte]$img.Height }
        $writer.Write([byte]$w)
        $writer.Write([byte]$h)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$img.Size)
        $writer.Write([UInt32]$offset)
        $offset += $img.Size
    }

    foreach ($img in $images) {
        $writer.Write($img.Bytes)
    }

    $writer.Close()
    $stream.Close()
}

# Run
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$assets = Join-Path $here "..\app\public"
$tempDir = Join-Path $env:TEMP "pmp-icon-build"

if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
}

$sizes = @(16, 32, 48, 64, 128, 256)
$pngPaths = @()

Write-Host ""
Write-Host "Building Piano MIDI Pro icon..." -ForegroundColor Cyan
foreach ($size in $sizes) {
    $pngPath = Join-Path $tempDir ("piano-" + $size + ".png")
    New-PianoIcon -Size $size -OutPath $pngPath
    $pngPaths += $pngPath
}

$icoOutput = Join-Path $assets "piano-midi-pro.ico"
ConvertTo-IcoFromPngs -PngPaths $pngPaths -OutIco $icoOutput

$png256 = Join-Path $assets "piano-midi-pro.png"
Copy-Item -Path (Join-Path $tempDir "piano-256.png") -Destination $png256 -Force

Remove-Item $tempDir -Recurse -Force

Write-Host ""
Write-Host "[OK] Icon written to: $icoOutput" -ForegroundColor Green
Write-Host "[OK] PNG written to:  $png256" -ForegroundColor Green
