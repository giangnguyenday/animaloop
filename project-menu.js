import { download } from './image-export.js';

export function bindProjectFiles({ filename, getProject, openProject, notify, invalidMessage }) {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'application/json,.json';
  picker.hidden = true;
  document.body.append(picker);

  document.getElementById('project-open').addEventListener('click', (event) => {
    event.currentTarget.closest('details').open = false;
    picker.click();
  });
  document.getElementById('project-save').addEventListener('click', (event) => {
    event.currentTarget.closest('details').open = false;
    const project = JSON.stringify(getProject(), null, 2);
    download(new Blob([project], { type: 'application/json' }), filename);
    notify('Editable project saved.');
  });
  picker.addEventListener('change', async () => {
    const [file] = picker.files;
    if (!file) return;
    picker.value = '';
    try {
      await openProject(JSON.parse(await file.text()));
      notify('Project opened.');
    } catch {
      notify(invalidMessage);
    }
  });
}

export function bindActionMenus() {
  document.addEventListener('click', (event) => {
    for (const menu of document.querySelectorAll('.action-menu[open]')) {
      if (!menu.contains(event.target)) menu.open = false;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const menu = document.querySelector('.action-menu[open]');
    if (!menu) return;
    event.preventDefault();
    menu.open = false;
    menu.querySelector('summary').focus();
  });
}
