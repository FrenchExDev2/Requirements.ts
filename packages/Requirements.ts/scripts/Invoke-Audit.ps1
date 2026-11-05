# Objectif : Exécuter les contrôles RaC avec preuves UTF-8 et suivi dans une fenêtre dédiée.
<# .SYNOPSIS
Runs the local RaC audit without changing coverage thresholds or sibling manifests.
.PARAMETER Phase
Selects the baseline, final verification, dependencies, or unit-only checks.
.PARAMETER OutputDirectory
Directory retaining logs, compact QuietCli results and monitor state.
#>
[CmdletBinding()]
param(
    [ValidateSet('Baseline','Final','Dependencies','Unit','TypeScript7','Targeted','Mutation','QualificationMutation','SpecIO','Integration','Fixes','Distribution','SelfAudit','RunnerSelfTest','Qualification','CompleteTests','FullQualification','LinuxFullQualification','LinuxCorpus','Extraction','PipelineTypes','PipelineConsumer','PipelineBridge')][string]$Phase = 'Final',
    [string]$OutputDirectory,
    [string]$TypeScript7Path,
    [ValidateRange(1,8)][int]$MaxParallel=4,
    [int]$CheckIndex=-1,
    [string]$RunId,
    [string]$LinuxContainerId,
    [string]$CompanionStatePath,
    [string]$ProjectDirectory,
    [string]$QuietCliManifest,
    [switch]$Worker
)
$ErrorActionPreference = 'Stop'
$utf8 = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
if ($PSVersionTable.PSVersion -lt [version]'7.6') { throw 'PowerShell Core 7.6+ required.' }
$root = if($ProjectDirectory){[IO.Path]::GetFullPath($ProjectDirectory)}else{[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))}
# Find the owning workspace independently of project nesting; explicit manifests remain supported.
$workspaceRoot = $root
$cursor = [IO.DirectoryInfo]::new($root)
while ($null -ne $cursor) {
    if (Test-Path -LiteralPath (Join-Path $cursor.FullName '.git')) { $workspaceRoot = $cursor.FullName }
    $candidate = Join-Path $cursor.FullName 'PoSh/FrenchExDev/QuietCliEcosystem/FrenchExDev.QuietCli.PoSh/FrenchExDev.QuietCli.PoSh.psd1'
    if (Test-Path -LiteralPath $candidate) {
        $workspaceRoot = $cursor.FullName
        if (!$QuietCliManifest) { $QuietCliManifest = $candidate }
        break
    }
    $cursor = $cursor.Parent
}
if (!$QuietCliManifest) {
    $pumpCommand = Get-Command pump -ErrorAction SilentlyContinue
    if ($pumpCommand.Module.Path) { $QuietCliManifest = $pumpCommand.Module.Path }
}
if (!$QuietCliManifest -or !(Test-Path -LiteralPath $QuietCliManifest)) {
    throw 'QuietCli is required for local audit infrastructure. Install it or supply -QuietCliManifest before starting the audit.'
}
$QuietCliManifest = [IO.Path]::GetFullPath($QuietCliManifest)
$completePhase=$Phase -in @('FullQualification','LinuxFullQualification')
$linuxPhase=$Phase -in @('LinuxCorpus','LinuxFullQualification')
if(!$RunId){$RunId=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ss')}
if (!$OutputDirectory) { $OutputDirectory = if($completePhase){Join-Path $root "test-results/$RunId"}else{Join-Path $root ('test-results/audit-' + $Phase.ToLower() + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))} }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if($completePhase -and $OutputDirectory -ne [IO.Path]::GetFullPath((Join-Path $root "test-results/$RunId"))){throw 'FullQualification retains all campaign artifacts under test-results/<RunId>; omit OutputDirectory or select that directory.'}
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$statePath = Join-Path $OutputDirectory 'state.json'
if($CheckIndex -ge 0){$statePath=Join-Path $OutputDirectory ("worker-$CheckIndex.json")}
if (!$Worker) {
    # Running workers read one immutable script snapshot even while sources evolve.
    $runnerScript=Join-Path $OutputDirectory 'Invoke-Audit.snapshot.ps1'
    Copy-Item -LiteralPath $PSCommandPath -Destination $runnerScript
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Watch-Audit.ps1') -Destination (Join-Path $OutputDirectory 'Watch-Audit.ps1')
    $shell = (Get-Process -Id $PID).Path
    $arguments = @('-NoProfile','-File', $runnerScript,'-Phase',$Phase,'-OutputDirectory',$OutputDirectory,'-QuietCliManifest',$QuietCliManifest,'-ProjectDirectory',$root,'-Worker')
    $arguments+=@('-MaxParallel',$MaxParallel)
    if($RunId){$arguments+=@('-RunId',$RunId)}
    if($LinuxContainerId){$arguments+=@('-LinuxContainerId',$LinuxContainerId)}
    if($TypeScript7Path){$arguments+=@('-TypeScript7Path',$TypeScript7Path)}
    $runnerWindow=if($IsWindows){@{WindowStyle='Hidden'}}else{@{}}
    $monitorWindow=if($IsWindows){@{WindowStyle='Normal'}}else{@{}}
    $runner = Start-Process $shell @runnerWindow -ArgumentList ($arguments | ForEach-Object { '"' + $_ + '"' }) -PassThru
    $monitorArguments=@('-NoProfile','-File', ('"' + (Join-Path $OutputDirectory 'Watch-Audit.ps1') + '"'),'-StatePath',('"' + $statePath + '"'),'-RunnerId',$runner.Id)
    if($CompanionStatePath){$monitorArguments+=@('-AdditionalStatePath',('"'+$CompanionStatePath+'"'))}
    $monitor = Start-Process $shell @monitorWindow -ArgumentList $monitorArguments -PassThru
    $reopen="pwsh -NoProfile -File `"$OutputDirectory/Watch-Audit.ps1`" -StatePath `"$statePath`""
    if($CompanionStatePath){$reopen+=" -AdditionalStatePath `"$CompanionStatePath`""}
    [pscustomobject]@{ RunnerId=$runner.Id; MonitorId=$monitor.Id; OutputDirectory=$OutputDirectory; Reopen=$reopen } | ConvertTo-Json
    return
}
Import-Module $QuietCliManifest -DisableNameChecking
$pnpmCommand = Get-Command pnpm -ErrorAction Stop
$pnpm = if (!$IsWindows -or $pnpmCommand.Source.EndsWith('.exe')) { $pnpmCommand.Source } else { Join-Path (Split-Path $pnpmCommand.Source) 'node_modules/pnpm/pnpm.exe' }
if (!(Test-Path -LiteralPath $pnpm)) { throw "Native pnpm not found: $pnpm" }
$node = (Get-Command node -CommandType Application).Source
if($Phase -eq 'TypeScript7' -and !$TypeScript7Path){$TypeScript7Path=Join-Path $root 'node_modules/@typescript/native/bin/tsc'}
$checks = @(switch ($Phase) {
    'PipelineTypes' { ,@('test-types','typecheck:tests') }
    'PipelineConsumer' { ,@('consumer-lib','--filter','@frenchexdev2/requirements-lib','run','test','--maxWorkers=2') }
    'Extraction' { @(@('build','-r','run','build'), @('pipeline-tests','--filter','@frenchexdev2/ts-codegen-pipeline','run','test'), @('test-types','typecheck:tests'), @('distribution','test:distribution')) }
    'PipelineBridge' { @(@('build','-r','--workspace-concurrency=4','run','build'), @('scanner-facade','--filter','@frenchexdev2/requirements-scanner','run','test','--maxWorkers=2'), @('consumer-lib','--filter','@frenchexdev2/requirements-lib','run','test','--maxWorkers=2'), @('integration','test:integration'), @('test-types','typecheck:tests')) }
    'LinuxCorpus' { @(@('build','-r','--workspace-concurrency=4','run','build'), @('linux-qualification-tests','run'), @('linux-test-types','check')) }
    'CompleteTests' { @(@('build','-r','--workspace-concurrency=4','run','build'), @('qualification-tests','exec','vitest','run','--config','vitest.qualification.config.ts','--coverage'), @('test-types','typecheck:tests')) }
    {$_ -in @('FullQualification','LinuxFullQualification')} { @(@('build','-r','--workspace-concurrency=4','run','build'), @('inputs-before','exec','node','scripts/collect-qualification-evidence.mjs','begin',$RunId), @('qualification-tests','exec','vitest','run','--config','vitest.qualification.config.ts','--coverage'), @('test-types','typecheck:tests'), @('distribution','test:distribution'), @('full-mutation','exec','stryker','run','stryker.qualification.conf.cjs','--force','--reporters','json,clear-text')) }
    'Qualification' { @(@('build','-r','--workspace-concurrency=4','run','build'), @('qualification-unit','--filter','@frenchexdev2/requirements-compliance','run','test'), @('style-contracts','--filter','@frenchexdev2/requirements-styles','run','test'), @('kernel-contracts','--filter','@frenchexdev2/requirements-core','run','test'), @('meta-contracts','--filter','@frenchexdev2/requirements-requirements','run','test'), @('integration','test:integration'), @('test-types','typecheck:tests')) }
    'RunnerSelfTest' { @(@('fixture-a','a','900','0'),@('fixture-b','b','900','0'),@('fixture-failure','failure','100','2')) }
    'TypeScript7' { @(Get-ChildItem (Join-Path $root 'packages') -Directory | ForEach-Object { ,@($_.Name,'--project',(Join-Path $_.FullName 'tsconfig.json'),'--types','node','--noEmit','--tsBuildInfoFile',(Join-Path $OutputDirectory ($_.Name+'.tsbuildinfo'))) }) }
    'Targeted' { @(@('test-types','typecheck:tests'), @('spec-io','--filter','@frenchexdev2/requirements-spec-io','run','test'), @('styles-demo','--filter','@frenchexdev2/requirements-styles-demo','run','test'), @('integration','test:integration')) }
    'Distribution' { ,@('distribution','test:distribution') }
    'SelfAudit' { ,@('self-audit','compliance:static') }
    'Fixes' { @(@('build','-r','--workspace-concurrency=4','run','build'), @('requirements','--filter','@frenchexdev2/requirements','run','test'), @('behavioral','--filter','@frenchexdev2/requirements-behavioral-check','run','test'), @('integration','test:integration')) }
    'Mutation' { ,@('versioning-mutation','run','stryker.conf.cjs','--force','--concurrency','1','--reporters','json,clear-text') }
    'QualificationMutation' { ,@('qualification-engine-mutation','run','stryker.qualification-engine.conf.cjs','--force','--reporters','json,clear-text') }
    'SpecIO' { ,@('spec-io','--filter','@frenchexdev2/requirements-spec-io','run','test') }
    'Integration' { ,@('integration','test:integration') }
    'Dependencies' { @(@('outdated','outdated','-r','--format','json'), @('security','audit','--json')) }
    'Unit' { ,@('unit','--filter','./packages/**','-r','--workspace-concurrency=4','--no-bail','run','--if-present','test','--maxWorkers=2') }
    default { @(@('build','-r','--workspace-concurrency=4','run','build'), @('ts7','typecheck:ts7'), @('test-types','typecheck:tests'), @('unit','--filter','./packages/**','-r','--workspace-concurrency=4','--no-bail','run','--if-present','test','--maxWorkers=2'), @('integration','test:integration'), @('smoke','--filter','@frenchexdev2/requirements','run','test:smoke'), @('compliance','compliance'), @('security','audit','--json'), @('distribution','test:distribution')) }
})
$runs = @($checks | ForEach-Object { [ordered]@{ Name=$_[0]; Platform=if($linuxPhase){'Linux'}elseif($IsWindows){'Windows'}else{'Linux'}; State='Pending'; Started=$null; Duration=0; Identity='-'; Passed=$null; Failed=$null; Lines=0; Outcome=$null; ExitCode=$null; SourceComplete=$null; AnalysisComplete=$null } })
$projects=@(Get-ChildItem (Join-Path $root 'packages') -Directory | Select-Object -ExpandProperty Name)
if($Phase -eq 'Mutation'){$projects=@('requirements-versioning')}
if($Phase -eq 'QualificationMutation'){$projects=@('requirements-compliance: qualification.ts verdict engine')}
if($Phase -eq 'RunnerSelfTest'){$projects=@('RaC audit scheduler: synthetic success/failure fixtures')}
if(!$RunId){$RunId=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ss')}
$state = [ordered]@{ Project=if($Phase -eq 'Mutation'){'@frenchexdev2/requirements-versioning'}else{'RaC TypeScript (targets below)'}; Projects=$projects; Task="Audit $Phase ($MaxParallel parallel)"; Workspace=$workspaceRoot; Directory=$root; RunnerId=$PID; TestRunId=$RunId; Done=$false; Runs=$runs }
if($Phase -eq 'QualificationMutation'){$state.Project='@frenchexdev2/requirements-compliance';$state.Directory=Join-Path $root 'packages/requirements-compliance';$state.Task='Diagnostic mutation of qualification.ts (not final qualification)'}
if($Phase -eq 'Mutation'){$state.Directory=Join-Path $root 'packages/requirements-versioning'}
if($linuxPhase){$state.ContainerDirectory='/workspace/'+[IO.Path]::GetRelativePath($workspaceRoot,$root).Replace('\','/');$state.ContainerId=$LinuxContainerId}
function Save-AuditState {
    # .SYNOPSIS Saves a UTF-8 snapshot with a single writer and shared readers.
    $json = $state | ConvertTo-Json -Depth 8
    # Replacing an open file can fail on Windows even for a short-lived reader.
    # Readers tolerate incomplete JSON and retain their previous valid snapshot.
    $stream=[IO.FileStream]::new($statePath,[IO.FileMode]::Create,[IO.FileAccess]::Write,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try {
        $bytes=$utf8.GetBytes($json)
        $stream.WriteAsync($bytes,0,$bytes.Length).GetAwaiter().GetResult()|Out-Null
        $stream.FlushAsync().GetAwaiter().GetResult()|Out-Null
    } finally {$stream.Dispose()}
}
Save-AuditState
if($CheckIndex -lt 0){
    # The build produces dist artifacts consumed by all following checks.
    # Separate pwsh workers own their logs/state; only this coordinator writes state.json.
    $active=@{};$waiting=[Collections.Generic.Queue[int]]::new()
    for($index=0;$index -lt $checks.Count;$index++){$waiting.Enqueue($index)}
    $buildIndex=if($checks.Count -and $checks[0][0] -eq 'build'){0}else{-1}
    $shell=(Get-Process -Id $PID).Path
    try {
        if($Phase -eq 'Final'){
            $env:TEST_RUN_ID=$RunId
            $snapshot=pump -AsObject -WorkingDirectory $root -OnOutput {param($o,$s) $s.Lines.Add($o.Text)} -State @{Lines=[Collections.Generic.List[string]]::new()} -Complete {param($s,$c) @{Lines=$s.Lines.ToArray()}} $node scripts/source-fingerprint.mjs
            $snapshot|ConvertTo-QuietJson -MaxOutputBytes 2000|Set-Content (Join-Path $OutputDirectory 'source-snapshot.result.json') -Encoding utf8
            if($snapshot.Outcome -ne 'Success'){throw 'Source snapshot failed.'}
        }
        while($waiting.Count -or $active.Count){
            $buildReady=$buildIndex -lt 0 -or $runs[$buildIndex].State -eq 'Success'
            if($buildIndex -ge 0 -and $runs[$buildIndex].State -notin @('Pending','Running','Success')){
                while($waiting.Count){$cancelled=$runs[$waiting.Dequeue()];$cancelled.State='Cancelled';$cancelled.Outcome='Build failed.'}
            }
            while($waiting.Count -and $active.Count -lt $MaxParallel -and ($buildReady -or ($waiting.Peek() -eq $buildIndex -and !$active.Count))){
                # A blocked compliance gate must not hold up independent checks.
                $index=$null;$candidates=$waiting.Count
                for($candidate=0;$candidate -lt $candidates;$candidate++){
                    $next=$waiting.Dequeue()
                    $blocked=$checks[$next][0] -eq 'compliance' -and @($runs|Where-Object { $_.Name -in @('unit','smoke','integration','test-types','ts7') -and $_.State -in @('Pending','Running') }).Count
                    if($completePhase -and $checks[$next][0] -notin @('build','inputs-before')){
                        $dependencies=@($runs[1])
                        if($checks[$next][0] -eq 'full-mutation'){$dependencies+=@($runs|Where-Object Name -in @('qualification-tests','test-types','distribution'))}
                        if(@($dependencies|Where-Object State -notin @('Pending','Running','Success')).Count){$runs[$next].State='Cancelled';$runs[$next].Outcome='A qualification prerequisite failed.';continue}
                        $blocked=@($dependencies|Where-Object State -ne 'Success').Count -gt 0
                    }
                    if($blocked){$waiting.Enqueue($next)}else{$index=$next;break}
                }
                if($null -eq $index){break}
                $arguments=@('-NoProfile','-File',$PSCommandPath,'-Phase',$Phase,'-OutputDirectory',$OutputDirectory,'-QuietCliManifest',$QuietCliManifest,'-ProjectDirectory',$root,'-Worker','-CheckIndex',$index,'-RunId',$RunId,'-MaxParallel',$MaxParallel)
                if($LinuxContainerId){$arguments+=@('-LinuxContainerId',$LinuxContainerId)}
                if($TypeScript7Path){$arguments+=@('-TypeScript7Path',$TypeScript7Path)}
                $workerWindow=if($IsWindows){@{WindowStyle='Hidden'}}else{@{}}
                $process=Start-Process $shell @workerWindow -ArgumentList ($arguments|ForEach-Object{'"'+$_+'"'}) -PassThru
                $runs[$index].Identity="pwsh:$($process.Id)";$runs[$index].State='Running';$runs[$index].Started=[DateTime]::UtcNow.ToString('o')
                $active[$index]=$process
                if(!$buildReady){break}
            }
            foreach($index in @($active.Keys)){
                $workerPath=Join-Path $OutputDirectory ("worker-$index.json")
                if(Test-Path -LiteralPath $workerPath){
                    $stream=[IO.FileStream]::new($workerPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
                    $reader=[IO.StreamReader]::new($stream,$utf8)
                    try{$snapshot=$reader.ReadToEndAsync().GetAwaiter().GetResult()|ConvertFrom-Json -AsHashtable -DateKind String;$runs[$index]=$snapshot.Runs[$index]}catch{continue}finally{$reader.Dispose()}
                }
                if($active[$index].HasExited){
                    if($runs[$index].State -in @('Pending','Running')){$runs[$index].State='Crash';$runs[$index].Outcome="Worker terminated (exit $($active[$index].ExitCode))."}
                    $active[$index].Dispose();$active.Remove($index)
                }
            }
            Save-AuditState
            if($waiting.Count -or $active.Count){Start-Sleep -Milliseconds 250}
        }
    } catch {
        foreach($index in @($active.Keys)){$runs[$index].State='Crash';$runs[$index].Outcome=$_.Exception.Message}
        throw
    } finally {
        $state.Done=$true;Save-AuditState
        Copy-Item -LiteralPath $statePath -Destination (Join-Path $OutputDirectory 'summary.json')
        if($completePhase){
            if($linuxPhase){
                $copied=pump -AsObject -TimeoutSeconds 60 -Parse {param($capture) @{SummaryRetained=($capture.ExitCode -eq 0)}} docker cp (Join-Path $OutputDirectory 'summary.json') "${LinuxContainerId}:/workspace/NodeJs/FrenchExDev/Requirements.ts/test-results/$RunId/summary.json"
                if($copied.Outcome -ne 'Success'){throw 'Linux summary retention failed.'}
                $collected=pump -AsObject -TimeoutSeconds 300 -Parse {param($capture) $capture.Stdout|ConvertFrom-Json} docker exec --workdir /workspace/NodeJs/FrenchExDev/Requirements.ts $LinuxContainerId node scripts/collect-qualification-evidence.mjs finish $RunId
            }else{$collected=pump -AsObject -WorkingDirectory $root -TimeoutSeconds 300 -Parse {param($capture) $capture.Stdout|ConvertFrom-Json} $node scripts/collect-qualification-evidence.mjs finish $RunId}
            $collected|ConvertTo-QuietJson -MaxOutputBytes 3000|Set-Content (Join-Path $OutputDirectory 'evidence-collection.result.json') -Encoding utf8
        }
        if($Phase -eq 'Final'){@{runId=$RunId;summary=(Join-Path $OutputDirectory 'summary.json')}|ConvertTo-Json|Set-Content (Join-Path $root 'test-results/latest-validation.json') -Encoding utf8}
    }
    if(@($runs|Where-Object State -ne 'Success').Count){exit 1}
    exit 0
}
try {
    for ($i=0; $i -lt $checks.Count; $i++) {
        if($i -ne $CheckIndex){continue}
        $check = $checks[$i]; $row = $runs[$i]
        $row.State='Running'; $row.Started=[DateTime]::UtcNow.ToString('o');$row.Identity="pwsh:$PID"
        $log = [IO.StreamWriter]::new((Join-Path $OutputDirectory ($row.Name+'.log')), $false, $utf8)
        $env:TEST_RUN_ID = $state.TestRunId
        if($completePhase){$env:QUALIFICATION_FULL='1';$env:STRYKER_REPORT_DIR=(Join-Path $OutputDirectory 'mutation')}
        if($Phase -eq 'QualificationMutation'){$env:STRYKER_REPORT_DIR=(Join-Path $OutputDirectory 'mutation')}
        $env:NO_COLOR='1'
        $native = $pnpm; $nativeArgs = @($check | Select-Object -Skip 1)
        if($Phase -eq 'TypeScript7'){$native=$node;$nativeArgs=@($TypeScript7Path)+$nativeArgs}
        if($Phase -eq 'RunnerSelfTest'){
            $native=$node;$nativeArgs=@((Join-Path $root 'test/fixtures/runner-probe.mjs'))+$nativeArgs
            if($MaxParallel -ge 2){$nativeArgs+=@($OutputDirectory)}
        }
        $workingDirectory=$root
        if($Phase -eq 'Mutation'){$native=$node;$nativeArgs=@((Join-Path $root 'node_modules/@stryker-mutator/core/bin/stryker.js'))+$nativeArgs;$workingDirectory=Join-Path $root 'packages/requirements-versioning'}
        if($Phase -eq 'QualificationMutation'){$native=$node;$nativeArgs=@((Join-Path $root 'node_modules/@stryker-mutator/core/bin/stryker.js'))+$nativeArgs;$workingDirectory=Join-Path $root 'packages/requirements-compliance'}
        if($check[0] -eq 'qualification-tests'){$native=$node;$nativeArgs=@((Join-Path $root 'node_modules/vitest/vitest.mjs'),'run','--config','vitest.qualification.config.ts','--coverage')}
        if($check[0] -eq 'inputs-before'){$native=$node;$nativeArgs=@('scripts/collect-qualification-evidence.mjs','begin',$RunId)}
        if($check[0] -eq 'full-mutation'){$native=$node;$nativeArgs=@((Join-Path $root 'node_modules/@stryker-mutator/core/bin/stryker.js'),'run','stryker.qualification.conf.cjs','--force','--reporters','json,clear-text')}
        if($linuxPhase){
            if($LinuxContainerId -notmatch '^[a-f0-9]{64}$'){throw 'LinuxCorpus requires the complete identity of the owned test container.'}
            $native=(Get-Command docker -CommandType Application).Source
            $prefix=@('exec','--env','QUIETCLI_CONFIG_PATH=/workspace/quietcli.yaml','--env','QUIETCLI_CONTEXT=Qualification','--env',"TEST_RUN_ID=$RunId",'--env','NO_COLOR=1')
            if($completePhase){$prefix+=@('--env','QUALIFICATION_FULL=1','--env',"STRYKER_REPORT_DIR=/workspace/NodeJs/FrenchExDev/Requirements.ts/test-results/$RunId/mutation")}
            $prefix+=@('--workdir','/workspace/NodeJs/FrenchExDev/Requirements.ts',$LinuxContainerId)
            $command=switch($check[0]){
                'build' {@('pnpm','-r','--workspace-concurrency=4','run','build')}
                {$_ -in @('test-types','linux-test-types')} {@('pnpm','typecheck:tests')}
                'inputs-before' {@('node','scripts/collect-qualification-evidence.mjs','begin',$RunId)}
                'distribution' {@('pwsh','-NoProfile','-File','scripts/Test-Distribution.ps1','-OutputDirectory',"test-results/$RunId/distribution")}
                'full-mutation' {@('node','node_modules/@stryker-mutator/core/bin/stryker.js','run','stryker.qualification.conf.cjs','--force','--reporters','json,clear-text')}
                default {@('node','node_modules/vitest/vitest.mjs','run','--config','vitest.qualification.config.ts','--coverage')}
            }
            $nativeArgs=$prefix+$command
            $row.Identity='ctr:'+$LinuxContainerId.Substring(0,12)
        }
        Save-AuditState
        try {
            $data = @{ Log=$log; Row=$row; Tail=[Collections.Generic.Queue[string]]::new() }
            $timeout=if($completePhase -or $Phase -eq 'QualificationMutation'){86400}else{1800}
            $result = pump -AsObject -WorkingDirectory $workingDirectory -TimeoutSeconds $timeout -State $data -OnOutput {
                param($output,$s)
                $line=$output.Text -replace '\x1b\[[0-9;]*[A-Za-z]',''
                $s.Log.WriteLineAsync($line).GetAwaiter().GetResult()
                $s.Log.FlushAsync().GetAwaiter().GetResult()
                $s.Row.Lines++
                foreach($m in [regex]::Matches($line,'Tests\s+(\d+) passed')){$s.Row.Passed=($s.Row.Passed ?? 0)+[int]$m.Groups[1].Value}
                foreach($m in [regex]::Matches($line,'Tests\s+(\d+) failed')){$s.Row.Failed=($s.Row.Failed ?? 0)+[int]$m.Groups[1].Value}
                if ($s.Tail.Count -ge 12) { $s.Tail.Dequeue() | Out-Null }; $s.Tail.Enqueue($line)
            } -Complete { param($s,$capture) @{ Lines=$s.Row.Lines; Tail=$s.Tail.ToArray() } } $native @nativeArgs
            $row.Outcome=[string]$result.Outcome; $row.ExitCode=$result.Execution.ExitCode
            $row.SourceComplete=$result.Completeness.Source; $row.AnalysisComplete=$result.Completeness.Analysis
            $row.State = [string]$result.Outcome
            $result | ConvertTo-QuietJson -MaxOutputBytes 6000 | Set-Content (Join-Path $OutputDirectory ($row.Name+'.result.json')) -Encoding utf8
        } finally { $log.Dispose() }
        $row.Duration=[math]::Round(([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($row.Started)).TotalSeconds,1)
        Save-AuditState
    }
} catch {
    if ($row) { $row.State='Crash'; $row.Outcome=$_.Exception.Message }
    foreach($pending in $runs){if($pending.State -eq 'Pending'){$pending.State='Cancelled';$pending.Outcome='Runner crashed before this check.'}}
    [IO.File]::WriteAllTextAsync((Join-Path $OutputDirectory 'crash.log'), $_.ToString(), $utf8).GetAwaiter().GetResult()
} finally {
    $state.Done=$true
    Save-AuditState
    Copy-Item -LiteralPath $statePath -Destination (Join-Path $OutputDirectory ("summary-$CheckIndex.json"))
}
if($runs[$CheckIndex].State -ne 'Success'){exit 1}
