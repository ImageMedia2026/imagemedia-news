param([string]$Root = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$violations = [Collections.Generic.List[string]]::new()
$salesLinkPattern = '(?is)<a\b[^>]*\bhref\s*=\s*["'']https?://[^"'']*fotop\.com(?:\.br)?[^"'']*["'']'

foreach ($page in Get-ChildItem -LiteralPath $Root -Filter '*.html' -File) {
  $content = Get-Content -LiteralPath $page.FullName -Raw -Encoding utf8
  if ($content -match $salesLinkPattern) {
    $violations.Add("$($page.Name): visible Fotop sales/gallery link is forbidden on IM News.")
  }
}

if ($violations.Count -gt 0) {
  throw ($violations -join [Environment]::NewLine)
}

Write-Output 'Editorial sales-link check passed: no visible Fotop sales/gallery links.'
