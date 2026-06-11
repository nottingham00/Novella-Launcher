// ─── Global state ────────────────────────────────────────────────
let library = { library: [] };
let ratings  = { ratings: {} };
let config   = { vndb_token: '', theme: 'auto', auto_check_updates: true };
let currentSelectedEntry = null;
let currentTheme = 'dark';

// ─── DOM refs ────────────────────────────────────────────────────
const libraryGrid           = document.getElementById('library-grid');
const filterInput           = document.getElementById('filter-input');
const sortSelect            = document.getElementById('sort-select');
const updateLibraryBtn      = document.getElementById('update-library-btn');
const vndbSearchBtn         = document.getElementById('vndb-search-btn');
const vndbSearchInput       = document.getElementById('vndb-search-input');
const detailCover           = document.getElementById('detail-cover');
const detailTitle           = document.getElementById('detail-title');
const detailInfo            = document.getElementById('detail-info');
const detailUserRating      = document.getElementById('detail-user-rating');
const detailDesc            = document.getElementById('detail-desc');
const detailTags            = document.getElementById('detail-tags');
const detailReviewSection   = document.getElementById('detail-review-section');
const detailReviewText      = document.getElementById('detail-review-text');
const setExeBtn             = document.getElementById('set-exe-btn');
const launchBtn             = document.getElementById('launch-btn');
const rateBtn               = document.getElementById('rate-btn');
const removeBtn             = document.getElementById('remove-btn');
const versionSpan           = document.getElementById('version-display');
const checkUpdatesSettingsBtn = document.getElementById('check-updates-settings');
const vndbTokenInput        = document.getElementById('vndb-token');
const themeSelect           = document.getElementById('theme-select');
const autoUpdateCheckbox    = document.getElementById('auto-update-checkbox');
const syncVndbCheckbox      = document.getElementById('sync-vndb-checkbox');
const testVndbTokenBtn      = document.getElementById('test-vndb-token-btn');
const bulkSyncBtn           = document.getElementById('bulk-sync-btn');
const bulkSyncStatus        = document.getElementById('bulk-sync-status');
const saveSettingsBtn       = document.getElementById('save-settings-btn');
const emptyState            = document.getElementById('empty-state');
const toastContainer        = document.getElementById('toast-container');

// Modals & progress
const searchResultsModal    = document.getElementById('search-results-modal');
const searchResultsList     = document.getElementById('search-results-list');
const searchModalCancel     = document.getElementById('search-modal-cancel');
const ratingModal           = document.getElementById('rating-modal');
const ratingScore           = document.getElementById('rating-score');
const ratingStatus          = document.getElementById('rating-status');
const ratingReview          = document.getElementById('rating-review');
const ratingSaveBtn         = document.getElementById('rating-save');
const ratingCancelBtn       = document.getElementById('rating-cancel');
const scoreDisplay          = document.getElementById('score-display');
const updateProgressContainer = document.getElementById('update-progress-container');
const updateProgressBar     = document.getElementById('update-progress-bar');
const updateProgressText    = document.getElementById('update-progress-text');

// Titlebar
const tbMinimize = document.getElementById('tb-minimize');
const tbMaximize = document.getElementById('tb-maximize');
const tbClose    = document.getElementById('tb-close');

// ─── Custom titlebar controls ─────────────────────────────────────
function setupTitlebar() {
  tbMinimize.addEventListener('click', () => window.electronAPI.windowMinimize());
  tbMaximize.addEventListener('click', () => window.electronAPI.windowMaximize());
  tbClose.addEventListener('click',    () => window.electronAPI.windowClose());

  // Sync the maximise / restore icon on startup and on state changes from main
  window.electronAPI.windowIsMaximized().then(setMaximizeIcon);
  window.electronAPI.onWindowMaximized(setMaximizeIcon);
}

function setMaximizeIcon(isMaximized) {
  const iconMax     = tbMaximize.querySelector('.icon-maximise');
  const iconRestore = tbMaximize.querySelector('.icon-restore');
  if (iconMax)     iconMax.style.display     = isMaximized ? 'none'  : 'block';
  if (iconRestore) iconRestore.style.display = isMaximized ? 'block' : 'none';
}

