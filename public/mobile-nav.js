/* Navegación del espacio central: barra inferior en celular, acceso al espacio profesional en todos los tamaños
   y cierre táctil del menú lateral. Se monta al final y sigue los cambios del menú lateral (#nav) sin tocar sus módulos. */
(() => {
  // Orden de prioridad para la barra del celular; cada perfil muestra las secciones que tenga disponibles
  const PRIMARY = ['contactos','inicio','agenda','salidas','ruta','flujo','pacientes','comunicaciones','equipo','crm','clinico','vip','finanzas'];
  // "ruta" y "flujo" son el mismo recorrido del paciente en perfiles distintos: se muestra una sola vez
  const GROUP = {ruta:'flujo'};
  const SHORT = {contactos:'Contactos',seguimiento:'Seguimiento',inicio:'Inicio',ruta:'Flujo',flujo:'Flujo',agenda:'Agenda',pacientes:'Pacientes',salidas:'Salidas',comunicaciones:'WhatsApp',equipo:'Equipo',crm:'Seguimiento',clinico:'Clínico',vip:'VIP',finanzas:'Finanzas'};
  const nav = document.getElementById('nav'), sidebar = document.getElementById('sidebar'), menuBtn = document.getElementById('menuBtn');
  if (!nav || !sidebar || !menuBtn) return;

  const bar = document.createElement('nav');
  bar.className = 'c-tabbar';
  bar.setAttribute('aria-label', 'Navegación móvil');

  const scrim = document.createElement('div');
  scrim.className = 'c-scrim';
  scrim.setAttribute('aria-hidden', 'true');
  document.body.append(bar, scrim);

  const proLink = document.createElement('a');
  proLink.className = 'btn gold c-pro-link';
  proLink.href = '#profesional';
  proLink.setAttribute('aria-label', 'Abrir espacio profesional');
  const proIcon = '<svg class="c-tooth" viewBox="0 0 64 64" aria-hidden="true"><path d="M17 16c5-5 11-3 15-1 4-2 10-4 15 1 8 8 1 22-5 32-3 5-7 5-8-2l-2-11-2 11c-1 7-5 7-8 2-6-10-13-24-5-32Z"/></svg>';
  proLink.innerHTML = `${proIcon}<span>Espacio profesional</span>`;
  document.getElementById('notifyBtn')?.before(proLink);

  const item = (cls, attrs, icon, label, count = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v));
    b.innerHTML = icon;
    b.append(document.createTextNode(label));
    if (count) { const em = document.createElement('em'); em.textContent = count; b.append(em); }
    return b;
  };

  function build() {
    const items = [...nav.querySelectorAll('.nav-btn[data-nav]')];
    const byKey = new Map(items.map(b => [b.dataset.nav, b]));
    const group = k => GROUP[k] || k;
    const picks = [];
    const add = k => { if (picks.length < 3 && !picks.some(p => group(p) === group(k))) picks.push(k); };
    PRIMARY.filter(k => byKey.has(k)).forEach(add);
    items.forEach(b => add(b.dataset.nav));

    const buttons = picks.map(key => {
      const src = byKey.get(key);
      const svg = src.querySelector('svg')?.outerHTML || '';
      const count = src.querySelector('em')?.textContent || '';
      const label = SHORT[key] || src.querySelector('span')?.textContent || key;
      return item(src.classList.contains('active') ? 'active' : '', { 'data-c-nav': key }, svg, label, count);
    });

    const isOpen = sidebar.classList.contains('open');
    buttons.push(item('', { 'data-c-pro': '1' }, proIcon, 'Profesional'));
    buttons.push(item('', { 'data-c-menu': '1', 'aria-expanded': String(isOpen) }, '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-menu"/></svg>', 'Más'));
    bar.replaceChildren(...buttons);
  }

  bar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cNav) {
      nav.querySelector(`.nav-btn[data-nav="${b.dataset.cNav}"]`)?.click();
      window.scrollTo({ top: 0 });
    } else if (b.dataset.cPro) {
      const enter = document.querySelector('[data-pro="enter"]');
      if (enter) enter.click(); else location.hash = '#profesional';
    } else if (b.dataset.cMenu) {
      menuBtn.click();
    }
  });

  const syncMenu = () => {
    const open = sidebar.classList.contains('open');
    document.body.classList.toggle('c-menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    bar.querySelector('[data-c-menu]')?.setAttribute('aria-expanded', String(open));
  };
  new MutationObserver(syncMenu).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  scrim.addEventListener('click', () => sidebar.classList.remove('open'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') sidebar.classList.remove('open'); });

  new MutationObserver(build).observe(nav, { childList: true, subtree: true });
  build();
  syncMenu();
})();

/* Menú lateral contraíble en tablet y computador, para la central y el espacio profesional. Contraído queda un riel
   de íconos; la preferencia se recuerda en el equipo. En celular el botón de la central sigue abriendo el menú como panel. */
(() => {
  const KEY = 'p360-nav', root = document.documentElement;
  const central = matchMedia('(min-width: 761px)'), professional = matchMedia('(min-width: 701px)');
  const inPro = () => document.body.classList.contains('professional-mode');
  // Hay menú lateral que contraer solo cuando se muestra como columna, no como panel ni oculto
  const hasRail = () => (inPro() ? professional : central).matches;
  const collapsed = () => root.classList.contains('nav-collapsed');

  function sync() {
    const isCollapsed = collapsed(), label = isCollapsed ? 'Expandir menú' : 'Contraer menú';
    const menuBtn = document.getElementById('menuBtn');
    document.querySelectorAll('[data-nav-toggle]').forEach(b => {
      b.setAttribute('aria-expanded', String(!isCollapsed));
      b.setAttribute('aria-label', label);
      b.title = `${label} (Ctrl+B)`;
    });
    if (menuBtn) {
      const rail = central.matches;
      menuBtn.setAttribute('aria-label', rail ? label : 'Abrir menú');
      menuBtn.setAttribute('aria-expanded', String(rail ? !isCollapsed : document.getElementById('sidebar')?.classList.contains('open')));
      menuBtn.title = rail ? `${label} (Ctrl+B)` : '';
    }
    // En el riel solo quedan los íconos: el nombre de la sección pasa a la ayuda emergente
    const rail = isCollapsed && hasRail();
    document.querySelectorAll('.nav-btn, .p-nav').forEach(b => {
      const name = b.querySelector('span')?.textContent.trim();
      if (rail && name) b.title = name; else b.removeAttribute('title');
    });
  }

  function toggle() {
    const next = !collapsed();
    root.classList.toggle('nav-collapsed', next);
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch (e) { /* sin almacenamiento: vale para esta visita */ }
    sync();
  }

  // En captura: en computador el botón de la central contrae el menú en vez de abrirlo como panel
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-nav-toggle], #menuBtn');
    if (!b || (b.id === 'menuBtn' && !central.matches)) return;
    e.stopPropagation();
    toggle();
  }, true);

  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b') return;
    if (!hasRail() || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    toggle();
  });

  // El espacio profesional y el menú de la central se redibujan: los botones nuevos reciben su estado
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sync(); });
  }).observe(document.body, { childList: true, subtree: true });
  central.addEventListener('change', sync);
  sync();
})();
