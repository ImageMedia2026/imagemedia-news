param([string]$Root = (Split-Path -Parent $PSScriptRoot))

$articleFiles = Get-ChildItem -LiteralPath $Root -File -Filter 'article-*.html'

foreach ($file in $articleFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8
  if ($content -match '<link rel="canonical"') { continue }

  $title = if ($content -match '<title>(.*?)</title>') { $Matches[1] } else { "IM News" }
  $cleanTitle = $title -replace '\s*\|\s*IM News\s*$', ''
  $description = if ($content -match '<meta name="description" content="([^"]*)"') { $Matches[1] } else { 'Verified sports, events and culture reporting from Image Media News.' }
  $image = if ($content -match '<div class="[^\"]*article-hero[^\"]*"[\s\S]*?<img src="([^"]+)"') { $Matches[1] } else { 'images/im-news-logo.png' }
  if ($image -like 'data:*') { $image = 'images/im-news-logo.png' }
  $url = "https://imnews.one/$($file.Name)"

  $social = @"
<link rel="canonical" href="$url">
<meta property="og:type" content="article">
<meta property="og:site_name" content="IM News">
<meta property="og:title" content="$cleanTitle">
<meta property="og:description" content="$description">
<meta property="og:url" content="$url">
<meta property="og:image" content="https://imnews.one/$image">
<meta name="twitter:card" content="summary_large_image">
"@

  $content = $content -replace '(</title>)', "`$1`r`n$social"
  Set-Content -LiteralPath $file.FullName -Value $content -Encoding utf8
}
