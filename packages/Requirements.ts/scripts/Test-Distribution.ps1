# Objectif : qualifier les archives des paquets du workspace dans un consommateur isolé, sans dépendances de développement.
<# .SYNOPSIS
Packs every RaC package, installs the archives outside the workspace, then exercises public exports and CLIs.
.PARAMETER OutputDirectory
Retains archives, install logs and the consumer location for reproducible diagnosis.
#>
param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
$utf8=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=$utf8;[Console]::OutputEncoding=$utf8;$OutputEncoding=$utf8
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(!$OutputDirectory){$OutputDirectory=Join-Path $root ('test-results/distribution-'+(Get-Date -Format yyyyMMdd-HHmmss))}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
$archives=Join-Path $OutputDirectory 'archives'
[IO.Directory]::CreateDirectory($archives)|Out-Null
Import-Module (Join-Path $root '../../../../../PoSh/FrenchExDev/QuietCliEcosystem/FrenchExDev.QuietCli.PoSh/FrenchExDev.QuietCli.PoSh.psd1') -DisableNameChecking
if(!$env:QUIETCLI_CONTEXT){$env:QUIETCLI_CONTEXT='FrenchExDev'}
$pnpmCommand=Get-Command pnpm
$pnpm=if(!$IsWindows -or $pnpmCommand.Source.EndsWith('.exe')){$pnpmCommand.Source}else{Join-Path (Split-Path $pnpmCommand.Source) 'node_modules/pnpm/pnpm.exe'}
function Invoke-DistributionCommand([string]$Directory,[string]$Executable,[string[]]$Arguments,[string]$Name){
    # .SYNOPSIS Retains complete UTF-8 diagnostics and returns failure explicitly.
    $log=[IO.StreamWriter]::new((Join-Path $OutputDirectory ($Name+'.log')),$false,$utf8)
    try {
        $result=pump -AsObject -WorkingDirectory $Directory -TimeoutSeconds 600 -State @{Log=$log;Lines=[Collections.Generic.Queue[string]]::new()} -OnOutput {
            param($o,$s)
            $s.Log.WriteLineAsync($o.Text).GetAwaiter().GetResult()|Out-Null
            foreach($line in ($o.Text -split '\r?\n')){if($s.Lines.Count -ge 8){$s.Lines.Dequeue()|Out-Null};$s.Lines.Enqueue($line)}
        } -Complete {param($s,$c) @{Tail=$s.Lines.ToArray()}} $Executable @Arguments
        $result|ConvertTo-QuietJson -MaxOutputBytes 3000|Set-Content (Join-Path $OutputDirectory ($Name+'.result.json')) -Encoding utf8
        $result|Out-QuietResult -MaxOutputBytes 3000
        if($result.Outcome -ne 'Success'){throw "$Name failed; see $OutputDirectory"}
    } finally {$log.Dispose()}
}
$manifests=@()
foreach($package in Get-ChildItem (Join-Path $root 'packages') -Directory){
    $manifest=Get-Content (Join-Path $package.FullName 'package.json') -Raw -Encoding utf8|ConvertFrom-Json -AsHashtable
    $manifests+=$manifest
    Invoke-DistributionCommand $package.FullName $pnpm @('pack','--pack-destination',$archives,'--json') ('pack-'+$package.Name)
}
$consumer=Join-Path ([IO.Path]::GetTempPath()) ('rac-consumer-é-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($consumer)|Out-Null
$dependencies=[ordered]@{}
foreach($manifest in $manifests){
    $name=$manifest.name.Substring(1).Replace('/','-')+'-'+$manifest.version+'.tgz'
    $dependencies[$manifest.name]='file:'+([IO.Path]::Combine($archives,$name).Replace('\','/'))
}
$json=@{name='rac-production-consumer';private=$true;type='module';packageManager=(Get-Content "$root/package.json" -Raw -Encoding utf8|ConvertFrom-Json).packageManager;dependencies=$dependencies}|ConvertTo-Json -Depth 8
[IO.File]::WriteAllTextAsync((Join-Path $consumer 'package.json'),$json,$utf8).GetAwaiter().GetResult()|Out-Null
Copy-Item (Join-Path $root 'pnpm-workspace.yaml') (Join-Path $consumer 'pnpm-workspace.yaml')
$yaml=[IO.File]::ReadAllText((Join-Path $consumer 'pnpm-workspace.yaml'),$utf8).Replace('  - packages/*','  - .')
# Resolve only under-test packages to freshly packed test fixtures; external
# workspace dependencies continue to use their published registry versions.
foreach($name in $dependencies.Keys){$yaml+="`n  '$name': '$($dependencies[$name])'"}
$yaml+="`n  vitest: 5.0.5`n"
[IO.File]::WriteAllTextAsync((Join-Path $consumer 'pnpm-workspace.yaml'),$yaml,$utf8).GetAwaiter().GetResult()|Out-Null
Copy-Item (Join-Path $PSScriptRoot 'check-installed-packages.mjs') (Join-Path $consumer 'check-installed-packages.mjs')
ConvertTo-Json -InputObject @($manifests) -Depth 12|Set-Content (Join-Path $consumer 'manifests.json') -Encoding utf8
@{Consumer=$consumer;Archives=$archives}|ConvertTo-Json|Set-Content (Join-Path $OutputDirectory 'locations.json') -Encoding utf8
Invoke-DistributionCommand $consumer $pnpm @('install','--offline','--prod','--ignore-scripts','--strict-peer-dependencies') 'install-production'
Invoke-DistributionCommand $consumer (Get-Command node -CommandType Application).Source @('check-installed-packages.mjs','manifests.json') 'consumer'
