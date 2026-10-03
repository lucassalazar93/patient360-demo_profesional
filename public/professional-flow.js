/* Flujo diario del espacio profesional: acción directa según el estado de cada cita, ficha sin encabezado repetido,
   formularios que abren listos para escribir y transición suave al cambiar de sección. Se monta sobre professional-ux.js. */

// 1. Cada cita muestra una sola acción, la que sigue en el recorrido: llegada, atención, evolución o ficha
pAppt = function (a, compact = false) {
  const p = patient(a.patient), stage = flowStep(a);
  const state = stage > 0 ? pStage(a) : a.status;
  const tone = stage === 1 ? 'blue' : a.status === 'Por confirmar' ? 'amber' : '';
  const action = stage === 0
    ? pBtn('Registrar llegada', 'arrive', a.id, 'quiet')
    : stage === 1
      ? pBtn('Iniciar atención', 'begin', a.id, 'primary')
      : stage === 2
        ? pBtn('Continuar atención', 'patient', `${a.patient}|${a.id}|notes`, 'primary')
        : pBtn('Ver ficha', 'patient', `${a.patient}|${a.id}`, compact ? 'quiet' : '');
  return `<article class="p-row ux-appt is-${stage}"><div class="p-time">${a.time}<br><small>${endTime(a)}</small></div><div class="p-grow"><strong>${esc(p.name)}</strong><p>${esc(a.type)}</p><small class="p-muted">${esc(a.site)} · ${esc(a.room || 'Consultorio por asignar')}</small></div>${pTag(state, tone)}<div class="p-actions">${action}</div></article>`;
};

// 2. "Iniciar atención" abre directamente la evolución de esa visita, sin pasos intermedios
const flowAction = pAction;
pAction = function (act, val) {
  if (act === 'begin') {
    const a = appointments.find(x => x.id === Number(val));
    if (!a) return;
    flowAction('start', val);
    if (flowStep(a) === 2) pOpen(a.patient, a.id, 'notes');
    return;
  }
  return flowAction(act, val);
};

// 3. La ficha pierde el encabezado repetido: queda una franja con el contexto y la vuelta a Mi día
const flowPatient = pViews.patient;
pViews.patient = function () {
  const template = document.createElement('template');
  template.innerHTML = flowPatient();
  const head = template.content.querySelector('.p-head');
  if (head) {
    const top = document.createElement('div');
    top.className = 'ux-patient-top';
    top.innerHTML = `<span class="p-kicker">Ficha clínica</span>${head.querySelector('.p-actions')?.innerHTML || ''}`;
    head.replaceWith(top);
  }
  // En atención, el estado ya aparece junto a la cita: no se repite en las acciones
  const a = pCurrent();
  if (a && flowStep(a) === 2) template.content.querySelector('.p-banner .p-actions')?.replaceChildren();
  return template.innerHTML;
};

// 4. En computador, los formularios abren con el cursor en el primer campo. En pantallas táctiles el foco
//    queda en "Cerrar", como antes, para que el teclado no tape el formulario al abrirlo
const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
const flowModal = pModal;
pModal = function (title, body, kind = '', label = 'Guardar') {
  flowModal(title, body, kind, label);
  if (!finePointer()) return;
  document.querySelector('.p-modal input:not([type=hidden]):not([type=checkbox]):not([type=file]), .p-modal select, .p-modal textarea')?.focus({ preventScroll: true });
};

// 5. La animación de entrada solo corre al cambiar de sección, no al escribir en la búsqueda
let flowLastView = null;
const flowRender = pRender;
pRender = function () {
  flowRender();
  const content = document.querySelector('#professionalApp .p-content');
  if (content && flowLastView !== pro.view) content.classList.add('ux-enter');
  flowLastView = pro.view;
};