// ─── Toast notifications ──────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(4px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Confirmation dialog
function showConfirm(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:3000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--bg-2);border:1px solid var(--border-mid);border-radius:var(--radius-lg);padding:24px;max-width:360px;width:90%;z-index:1;position:relative;animation:modalIn 0.2s ease;">
        <p style="font-size:14px;color:var(--text-1);line-height:1.6;margin-bottom:20px;">${message}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="conf-cancel" style="padding:8px 16px;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-2);font-family:var(--font-ui);font-size:13px;cursor:pointer;">Cancel</button>
          <button id="conf-ok" style="padding:8px 16px;background:var(--danger);border:none;border-radius:var(--radius-md);color:#fff;font-family:var(--font-ui);font-size:13px;font-weight:600;cursor:pointer;">Remove</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#conf-ok').onclick     = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#conf-cancel').onclick = () => { overlay.remove(); resolve(false); };
  });
}

// ─── Utilities ───────────────────────────────────────────────────
function getDirPath(filePath) {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSlash === -1 ? '' : filePath.substring(0, lastSlash);
}

function cleanHtml(text) {
  if (!text) return '';
  return text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+(>|$)/g, '').trim();
}

function mergeRatings() {
  for (const entry of library.library) {
    entry.user_rating = ratings.ratings[entry.vndb_id] || null;
  }
}

function statusClass(status) {
  const map = { 'Playing': 'playing', 'Completed': 'completed', 'Dropped': 'dropped', 'On Hold': 'hold', 'Not Started': 'notstarted' };
  return map[status] || 'notstarted';
}

// ─── Sort ────────────────────────────────────────────────────────
function sortLibrary(entries, mode) {
  const copy = [...entries];
  const statusOrder = { Playing:0, Completed:1, 'On Hold':2, Dropped:3, 'Not Started':4 };
  switch (mode) {
    case 'Title (A-Z)':             return copy.sort((a,b) => a.title.localeCompare(b.title));
    case 'Title (Z-A)':             return copy.sort((a,b) => b.title.localeCompare(a.title));
    case 'My Rating (High-Low)':    return copy.sort((a,b) => (b.user_rating?.score ?? -1) - (a.user_rating?.score ?? -1));
    case 'My Rating (Low-High)':    return copy.sort((a,b) => (a.user_rating?.score ?? -1) - (b.user_rating?.score ?? -1));
    case 'VNDB Rating (High-Low)':  return copy.sort((a,b) => (b.rating || 0) - (a.rating || 0));
    case 'VNDB Rating (Low-High)':  return copy.sort((a,b) => (a.rating || 0) - (b.rating || 0));
    case 'Playtime (High-Low)':     return copy.sort((a,b) => (b.playtime_minutes||0) - (a.playtime_minutes||0));
    case 'Playtime (Low-High)':     return copy.sort((a,b) => (a.playtime_minutes||0) - (b.playtime_minutes||0));
    case 'Last Played (Recent)':    return copy.sort((a,b) => (b.last_played||0) - (a.last_played||0));
    case 'Last Played (Oldest)':    return copy.sort((a,b) => (a.last_played||0) - (b.last_played||0));
    case 'Status':                  return copy.sort((a,b) => statusOrder[a.user_rating?.status||'Not Started'] - statusOrder[b.user_rating?.status||'Not Started']);
    case 'Recently Added':          return copy.sort((a,b) => (b.added_at||0) - (a.added_at||0));
    default: return copy;
  }
}

