// ─── Global state ────────────────────────────────────────────────
let library = { library: [] };
let ratings  = { ratings: {} };
let config   = { vndb_token: '', theme: 'auto', auto_check_updates: true, sync_to_vndb: false, collections: [] };
let currentSelectedEntry = null;
let currentTheme = 'dark';
let selectedCards = new Set();
let fuse = null;
let activeFilters = { status: null, minRating: null, minPlaytime: null };

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
const toastContainer        = document.getElementById('toast-container');
const batchDeleteBtn        = document.getElementById('batch-delete-btn');
const filterChips           = document.querySelectorAll('.filter-chip');
const clearFiltersBtn       = document.getElementById('clear-filters');
const customTagsList        = document.getElementById('custom-tags-list');
const newTagInput           = document.getElementById('new-tag-input');
const addTagBtn             = document.getElementById('add-tag-btn');
const collectionsList       = document.getElementById('collections-list');
const collectionSelect      = document.getElementById('collection-select');
const addToCollectionBtn    = document.getElementById('add-to-collection-btn');
const manageCollectionsBtn  = document.getElementById('manage-collections-btn');
const launchArgsInput       = document.getElementById('launch-args');
const launchCwdInput        = document.getElementById('launch-cwd');
const saveLaunchOptionsBtn  = document.getElementById('save-launch-options');
const launchOptionsSection  = document.getElementById('launch-options-section');
const backupBtn             = document.getElementById('backup-btn');
const restoreBtn            = document.getElementById('restore-btn');
const importVndbListBtn     = document.getElementById('import-vndb-list-btn');

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
  window.electronAPI.windowIsMaximized().then(setMaximizeIcon);
  window.electronAPI.onWindowMaximized(setMaximizeIcon);
}
function setMaximizeIcon(isMaximized) {
  const iconMax = tbMaximize.querySelector('.icon-maximise');
  const iconRestore = tbMaximize.querySelector('.icon-restore');
  if (iconMax) iconMax.style.display = isMaximized ? 'none' : 'block';
  if (iconRestore) iconRestore.style.display = isMaximized ? 'block' : 'none';
}