// 6. Calendario: franja de días que se toca con el pulgar y lista del día; la semana en tabla solo en pantallas anchas
const wideScreen = () => matchMedia('(min-width: 701px)').matches;
const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
const dayNumber = d => new Date(d + 'T12:00:00').getDate();
pAgenda = function () {
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart(pro.date), i));
  const load = d => pAppointments(d).length + pBlocks(d).length;
  const strip = week.map(d => {
    const n = pAppointments(d).length, active = d === pro.date;
    const status = n ? n + (n === 1 ? ' cita' : ' citas') : pBlocks(d).length ? 'Reservado' : 'Libre';
    return `<button type="button" class="ux-day ${active ? 'active' : ''}" data-pro="day" data-val="${d}" aria-pressed="${active}" aria-label="${fullDate(d)}, ${status}"><span>${dayLabel(d)}</span><b>${dayNumber(d)}</b><small>${status}</small></button>`;
  }).join('');
  const monthRaw = new Date(pro.date + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }), monthTitle = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1);

  const toolbar = `<section class="p-card ux-cal" aria-label="Calendario">
    <div class="ux-cal-bar">
      ${pBtn('‹', 'date-shift', -7, 'quiet ux-icon').replace('>', ' aria-label="Semana anterior">')}
      <div class="ux-cal-title"><strong>${monthTitle}</strong><span>${fullDate(pro.date)}</span></div>
      ${pBtn('›', 'date-shift', 7, 'quiet ux-icon').replace('>', ' aria-label="Semana siguiente">')}
    </div>
    <div class="ux-strip" role="group" aria-label="Días de la semana">${strip}</div>
    <div class="ux-cal-tools">
      <label class="ux-cal-date"><span class="sr-only">Ir a una fecha</span><input class="p-input" type="date" id="pDate" value="${pro.date}"></label>
      <label class="ux-cal-date"><span class="sr-only">Sede</span><select class="p-input" id="pSite" aria-label="Sede">${jOptions(['Todas las sedes', 'El Tesoro', 'Laureles'], pro.site)}</select></label>
      <div class="ux-wide-only">${['Día', 'Semana'].map(x => pBtn(x, 'mode', x, pro.mode === x ? 'primary' : '')).join('')}</div>
      ${pro.date === '2026-10-05' ? '' : pBtn('Volver a hoy', 'date-reset', '', 'quiet')}
    </div>
  </section>`;

  if (pro.mode === 'Semana' && wideScreen()) {
    const grid = week.map(d => `<section class="p-day"><button class="p-day-head ${d === pro.date ? 'active' : ''}" data-pro="day" data-val="${d}">${new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}</button>${pAppointments(d).map(a => `<button class="p-event" data-pro="patient" data-val="${a.patient}|${a.id}"><b>${a.time}–${endTime(a)}</b><span>${esc(patient(a.patient).name)}</span><small>${esc(a.type)}</small></button>`).join('')}${pBlocks(d).map(b => `<button class="p-event block" data-pro="block" data-val="${b.id}"><b>${b.time}–${endTime(b)}</b><span>${esc(b.reason)}</span></button>`).join('')}${load(d) ? '' : '<p class="p-empty">Disponible</p>'}</section>`).join('');
    return pHead('DISPONIBILIDAD PERSONAL', 'Mi agenda', 'Atenciones y espacios protegidos, en un mismo lugar.', pBtn('Reservar tiempo', 'block-new', '', 'primary')) + toolbar + `<div class="p-week">${grid}</div>`;
  }

  const appts = pAppointments(), blocks = pBlocks();
  const summary = appts.length ? `${appts.length} ${appts.length === 1 ? 'cita' : 'citas'}` : 'Sin citas';
  const list = appts.map(a => pAppt(a)).join('') || pEmpty('Sin citas para esta fecha', 'Puedes reservar tiempo de revisión o revisar otro día.');
  const protected_ = blocks.map(b => `<article class="p-row"><div class="p-time">${b.time}</div><div class="p-grow"><strong>${esc(b.reason)}</strong><p>Hasta ${endTime(b)} · ${esc(b.site)}</p></div>${pTag('Tiempo protegido', 'amber')}${pBtn('Ver reserva', 'block', b.id)}</article>`).join('');
  return pHead('DISPONIBILIDAD PERSONAL', 'Mi agenda', 'Atenciones y espacios protegidos, en un mismo lugar.', pBtn('Reservar tiempo', 'block-new', '', 'primary'))
    + toolbar
    + `<section class="p-card"><div class="p-card-head"><h2>${fullDate(pro.date)}</h2>${pTag(summary)}</div><div class="p-agenda-list">${list}${protected_}</div></section>`
    + `<p class="p-note">Los bloqueos se reflejan en la agenda central. Una solicitud de cambio conserva la cita hasta que recepción confirme la reprogramación.</p>`;
};

