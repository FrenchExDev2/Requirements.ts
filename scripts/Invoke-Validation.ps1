# Objectif : Lancer les tests de structure et de livraison avec une fenêtre de suivi dédiée.
[CmdletBinding()]
param([switch]$Worker, [switch]$Full, [ValidateSet('All','Integration','Unit')][string]$Checks = 'All')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$run = Join-Path $root 'test-results/monorepo'
$pwsh = (Get-Process -Id $PID).Path
if (-not $Worker) {
    New-Item -ItemType Directory -Path $run -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $run 'output.log') -Value '' -Encoding utf8
    @{Started=[datetime]::UtcNow.ToString('o');Status='Starting';ProcessId=$null;Tests=$null} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'state.json') -Encoding utf8
    Start-Process -FilePath $pwsh -WindowStyle Normal -ArgumentList @('-File', "`"$PSScriptRoot/Watch-Validation.ps1`"") | Out-Null
    $workerArguments = @('-File', "`"$PSCommandPath`"", '-Worker')
    if ($Full) { $workerArguments += '-Full' }
    $workerArguments += @('-Checks', $Checks)
    $process = Start-Process -FilePath $pwsh -WindowStyle Hidden -ArgumentList $workerArguments -PassThru
    Write-Output "Validation PID: $($process.Id); monitor: $PSScriptRoot/Watch-Validation.ps1"
    return
}
$state = @{Started=[datetime]::UtcNow.ToString('o');Status='Running';ProcessId=$PID;Tests=$null}
$statePath = Join-Path $run 'state.json'
$state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
try {
    if (-not (Get-Command pump -ErrorAction SilentlyContinue)) {
        $workspace = [IO.Path]::GetFullPath((Join-Path $root '../../..'))
        Import-Module (Join-Path $workspace 'PoSh/FrenchExDev/QuietCliEcosystem/FrenchExDev.QuietCli.PoSh/FrenchExDev.QuietCli.PoSh.psd1')
    }
    $analysis = @{Log=(Join-Path $run 'output.log');Tests=$null;Passed=$null;Failed=$null}
    $result = pump -AsObject -TimeoutSeconds 180 -WorkingDirectory $root -State $analysis -OnOutput {
        param($record, $state)
        Add-Content -LiteralPath $state.Log -Value $record.Text -Encoding utf8
        if ($record.Text -match '^# tests (\d+)') { $state.Tests = [int]$Matches[1] }
        if ($record.Text -match '^# pass (\d+)') { $state.Passed = [int]$Matches[1] }
        if ($record.Text -match '^# fail (\d+)') { $state.Failed = [int]$Matches[1] }
    } -Complete { param($state, $capture) @{Tests=$state.Tests;Passed=$state.Passed;Failed=$state.Failed} } node --test --test-reporter=tap test/monorepo.test.mjs test/release.test.mjs packages/Requirements.ts/test/release.test.mjs packages/Requirements.SharedKernel.ts/test/release.test.mjs
    $result | ConvertTo-QuietJson | Set-Content -LiteralPath (Join-Path $run 'result.json') -Encoding utf8
    $state.Status = if ($result.Outcome -eq 'Success') { 'Success' } elseif ($result.Outcome -eq 'Timeout') { 'Timeout' } else { 'Failed' }
    $state.Tests = $result.Data.Tests
    $state.Passed = $result.Data.Passed
    $state.Failed = $result.Data.Failed
    if ($Full) {
        $results = [Collections.Generic.List[object]]::new()
        $results.Add(@{ Phase='Structure and release'; Outcome=$result.Outcome; Tests=$state.Tests; Passed=$state.Passed; Failed=$state.Failed })
        $pnpm = Join-Path (Split-Path (Get-Command pnpm.ps1 -ErrorAction Stop).Source) 'node_modules/pnpm/pnpm.exe'
        $phases = @(
            @{ Name='Build'; Script='build'; Timeout=300 },
            @{ Name='Unit tests'; Script='test'; Timeout=900 },
            @{ Name='Integration tests'; Script='test:integration'; Timeout=300 },
            @{ Name='Test typecheck'; Script='typecheck:tests'; Timeout=300 }
        ) | Where-Object {
            $Checks -eq 'All' -or
            ($Checks -eq 'Integration' -and $_.Script -in @('test:integration','typecheck:tests')) -or
            ($Checks -eq 'Unit' -and $_.Script -eq 'test')
        }
        foreach ($phase in $phases) {
            $state.Status = 'Running'
            $state.Phase = $phase.Name
            $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding utf8
            Add-Content -LiteralPath $analysis.Log -Value "`nPHASE: $($phase.Name)" -Encoding utf8
            $phaseAnalysis = @{ Log=$analysis.Log; Passed=0; Failed=0; Skipped=0; Summaries=0 }
            $check = pump -AsObject -TimeoutSeconds $phase.Timeout -WorkingDirectory $root -State $phaseAnalysis -OnOutput {
                param($record, $state)
                Add-Content -LiteralPath $state.Log -Value $record.Text -Encoding utf8
                $line = $record.Text -replace '\x1b\[[0-9;]*[A-Za-z]', ''
                if ($line -match '(?:^|:\s*)\s*Tests\s+(.+)$') {
                    $counts = $Matches[1]
                    if ($counts -match '(\d+) passed') { $state.Passed += [int]$Matches[1] }
                    if ($counts -match '(\d+) failed') { $state.Failed += [int]$Matches[1] }
                    if ($counts -match '(\d+) skipped') { $state.Skipped += [int]$Matches[1] }
                    $state.Summaries++
                }
            } -Complete {
                param($state, $capture)
                @{ Passed=$state.Passed; Failed=$state.Failed; Skipped=$state.Skipped; Summaries=$state.Summaries }
            } $pnpm run $phase.Script
            $check | ConvertTo-QuietJson -MaxOutputBytes 6000 | Set-Content -LiteralPath (Join-Path $run "$($phase.Script.Replace(':','-')).json") -Encoding utf8
            $results.Add(@{Phase=$phase.Name; Outcome=$check.Outcome; ExitCode=$check.Execution.ExitCode; Counters=$check.Data})
            if ($check.Data.Summaries -gt 0) {
                $state.Passed += $check.Data.Passed
                $state.Failed += $check.Data.Failed
                $state.Tests += $check.Data.Passed + $check.Data.Failed + $check.Data.Skipped
            }
            $state.Results = @($results.ToArray())
            $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding utf8
        }
        $state.Status = if (@($results | Where-Object Outcome -ne 'Success').Count) { 'Failed' } else { 'Success' }
        $state.Phase = 'Complete'
    }
} catch {
    $state.Status = 'Crash'
    Add-Content -LiteralPath (Join-Path $run 'output.log') -Value $_.ToString() -Encoding utf8
} finally {
    $state.Finished = [datetime]::UtcNow.ToString('o')
    $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $run 'summary.json') -Encoding utf8
    $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding utf8
}