// ─── Grid ────────────────────────────────────────────────────────
async function refreshGrid() {
  const filter = filterInput.value.toLowerCase();
  let filtered = library.library.filter(e => e.title.toLowerCase().includes(filter));
  filtered = sortLibrary(filtered, sortSelect.value);

  for (const card of libraryGrid.querySelectorAll('.vn-card')) {
    card.style.transition = 'opacity 0.12s';
    card.style.opacity = '0';
  }
  await new Promise(r => setTimeout(r, 120));

  libraryGrid.innerHTML = '';

  if (filtered.length === 0) {
    const es = document.createElement('div');
    es.className = 'empty-state';
    es.innerHTML = `
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="40" height="40"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg></div>
      <p class="empty-title">${library.library.length === 0 ? 'Your library is empty' : 'No results'}</p>
      <p class="empty-sub">${library.library.length === 0 ? 'Search VNDB above to add visual novels' : 'Try a different search term'}</p>`;
    libraryGrid.appendChild(es);
    return;
  }

  for (const entry of filtered) {
    libraryGrid.appendChild(createVNCard(entry));
  }
}

function createVNCard(entry) {
  const card = document.createElement('div');
  card.className = 'vn-card';
  if (currentSelectedEntry?.vndb_id === entry.vndb_id) card.classList.add('selected');
  card.addEventListener('click', () => selectEntry(entry));

  // Cover
  if (entry.cover_path && entry.cover_path !== '') {
    const img = document.createElement('img');
    img.className = 'card-cover';
    img.src = `file://${entry.cover_path}`;
    img.alt = entry.title;
    img.onerror = () => { img.replaceWith(coverPlaceholder()); };
    card.appendChild(img);
  } else {
    card.appendChild(coverPlaceholder());
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  const titleEl = document.createElement('div');
  titleEl.className = 'card-title';
  titleEl.textContent = entry.title;
  body.appendChild(titleEl);

  const userScore  = entry.user_rating?.score;
  const vndbRating = entry.rating;
  const ratingEl   = document.createElement('div');
  ratingEl.className = 'card-rating';
  if (userScore != null) {
    ratingEl.textContent = `★ ${userScore}/10${vndbRating ? ` · ${vndbRating.toFixed(1)}` : ''}`;
  } else if (vndbRating) {
    ratingEl.textContent = `${vndbRating.toFixed(1)} VNDB`;
    ratingEl.style.color = 'var(--text-3)';
  } else {
    ratingEl.textContent = 'unrated';
    ratingEl.style.color = 'var(--text-3)';
  }
  body.appendChild(ratingEl);

  const status = entry.user_rating?.status || 'Not Started';
  const metaEl = document.createElement('div');
  metaEl.className = 'card-meta';
  metaEl.innerHTML = `<span class="status-dot ${statusClass(status)}"></span>${status}`;
  body.appendChild(metaEl);

  card.appendChild(body);
  return card;
}

function coverPlaceholder() {
  const ph = document.createElement('div');
  ph.className = 'card-cover-placeholder';
  ph.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="28" height="28"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`;
  return ph;
}

// ─── Detail Panel ────────────────────────────────────────────────
function selectEntry(entry) {
  currentSelectedEntry = entry;
  document.querySelectorAll('.vn-card').forEach(c => c.classList.remove('selected'));
  event?.currentTarget?.classList.add('selected');
  updateDetailsPanel(entry);
}

function updateDetailsPanel(entry) {
  detailTitle.textContent = entry.title;

  detailUserRating.innerHTML = '';
  if (entry.user_rating?.score != null) {
    const scoreEl = document.createElement('span');
    scoreEl.className = 'rating-score';
    scoreEl.textContent = `★ ${entry.user_rating.score}/10`;
    const statusEl = document.createElement('span');
    statusEl.className = 'rating-label';
    statusEl.textContent = ` · ${entry.user_rating.status || 'Not Started'}`;
    detailUserRating.appendChild(scoreEl);
    detailUserRating.appendChild(statusEl);
  } else {
    const el = document.createElement('span');
    el.className = 'rating-label';
    el.textContent = 'Not rated';
    detailUserRating.appendChild(el);
  }

  detailTags.innerHTML = '';
  if (entry.tags?.length) {
    for (const tag of entry.tags.slice(0, 8)) {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = tag;
      detailTags.appendChild(pill);
    }
  }

  detailInfo.innerHTML = '';
  const metas = [
    ['VNDB ID',   entry.vndb_id],
    ['Released',  entry.released || 'Unknown'],
    ['VNDB',      entry.rating ? `${entry.rating.toFixed(2)} (${entry.votecount || 0} votes)` : 'N/A'],
    ['Playtime',  `${entry.playtime_minutes || 0} min`],
    ['Developer', entry.developers?.join(', ') || 'Unknown'],
    ['EXE',       entry.exe_path || 'Not set'],
  ];
  for (const [key, val] of metas) {
    const row = document.createElement('div');
    row.className = 'meta-row';
    row.innerHTML = `<span class="meta-key">${key}</span><span class="meta-val">${val}</span>`;
    detailInfo.appendChild(row);
  }

  if (entry.user_rating?.review) {
    detailReviewSection.style.display = 'flex';
    detailReviewText.textContent = entry.user_rating.review;
  } else {
    detailReviewSection.style.display = 'none';
  }

  detailDesc.textContent = entry.description || 'No description available.';

  if (entry.cover_path && entry.cover_path !== '') {
    detailCover.innerHTML = `<img src="file://${entry.cover_path}" alt="${entry.title}">`;
  } else {
    detailCover.innerHTML = `<div class="cover-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="40" height="40"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg><span>No cover</span></div>`;
  }
}

