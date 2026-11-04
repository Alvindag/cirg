<#
.SYNOPSIS  Tracker row 4 - IT policies and procedures.
.DESCRIPTION
  Scans a policy folder/share, matches files to the required policy list, and reports file name, path,
  last modified date, author and last-saved-by (Office docs), plus a MISSING flag for any policy with no match.
  Signatures / review dates: confirm from the document itself and add in the 'ManagementSigned' column.
  Optionally copies matched files into an evidence folder for hand-over.
.EXAMPLE
  .\Task4_Policy_Inventory.ps1 -PolicyPath \\fileserver\IT\Policies -CopyEvidence
#>
param(
  [Parameter(Mandatory)][string]$PolicyPath,
  [string]$OutDir = "C:\Audit\Task4",
  [switch]$CopyEvidence
)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
$required = [ordered]@{
  'Access control'                 = 'access.?control|user.?access'
  'Password management'            = 'password'
  'Change management'              = 'change.?manage'
  'Backup and recovery'            = 'backup|recovery|restore|DR'
  'Incident response & management' = 'incident'
  'Cybersecurity'                  = 'cyber|information.?security|infosec'
  'Patch management'               = 'patch'
  'Acceptable use policy'          = 'acceptable.?use|AUP'
}
$files = Get-ChildItem $PolicyPath -Recurse -File -Include *.pdf,*.doc,*.docx,*.xls,*.xlsx
function Get-DocProps($f) {
  if ($f.Extension -notmatch 'docx|xlsx') { return @{Author='';LastBy=''} }
  try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $z = [IO.Compression.ZipFile]::OpenRead($f.FullName)
    $e = $z.Entries | Where-Object FullName -eq 'docProps/core.xml'
    $x = [xml](New-Object IO.StreamReader($e.Open())).ReadToEnd(); $z.Dispose()
    @{Author=$x.coreProperties.creator; LastBy=$x.coreProperties.lastModifiedBy}
  } catch { @{Author='';LastBy=''} }
}
$rows = foreach ($k in $required.Keys) {
  $m = $files | Where-Object { $_.BaseName -match $required[$k] }
  if (-not $m) {
    [pscustomobject]@{Policy=$k;Status='MISSING - not found';FileName='';LastModified='';Author='';LastSavedBy='';Path='';ManagementSigned='MANUAL';LastReviewDate='MANUAL'}
  } else { foreach ($f in $m) { $p = Get-DocProps $f
    [pscustomobject]@{Policy=$k;Status='Found';FileName=$f.Name;LastModified=$f.LastWriteTime.ToString('yyyy-MM-dd')
      Author=$p.Author;LastSavedBy=$p.LastBy;Path=$f.FullName;ManagementSigned='MANUAL';LastReviewDate='MANUAL'}
    if ($CopyEvidence) { $dst = Join-Path $OutDir "Evidence\$k"; New-Item -ItemType Directory -Force $dst | Out-Null; Copy-Item $f.FullName $dst }
  } }
}
$rows | Export-Csv "$OutDir\Task4_Policy_Inventory_$stamp.csv" -NoTypeInformation
$rows | Format-Table Policy,Status,FileName,LastModified -AutoSize
Write-Host "Saved to $OutDir. Add signed/review dates (check document version-control table)." -ForegroundColor Green
