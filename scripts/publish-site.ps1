param([string]$Root = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'apply-publishing-metadata.ps1') -Root $Root
& (Join-Path $PSScriptRoot 'update-sitemaps.ps1') -Root $Root
& (Join-Path $PSScriptRoot 'validate-publishing.ps1') -Root $Root
Write-Output 'IM News publishing checks completed successfully.'
