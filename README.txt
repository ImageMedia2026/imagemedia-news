IMAGE MEDIA NEWS — OFFLINE NEWS SITE CONCEPT
=================================================

WHAT THIS IS
A concept-stage sports (+ occasional culture/concerts) news site: seven
static pages with a built-in edit mode, so a non-technical editor can
update headlines, images, links, and add or remove story cards directly
in the browser — no code, no server, no account.

HOW TO OPEN IT
Double-click index.html to open it in any browser. Click through Sports,
Culture & Concerts, an article, and About from the top menu. Works fully
offline.

HOW TO EDIT
1. Click "Edit this page" (bottom-right corner).
2. Click any headline, deck or text to type directly into it.
3. Hover an image and choose "Upload photo" or "paste an image URL" —
   every story card is designed to always carry an image.
4. Next to any link, click the small pencil (✎) badge to change its
   destination.
5. On Home / Sports / Culture, use "+ Add story" to create a new card, or
   the red × on a card to remove it.
6. Click "Done editing" when finished.

SAVING YOUR WORK
Edits save automatically in this browser's local storage, tied to this
computer and browser. They are NOT written into the HTML files and are
NOT shared across browsers/computers on their own.

To back up or move your edits:
  - "Export backup" (bottom bar) → downloads a .json file.
  - On another browser/computer, open any page and use "Import backup"
    with that file.

"Reset this page" clears edits on the current page back to placeholder
defaults (with confirmation).

LANGUAGES
The site speaks English, Portuguese, Spanish, French and Italian — the
same five languages as imagemedia.one. On first visit it auto-detects the
visitor's browser/OS language and falls back to English if it's not one
of the five. Anyone can override it with the flag switcher in the header
(🇬🇧 🇵🇹 🇪🇸 🇫🇷 🇮🇹); the choice is remembered in this browser.

Every piece of UI chrome (nav, buttons, tags, toolbar) and every sample
headline/article is translated. If you edit text while a language is
active, that edit is saved for THAT language only — switching languages
does not overwrite the other four. Story cards you add/remove are shared
across all languages (only the words differ); new cards you add show
generic English placeholders since there's no live translation service
wired in — type the real headline in each language separately if needed.
"Reset this page" and "Export/Import backup" cover all five languages'
edits together, not just the one currently showing.

CONTENT NOTE
All headlines, bylines and images are fictitious placeholders — invented
to preview the layout, not real reporting. The brand is Image Media
News (logo text lives in the header/footer on every page).

FILES
index.html         Home
sports.html        Sports section (filterable by discipline)
culture.html       Culture & Concerts section
article-1.html     Sample article — sports feature
article-2.html     Sample article — sports news (shorter)
article-3.html     Sample article — culture/concert feature
about.html         Masthead / editorial focus / newsroom contact
assets/style.css   All styling (light, modern-tabloid theme)
assets/i18n.js     English/Portuguese/Spanish/French/Italian translations
assets/app.js      Edit-mode + language engine (no external dependencies)
