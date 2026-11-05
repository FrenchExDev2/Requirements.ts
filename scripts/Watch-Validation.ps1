# Objectif : Afficher les vérifications du monorepo et fermer la fenêtre à leur achèvement.
[CmdletBinding()]
param([string]$RunDirectory = (Join-Path $PSScriptRoot '../test-results/monorepo'))
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspace = [IO.Path]::GetFullPath((Join-Path $root '../../..'))
$Host.UI.RawUI.WindowTitle = 'Requirements.ts | Monorepo validation'
$interactive = -not [Console]::IsOutputRedirected
try {
    if ($interactive) { [Console]::CursorVisible = $false }
    do {
        $state = $null
        try { $state = Get-Content -LiteralPath (Join-Path $RunDirectory 'state.json') -Raw -Encoding utf8 | ConvertFrom-Json } catch { }
        $width = if ($interactive) { [Math]::Max(10, [Console]::WindowWidth - 1) } else { 100 }
        $height = if ($interactive) { [Math]::Max(1, [Console]::WindowHeight - 1) } else { 20 }
        $end = if ($state.Finished) { [datetime]$state.Finished } else { [datetime]::UtcNow }
        $elapsed = if ($state) { [int](($end - [datetime]$state.Started).TotalSeconds) } else { 0 }
        $duration = if ($elapsed -ge 60) { '{0}m{1}s' -f [int][Math]::Floor($elapsed / 60), ($elapsed % 60) } else { "${elapsed}s" }
        $status = if ($state) { $state.Status } else { 'Starting' }
        $identity = if ($state) { "PID $($state.ProcessId)" } else { '-' }
        $lines = @(
            'Projet : Requirements.ts + Requirements.SharedKernel.ts | Tâche : validation monorepo'
            $workspace
            "Projects: $root/Requirements.ts ; $root/Requirements.SharedKernel.ts"
        )
        if ($state.Phase) { $lines += "Phase: $($state.Phase)" }
        if ($width -ge 72) {
            $lines += '┌──────────┬──────────────┬──────────┬────────────┬──────────┐'
            $lines += '│ Platform | State        | Duration | Process    | Tests    │'
            $lines += '├──────────┼──────────────┼──────────┼────────────┼──────────┤'
            $count = if ($state -and $null -ne $state.Tests) { [string]$state.Tests } else { '-' }
            $lines += ('│ {0,-8} | {1,-12} | {2,8} | {3,-10} | {4,8} │' -f 'Windows', $status, $duration, $identity, $count)
            $lines += '└──────────┴──────────────┴──────────┴────────────┴──────────┘'
        } else {
            $lines += "Windows | $status | Duration $duration"
            $lines += "$identity | Tests: $(if ($state) {$state.Tests} else {'-'})"
        }
        $log = Join-Path $RunDirectory 'output.log'
        if (Test-Path -LiteralPath $log) {
            $lineCount = @(Get-Content -LiteralPath $log -Encoding utf8).Count
            $lines += "Heartbeat: $lineCount output lines | $duration"
            $lines += @(Get-Content -LiteralPath $log -Encoding utf8 -Tail 3)
        }
        $frame = @($lines | Select-Object -First $height | ForEach-Object {
            $plain = $_ -replace '\x1b\[[0-9;]*[A-Za-z]', ''
            # This interface uses single-cell characters; truncate before wrapping.
            if ($plain.Length -gt $width) { $plain = $plain.Substring(0, $width - 1) + '…' }
            $plain.PadRight($width)
        }) -join "`n"
        if ($interactive) { [Console]::SetCursorPosition(0, 0); [Console]::Write($frame) }
        else { Write-Output $frame }
        if ($state -and $state.Status -in @('Success', 'Failed', 'Crash', 'Timeout')) { break }
        Start-Sleep -Milliseconds 500
    } while ($true)
} finally { if ($interactive) { [Console]::CursorVisible = $true } }