function resetDetailsPanel() {
  detailTitle.textContent = '—';
  detailUserRating.innerHTML = '<span class="rating-label">Not rated</span>';
  detailTags.innerHTML = '';
  detailInfo.innerHTML = '';
  detailReviewSection.style.display = 'none';
  detailDesc.textContent = 'Select a visual novel to see details.';
  detailCover.innerHTML = `<div class="cover-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="40" height="40"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg><span>Select a visual novel</span></div>`;
}

// ─── VNDB Search ─────────────────────────────────────────────────
async function onVndbSearch() {
  const query = vndbSearchInput.value.trim();
  if (!query) return;
  const token = config.vndb_token;
  if (!token) { showToast('Set your VNDB token in Settings first.', 'error'); return; }
  vndbSearchBtn.disabled = true;
  vndbSearchBtn.classList.add('loading');
  try {
    const results = await window.electronAPI.vndbSearch(token, query);
    if (!results.length) { showToast('No results found.', 'info'); return; }
    if (results.length === 1) {
      const details = await window.electronAPI.vndbDetails(token, results[0].id);
      if (details) await addVnToLibrary(details);
    } else {
      showSearchResultsModal(results, token);
    }
  } catch (err) {
    showToast(`Search error: ${err.message}`, 'error');
  } finally {
    vndbSearchBtn.disabled = false;
    vndbSearchBtn.classList.remove('loading');
  }
}

function showSearchResultsModal(results, token) {
  searchResultsList.innerHTML = '';
  for (const vn of results) {
    const item = document.createElement('div');
    item.className = 'search-result-item';

    const img = document.createElement('img');
    img.className = 'result-cover';
    img.src = vn.image?.url || '';
    img.onerror = () => { img.style.display = 'none'; };
    img.alt = vn.title;
    item.appendChild(img);

    const info = document.createElement('div');
    info.className = 'result-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'result-title';
    titleEl.textContent = vn.title;
    info.appendChild(titleEl);

    if (vn.alttitle) {
      const alt = document.createElement('div');
      alt.className = 'result-alt';
      alt.textContent = vn.alttitle;
      info.appendChild(alt);
    }

    const meta = document.createElement('div');
    meta.className = 'result-meta';
    meta.textContent = `${vn.released?.slice(0,4) || '?'} · ${vn.rating ? vn.rating.toFixed(2) : 'N/A'}`;
    info.appendChild(meta);

    item.appendChild(info);
    item.addEventListener('click', async () => {
      searchResultsModal.style.display = 'none';
      const details = await window.electronAPI.vndbDetails(token, vn.id);
      if (details) await addVnToLibrary(details);
    });
    searchResultsList.appendChild(item);
  }
  searchResultsModal.style.display = 'flex';
}

