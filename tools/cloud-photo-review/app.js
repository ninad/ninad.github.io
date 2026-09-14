(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const state = { items: [], selected: null, storage: false, dirty: false };
  const els = {
    list: $('#mediaList'), editor: $('#editor'), empty: $('#emptyState'), upload: $('#upload'),
    image: $('#imagePreview'), video: $('#videoPreview'), frame: $('#previewFrame'), format: $('#format'),
    caption: $('#caption'), alt: $('#alt'), fx: $('#focalX'), fy: $('#focalY'), approve: $('#approveButton'),
    save: $('#saveButton'), website: $('#websiteButton'), instagram: $('#instagramButton')
  };

  const escapeHtml = value => { const el = document.createElement('div'); el.textContent = value || ''; return el.innerHTML; };
  const api = async (url, options) => {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  };
  function toast(message) { const el=$('#toast'); el.textContent=message; el.hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>{el.hidden=true;},3500); }
  function updateCounts() { $('#itemCount').textContent=String(state.items.length); }
  function payload() { return { format:els.format.value, caption:els.caption.value, alt:els.alt.value, focal_x:Number(els.fx.value), focal_y:Number(els.fy.value) }; }
  function previewUrl(item, approved=false) { return `${approved ? item.preview_url : item.original_url}?v=${encodeURIComponent(item.draft.approval_hash || item.draft.status)}`; }

  function renderList() {
    els.list.innerHTML=state.items.map(item => `<button type="button" class="media-card${state.selected?.id===item.id?' selected':''}${item.draft.status==='approved'?' approved':''}" data-id="${item.id}"><img src="${previewUrl(item,item.draft.status==='approved')}" alt=""></button>`).join('');
    els.list.querySelectorAll('[data-id]').forEach(button=>button.addEventListener('click',()=>select(button.dataset.id)));
    updateCounts();
  }
  function updatePreview() {
    if (!state.selected) return;
    els.frame.className=`preview-frame ${els.format.value}`;
    els.image.style.objectPosition=`${els.fx.value}% ${els.fy.value}%`;
    $('#focalXValue').textContent=`${els.fx.value}%`; $('#focalYValue').textContent=`${els.fy.value}%`;
    $('#captionCount').textContent=`${els.caption.value.length} / 2200`;
  }
  function setDirty(value) {
    state.dirty=value;
    $('#savedState').textContent=value?'Unsaved changes':state.selected?.draft.status==='approved'?'Exact version approved':'Draft saved in Cloudflare';
    if(value) { $('#statusPill').textContent='Draft'; $('#statusPill').classList.remove('approved'); }
  }
  function select(id) {
    const item=state.items.find(entry=>entry.id===id); if(!item)return; state.selected=item;
    els.empty.hidden=true; els.editor.hidden=false;
    els.format.innerHTML=Object.entries(item.formats).map(([value,details])=>`<option value="${value}">${escapeHtml(details.label)}</option>`).join('');
    els.format.value=item.draft.format; els.caption.value=item.draft.caption; els.alt.value=item.draft.alt;
    els.fx.value=item.draft.focal_x; els.fy.value=item.draft.focal_y;
    const video=item.type==='video'; els.image.hidden=video; els.video.hidden=!video; $('#cropControls').hidden=video;
    if(video){els.video.src=item.original_url;els.image.removeAttribute('src');}else{els.video.removeAttribute('src');els.image.src=previewUrl(item,item.draft.status==='approved');els.image.alt=item.draft.alt;}
    $('#sourceName').textContent=item.source; $('#sourceDimensions').textContent=[item.width&&item.height?`${item.width} × ${item.height}`:'',item.duration?`${item.duration.toFixed(1)} seconds`:''].filter(Boolean).join(' · ');
    const approved=item.draft.status==='approved'; $('#statusPill').textContent=approved?'Approved':'Draft'; $('#statusPill').classList.toggle('approved',approved);
    els.website.disabled=!approved||item.draft.website_published; els.website.textContent=item.draft.website_published?'On website':'Add to website';
    els.instagram.disabled=!approved||item.draft.instagram_status==='publishing'||item.draft.instagram_status==='published'; els.instagram.textContent=item.draft.instagram_status==='published'?'Posted':item.draft.instagram_status==='publishing'?'Posting…':'Post to Instagram';
    $('#publishState').textContent=[item.draft.website_published?'Published on website':'',item.draft.instagram_status==='published'?'Published on Instagram':'',item.draft.error_message||''].filter(Boolean).join(' · ');
    setDirty(false); updatePreview(); renderList();
  }
  async function save() {
    if(!state.selected)return; disable(true);
    try { const result=await api(`/api/items/${state.selected.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())}); replace(result.item); toast('Draft saved in Cloudflare.'); }
    catch(error){toast(error.message);} finally{disable(false);}
  }
  async function renderImage(item) {
    const image=new Image(); image.crossOrigin='same-origin'; image.src=item.original_url; await image.decode();
    const formats={feed_portrait:[1080,1350],feed_square:[1080,1080],story:[1080,1920]}; const [tw,th]=formats[els.format.value];
    const sw=image.naturalWidth,sh=image.naturalHeight,scale=Math.max(tw/sw,th/sh),cw=tw/scale,ch=th/scale;
    const sx=(sw-cw)*(Number(els.fx.value)/100),sy=(sh-ch)*(Number(els.fy.value)/100);
    const canvas=document.createElement('canvas');canvas.width=tw;canvas.height=th;canvas.getContext('2d',{alpha:false}).drawImage(image,sx,sy,cw,ch,0,0,tw,th);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not render image')),'image/jpeg',.92));
  }
  async function approve() {
    if(!state.selected)return; disable(true); $('#savedState').textContent='Rendering exact version…';
    try { const data=new FormData(); Object.entries(payload()).forEach(([key,value])=>data.set(key,String(value))); if(state.selected.type==='image')data.set('media',await renderImage(state.selected),'approved.jpg'); const result=await api(`/api/items/${state.selected.id}/approve`,{method:'POST',body:data}); replace(result.item); toast('Approved. This exact media and copy are locked.'); }
    catch(error){toast(error.message);} finally{disable(false);}
  }
  async function publish(channel) {
    if(!state.selected)return; disable(true);
    try { const result=await api(`/api/items/${state.selected.id}/publish-${channel}`,{method:'POST'}); replace(result.item); toast(channel==='website'?'Added to the website feed.':'Published to Instagram.'); }
    catch(error){toast(error.message); await load();} finally{disable(false);}
  }
  function replace(item){const index=state.items.findIndex(entry=>entry.id===item.id);state.items[index]=item;select(item.id);}
  function disable(value){[els.save,els.approve,els.website,els.instagram].forEach(button=>button.disabled=value);}
  async function mediaDetails(file) {
    const url=URL.createObjectURL(file); try { if(file.type.startsWith('image/')){const image=new Image();image.src=url;await image.decode();return{width:image.naturalWidth,height:image.naturalHeight,duration:''};} const video=document.createElement('video');video.preload='metadata';video.src=url;await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});return{width:video.videoWidth,height:video.videoHeight,duration:video.duration}; } finally {URL.revokeObjectURL(url);}
  }
  async function upload(files) {
    if(!state.storage){toast('Enable R2 once in Cloudflare before uploading.');return;}
    for(const file of files){try{toast(`Uploading ${file.name}…`);const details=await mediaDetails(file);const data=new FormData();data.set('media',file,file.name);Object.entries(details).forEach(([key,value])=>data.set(key,String(value)));const result=await api('/api/items',{method:'POST',body:data});state.items.unshift(result.item);select(result.item.id);}catch(error){toast(error.message);}}
    els.upload.value='';
  }
  async function load() {
    try { const result=await api('/api/items');state.items=result.items;state.storage=result.storage;$('#identity').textContent=result.identity||'';$('#setupMessage').hidden=result.storage;if(!result.storage)$('#setupMessage').textContent='One setup step remains: enable R2 in Cloudflare to turn on media uploads.';renderList();if(state.items.length)select(state.selected?.id||state.items[0].id); }
    catch(error){$('#setupMessage').hidden=false;$('#setupMessage').textContent=error.message;}
  }
  $('#reviewForm').addEventListener('submit',event=>{event.preventDefault();save();}); els.approve.addEventListener('click',approve); els.website.addEventListener('click',()=>publish('website')); els.instagram.addEventListener('click',()=>publish('instagram')); els.upload.addEventListener('change',()=>upload([...els.upload.files]));
  [els.format,els.caption,els.alt,els.fx,els.fy].forEach(control=>control.addEventListener('input',()=>{if(state.selected?.type==='image'&&state.selected.draft.status==='approved')els.image.src=previewUrl(state.selected,false);setDirty(true);updatePreview();}));
  window.addEventListener('beforeunload',event=>{if(state.dirty)event.preventDefault();}); load();
})();
