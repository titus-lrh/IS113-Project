'use strict';

// ── state ──────────────────────────────────────────────────────────────────
let pendingFood = null; // { name, sourceType, sourceId, thumb }

// ── search debounce ────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── helpers ────────────────────────────────────────────────────────────────
function round(n) {
  return n != null ? Math.round(n) : '—';
}

function buildMacroPreview(nutrition) {
  if (!nutrition) return 'Nutrition unavailable';
  const n = nutrition.nutrition || {};
  const ds = nutrition.defaultServing || {};
  const servings = parseFloat(document.getElementById('modal-servings').value) || 1;
  const amount   = ds.amount || 100;
  const cal  = round(((n.calories || 0) / 100) * amount * servings);
  const pro  = round(((n.protein  || 0) / 100) * amount * servings);
  const carb = round(((n.carbs    || 0) / 100) * amount * servings);
  const fat  = round(((n.fat      || 0) / 100) * amount * servings);
  return `~${cal} kcal · ${pro}g P · ${carb}g C · ${fat}g F`;
}

// ── search ─────────────────────────────────────────────────────────────────
async function searchFood(query, resultsEl) {
  if (!query.trim()) {
    resultsEl.innerHTML = '';
    return;
  }
  resultsEl.innerHTML = '<div class="add-food-results__loading">Searching…</div>';
  try {
    const res  = await fetch(`/schedule/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    renderResults(data, resultsEl);
  } catch {
    resultsEl.innerHTML = '<div class="add-food-results__error">Search failed. Try again.</div>';
  }
}

function renderResults({ userRecipes = [], mealdb = [] }, resultsEl) {
  const all = [
    ...userRecipes.map(r => ({ ...r, badge: 'My Recipe' })),
    ...mealdb.map(m => ({ ...m, badge: 'TheMealDB' })),
  ];

  if (!all.length) {
    resultsEl.innerHTML = '<div class="add-food-results__empty">No results found.</div>';
    return;
  }

  resultsEl.innerHTML = all.map(item => `
    <div class="search-result-item"
      data-name="${escHtml(item.name)}"
      data-source-type="${escHtml(item.sourceType)}"
      data-source-id="${escHtml(item.sourceId || '')}"
      data-meal="${escHtml(resultsEl.dataset.meal || 'Other')}"
    >
      <span class="search-result-item__name">${escHtml(item.name)}</span>
      <span class="badge">${escHtml(item.badge)}</span>
    </div>
  `).join('');
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── modal ──────────────────────────────────────────────────────────────────
const modal       = document.getElementById('portion-modal');
const modalName   = document.getElementById('modal-food-name');
const modalSource = document.getElementById('modal-food-source');
const modalPreview= document.getElementById('modal-nutrition-preview');
const modalServings = document.getElementById('modal-servings');
const modalMeal   = document.getElementById('modal-meal');
const modalTime   = document.getElementById('modal-time');
const modalSubmit = document.getElementById('modal-submit');
const modalClose  = document.getElementById('modal-close');

let cachedNutrition = null;

async function openModal(food) {
  pendingFood    = food;
  cachedNutrition = null;
  modalName.textContent   = food.name;
  modalSource.textContent = food.badge || food.sourceType || '';
  modalPreview.textContent = 'Fetching nutrition…';
  if (food.mealType) {
    modalMeal.value = food.mealType;
  }
  modal.style.display = 'flex';

  try {
    const qs = `foodName=${encodeURIComponent(food.name)}`;
    const res = await fetch(`/schedule/nutrition/${encodeURIComponent(food.sourceType)}/${encodeURIComponent(food.sourceId || '_')}?${qs}`);
    if (res.ok) {
      const data = await res.json();
      cachedNutrition = data.nutrition;
      modalPreview.textContent = buildMacroPreview(cachedNutrition);
    } else {
      modalPreview.textContent = 'Nutrition unavailable';
    }
  } catch {
    modalPreview.textContent = 'Nutrition unavailable';
  }
}

function closeModal() {
  modal.style.display = 'none';
  pendingFood = null;
  cachedNutrition = null;
}

modalClose.addEventListener('click', closeModal);
modal.querySelector('.modal__backdrop').addEventListener('click', closeModal);
modalServings.addEventListener('input', () => {
  if (cachedNutrition) {
    modalPreview.textContent = buildMacroPreview(cachedNutrition);
  }
});

// ── add entry ──────────────────────────────────────────────────────────────
modalSubmit.addEventListener('click', async () => {
  if (!pendingFood) return;
  modalSubmit.disabled = true;
  modalSubmit.textContent = 'Adding…';

  try {
    const body = {
      dateString:  window.SCHEDULE_DATE,
      sourceType:  pendingFood.sourceType,
      sourceId:    pendingFood.sourceId || '',
      foodName:    pendingFood.name,
      servings:    parseFloat(modalServings.value) || 1,
      timeLabel:   modalTime.value.trim(),
      mealType:    modalMeal.value,
    };

    const res = await fetch('/schedule/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Failed to add entry');

    const data = await res.json();
    closeModal();
    refreshPage(data.log);
  } catch (err) {
    console.error(err);
    modalSubmit.textContent = 'Error — retry';
    modalSubmit.disabled = false;
  }
});

// ── remove entry ───────────────────────────────────────────────────────────
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.log-entry__remove');
  if (!btn) return;
  const entryId = btn.dataset.entryId;
  if (!entryId) return;

  btn.disabled = true;
  try {
    const res = await fetch(`/schedule/entry/${entryId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove');
    const data = await res.json();
    refreshPage(data.log);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
  }
});

// ── refresh DOM after mutation ─────────────────────────────────────────────
function refreshPage(log) {
  // Simplest reliable approach: reload the page preserving scroll
  const scrollY = window.scrollY;
  window.location.reload();
  // Note: scroll restoration happens automatically in most browsers
}

// ── helpers for stacking context elevation ─────────────────────────────────
function elevateMealGroup(panel) {
  const group = panel.closest('.meal-group');
  if (group) { group.style.position = 'relative'; group.style.zIndex = '10'; }
}
function resetMealGroup(panel) {
  const group = panel.closest('.meal-group');
  if (group) { group.style.position = ''; group.style.zIndex = ''; }
}

// ── wire up add-food buttons ───────────────────────────────────────────────
document.querySelectorAll('.add-food-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const meal  = btn.dataset.meal;
    const panel = document.querySelector(`.add-food-panel[data-meal="${meal}"]`);
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      elevateMealGroup(panel);
      panel.querySelector('.add-food-input')?.focus();
    } else {
      resetMealGroup(panel);
    }
  });
});

// ── wire up search inputs ──────────────────────────────────────────────────
document.querySelectorAll('.add-food-input').forEach(input => {
  const meal       = input.dataset.meal;
  const resultsEl  = document.querySelector(`.add-food-results[data-meal="${meal}"]`);
  if (!resultsEl) return;
  resultsEl.dataset.meal = meal;

  const debouncedSearch = debounce((q) => searchFood(q, resultsEl), 300);
  input.addEventListener('input', () => debouncedSearch(input.value));

  // Click on a result → open modal
  resultsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (!item) return;
    openModal({
      name:       item.dataset.name,
      sourceType: item.dataset.sourceType,
      sourceId:   item.dataset.sourceId,
      mealType:   meal,
      badge:      item.querySelector('.badge')?.textContent,
    });
    // Clear search
    input.value = '';
    resultsEl.innerHTML = '';
    const panel = input.closest('.add-food-panel');
    panel.style.display = 'none';
    resetMealGroup(panel);
  });
});