searchModalCancel.onclick = () => { searchResultsModal.style.display = 'none'; };
searchResultsModal.querySelector('.modal-backdrop').onclick = () => { searchResultsModal.style.display = 'none'; };

async function addVnToLibrary(vnData) {
  if (library.library.some(e => e.vndb_id === vnData.id)) {
    showToast('Already in your library.', 'info');
    return;
  }
  let coverPath = '';
  if (vnData.image?.url) {
    try { coverPath = await window.electronAPI.downloadCover(vnData.image.url, vnData.id); } catch(e) { console.warn(e); }
  }
  const newEntry = {
    vndb_id:          vnData.id,
    title:            vnData.title,
    alttitle:         vnData.alttitle || '',
    released:         vnData.released || 'Unknown',
    rating:           vnData.rating || null,
    votecount:        vnData.votecount || 0,
    description:      cleanHtml(vnData.description || ''),
    exe_path:         '',
    install_dir:      '',
    cover_path:       coverPath || '',
    added_at:         Math.floor(Date.now() / 1000),
    last_played:      0,
    playtime_minutes: 0,
    tags:             (vnData.tags || []).slice(0,10).map(t => t.name),
    developers:       (vnData.developers || []).slice(0,5).map(d => d.name)
  };
  library.library.push(newEntry);
  await window.electronAPI.saveLibrary(library);
  refreshGrid();
  showToast(`${vnData.title} added to library.`, 'success');
}

// ─── Library Update ───────────────────────────────────────────────
async function updateLibraryData() {
  if (!config.vndb_token) { showToast('VNDB token missing. Check Settings.', 'error'); return; }
  if (library.library.length === 0) { showToast('Library is empty.', 'info'); return; }
  updateLibraryBtn.disabled = true;
  updateLibraryBtn.classList.add('loading');
  updateProgressContainer.style.display = 'block';
  updateProgressBar.style.width = '0%';
  let updated = 0;
  for (let i = 0; i < library.library.length; i++) {
    const entry = library.library[i];
    updateProgressText.textContent = `Updating: ${entry.title}`;
    const percent = Math.round((i / library.library.length) * 100);
    updateProgressBar.style.width = `${percent}%`;
    try {
      const details = await window.electronAPI.vndbDetails(config.vndb_token, entry.vndb_id);
      if (details) {
        entry.title       = details.title;
        entry.alttitle    = details.alttitle || '';
        entry.released    = details.released;
        entry.rating      = details.rating;
        entry.votecount   = details.votecount;
        entry.description = cleanHtml(details.description || '');
        if (details.image?.url && !entry.cover_path) {
          const newCover = await window.electronAPI.downloadCover(details.image.url, entry.vndb_id);
          if (newCover) entry.cover_path = newCover;
        }
        entry.last_updated = Math.floor(Date.now() / 1000);
        updated++;
      }
    } catch (err) { console.warn(`Failed ${entry.title}:`, err); }
    await new Promise(r => setTimeout(r, 500));
  }
  updateProgressBar.style.width = '100%';
  await window.electronAPI.saveLibrary(library);
  refreshGrid();
  if (currentSelectedEntry) updateDetailsPanel(currentSelectedEntry);
  updateProgressContainer.style.display = 'none';
  updateLibraryBtn.disabled = false;
  updateLibraryBtn.classList.remove('loading');
  showToast(`Library updated: ${updated} of ${library.library.length} refreshed.`, 'success');
}

// ─── Rating Modal ────────────────────────────────────────────────
ratingScore.addEventListener('input', () => {
  scoreDisplay.textContent = ratingScore.value;
});