pViews.agenda = pAgenda; // pViews guarda la referencia original; se actualiza a la nueva

// 7. "Mi día" siempre es hoy: al volver desde otro día de la agenda, la fecha de trabajo regresa a hoy
//    para que llegadas, atenciones y "siguiente paciente" actúen sobre la jornada actual
const FLOW_TODAY = '2026-10-05'; // fecha de referencia del demo
const flowToday = pViews.today;
pViews.today = function () {
  pro.date = FLOW_TODAY;
  return flowToday();
};

// 8. Buscador rápido: pacientes, pendientes, secciones y acciones desde cualquier pantalla (Ctrl K o "/")
const findNorm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const findKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
const findActions = () => [
  ['task-new~', 'Crear pendiente', 'Un compromiso con fecha y prioridad'],
  ['block-new~', 'Reservar tiempo', 'Protege un espacio en tu agenda'],
  ['support~' + pro.patient, 'Solicitar apoyo', 'Pide ayuda al equipo'],
  ['nav~notifications', 'Ver notificaciones', 'Llegadas, cambios y respuestas del equipo']
];
function findDraw(query) {
  const list = document.getElementById('uxFindList');
  if (!list) return;
  const term = findNorm(query.trim()), hit = text => findNorm(text).includes(term);
  const item = (go, title, sub, tag = '') => `<button type="button" class="ux-find-item" data-pro="find-go" data-val="${esc(go)}"><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>${tag}</button>`;
  const group = (title, rows) => rows.length ? `<div class="p-kicker ux-find-group">${title}</div>${rows.join('')}` : '';
  let html;
  if (!term) {
    html = group('Tu jornada', pAppointments(FLOW_TODAY).map(a => item(`patient~${a.patient}|${a.id}`, patient(a.patient).name, `${a.time} · ${a.type}`, pTag(flowStep(a) > 0 ? pStage(a) : a.status))))
      + group('Acciones rápidas', findActions().map(([go, title, sub]) => item(go, title, sub)));
  } else {
    html = group('Pacientes', pPatients().filter(p => hit(p.name)).map(p => item(`patient~${p.id}`, p.name, `${p.age} años · ${p.site}`)))
      + group('Pendientes', pTasks().filter(t => !t.done && hit(t.title)).map(t => item('nav~tasks', t.title, `${patient(t.patient)?.name || 'Organización personal'} · ${dateLabel(t.date)}`)))
      + group('Acciones rápidas', findActions().filter(([, title]) => hit(title)).map(([go, title, sub]) => item(go, title, sub)))
      + group('Secciones', pNav.filter(([, label]) => hit(label)).map(([id, label]) => item('nav~' + id, label, 'Ir a esta sección')));
  }
  list.innerHTML = html || pEmpty('Sin resultados', 'Prueba con el nombre del paciente o con una acción.');
}
function findOpen() {
  if (document.querySelector('.p-modal')) return; // no interrumpe un formulario abierto
  pModal('Buscar', `<input id="uxFind" type="search" autocomplete="off" enterkeyhint="go" placeholder="Paciente, pendiente o acción" aria-label="Buscar paciente, pendiente o acción"><div id="uxFindList" class="ux-find-list"></div>`);
  document.querySelector('.p-modal')?.classList.add('ux-find');
  document.querySelector('.p-modal-back')?.classList.add('ux-find-back');
  findDraw('');
  document.getElementById('uxFind')?.focus();
}
const findAction = pAction;
pAction = function (act, val) {
  if (act === 'find') return findOpen();
  if (act === 'find-go') {
    const i = val.indexOf('~');
    pClose();
    return pAction(val.slice(0, i), val.slice(i + 1));
  }
  return findAction(act, val);
};
document.addEventListener('input', e => { if (e.target.id === 'uxFind') findDraw(e.target.value); });
document.addEventListener('keydown', e => {
  if (!pro.active) return;
  const el = document.activeElement, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName || '');
  if ((e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
    if (document.querySelector('.p-modal')) return;
    e.preventDefault();
    return findOpen();
  }
  const items = [...document.querySelectorAll('#uxFindList .ux-find-item')];
  if (!items.length) return;
  if (e.target.id === 'uxFind' && e.key === 'Enter') { e.preventDefault(); items[0].click(); }
  else if (e.target.id === 'uxFind' && e.key === 'ArrowDown') { e.preventDefault(); items[0].focus(); }
  else if (items.includes(e.target) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const next = items[items.indexOf(e.target) + (e.key === 'ArrowDown' ? 1 : -1)];
    (next || (e.key === 'ArrowUp' ? document.getElementById('uxFind') : null))?.focus();
  }
});

