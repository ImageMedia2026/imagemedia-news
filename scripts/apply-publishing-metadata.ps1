param([string]$Root = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $Root 'data\publishing.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$site = $manifest.site
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function HtmlAttribute([string]$value) {
  return [System.Net.WebUtility]::HtmlEncode($value)
}

function AbsoluteUrl([string]$path) {
  if ($path -match '^https?://') { return $path }
  return "$($site.baseUrl)$($path.TrimStart('/'))"
}

function DisplayDate([string]$value) {
  $date = [DateTimeOffset]::Parse($value, [Globalization.CultureInfo]::InvariantCulture)
  return $date.ToString('d MMMM yyyy', [Globalization.CultureInfo]::GetCultureInfo('en-GB'))
}

foreach ($article in $manifest.articles) {
  $articlePath = Join-Path $Root $article.file
  if (-not (Test-Path -LiteralPath $articlePath)) {
    throw "Publishing metadata points to a missing article: $($article.file)"
  }

  $content = Get-Content -LiteralPath $articlePath -Raw -Encoding utf8
  $articleUrl = AbsoluteUrl $article.file
  $imageUrl = AbsoluteUrl $article.image
  $canonicalTitle = "$($article.headline) | IM News"

  $imageObject = [ordered]@{
    '@type' = 'ImageObject'
    url = $imageUrl
    creditText = $article.imageCredit
  }
  if (@($article.photographers).Count -gt 0) {
    $imageObject.creator = @($article.photographers | ForEach-Object {
      [ordered]@{ '@type' = 'Person'; name = $_ }
    })
  }

  $schema = [ordered]@{
    '@context' = 'https://schema.org'
    '@type' = 'NewsArticle'
    headline = $article.headline
    description = $article.description
    image = @($imageObject)
    datePublished = $article.published
    dateModified = $article.modified
    articleSection = $article.section
    author = [ordered]@{
      '@type' = 'Organization'
      name = $site.editorialAuthor
      url = $site.editorialAuthorUrl
    }
    publisher = [ordered]@{
      '@type' = 'NewsMediaOrganization'
      name = $site.publisherName
      url = $site.baseUrl
      logo = [ordered]@{
        '@type' = 'ImageObject'
        url = AbsoluteUrl $site.logo
      }
    }
    mainEntityOfPage = [ordered]@{
      '@type' = 'WebPage'
      '@id' = $articleUrl
    }
    isAccessibleForFree = $true
  }

  if (@($article.correspondents).Count -gt 0) {
    $schema.contributor = @($article.correspondents | ForEach-Object {
      [ordered]@{ '@type' = 'Person'; name = $_ }
    })
  }
  if (@($article.sourceUrls).Count -gt 0) {
    $schema.citation = @($article.sourceUrls)
  }

  $schemaJson = $schema | ConvertTo-Json -Depth 12 -Compress
  $metaBlock = @"
<!-- IMNEWS:PUBLISHING:START -->
<meta name="description" content="$(HtmlAttribute $article.description)">
<meta name="author" content="$(HtmlAttribute $site.editorialAuthor)">
<link rel="canonical" href="$(HtmlAttribute $articleUrl)">
<meta property="og:type" content="article">
<meta property="og:site_name" content="$(HtmlAttribute $site.publicationName)">
<meta property="og:title" content="$(HtmlAttribute $article.headline)">
<meta property="og:description" content="$(HtmlAttribute $article.description)">
<meta property="og:url" content="$(HtmlAttribute $articleUrl)">
<meta property="og:image" content="$(HtmlAttribute $imageUrl)">
<meta property="article:published_time" content="$(HtmlAttribute $article.published)">
<meta property="article:modified_time" content="$(HtmlAttribute $article.modified)">
<meta property="article:section" content="$(HtmlAttribute $article.section)">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$(HtmlAttribute $article.headline)">
<meta name="twitter:description" content="$(HtmlAttribute $article.description)">
<meta name="twitter:image" content="$(HtmlAttribute $imageUrl)">
<script type="application/ld+json" id="imnews-newsarticle">$schemaJson</script>
<!-- IMNEWS:PUBLISHING:END -->
"@

  $content = [regex]::Replace(
    $content,
    '(?s)\r?\n?<!-- IMNEWS:PUBLISHING:START -->.*?<!-- IMNEWS:PUBLISHING:END -->\r?\n?',
    "`r`n"
  )
  $content = [regex]::Replace($content, '(?im)^\s*<meta\s+name="(?:description|author)"[^>]*>\s*\r?\n?', '')
  $content = [regex]::Replace($content, '(?im)^\s*<link\s+rel="canonical"[^>]*>\s*\r?\n?', '')
  $content = [regex]::Replace($content, '(?im)^\s*<meta\s+property="(?:og:[^"]+|article:[^"]+)"[^>]*>\s*\r?\n?', '')
  $content = [regex]::Replace($content, '(?im)^\s*<meta\s+name="twitter:[^"]+"[^>]*>\s*\r?\n?', '')
  $content = [regex]::Replace($content, '(?is)\s*<script\s+type="application/ld\+json"[^>]*>.*?</script>\s*', "`r`n")
  $content = [regex]::Replace($content, '(?is)<title>.*?</title>', "<title>$(HtmlAttribute $canonicalTitle)</title>`r`n$metaBlock", 1)

  $visibleByline = "By <a href=`"editorial-standards.html`">$(HtmlAttribute $site.editorialAuthor)</a> <span aria-hidden=`"true`">&middot;</span> <time datetime=`"$(HtmlAttribute $article.published)`">$(DisplayDate $article.published)</time> <span aria-hidden=`"true`">&middot;</span> $(HtmlAttribute $article.location)"
  $content = [regex]::Replace(
    $content,
    '(?is)<div\s+class="article-byline"[^>]*>.*?</div>',
    "<div class=`"article-byline`">$visibleByline</div>",
    1
  )

  [IO.File]::WriteAllText($articlePath, $content, $utf8NoBom)
  Write-Output "Applied publishing metadata to $($article.file)"

  $sectionFile = if ($article.section -eq 'Sports') { 'sports.html' } elseif ($article.section -eq 'Culture') { 'culture.html' } else { $null }
  $gridMode = if ([string]::IsNullOrWhiteSpace([string]$article.gridMode)) { 'event' } else { [string]$article.gridMode }
  $publishedGridDate = [DateTimeOffset]::Parse($article.published, [Globalization.CultureInfo]::InvariantCulture).ToString('yyyy-MM-dd')
  $cardWasFoundInSection = $false
  foreach ($surfaceFile in @('index.html', $sectionFile) | Where-Object { $_ } | Select-Object -Unique) {
    $surfacePath = Join-Path $Root $surfaceFile
    $surfaceContent = Get-Content -LiteralPath $surfacePath -Raw -Encoding utf8
    $articleFilePattern = [regex]::Escape($article.file)
    $cardPattern = '(?is)(<div\s+class="story-card"(?<attrs>[^>]*)>)(?:(?!<div\s+class="story-card").)*?href="' + $articleFilePattern + '(?:[?#][^"]*)?"'
    $cardMatch = [regex]::Match($surfaceContent, $cardPattern)
    if (-not $cardMatch.Success) { continue }
    if ($surfaceFile -eq $sectionFile) { $cardWasFoundInSection = $true }
    $opening = $cardMatch.Groups[1].Value
    $attrs = $cardMatch.Groups['attrs'].Value
    if ($attrs -match '\sdata-event-date="[^"]*"') {
      $newOpening = [regex]::Replace($opening, '\sdata-event-date="[^"]*"', " data-event-date=`"$($article.eventDate)`"")
    } else {
      $newOpening = $opening.TrimEnd('>') + " data-event-date=`"$($article.eventDate)`">"
    }
    $newOpening = [regex]::Replace($newOpening, '\sdata-published-date="[^"]*"', '')
    $newOpening = [regex]::Replace($newOpening, '\sdata-grid-mode="[^"]*"', '')
    if ($gridMode -eq 'publication') {
      $newOpening = $newOpening.TrimEnd('>') + " data-published-date=`"$publishedGridDate`" data-grid-mode=`"publication`">"
    }
    $replacement = $newOpening + $cardMatch.Value.Substring($opening.Length)
    $surfaceContent = $surfaceContent.Substring(0, $cardMatch.Index) + $replacement + $surfaceContent.Substring($cardMatch.Index + $cardMatch.Length)
    [IO.File]::WriteAllText($surfacePath, $surfaceContent, $utf8NoBom)
    $effectiveGridDate = if ($gridMode -eq 'publication') { $publishedGridDate } else { $article.eventDate }
    Write-Output "Set $surfaceFile grid order for $($article.file) to $gridMode date $effectiveGridDate"
  }
  if ($sectionFile -and -not $cardWasFoundInSection) {
    throw "$($article.file) has no story card in $sectionFile."
  }
}

# The most recently published managed article is always the homepage lead and
# supplies the breaking-news ticker. Article-specific i18n files may translate
# these fields at runtime, while these canonical English values remain the
# source-of-truth fallback in index.html.
$latestArticle = $manifest.articles |
  Sort-Object { [DateTimeOffset]::Parse($_.published, [Globalization.CultureInfo]::InvariantCulture) } -Descending |
  Select-Object -First 1

if ($latestArticle) {
  $homePath = Join-Path $Root 'index.html'
  $homeLeadContent = Get-Content -LiteralPath $homePath -Raw -Encoding utf8
  $leadTag = if ([string]::IsNullOrWhiteSpace([string]$latestArticle.homepageTag)) { $latestArticle.section } else { [string]$latestArticle.homepageTag }
  $leadTagClass = if ([string]::IsNullOrWhiteSpace([string]$latestArticle.homepageTagClass)) { 'tag-general' } else { [string]$latestArticle.homepageTagClass }
  $leadAlt = if ([string]::IsNullOrWhiteSpace([string]$latestArticle.homepageAlt)) { $latestArticle.headline } else { [string]$latestArticle.homepageAlt }
  $breakingText = if ([string]::IsNullOrWhiteSpace([string]$latestArticle.breakingText)) { $latestArticle.description } else { [string]$latestArticle.breakingText }
  $leadByline = "By $($site.editorialAuthor) $([char]0x2014) $($latestArticle.location)"

  $homeLeadContent = [regex]::Replace($homeLeadContent, '(?is)(<a\s+href=")[^"]+("\s+style="text-decoration:none;">\s*<div\s+class="hero-story">)', "`${1}$($latestArticle.file)`${2}", 1)
  $homeLeadContent = [regex]::Replace($homeLeadContent, '(?is)<img\s+[^>]*data-edit-id="home-hero-image"[^>]*>', {
    param($match)
    $tag = [regex]::Replace($match.Value, '\ssrc="[^"]*"', " src=`"$(HtmlAttribute $latestArticle.image)`"", 1)
    $tag = [regex]::Replace($tag, '\salt="[^"]*"', " alt=`"$(HtmlAttribute $leadAlt)`"", 1)
    return $tag
  }, 1)
  $homeLeadContent = [regex]::Replace($homeLeadContent, '(?is)<span\s+class="tag\s+[^"]*"\s+data-edit-id="home-hero-tag"[^>]*>.*?</span>', "<span class=`"tag $(HtmlAttribute $leadTagClass)`" data-edit-id=`"home-hero-tag`" data-edit-type=`"text`">$(HtmlAttribute $leadTag)</span>", 1)
  $homeLeadContent = [regex]::Replace($homeLeadContent, '(?is)(<h1\s+data-edit-id="home-hero-title"[^>]*>).*?(</h1>)', "`${1}$(HtmlAttribute $latestArticle.headline)`${2}", 1)
  $homeLeadContent = [regex]::Replace($homeLeadContent, '(?is)(<p\s+data-edit-id="home-hero-deck"[^>]*>).*?(</p>)', "`${1}$(HtmlAttribute $latestArticle.description)`${2}", 1)
  $homeLeadContent = [regex]::Replace($homeLeadContent, '(?is)(<span\s+class="byline"\s+data-edit-id="home-hero-byline"[^>]*>).*?(</span>)', "`${1}$(HtmlAttribute $leadByline)`${2}", 1)
  $homeLeadContent = [regex]::Replace($homeLeadContent, '(?is)(<span\s+class="ticker-track"\s+data-edit-id="home-breaking-text"[^>]*>).*?(</span>)', "`${1}$(HtmlAttribute $breakingText)`${2}", 1)

  [IO.File]::WriteAllText($homePath, $homeLeadContent, $utf8NoBom)
  Write-Output "Set homepage lead and breaking ticker to $($latestArticle.file)"
}