function openRatingModal(entry) {
  const ur = entry.user_rating || {};
  ratingScore.value = ur.score ?? 0;
  scoreDisplay.textContent = ratingScore.value;
  ratingStatus.value = ur.status || 'Not Started';
  ratingReview.value = ur.review || '';
  document.getElementById('rating-modal-title').textContent = `Rate — ${entry.title}`;
  ratingModal.style.display = 'flex';

  const saveHandler = async () => {
    const newRating = {
      score:      parseFloat(ratingScore.value),
      status:     ratingStatus.value,
      review:     ratingReview.value,
      date_rated: new Date().toISOString()
    };
    ratings.ratings[entry.vndb_id] = newRating;
    await window.electronAPI.saveRatings(ratings);
    entry.user_rating = newRating;
    await window.electronAPI.saveLibrary(library);
    // Sync to VNDB if enabled (non-blocking; errors shown as toasts)
    await syncRatingToVndb(entry, newRating);
    refreshGrid();
    if (currentSelectedEntry?.vndb_id === entry.vndb_id) updateDetailsPanel(entry);
    ratingModal.style.display = 'none';
    showToast('Rating saved.', 'success');
  };

  ratingSaveBtn.addEventListener('click', saveHandler, { once: true });
}

ratingCancelBtn.onclick = () => { ratingModal.style.display = 'none'; };
ratingModal.querySelector('.modal-backdrop').onclick = () => { ratingModal.style.display = 'none'; };

// ─── EXE / Launch ────────────────────────────────────────────────
async function onSetExe() {
  if (!currentSelectedEntry) { showToast('Select a VN first.', 'info'); return; }
  const exePath = await window.electronAPI.selectExe();
  if (exePath) {
    currentSelectedEntry.exe_path    = exePath;
    currentSelectedEntry.install_dir = getDirPath(exePath);
    await window.electronAPI.saveLibrary(library);
    refreshGrid();
    updateDetailsPanel(currentSelectedEntry);
    showToast('Executable path set.', 'success');
  }
}

async function onLaunch() {
  if (!currentSelectedEntry) return;
  const exe = currentSelectedEntry.exe_path;
  if (!exe) { showToast('Set an EXE path first.', 'error'); return; }

  currentSelectedEntry.last_played = Math.floor(Date.now() / 1000);

  if (!currentSelectedEntry.user_rating || currentSelectedEntry.user_rating.status === 'Not Started') {
    if (!currentSelectedEntry.user_rating) currentSelectedEntry.user_rating = {};
    currentSelectedEntry.user_rating.status = 'Playing';
    ratings.ratings[currentSelectedEntry.vndb_id] = currentSelectedEntry.user_rating;
    await window.electronAPI.saveRatings(ratings);
  }
  await window.electronAPI.saveLibrary(library);
  try {
    await window.electronAPI.launchGame(exe, currentSelectedEntry.install_dir || getDirPath(exe));
    window.electronAPI.showNotification({ title: 'Launched', body: currentSelectedEntry.title });
    refreshGrid();
    updateDetailsPanel(currentSelectedEntry);
  } catch (err) {
    showToast(`Launch failed: ${err.message}`, 'error');
  }
}

async function onRemove() {
  if (!currentSelectedEntry) return;
  const ok = await showConfirm(`Remove "<strong>${currentSelectedEntry.title}</strong>" from your library?`);
  if (ok) {
    const vnId = currentSelectedEntry.vndb_id;
    library.library = library.library.filter(e => e.vndb_id !== vnId);
    delete ratings.ratings[vnId];
    await window.electronAPI.saveLibrary(library);
    await window.electronAPI.saveRatings(ratings);
    await deleteFromVndb(vnId);
    currentSelectedEntry = null;
    refreshGrid();
    resetDetailsPanel();
    showToast('Removed from library.', 'info');
  }
}

// ─── Theme ───────────────────────────────────────────────────────
async function applyTheme(theme) {
  let effective = theme;
  if (effective === 'auto') effective = await window.electronAPI.getSystemTheme();
  currentTheme = effective;
  document.body.classList.remove('light', 'dark');
  document.body.classList.add(effective);
}

async function onThemeSelectChange() {
  const selected = themeSelect.value;
  await applyTheme(selected);
  config.theme = selected;
  await window.electronAPI.saveConfig(config);
}