// ─── Toast & confirm ──────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(4px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
function showConfirm(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:3000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `<div style="background:var(--bg-2);border-radius:var(--radius-lg);padding:24px;max-width:360px;"><p style="margin-bottom:20px;">${message}</p><div style="display:flex;gap:8px;justify-content:flex-end;"><button id="conf-cancel">Cancel</button><button id="conf-ok">Remove</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#conf-ok').onclick = () => { overlay.remove(); resolve(true); };
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

// ─── Advanced search with Fuse.js ────────────────────────────────
function rebuildFuse() {
  fuse = new Fuse(library.library, { keys: ['title', 'alttitle', 'developers', 'tags'], threshold: 0.3 });
}
function applyAdvancedFilters(entries) {
  let filtered = entries;
  if (activeFilters.status) {
    filtered = filtered.filter(e => (e.user_rating?.status || 'Not Started') === activeFilters.status);
  }
  if (activeFilters.minRating) {
    filtered = filtered.filter(e => (e.user_rating?.score || 0) >= activeFilters.minRating);
  }
  if (activeFilters.minPlaytime) {
    filtered = filtered.filter(e => (e.playtime_minutes || 0) >= activeFilters.minPlaytime);
  }
  return filtered;
}
function sortLibrary(entries, mode) {
  const copy = [...entries];
  const statusOrder = { Playing:0, Completed:1, 'On Hold':2, Dropped:3, 'Not Started':4 };
  switch (mode) {
    case 'Title (A-Z)': return copy.sort((a,b) => a.title.localeCompare(b.title));
    case 'Title (Z-A)': return copy.sort((a,b) => b.title.localeCompare(a.title));
    case 'My Rating (High-Low)': return copy.sort((a,b) => (b.user_rating?.score ?? -1) - (a.user_rating?.score ?? -1));
    case 'My Rating (Low-High)': return copy.sort((a,b) => (a.user_rating?.score ?? -1) - (b.user_rating?.score ?? -1));
    case 'VNDB Rating (High-Low)': return copy.sort((a,b) => (b.rating || 0) - (a.rating || 0));
    case 'VNDB Rating (Low-High)': return copy.sort((a,b) => (a.rating || 0) - (b.rating || 0));
    case 'Playtime (High-Low)': return copy.sort((a,b) => (b.playtime_minutes||0) - (a.playtime_minutes||0));
    case 'Playtime (Low-High)': return copy.sort((a,b) => (a.playtime_minutes||0) - (b.playtime_minutes||0));
    case 'Last Played (Recent)': return copy.sort((a,b) => (b.last_played||0) - (a.last_played||0));
    case 'Last Played (Oldest)': return copy.sort((a,b) => (a.last_played||0) - (b.last_played||0));
    case 'Status': return copy.sort((a,b) => statusOrder[a.user_rating?.status||'Not Started'] - statusOrder[b.user_rating?.status||'Not Started']);
    case 'Recently Added': return copy.sort((a,b) => (b.added_at||0) - (a.added_at||0));
    default: return copy;
  }
}

// ─── Grid rendering ──────────────────────────────────────────────
async function refreshGrid() {
  const filter = filterInput.value.trim();
  let filtered = library.library;
  if (filter && fuse) {
    filtered = fuse.search(filter).map(r => r.item);
  }
  filtered = applyAdvancedFilters(filtered);
  filtered = sortLibrary(filtered, sortSelect.value);

  libraryGrid.innerHTML = '';
  if (filtered.length === 0) {
    libraryGrid.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="40" height="40"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg></div><p class="empty-title">${library.library.length === 0 ? 'Your library is empty' : 'No results'}</p><p class="empty-sub">Search VNDB above to add visual novels</p></div>`;
    batchDeleteBtn.style.display = 'none';
    return;
  }

  for (const entry of filtered) {
    const card = createVNCard(entry);
    card.dataset.vndbId = entry.vndb_id;
    if (selectedCards.has(entry.vndb_id)) card.classList.add('selected');
    card.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (selectedCards.has(entry.vndb_id)) {
          selectedCards.delete(entry.vndb_id);
          card.classList.remove('selected');
        } else {
          selectedCards.add(entry.vndb_id);
          card.classList.add('selected');
        }
        batchDeleteBtn.style.display = selectedCards.size > 0 ? 'flex' : 'none';
      } else {
        if (selectedCards.size > 0) {
          selectedCards.clear();
          document.querySelectorAll('.vn-card').forEach(c => c.classList.remove('selected'));
          batchDeleteBtn.style.display = 'none';
        }
        selectEntry(entry);
      }
    });
    libraryGrid.appendChild(card);
  }
  batchDeleteBtn.style.display = selectedCards.size > 0 ? 'flex' : 'none';
}

