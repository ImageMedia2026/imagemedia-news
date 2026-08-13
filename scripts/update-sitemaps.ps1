param([string]$Root = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$base = 'https://imnews.one/'
$manifest = Get-Content -LiteralPath (Join-Path $Root 'data\publishing.json') -Raw -Encoding utf8 | ConvertFrom-Json
$metadataByFile = @{}
foreach ($article in $manifest.articles) { $metadataByFile[$article.file] = $article }
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$knownPageDates = @{
  'editorial-standards.html' = '2026-08-14'
  'latest.html' = '2026-08-13'
  'privacy.html' = '2026-08-13'
}

function XmlEscape([string]$value) {
  return [System.Security.SecurityElement]::Escape($value)
}

function PublicationDate([string]$value) {
  return [DateTimeOffset]::Parse($value, [Globalization.CultureInfo]::InvariantCulture)
}

$htmlFiles = Get-ChildItem -LiteralPath $Root -File -Filter '*.html' | Sort-Object Name
$urls = foreach ($file in $htmlFiles) {
  $relative = if ($file.Name -eq 'index.html') { '' } else { $file.Name }
  $loc = XmlEscape "$base$relative"
  if ($metadataByFile.ContainsKey($file.Name)) {
    $lastModified = (PublicationDate $metadataByFile[$file.Name].modified).ToString('yyyy-MM-dd')
    "  <url><loc>$loc</loc><lastmod>$lastModified</lastmod></url>"
  } elseif ($knownPageDates.ContainsKey($file.Name)) {
    "  <url><loc>$loc</loc><lastmod>$($knownPageDates[$file.Name])</lastmod></url>"
  } else {
    "  <url><loc>$loc</loc></url>"
  }
}

$sitemap = @(
  '<?xml version="1.0" encoding="UTF-8"?>'
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  $urls
  '</urlset>'
) -join "`n"
[IO.File]::WriteAllText((Join-Path $Root 'sitemap.xml'), $sitemap, $utf8NoBom)

$cutoff = [DateTimeOffset]::Now.AddDays(-2)
$newsEntries = foreach ($article in $manifest.articles) {
  $published = PublicationDate $article.published
  if ($published -lt $cutoff -or $published -gt [DateTimeOffset]::Now.AddMinutes(5)) { continue }
  $loc = XmlEscape "$base$($article.file)"
  $title = XmlEscape $article.headline
  $publishedValue = XmlEscape $article.published
  "  <url><loc>$loc</loc><news:news><news:publication><news:name>IM News</news:name><news:language>en</news:language></news:publication><news:publication_date>$publishedValue</news:publication_date><news:title>$title</news:title></news:news></url>"
}

$news = @(
  '<?xml version="1.0" encoding="UTF-8"?>'
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'
  $newsEntries
  '</urlset>'
) -join "`n"
[IO.File]::WriteAllText((Join-Path $Root 'news-sitemap.xml'), $news, $utf8NoBom)

Write-Output "Updated sitemap.xml with $($htmlFiles.Count) public pages."
Write-Output "Updated news-sitemap.xml with $(@($newsEntries).Count) articles from the last two days."
