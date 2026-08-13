param([string]$Root = (Split-Path -Parent $PSScriptRoot))

$base = 'https://imnews.one/'
$htmlFiles = Get-ChildItem -LiteralPath $Root -File -Filter '*.html' | Sort-Object Name
$urls = foreach ($file in $htmlFiles) {
  $relative = if ($file.Name -eq 'index.html') { '' } else { $file.Name }
  $lastModified = $file.LastWriteTime.ToString('yyyy-MM-dd')
  "  <url><loc>$base$relative</loc><lastmod>$lastModified</lastmod></url>"
}

$sitemap = @(
  '<?xml version="1.0" encoding="UTF-8"?>'
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  $urls
  '</urlset>'
) -join "`n"
Set-Content -LiteralPath (Join-Path $Root 'sitemap.xml') -Value $sitemap -Encoding utf8

$recent = $htmlFiles | Where-Object { $_.Name -match '^article-(64|65)\.html$' }
$newsEntries = foreach ($file in $recent) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8
  $title = if ($content -match '<title>(.*?)\s*\|\s*IM News</title>') { $Matches[1] } else { $file.BaseName }
  $published = if ($file.Name -eq 'article-65.html') { '2026-08-13' } else { '2026-08-12' }
  $escapedTitle = [System.Security.SecurityElement]::Escape($title)
  "  <url><loc>$base$($file.Name)</loc><news:news><news:publication><news:name>IM News</news:name><news:language>en</news:language></news:publication><news:publication_date>$published</news:publication_date><news:title>$escapedTitle</news:title></news:news></url>"
}

$news = @(
  '<?xml version="1.0" encoding="UTF-8"?>'
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'
  $newsEntries
  '</urlset>'
) -join "`n"
Set-Content -LiteralPath (Join-Path $Root 'news-sitemap.xml') -Value $news -Encoding utf8