// ─── Settings ────────────────────────────────────────────────────
async function saveSettings() {
  config.vndb_token         = vndbTokenInput.value.trim();
  config.theme              = themeSelect.value;
  config.auto_check_updates = autoUpdateCheckbox.checked;
  config.sync_to_vndb       = syncVndbCheckbox.checked;
  await window.electronAPI.saveConfig(config);
  await applyTheme(config.theme);
  showToast('Settings saved.', 'success');
}

async function checkForUpdates() {
  checkUpdatesSettingsBtn.disabled = true;
  checkUpdatesSettingsBtn.classList.add('loading');
  const updateInfo = await window.electronAPI.checkUpdates();
  checkUpdatesSettingsBtn.disabled = false;
  checkUpdatesSettingsBtn.classList.remove('loading');
  if (updateInfo.hasUpdate) {
    const ok = await showConfirm(`Version ${updateInfo.version} is available. Open download page?`);
    if (ok) window.electronAPI.openExternal(updateInfo.downloadUrl);
  } else {
    showToast('You are up to date.', 'success');
  }
}

// ─── VNDB Sync helpers ────────────────────────────────────────────
// Pushes a rating to the user's VNDB list. Silently no-ops when sync is off.
async function syncRatingToVndb(entry, rating) {
  if (!config.sync_to_vndb || !config.vndb_token) return;
  try {
    await window.electronAPI.vndbUlistSet(
      config.vndb_token,
      entry.vndb_id,
      rating.score,
      rating.review || ''
    );
    showToast('Synced to VNDB.', 'success');
  } catch (err) {
    // Surface the most useful part of VNDB error responses
    const detail = err?.response?.data?.message || err.message;
    showToast(`VNDB sync failed: ${detail}`, 'error');
  }
}

// Removes the entry from the user's VNDB list when removed locally.
async function deleteFromVndb(vnId) {
  if (!config.sync_to_vndb || !config.vndb_token) return;
  try {
    await window.electronAPI.vndbUlistDelete(config.vndb_token, vnId);
  } catch (err) {
    // 404 means it wasn't on VNDB list at all — not an error worth showing
    if (err?.response?.status !== 404) {
      showToast(`VNDB remove failed: ${err?.response?.data?.message || err.message}`, 'error');
    }
  }
}

// Validates the token and checks that listwrite permission is granted.
async function testVndbToken() {
  const token = vndbTokenInput.value.trim();
  if (!token) { showToast('Enter a token first.', 'error'); return; }
  testVndbTokenBtn.disabled = true;
  testVndbTokenBtn.classList.add('loading');
  try {
    const res = await window.electronAPI.vndbAuthInfo(token);
    if (!res || !res.id) {
      showToast('Token invalid or expired.', 'error');
      return;
    }
    const perms = res.permissions || [];
    const hasWrite = perms.includes('listwrite');
    if (hasWrite) {
      showToast(`✓ Token valid (${res.username}). listwrite permission confirmed.`, 'success', 5000);
    } else {
      showToast(`Token valid (${res.username}), but missing listwrite — sync will fail.`, 'error', 6000);
    }
  } catch (err) {
    showToast(`Token check failed: ${err?.response?.data?.message || err.message}`, 'error');
  } finally {
    testVndbTokenBtn.disabled = false;
    testVndbTokenBtn.classList.remove('loading');
  }
}