// Después de cada dibujo: buscador en la barra superior, nombre del paciente en la ruta y franja de días centrada
const flowRenderTop = pRender;
pRender = function () {
  flowRenderTop();
  const root = document.getElementById('professionalApp');
  root.querySelector('.p-top-actions')?.insertAdjacentHTML('afterbegin', `<button type="button" class="p-btn ux-find-btn" data-pro="find" aria-label="Buscar paciente, pendiente o acción" aria-keyshortcuts="Control+K">${icon('search')}<span>Buscar</span><kbd>${findKey}</kbd></button>`);
  const crumb = root.querySelector('.p-top-title span');
  if (crumb && pro.view === 'patient') crumb.textContent = ' / ' + (patient(pro.patient)?.name || 'Paciente');
  const strip = root.querySelector('.ux-strip'), active = strip?.querySelector('.active');
  if (strip && active) strip.scrollLeft = active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2;
  histSync();
};

// 9. El botón Atrás (teléfono o navegador) vuelve a la pantalla anterior en lugar de salir de la herramienta.
//    Cada cambio de sección o de paciente queda en el historial; con un formulario abierto, Atrás solo lo cierra
let histKey = null, histFromPop = false;
const histState = () => ({ pv: pro.view, patient: pro.patient, visit: pro.visit, tab: pro.tab });
function histSync() {
  const key = pro.view === 'patient' ? 'patient:' + pro.patient : pro.view;
  if (history.state?.pv === undefined) history.replaceState(histState(), '', '#profesional');
  else if (key !== histKey && !histFromPop) history.pushState(histState(), '', '#profesional');
  histKey = key;
  histFromPop = false;
}
window.addEventListener('popstate', e => {
  if (!pro.active || location.hash !== '#profesional') return; // al salir del espacio decide el manejo de hash existente
  if (document.querySelector('.p-modal')) { pClose(); history.pushState(histState(), '', '#profesional'); return; }
  const s = e.state || {};
  if (s.pv === 'patient' && patient(s.patient)) {
    pro.patient = s.patient; pro.visit = s.visit; pro.tab = s.tab || 'summary';
    journey.patient = state.patient = s.patient;
  }
  pro.view = pViews[s.pv] ? s.pv : 'today';
  histFromPop = true;
  render();
  window.scrollTo(0, 0);
});

// Si el espacio ya estaba abierto al cargar la página, vuelve a dibujarlo con estas funciones
if (pro.active) render();
