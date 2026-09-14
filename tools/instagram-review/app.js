(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const list = $('#mediaList');
  const form = $('#reviewForm');
  const editor = $('#editor');
  const empty = $('#emptyState');
  const previewFrame = $('#previewFrame');
  const imagePreview = $('#imagePreview');
  const videoPreview = $('#videoPreview');
  const format = $('#format');
  const caption = $('#caption');
  const alt = $('#alt');
  const focalX = $('#focalX');
  const focalY = $('#focalY');
  const statusPill = $('#statusPill');
  const saveButton = $('#saveButton');
  const approveButton = $('#approveButton');
  let items = [];
  let selected = null;
  let dirty = false;

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  function payload() {
    return {
      format: format.value,
      caption: caption.value,
      alt: alt.value,
      focal_x: Number(focalX.value),
      focal_y: Number(focalY.value),
    };
  }

  function updateCounts() {
    const approved = items.filter(item => item.draft.status === 'approved').length;
    const published = items.filter(item => item.draft.status === 'published').length;
    $('#itemCount').textContent = String(items.length);
    const drafts = items.length - approved - published;
    $('#draftCount').textContent = `${drafts} draft${drafts === 1 ? '' : 's'}`;
    $('#approvedCount').textContent = published ? `${approved} approved · ${published} published` : `${approved} approved`;
  }

  function renderList() {
    list.innerHTML = items.map(item => {
      const active = selected?.id === item.id ? ' selected' : '';
      const approved = ['approved', 'published'].includes(item.draft.status) ? ' approved' : '';
      const video = item.type === 'video' ? ' video' : '';
      return `<button type="button" class="media-card${active}${approved}${video}" data-id="${item.id}" aria-label="Review ${escapeHtml(item.source)}"><img src="${item.type === 'video' ? item.poster_url : item.original_url}" alt=""></button>`;
    }).join('');
    list.querySelectorAll('.media-card').forEach(button => button.addEventListener('click', () => selectItem(button.dataset.id)));
    updateCounts();
  }

  function setDirty(value) {
    dirty = value;
    $('#savedState').textContent = value ? 'Unsaved changes' : (selected?.draft.status === 'approved' ? 'Locked to this version' : selected?.draft.status === 'published' ? 'Posted to Instagram' : 'Draft saved locally');
    if (value && ['approved', 'published'].includes(selected?.draft.status)) {
      statusPill.textContent = 'Draft';
      statusPill.classList.remove('approved');
    }
  }

  function updatePreview() {
    if (!selected) return;
    previewFrame.className = `preview-frame ${format.value}`;
    imagePreview.style.objectPosition = `${focalX.value}% ${focalY.value}%`;
    $('#focalXValue').textContent = `${focalX.value}%`;
    $('#focalYValue').textContent = `${focalY.value}%`;
    $('#captionCount').textContent = `${caption.value.length} / 2200`;
  }

  function selectItem(identifier) {
    selected = items.find(item => item.id === identifier);
    if (!selected) return;
    empty.hidden = true;
    editor.hidden = false;
    format.innerHTML = Object.entries(selected.formats).map(([value, details]) => `<option value="${value}">${escapeHtml(details.label)}</option>`).join('');
    format.value = selected.draft.format;
    caption.value = selected.draft.caption;
    alt.value = selected.draft.alt;
    focalX.value = selected.draft.focal_x;
    focalY.value = selected.draft.focal_y;
    const isVideo = selected.type === 'video';
    imagePreview.hidden = isVideo;
    videoPreview.hidden = !isVideo;
    if (isVideo) {
      videoPreview.src = selected.original_url;
    } else {
      videoPreview.removeAttribute('src');
      imagePreview.src = ['approved', 'published'].includes(selected.draft.status) ? selected.preview_url : selected.original_url;
      imagePreview.alt = selected.draft.alt;
    }
    $('#cropControls').hidden = isVideo;
    $('#sourceName').textContent = selected.source;
    $('#sourceDimensions').textContent = [selected.width && selected.height ? `${selected.width} × ${selected.height}` : '', selected.duration ? `${selected.duration.toFixed(1)} seconds` : ''].filter(Boolean).join(' · ');
    const published = selected.draft.status === 'published';
    statusPill.textContent = published ? 'Published' : selected.draft.status === 'approved' ? 'Approved' : 'Draft';
    statusPill.classList.toggle('approved', selected.draft.status === 'approved' || published);
    approveButton.textContent = selected.draft.status === 'approved' ? 'Approved' : published ? 'Approve changes' : 'Approve';
    renderList();
    updatePreview();
    setDirty(false);
  }

  async function mutate(action) {
    if (!selected) return;
    saveButton.disabled = true;
    approveButton.disabled = true;
    $('#savedState').textContent = action === 'approve' ? 'Rendering approved version…' : 'Saving…';
    try {
      const response = await fetch(`/api/items/${selected.id}/${action}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-Review-Token': window.REVIEW_TOKEN},
        body: JSON.stringify(payload()),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The review server could not save this item');
      const index = items.findIndex(item => item.id === selected.id);
      items[index] = result.item;
      selected = result.item;
      if (action === 'approve' && selected.type === 'image') imagePreview.src = `${selected.preview_url}?approved=${Date.now()}`;
      selectItem(selected.id);
      showToast(action === 'approve' ? 'Approved. This exact version is locked.' : 'Draft saved.');
    } catch (error) {
      $('#savedState').textContent = error.message;
      showToast(error.message);
    } finally {
      saveButton.disabled = false;
      approveButton.disabled = false;
    }
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  form.addEventListener('submit', event => { event.preventDefault(); mutate('save'); });
  approveButton.addEventListener('click', () => mutate('approve'));
  [format, caption, alt, focalX, focalY].forEach(control => control.addEventListener('input', () => {
    if (selected?.type === 'image' && ['approved', 'published'].includes(selected.draft.status)) imagePreview.src = selected.original_url;
    setDirty(true);
    updatePreview();
  }));
  window.addEventListener('beforeunload', event => { if (dirty) event.preventDefault(); });

  fetch('/api/items')
    .then(response => response.json())
    .then(result => {
      items = result.items;
      renderList();
      if (items.length) selectItem(items[0].id);
    })
    .catch(error => { empty.innerHTML = `<p>${escapeHtml(error.message)}</p>`; });
})();