// Bulk-pushes every locally-rated entry to the user's VNDB list.
// Works regardless of whether sync_to_vndb is toggled — this is an explicit one-shot action.
async function bulkSyncToVndb() {
  const token = config.vndb_token;
  if (!token) { showToast('Set your VNDB token in Settings first.', 'error'); return; }

  // Include ALL library entries that have a score, even uninstalled ones
  const rated = library.library.filter(e => e.user_rating?.score != null);
  if (rated.length === 0) { showToast('No rated entries to sync.', 'info'); return; }

  bulkSyncBtn.disabled = true;
  bulkSyncBtn.classList.add('loading');
  bulkSyncStatus.style.display = 'block';
  bulkSyncStatus.style.color = 'var(--text-2)';
  bulkSyncStatus.textContent = `Starting sync for ${rated.length} entr${rated.length === 1 ? 'y' : 'ies'}…`;

  let synced = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < rated.length; i++) {
    const entry = rated[i];
    const ur    = entry.user_rating;
    bulkSyncStatus.textContent = `Syncing ${i + 1} / ${rated.length} — ${entry.title}`;
    try {
      await window.electronAPI.vndbUlistSet(token, entry.vndb_id, ur.score, ur.review || '');
      synced++;
    } catch (err) {
      failed++;
      const detail = err?.response?.data?.message || err.message;
      errors.push(`${entry.title}: ${detail}`);
      console.warn('Bulk sync failed for', entry.title, detail);
    }
    // 300 ms between requests to be respectful to the VNDB API
    await new Promise(r => setTimeout(r, 300));
  }

  bulkSyncBtn.disabled = false;
  bulkSyncBtn.classList.remove('loading');

  if (failed === 0) {
    bulkSyncStatus.style.color = 'var(--success)';
    bulkSyncStatus.textContent = `✓ All ${synced} entr${synced === 1 ? 'y' : 'ies'} synced successfully.`;
    showToast(`Synced ${synced} entries to VNDB.`, 'success');
  } else {
    bulkSyncStatus.style.color = 'var(--danger)';
    bulkSyncStatus.textContent = `${synced} synced, ${failed} failed — open DevTools console for details.`;
    showToast(`Sync done: ${synced} ok, ${failed} failed.`, 'error');
    console.error('Bulk sync errors:\n' + errors.join('\n'));
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`${tabId}-tab`).classList.add('active');
  document.querySelector(`.nav-item[data-tab="${tabId}"]`).classList.add('active');
}

// ─── Init ────────────────────────────────────────────────────────
async function init() {
  setupTitlebar();

  config  = await window.electronAPI.loadConfig();
  library = await window.electronAPI.loadLibrary();
  ratings = await window.electronAPI.loadRatings();
  mergeRatings();

  vndbTokenInput.value       = config.vndb_token || '';
  themeSelect.value          = config.theme || 'auto';
  autoUpdateCheckbox.checked = config.auto_check_updates !== false;
  syncVndbCheckbox.checked   = config.sync_to_vndb === true;

  const version = '1.0.1';
  if (versionSpan) versionSpan.textContent = version;
  const vd2 = document.getElementById('version-display-settings');
  if (vd2) vd2.textContent = version;

  await applyTheme(config.theme);
  refreshGrid();

  // Event listeners
  filterInput.addEventListener('input', refreshGrid);
  sortSelect.addEventListener('change', refreshGrid);
  vndbSearchBtn.addEventListener('click', onVndbSearch);
  vndbSearchInput.addEventListener('keydown', e => { if (e.key === 'Enter') onVndbSearch(); });
  updateLibraryBtn.addEventListener('click', updateLibraryData);
  setExeBtn.addEventListener('click', onSetExe);
  launchBtn.addEventListener('click', onLaunch);
  rateBtn.addEventListener('click', () => { if (currentSelectedEntry) openRatingModal(currentSelectedEntry); });
  removeBtn.addEventListener('click', onRemove);
  saveSettingsBtn.addEventListener('click', saveSettings);
  themeSelect.addEventListener('change', onThemeSelectChange);
  checkUpdatesSettingsBtn.addEventListener('click', checkForUpdates);
  testVndbTokenBtn.addEventListener('click', testVndbToken);
  bulkSyncBtn.addEventListener('click', bulkSyncToVndb);

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  window.electronAPI.onMenuCheckUpdates(() => checkForUpdates());
  window.electronAPI.onMenuUpdateLibrary(() => updateLibraryData());
  // Re-read config.theme at call time rather than closing over the initial value
  window.electronAPI.onSystemThemeChanged(() => {
    if (config.theme === 'auto') applyTheme('auto');
  });
}

init();
