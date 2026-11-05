# Objectif : Afficher les états observés de l’audit RaC et fermer la fenêtre à sa terminaison.
<# .SYNOPSIS
Read-only, resizing-aware audit monitor. Reads only the selected run's state/logs.
.PARAMETER StatePath
Run state produced by Invoke-Audit.ps1. Completed runs can be reopened.
.PARAMETER RunnerId
Optional runner process identity used to detect an unexpected crash.
.PARAMETER AdditionalStatePath
Independent campaign states displayed together, including Windows and Linux.
#>
param([Parameter(Mandatory)][string]$StatePath, [int]$RunnerId, [string[]]$AdditionalStatePath=@())
$utf8=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $OutputEncoding=$utf8
$interactive = ![Console]::IsOutputRedirected
if($interactive){[Console]::CursorVisible=$false}
$Host.UI.RawUI.WindowTitle='Requirements-as-Code TypeScript | Audit'
function Fit-Cell([string]$Value,[int]$Width) {
    # .SYNOPSIS Fits grapheme clusters, combining marks and wide Unicode cells.
    $Value=$Value -replace '\x1b\[[0-9;]*[A-Za-z]',''
    $parts=[Collections.Generic.List[object]]::new();$visible=0
    $enumerator=[Globalization.StringInfo]::GetTextElementEnumerator($Value)
    while($enumerator.MoveNext()){
        $element=$enumerator.GetTextElement();$code=[char]::ConvertToUtf32($element,0)
        $cells=if(($code -ge 0x1100 -and $code -le 0x115f) -or ($code -ge 0x2e80 -and $code -le 0xa4cf) -or ($code -ge 0xac00 -and $code -le 0xd7a3) -or ($code -ge 0xf900 -and $code -le 0xfaff) -or ($code -ge 0xff01 -and $code -le 0xff60) -or $code -ge 0x1f000){2}else{1}
        $parts.Add(@($element,$cells));$visible+=$cells
    }
    $text=[Text.StringBuilder]::new();$used=0;$limit=if($visible -gt $Width){[math]::Max(0,$Width-1)}else{$Width}
    foreach($part in $parts){if($used+$part[1] -gt $limit){break};[void]$text.Append($part[0]);$used+=$part[1]}
    if($visible -gt $Width){[void]$text.Append('…');$used++}
    return $text.ToString()+(' '*[math]::Max(0,$Width-$used))
}
function Format-Duration([double]$Seconds) {
    # .SYNOPSIS Formats elapsed time in compact seconds, minutes and hours.
    if ($Seconds -lt 60) { return ([int]$Seconds).ToString()+'s' }
    if ($Seconds -lt 3600) { return ([int][math]::Floor($Seconds/60)).ToString()+'m'+([int]($Seconds%60)).ToString()+'s' }
    return ([int][math]::Floor($Seconds/3600)).ToString()+'h'+([int][math]::Floor(($Seconds%3600)/60)).ToString()+'m'
}
$seen=$false
function Read-SharedText([string]$Path) {
    # .SYNOPSIS Reads a snapshot without blocking its atomic replacement on Windows.
    $stream=[IO.FileStream]::new($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $reader=[IO.StreamReader]::new($stream,$utf8)
    try { return $reader.ReadToEndAsync().GetAwaiter().GetResult() } finally { $reader.Dispose() }
}
try { while ($true) {
    if (Test-Path -LiteralPath $StatePath) {
        # Keep ISO strings intact: ConvertFrom-Json otherwise creates DateTime
        # values that can be stringified as MM/dd and reparsed as dd/MM in fr-FR.
        try { $s=(Read-SharedText $StatePath) | ConvertFrom-Json -DateKind String; $seen=$true } catch { Start-Sleep -Milliseconds 250; continue }
        $snapshots=@($s)
        foreach($run in $s.Runs){$run|Add-Member -NotePropertyName LogDirectory -NotePropertyValue (Split-Path $StatePath) -Force}
        foreach($extra in $AdditionalStatePath){try{
            $snapshot=(Read-SharedText $extra)|ConvertFrom-Json -DateKind String
            foreach($run in $snapshot.Runs){$run|Add-Member -NotePropertyName LogDirectory -NotePropertyValue (Split-Path $extra) -Force}
            $snapshots+=$snapshot
        }catch{}}
        foreach($snapshot in $snapshots){
            if(!$snapshot.Done -and $snapshot.RunnerId -and !(Get-Process -Id $snapshot.RunnerId -ErrorAction SilentlyContinue)){
                foreach($run in $snapshot.Runs){if($run.State -in @('Running','Pending')){$run.State='Crash';$run.Outcome='Runner process is absent.'}}
                $snapshot.Done=$true
            }
        }
        if($snapshots.Count -gt 1){$s.Done=@($snapshots|Where-Object {!$_.Done}).Count -eq 0;$s.Runs=@($snapshots|ForEach-Object Runs);$s.Projects=@($snapshots|ForEach-Object Projects|Select-Object -Unique)}
        $Host.UI.RawUI.WindowTitle="$($s.Project) | $($s.Task)"
        $width=if($interactive){[math]::Max(12,[Console]::WindowWidth-1)}else{100}
        $height=if($interactive){[math]::Max(6,[Console]::WindowHeight-1)}else{40}
        $lines=[Collections.Generic.List[string]]::new()
        $lines.Add("Projet : $($s.Project) | Tâche : $($s.Task)")
        $lines.Add($s.Workspace)
        $lines.Add("Projet : $($s.Directory)")
        if($s.ContainerDirectory){$lines.Add("Linux : $($s.ContainerDirectory) | $($s.ContainerId.Substring(0,12))")}
        # Name every selected module when space permits, preserving a bounded
        # viewport on smaller terminals. Full identities remain in state.json.
        $projects=@($s.Projects | Where-Object { $_ })
        if($projects.Count){
            $columns=if($width -ge 82){2}else{1}
            $cellWidth=[math]::Max(8,[int][math]::Floor($width/$columns))
            $available=[math]::Max(1,$height-$s.Runs.Count-11)
            $visible=[math]::Min($projects.Count,$available*$columns)
            for($at=0;$at -lt $visible;$at+=$columns){
                $parts=@(for($n=0;$n -lt $columns -and $at+$n -lt $visible;$n++){Fit-Cell $projects[$at+$n] $cellWidth})
                $lines.Add($parts -join '')
            }
            if($visible -lt $projects.Count){$lines.Add("… $($projects.Count-$visible) autres cibles dans state.json")}
        }
        $cols=if($width -ge 100){@(32,7,10,9,14,7,7)}elseif($width -ge 82){@(32,7,10,9,14)}elseif($width -ge 55){@(10,7,10,8,10)}else{@(8,[math]::Max(4,$width-13))}
        $headers=if($cols.Count -eq 7){@('Run','OS','State','Duration','Process','Passed','Failed')}elseif($cols.Count -eq 5){@('Run','OS','State','Duration','Process')}else{@('Run','State')}
        $border='├'+(($cols | ForEach-Object {'─'*$_}) -join '┼')+'┤'
        $lines.Add('┌'+(($cols | ForEach-Object {'─'*$_}) -join '┬')+'┐')
        $lines.Add('|'+(@(for($i=0;$i -lt $cols.Count;$i++){Fit-Cell $headers[$i] $cols[$i]}) -join '|')+'|')
        $lines.Add($border)
        foreach($r in $s.Runs){
            if($r.State -eq 'Running'){
                $runLog=Join-Path $r.LogDirectory ($r.Name+'.log')
                if(Test-Path $runLog){
                    [string]$observed=Read-SharedText $runLog
                    $passedMatches=[regex]::Matches($observed,'Tests\s+(\d+) passed')
                    $failedMatches=[regex]::Matches($observed,'Tests\s+(\d+) failed')
                    if($passedMatches.Count){$r.Passed=($passedMatches|ForEach-Object{[int]$_.Groups[1].Value}|Measure-Object -Sum).Sum}
                    if($failedMatches.Count){$r.Failed=($failedMatches|ForEach-Object{[int]$_.Groups[1].Value}|Measure-Object -Sum).Sum}
                }
            }
            $elapsed=if($r.State -eq 'Running'){([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($r.Started,[Globalization.CultureInfo]::InvariantCulture)).TotalSeconds}else{$r.Duration}
            $duration=if(!$r.Started){'-'}else{Format-Duration $elapsed}
            $passed=if($null -eq $r.Passed){'-'}else{[string]$r.Passed}
            $failed=if($null -eq $r.Failed){'-'}else{[string]$r.Failed}
            $platform=if($r.Platform){$r.Platform}elseif($IsWindows){'Windows'}else{'Linux'}
            $values=if($cols.Count -eq 7){@($r.Name,$platform,$r.State,$duration,$r.Identity,$passed,$failed)}elseif($cols.Count -eq 5){@($r.Name,$platform,$r.State,$duration,$r.Identity)}else{@($r.Name,$r.State)}
            $lines.Add('|'+(@(for($i=0;$i -lt $cols.Count;$i++){$cell=Fit-Cell $values[$i] $cols[$i];if($headers[$i] -in @('Duration','Passed','Failed')){$cell=$cell.TrimEnd().PadLeft($cols[$i])};$cell}) -join '|')+'|')
        }
        $lines.Add('└'+(($cols | ForEach-Object {'─'*$_}) -join '┴')+'┘')
        $active=$s.Runs | Where-Object State -eq Running | Select-Object -First 1
        if($active){$log=Join-Path $active.LogDirectory ($active.Name+'.log'); $size=if(Test-Path $log){(Get-Item $log).Length}else{0}; $lines.Add("Heartbeat: $size UTF-8 bytes; elapsed $(Format-Duration (([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($active.Started,[Globalization.CultureInfo]::InvariantCulture)).TotalSeconds))")}
        $lines.Add("Résultats : $(Split-Path $StatePath)")
        if($RunnerId -and $snapshots.Count -eq 1 -and !$s.Done -and !(Get-Process -Id $RunnerId -ErrorAction SilentlyContinue)){$lines.Add('CRASH: runner absent; consulter les journaux.');$s.Done=$true}
        if($interactive){while($lines.Count -lt $height){$lines.Add('')}}
        $render=@($lines | Select-Object -First $height | ForEach-Object {Fit-Cell $_ $width}) -join [Environment]::NewLine
        if($interactive){[Console]::SetCursorPosition(0,0);[Console]::Write($render)}else{[Console]::WriteLine($render)}
        if($s.Done -or !$interactive){break}
    } elseif($RunnerId -and !(Get-Process -Id $RunnerId -ErrorAction SilentlyContinue)){[Console]::WriteLine('Projet : Requirements-as-Code TypeScript | Tâche : Audit - CRASH avant état');break}
    Start-Sleep -Milliseconds 500
} } finally { if($interactive){[Console]::CursorVisible=$true} }