function createVNCard(entry) {
  const card = document.createElement('div');
  card.className = 'vn-card';
  if (currentSelectedEntry?.vndb_id === entry.vndb_id) card.classList.add('selected');
  if (entry.cover_path && entry.cover_path !== '') {
    const img = document.createElement('img');
    img.className = 'card-cover';
    img.src = `file://${entry.cover_path}`;
    img.alt = entry.title;
    img.onerror = () => img.replaceWith(coverPlaceholder());
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
  const userScore = entry.user_rating?.score;
  const vndbRating = entry.rating;
  const ratingEl = document.createElement('div');
  ratingEl.className = 'card-rating';
  if (userScore != null) ratingEl.textContent = `★ ${userScore}/10${vndbRating ? ` · ${vndbRating.toFixed(1)}` : ''}`;
  else if (vndbRating) ratingEl.textContent = `${vndbRating.toFixed(1)} VNDB`;
  else ratingEl.textContent = 'unrated';
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
  ph.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="28" height="28"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`;
  return ph;
}

// ─── Detail panel ────────────────────────────────────────────────
function selectEntry(entry) {
  currentSelectedEntry = entry;
  document.querySelectorAll('.vn-card').forEach(c => c.classList.remove('selected'));
  const currentCard = document.querySelector(`.vn-card[data-vndb-id="${entry.vndb_id}"]`);
  if (currentCard) currentCard.classList.add('selected');
  updateDetailsPanel(entry);
  updateLaunchOptionsUI(entry);
  updateCustomTagsUI(entry);
  updateCollectionsUI(entry);
  launchOptionsSection.style.display = 'block';
}
function updateDetailsPanel(entry) {
  detailTitle.textContent = entry.title;
  detailUserRating.innerHTML = '';
  if (entry.user_rating?.score != null) {
    detailUserRating.innerHTML = `<span class="rating-score">★ ${entry.user_rating.score}/10</span><span class="rating-label"> · ${entry.user_rating.status || 'Not Started'}</span>`;
  } else {
    detailUserRating.innerHTML = '<span class="rating-label">Not rated</span>';
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
    ['VNDB ID', entry.vndb_id],
    ['Released', entry.released || 'Unknown'],
    ['VNDB', entry.rating ? `${entry.rating.toFixed(2)} (${entry.votecount || 0} votes)` : 'N/A'],
    ['Playtime', `${entry.playtime_minutes || 0} min`],
    ['Developer', entry.developers?.join(', ') || 'Unknown'],
    ['EXE', entry.exe_path || 'Not set'],
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
    detailCover.innerHTML = `<div class="cover-placeholder"><svg viewBox="0 0 24 24" width="40" height="40"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg><span>No cover</span></div>`;
  }
}
function resetDetailsPanel() {
  detailTitle.textContent = '—';
  detailUserRating.innerHTML = '<span class="rating-label">Not rated</span>';
  detailTags.innerHTML = '';
  detailInfo.innerHTML = '';
  detailReviewSection.style.display = 'none';
  detailDesc.textContent = 'Select a visual novel to see details.';
  detailCover.innerHTML = `<div class="cover-placeholder"><svg viewBox="0 0 24 24" width="40" height="40"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg><span>Select a visual novel</span></div>`;
  launchOptionsSection.style.display = 'none';
}

// ─── Custom Tags & Collections (unchanged) ───────────────────────
function updateCustomTagsUI(entry) {
  const tags = entry.user_rating?.customTags || [];
  customTagsList.innerHTML = '';
  for (const tag of tags) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.onclick = async (e) => {
      e.stopPropagation();
      const newTags = tags.filter(t => t !== tag);
      if (!entry.user_rating) entry.user_rating = {};
      entry.user_rating.customTags = newTags;
      ratings.ratings[entry.vndb_id] = entry.user_rating;
      await window.electronAPI.saveRatings(ratings);
      await window.electronAPI.saveLibrary(library);
      updateCustomTagsUI(entry);
    };
    pill.appendChild(removeBtn);
    customTagsList.appendChild(pill);
  }
}
async function addCustomTag() {
  if (!currentSelectedEntry) return;
  const newTag = newTagInput.value.trim();
  if (!newTag) return;
  const tags = currentSelectedEntry.user_rating?.customTags || [];
  if (tags.includes(newTag)) return;
  tags.push(newTag);
  if (!currentSelectedEntry.user_rating) currentSelectedEntry.user_rating = {};
  currentSelectedEntry.user_rating.customTags = tags;
  ratings.ratings[currentSelectedEntry.vndb_id] = currentSelectedEntry.user_rating;
  await window.electronAPI.saveRatings(ratings);
  await window.electronAPI.saveLibrary(library);
  updateCustomTagsUI(currentSelectedEntry);
  newTagInput.value = '';
}
function updateCollectionsUI(entry) {
  const userCollections = entry.user_rating?.collections || [];
  collectionsList.innerHTML = '';
  for (const col of userCollections) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = col;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.onclick = async (e) => {
      e.stopPropagation();
      const newCols = userCollections.filter(c => c !== col);
      if (!entry.user_rating) entry.user_rating = {};
      entry.user_rating.collections = newCols;
      ratings.ratings[entry.vndb_id] = entry.user_rating;
      await window.electronAPI.saveRatings(ratings);
      await window.electronAPI.saveLibrary(library);
      updateCollectionsUI(entry);
    };
    pill.appendChild(removeBtn);
    collectionsList.appendChild(pill);
  }
  collectionSelect.innerHTML = '';
  for (const col of config.collections) {
    const opt = document.createElement('option');
    opt.value = col;
    opt.textContent = col;
    collectionSelect.appendChild(opt);
  }
}
async function addToCollection() {
  if (!currentSelectedEntry) return;
  const collection = collectionSelect.value;
  const cols = currentSelectedEntry.user_rating?.collections || [];
  if (cols.includes(collection)) return;
  cols.push(collection);
  if (!currentSelectedEntry.user_rating) currentSelectedEntry.user_rating = {};
  currentSelectedEntry.user_rating.collections = cols;
  ratings.ratings[currentSelectedEntry.vndb_id] = currentSelectedEntry.user_rating;
  await window.electronAPI.saveRatings(ratings);
  await window.electronAPI.saveLibrary(library);
  updateCollectionsUI(currentSelectedEntry);
}
async function manageCollections() {
  const newCols = prompt('Enter collection names separated by commas:', config.collections.join(','));
  if (newCols) {
    config.collections = newCols.split(',').map(s => s.trim()).filter(s => s);
    await window.electronAPI.saveConfig(config);
    updateCollectionsUI(currentSelectedEntry);
    showToast('Collections updated', 'success');
  }
}

// ─── Launch Options ──────────────────────────────────────────────
function updateLaunchOptionsUI(entry) {
  launchArgsInput.value = entry.launch_args || '';
  launchCwdInput.value = entry.launch_cwd || '';
}
async function saveLaunchOptions() {
  if (!currentSelectedEntry) return;
  currentSelectedEntry.launch_args = launchArgsInput.value;
  currentSelectedEntry.launch_cwd = launchCwdInput.value;
  await window.electronAPI.saveLibrary(library);
  showToast('Launch options saved', 'success');
}

// ─── VNDB Search & Add ───────────────────────────────────────────
async function onVndbSearch() {
  const query = vndbSearchInput.value.trim();
  if (!query) return;
  const token = config.vndb_token;
  if (!token) { showToast('Set VNDB token in Settings', 'error'); return; }
  vndbSearchBtn.disabled = true;
  vndbSearchBtn.classList.add('loading');
  try {
    const results = await window.electronAPI.vndbSearch(token, query);
    if (!results.length) { showToast('No results', 'info'); return; }
    if (results.length === 1) {
      const details = await window.electronAPI.vndbDetails(token, results[0].id);
      if (details) await addVnToLibrary(details);
    } else {
      showSearchResultsModal(results, token);
    }
  } catch (err) { showToast(`Search error: ${err.message}`, 'error');
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
    img.onerror = () => img.style.display = 'none';
    item.appendChild(img);
    const info = document.createElement('div');
    info.className = 'result-info';
    info.innerHTML = `<div class="result-title">${vn.title}</div><div class="result-meta">${vn.released?.slice(0,4) || '?'} · ${vn.rating ? vn.rating.toFixed(2) : 'N/A'}</div>`;
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
searchModalCancel.onclick = () => searchResultsModal.style.display = 'none';
searchResultsModal.querySelector('.modal-backdrop').onclick = () => searchResultsModal.style.display = 'none';

async function addVnToLibrary(vnData) {
  if (library.library.some(e => e.vndb_id === vnData.id)) {
    showToast('Already in library', 'info');
    return;
  }
  let coverPath = '';
  if (vnData.image?.url) {
    try { coverPath = await window.electronAPI.downloadCover(vnData.image.url, vnData.id); } catch(e) { console.warn(e); }
  }
  const newEntry = {
    vndb_id: vnData.id, title: vnData.title, alttitle: vnData.alttitle || '', released: vnData.released || 'Unknown',
    rating: vnData.rating || null, votecount: vnData.votecount || 0, description: cleanHtml(vnData.description || ''),
    exe_path: '', install_dir: '', cover_path: coverPath || '', added_at: Math.floor(Date.now() / 1000),
    last_played: 0, playtime_minutes: 0, tags: (vnData.tags || []).slice(0,10).map(t => t.name),
    developers: (vnData.developers || []).slice(0,5).map(d => d.name)
  };
  library.library.push(newEntry);
  await window.electronAPI.saveLibrary(library);
  rebuildFuse();
  refreshGrid();
  showToast(`${vnData.title} added`, 'success');
}

// ─── Library Update ──────────────────────────────────────────────
async function updateLibraryData() {
  if (!config.vndb_token) { showToast('VNDB token missing', 'error'); return; }
  if (library.library.length === 0) { showToast('Library empty', 'info'); return; }
  updateLibraryBtn.disabled = true;
  updateLibraryBtn.classList.add('loading');
  updateProgressContainer.style.display = 'block';
  let updated = 0;
  for (let i = 0; i < library.library.length; i++) {
    const entry = library.library[i];
    updateProgressText.textContent = `Updating: ${entry.title}`;
    updateProgressBar.style.width = `${(i / library.library.length) * 100}%`;
    try {
      const details = await window.electronAPI.vndbDetails(config.vndb_token, entry.vndb_id);
      if (details) {
        entry.title = details.title; entry.alttitle = details.alttitle || ''; entry.released = details.released;
        entry.rating = details.rating; entry.votecount = details.votecount;
        entry.description = cleanHtml(details.description || '');
        if (details.image?.url && !entry.cover_path) {
          const newCover = await window.electronAPI.downloadCover(details.image.url, entry.vndb_id);
          if (newCover) entry.cover_path = newCover;
        }
        updated++;
      }
    } catch (err) { console.warn(err); }
    await new Promise(r => setTimeout(r, 500));
  }
  updateProgressBar.style.width = '100%';
  await window.electronAPI.saveLibrary(library);
  rebuildFuse();
  refreshGrid();
  if (currentSelectedEntry) updateDetailsPanel(currentSelectedEntry);
  updateProgressContainer.style.display = 'none';
  updateLibraryBtn.disabled = false;
  updateLibraryBtn.classList.remove('loading');
  showToast(`Updated ${updated} of ${library.library.length}`, 'success');
}

// ─── Rating Modal ────────────────────────────────────────────────
ratingScore.addEventListener('input', () => { scoreDisplay.textContent = ratingScore.value; });
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
      score: parseFloat(ratingScore.value), status: ratingStatus.value, review: ratingReview.value,
      date_rated: new Date().toISOString(), customTags: entry.user_rating?.customTags || [],
      collections: entry.user_rating?.collections || []
    };
    ratings.ratings[entry.vndb_id] = newRating;
    entry.user_rating = newRating;
    await window.electronAPI.saveRatings(ratings);
    await window.electronAPI.saveLibrary(library);
    await syncRatingToVndb(entry, newRating);
    refreshGrid();
    if (currentSelectedEntry?.vndb_id === entry.vndb_id) updateDetailsPanel(entry);
    ratingModal.style.display = 'none';
    showToast('Rating saved', 'success');
  };
  ratingSaveBtn.addEventListener('click', saveHandler, { once: true });
}
ratingCancelBtn.onclick = () => ratingModal.style.display = 'none';
ratingModal.querySelector('.modal-backdrop').onclick = () => ratingModal.style.display = 'none';

// ─── EXE / Launch ────────────────────────────────────────────────
async function onSetExe() {
  if (!currentSelectedEntry) { showToast('Select a VN first', 'info'); return; }
  const exePath = await window.electronAPI.selectExe();
  if (exePath) {
    currentSelectedEntry.exe_path = exePath;
    currentSelectedEntry.install_dir = getDirPath(exePath);
    await window.electronAPI.saveLibrary(library);
    refreshGrid();
    updateDetailsPanel(currentSelectedEntry);
    showToast('Executable set', 'success');
  }
}
async function onLaunch() {
  if (!currentSelectedEntry) return;
  const entry = currentSelectedEntry;
  const exe = entry.exe_path;
  if (!exe) { showToast('Set an EXE path first', 'error'); return; }
  try {
    const args = entry.launch_args ? entry.launch_args.split(' ') : [];
    const cwd = entry.launch_cwd || entry.install_dir || getDirPath(exe);
    await window.electronAPI.launchGame(exe, cwd, args);
    await updatePlaytimeAndStatus(entry);
    window.electronAPI.startPlaytimeTracking(entry.vndb_id);
    showToast(`Launching ${entry.title}`, 'success');
  } catch (err) { showToast(`Launch failed: ${err.message}`, 'error'); }
}
async function updatePlaytimeAndStatus(entry) {
  entry.last_played = Math.floor(Date.now() / 1000);
  if (!entry.user_rating || entry.user_rating.status === 'Not Started') {
    if (!entry.user_rating) entry.user_rating = {};
    entry.user_rating.status = 'Playing';
    ratings.ratings[entry.vndb_id] = entry.user_rating;
    await window.electronAPI.saveRatings(ratings);
  }
  await window.electronAPI.saveLibrary(library);
  refreshGrid();
  updateDetailsPanel(entry);
}
async function onRemove() {
  if (!currentSelectedEntry) return;
  const ok = await showConfirm(`Remove "${currentSelectedEntry.title}" from library?`);
  if (ok) {
    const vnId = currentSelectedEntry.vndb_id;
    library.library = library.library.filter(e => e.vndb_id !== vnId);
    delete ratings.ratings[vnId];
    await window.electronAPI.saveLibrary(library);
    await window.electronAPI.saveRatings(ratings);
    await deleteFromVndb(vnId);
    currentSelectedEntry = null;
    selectedCards.delete(vnId);
    rebuildFuse();
    refreshGrid();
    resetDetailsPanel();
    showToast('Removed', 'info');
  }
}
async function batchDelete() {
  if (selectedCards.size === 0) return;
  const ok = await showConfirm(`Remove ${selectedCards.size} selected visual novels?`);
  if (ok) {
    for (const vnId of selectedCards) {
      library.library = library.library.filter(e => e.vndb_id !== vnId);
      delete ratings.ratings[vnId];
      await deleteFromVndb(vnId);
    }
    await window.electronAPI.saveLibrary(library);
    await window.electronAPI.saveRatings(ratings);
    selectedCards.clear();
    rebuildFuse();
    refreshGrid();
    resetDetailsPanel();
    showToast('Batch removal complete', 'success');
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
  config.theme = themeSelect.value;
  await applyTheme(config.theme);
  await window.electronAPI.saveConfig(config);
}

// ─── Settings ────────────────────────────────────────────────────
async function saveSettings() {
  config.vndb_token = vndbTokenInput.value.trim();
  config.theme = themeSelect.value;
  config.auto_check_updates = autoUpdateCheckbox.checked;
  config.sync_to_vndb = syncVndbCheckbox.checked;
  await window.electronAPI.saveConfig(config);
  await applyTheme(config.theme);
  showToast('Settings saved', 'success');
}
async function checkForUpdates() {
  checkUpdatesSettingsBtn.disabled = true;
  checkUpdatesSettingsBtn.classList.add('loading');
  const updateInfo = await window.electronAPI.checkUpdates();
  checkUpdatesSettingsBtn.disabled = false;
  checkUpdatesSettingsBtn.classList.remove('loading');
  if (updateInfo.hasUpdate) {
    const ok = await showConfirm(`Version ${updateInfo.version} available. Download?`);
    if (ok) window.electronAPI.openExternal(updateInfo.downloadUrl);
  } else { showToast('Up to date', 'success'); }
}

// ─── VNDB Sync helpers ───────────────────────────────────────────
async function syncRatingToVndb(entry, rating) {
  if (!config.sync_to_vndb || !config.vndb_token) return;
  try {
    await window.electronAPI.vndbUlistSet(config.vndb_token, entry.vndb_id, rating.score, rating.review || '');
    showToast('Synced to VNDB', 'success');
  } catch (err) { showToast(`VNDB sync failed: ${err.message}`, 'error'); }
}
async function deleteFromVndb(vnId) {
  if (!config.sync_to_vndb || !config.vndb_token) return;
  try { await window.electronAPI.vndbUlistDelete(config.vndb_token, vnId); } catch(e) { if (e?.response?.status !== 404) showToast(`VNDB remove failed: ${e.message}`, 'error'); }
}
async function testVndbToken() {
  const token = vndbTokenInput.value.trim();
  if (!token) { showToast('Enter token', 'error'); return; }
  testVndbTokenBtn.disabled = true;
  testVndbTokenBtn.classList.add('loading');
  try {
    const res = await window.electronAPI.vndbAuthInfo(token);
    if (res.valid) {
      const hasWrite = (res.permissions || []).includes('listwrite');
      if (hasWrite) showToast(`✓ Token valid (${res.username}). listwrite OK`, 'success');
      else showToast(`Token valid but missing listwrite`, 'error');
    } else {
      showToast(`Token invalid: ${res.error}`, 'error');
    }
  } catch (err) { showToast(`Token check failed: ${err.message}`, 'error');
  } finally { testVndbTokenBtn.disabled = false; testVndbTokenBtn.classList.remove('loading'); }
}
async function bulkSyncToVndb() {
  const token = config.vndb_token;
  if (!token) { showToast('Set VNDB token', 'error'); return; }
  const rated = library.library.filter(e => e.user_rating?.score != null);
  if (rated.length === 0) { showToast('No rated entries', 'info'); return; }
  bulkSyncBtn.disabled = true;
  bulkSyncBtn.classList.add('loading');
  bulkSyncStatus.style.display = 'block';
  bulkSyncStatus.textContent = `Syncing ${rated.length} entries...`;
  let synced = 0, failed = 0;
  for (let i = 0; i < rated.length; i++) {
    const entry = rated[i];
    bulkSyncStatus.textContent = `${i+1}/${rated.length} — ${entry.title}`;
    try {
      await window.electronAPI.vndbUlistSet(token, entry.vndb_id, entry.user_rating.score, entry.user_rating.review || '');
      synced++;
    } catch (err) { failed++; console.warn(entry.title, err.message); }
    await new Promise(r => setTimeout(r, 300));
  }
  bulkSyncBtn.disabled = false;
  bulkSyncBtn.classList.remove('loading');
  bulkSyncStatus.textContent = `${synced} synced, ${failed} failed`;
  showToast(`Sync done: ${synced} ok, ${failed} failed`, failed ? 'error' : 'success');
}
async function importVndbList() {
  const token = config.vndb_token;
  if (!token) { showToast('Set VNDB token', 'error'); return; }
  importVndbListBtn.disabled = true;
  importVndbListBtn.classList.add('loading');
  try {
    const list = await window.electronAPI.vndbUserlist(token);
    let imported = 0;
    for (const item of list) {
      if (!library.library.some(e => e.vndb_id === item.vn.id)) {
        const vnData = await window.electronAPI.vndbDetails(token, item.vn.id);
        if (vnData) {
          await addVnToLibrary(vnData);
          const statusMap = { 'playing': 'Playing', 'completed': 'Completed', 'dropped': 'Dropped', 'onhold': 'On Hold', 'wishlist': 'Not Started' };
          ratings.ratings[item.vn.id] = {
            score: item.vote ? item.vote / 10 : null,
            status: statusMap[item.status] || 'Not Started',
            review: item.notes || '',
            date_rated: new Date().toISOString()
          };
          imported++;
        }
      }
    }
    await window.electronAPI.saveRatings(ratings);
    rebuildFuse();
    refreshGrid();
    showToast(`Imported ${imported} VNs from VNDB`, 'success');
  } catch (err) { showToast(`Import failed: ${err.message}`, 'error');
  } finally { importVndbListBtn.disabled = false; importVndbListBtn.classList.remove('loading'); }
}

// ─── Backup & Restore ────────────────────────────────────────────
async function backupLibrary() {
  const result = await window.electronAPI.backupLibrary();
  if (result.success) showToast(`Backup saved to ${result.path}`, 'success');
  else showToast('Backup failed', 'error');
}
async function restoreBackup() {
  const { filePaths } = await window.electronAPI.showOpenDialog({ filters: [{ name: 'Zip', extensions: ['zip'] }], properties: ['openFile'] });
  if (filePaths && filePaths[0]) {
    await window.electronAPI.restoreBackup(filePaths[0]);
    showToast('Restore complete. Please restart the app.', 'success');
  }
}

// ─── Filter chips ────────────────────────────────────────────────
function setupFilterChips() {
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const filter = chip.dataset.filter;
      if (filter === 'playing') activeFilters.status = 'Playing';
      else if (filter === 'completed') activeFilters.status = 'Completed';
      else if (filter === 'rating-high') activeFilters.minRating = 8;
      else if (filter === 'playtime>10') activeFilters.minPlaytime = 600;
      refreshGrid();
    });
  });
  clearFiltersBtn.addEventListener('click', () => {
    activeFilters = { status: null, minRating: null, minPlaytime: null };
    filterInput.value = '';
    refreshGrid();
  });
}
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`${tabId}-tab`).classList.add('active');
  document.querySelector(`.nav-item[data-tab="${tabId}"]`).classList.add('active');
}

// ─── Playtime updates from main ──────────────────────────────────
window.electronAPI.onPlaytimeUpdated((data) => {
  const entry = library.library.find(e => e.vndb_id === data.vnId);
  if (entry) entry.playtime_minutes = data.playtime;
  if (currentSelectedEntry?.vndb_id === data.vnId) updateDetailsPanel(currentSelectedEntry);
});

// ─── Init ────────────────────────────────────────────────────────
async function init() {
  setupTitlebar();
  config = await window.electronAPI.loadConfig();
  library = await window.electronAPI.loadLibrary();
  ratings = await window.electronAPI.loadRatings();
  mergeRatings();
  rebuildFuse();

  vndbTokenInput.value = config.vndb_token || '';
  themeSelect.value = config.theme || 'auto';
  autoUpdateCheckbox.checked = config.auto_check_updates !== false;
  syncVndbCheckbox.checked = config.sync_to_vndb === true;
  if (!config.collections) config.collections = ['Favorites', 'Backlog', 'Completed', 'Dropped'];

  const version = '1.0.1';
  if (versionSpan) versionSpan.textContent = version;
  document.getElementById('version-display-settings').textContent = version;

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
  batchDeleteBtn.addEventListener('click', batchDelete);
  addTagBtn.addEventListener('click', addCustomTag);
  addToCollectionBtn.addEventListener('click', addToCollection);
  manageCollectionsBtn.addEventListener('click', manageCollections);
  saveLaunchOptionsBtn.addEventListener('click', saveLaunchOptions);
  backupBtn.addEventListener('click', backupLibrary);
  restoreBtn.addEventListener('click', restoreBackup);
  importVndbListBtn.addEventListener('click', importVndbList);

  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab'))));
  window.electronAPI.onMenuCheckUpdates(() => checkForUpdates());
  window.electronAPI.onMenuUpdateLibrary(() => updateLibraryData());
  window.electronAPI.onSystemThemeChanged(() => { if (config.theme === 'auto') applyTheme('auto'); });
  setupFilterChips();
}
init();