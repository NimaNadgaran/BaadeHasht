(() => {
  const themeToggle = document.querySelector('.theme-toggle');
  function updateThemeControl() {
    if (!themeToggle) return;
    const light = document.documentElement.dataset.theme === 'light';
    themeToggle.setAttribute('aria-label', light ? 'فعال کردن حالت تاریک' : 'فعال کردن حالت روشن');
    themeToggle.setAttribute('aria-pressed', String(!light));
    themeToggle.textContent = light ? '☾' : '☼';
  }
  updateThemeControl();
  themeToggle?.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('baadehasht-theme', theme); } catch {}
    updateThemeControl();
  });
  document.querySelectorAll('[data-confirm]').forEach(form => form.addEventListener('submit', event => {
    if (!confirm(form.dataset.confirm)) event.preventDefault();
  }));
  document.querySelectorAll('[data-upload]').forEach(input => input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const form = input.closest('form');
    const output = input.closest('.upload-field').querySelector('output');
    const target = form.elements.namedItem(input.dataset.upload);
    const submit = form.querySelector('button[type=submit], .form-actions button');
    const asset = input.accept === '.glb';
    output.textContent = 'در حال بارگذاری…';
    if (submit) submit.disabled = true;
    try {
      if (file.size > (asset ? 4 : 5) * 1024 * 1024) throw new Error('حجم فایل بیش از حد مجاز است.');
      let blob = file;
      if (!asset) {
        const bitmap = await createImageBitmap(file);
        if (bitmap.width > 12000 || bitmap.height > 12000) { bitmap.close(); throw new Error('ابعاد تصویر بیش از حد مجاز است.'); }
        const canvas = document.createElement('canvas');
        const ratio = input.dataset.upload === 'photo' ? 1 : input.dataset.upload === 'thumbnail' ? 16 / 9 : bitmap.width / bitmap.height;
        const cropWidth = Math.min(bitmap.width, bitmap.height * ratio);
        const cropHeight = cropWidth / ratio;
        const scale = Math.min(1, 1200 / Math.max(cropWidth, cropHeight));
        canvas.width = Math.round(cropWidth * scale);
        canvas.height = Math.round(cropHeight * scale);
        canvas.getContext('2d').drawImage(bitmap, (bitmap.width - cropWidth) / 2, (bitmap.height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.88));
        if (!blob) throw new Error('تبدیل تصویر انجام نشد.');
      } else blob = new Blob([await file.arrayBuffer()], { type: 'model/gltf-binary' });
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('خواندن فایل انجام نشد.'));
        reader.readAsDataURL(blob);
      });
      const response = await fetch('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': form.elements.namedItem('csrf').value }, body: JSON.stringify({ data }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'بارگذاری انجام نشد.');
      target.value = result.url;
      output.textContent = 'فایل بارگذاری شد. برای ثبت تغییر، فرم را ذخیره کنید.';
    } catch (error) { output.textContent = error.message; }
    finally { if (submit) submit.disabled = false; input.value = ''; }
  }));
  document.querySelectorAll('form[data-editor]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    let notice = form.querySelector('[role=alert]');
    if (!notice) { notice = document.createElement('p'); notice.className = 'error'; notice.setAttribute('role', 'alert'); form.prepend(notice); }
    notice.hidden = true;
    const submit = form.querySelector('.form-actions button');
    submit.disabled = true;
    try {
      const url = form.action.replace('/admin/', '/api/admin/');
      const data = Object.fromEntries(new FormData(form));
      form.querySelectorAll('input[type=checkbox]').forEach(input => { data[input.name] = input.checked; });
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ذخیره انجام نشد.');
      const destination = new URL(form.action).pathname;
      location.assign((destination === '/admin/settings' ? destination : destination.replace(/\/[^/]+$/, '')) + '?message=' + encodeURIComponent('ذخیره شد.'));
    } catch (error) { notice.textContent = error.message; notice.hidden = false; notice.scrollIntoView({ block: 'center' }); }
    finally { submit.disabled = false; }
  }));
})();
