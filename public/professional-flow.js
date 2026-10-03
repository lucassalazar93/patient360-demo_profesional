/* Espacio profesional como herramienta personal: agenda propia, pacientes y pendientes, con una sola acción por cita.
   Sin solicitudes de apoyo, sin sección Equipo y sin pasos de recepción o administración: el profesional inicia la
   atención, registra la evolución y la finaliza; la salida administrativa continúa sola en la plataforma central.
   Se monta sobre professional.js y professional-ux.js y reutiliza sus datos y acciones. */

const FLOW_TODAY = P360.today; // el mismo "hoy" que usa toda la plataforma

// 1. Navegación personal: Mi día, Mi agenda, Mis pacientes y Pendientes. La coordinación del equipo queda en la central
const teamNav = pNav.findIndex(([id]) => id === 'team');
if (teamNav > -1) pNav.splice(teamNav, 1);

// 2. Estado de la cita en palabras del profesional y la única acción que le corresponde
const proStage = a => { const s = flowStep(a); return s >= 3 ? 'Atendida' : s === 2 ? 'En atención' : s === 1 ? 'En recepción' : a.status; };
const proTone = a => flowStep(a) === 1 ? 'blue' : flowStep(a) === 0 && a.status === 'Por confirmar' ? 'amber' : '';
const apptAction = (a, strong = 'primary', calm = 'quiet') => {
  const s = flowStep(a);
  if (s === 2) return pBtn('Continuar atención', 'patient', `${a.patient}|${a.id}|notes`, strong);
  if (s === 1) return pBtn('Iniciar atención', 'begin', a.id, strong);
  return pBtn('Ver ficha', 'patient', `${a.patient}|${a.id}`, calm);
};
pAppt = function (a) {
  const p = patient(a.patient);
  return `<article class="p-row ux-appt is-${flowStep(a)}"><div class="p-time">${a.time}<br><small>${endTime(a)}</small></div><div class="p-grow"><strong>${esc(p.name)}</strong><p>${esc(a.type)}</p><small class="p-muted">${esc(a.site)} · ${esc(a.room || 'Consultorio por asignar')}</small></div>${pTag(proStage(a), proTone(a))}<div class="p-actions">${apptAction(a)}</div></article>`;
};

// 3. Atender en dos gestos: iniciar (abre la evolución) y finalizar (la salida pasa sola a administración)
const flowAction = pAction;
pAction = function (act, val) {
  if (act === 'begin') {
    const a = appointments.find(x => x.id === Number(val));
    if (!a || flowStep(a) > 1) return;
    const busy = pMine().find(x => flowStep(x) === 2 && x.id !== a.id);
    if (busy) return toast('Finaliza primero la atención de ' + patient(busy.patient).name + '.');
    if (flowStep(a) === 0) visitFlow[a.id] = 1; // el profesional recibe al paciente sin esperar el registro de recepción
    flowAction('start', val);
    if (flowStep(a) === 2) pOpen(a.patient, a.id, 'notes');
    return;
  }
  if (act === 'finish') {
    const a = appointments.find(x => x.id === Number(val));
    if (!a || flowStep(a) !== 2) return;
    if (!clinical.some(c => c.visit === a.id)) { pro.tab = 'notes'; render(); return toast('Guarda la evolución antes de finalizar la atención.'); }
    // Reutiliza la entrega existente con valores por defecto: recepción recibe la visita y su tarea, sin formulario
    flowModal('Finalizar atención', `<input type="hidden" name="visit" value="${a.id}"><input type="hidden" name="next" value="${P360.checkoutTask}"><input type="hidden" name="date" value="${addDays(a.date, 1)}">`, 'handoff');
    document.getElementById('pForm').requestSubmit();
    return toast('Atención finalizada. Administración continúa con la salida.');
  }
  if (act === 'jump') return document.getElementById(val)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (act === 'note-add') {
    const text = document.getElementById('uxPatientNote')?.value.trim();
    if (!text) return toast('Escribe la nota antes de agregarla.');
    clinicalProfile(Number(val)).notes.unshift({ author: proName, date: FLOW_TODAY, text });
    render();
    return toast('Nota agregada a la ficha.');
  }
  return flowAction(act, val);
};

// 4. En la ficha, un solo recuadro dice qué sigue. Reemplaza el paso a paso Preparar / Atender / Cerrar
uxNext = function (a) {
  if (!a) return '';
  const s = flowStep(a), saved = clinical.some(c => c.visit === a.id);
  if (s <= 1 && a.date !== FLOW_TODAY) return ''; // cita de otro día: solo contexto
  let title, text, action;
  if (s <= 1) { title = s === 1 ? 'El paciente ya está en la clínica' : 'Cita de hoy · ' + a.time; text = 'Revisa el contexto y comienza cuando estés listo.'; action = pBtn('Iniciar atención', 'begin', a.id, 'primary'); }
  else if (s === 2 && !saved) { title = 'Atención en curso'; text = 'Registra la evolución de la visita para poder finalizarla.'; action = pBtn('Escribir evolución', 'write-note', a.id, 'primary'); }
  else if (s === 2) { title = 'Evolución guardada'; text = 'Al finalizar, administración continúa con la salida del paciente.'; action = pBtn('Finalizar atención', 'finish', a.id, 'primary'); }
  else { title = 'Atención finalizada'; text = 'Administración continúa con la salida del paciente.'; action = pBtn('Siguiente paciente', 'next-patient', '', 'primary'); }
  return `<section class="ux-guide" aria-label="Siguiente paso"><div class="ux-next"><div><strong>${title}</strong><p>${text}</p></div>${action}</div></section>`;
};

// 5. Ficha del paciente: todo lo que el odontólogo necesita, fácil de encontrar. Las alertas (alergias y condiciones)
//    quedan a la vista en todas las pestañas; el resumen se ordena por secciones con un índice para saltar entre ellas
const listOr = (items, empty) => items.length ? items.map(esc).join(' · ') : empty;
const fact = (label, value, alert = false) => `<div><dt>${label}</dt><dd${alert ? ' class="alert"' : ''}>${value}</dd></div>`;
function alertTags(c) {
  return (c.allergies.length ? c.allergies.map(x => pTag('Alergia: ' + x, 'red')).join('') : pTag('Sin alergias conocidas'))
    + c.conditions.map(x => pTag(x, 'amber')).join('');
}
function flowSummary(p) {
  const c = clinicalProfile(p.id), v = profileFor(p.id);
  const notes = clinical.filter(n => n.patient === p.id).slice().reverse();
  const plans = treatments.filter(t => t.patient === p.id);
  const tasks = pTasks().filter(t => t.patient === p.id && !t.done);
  const sections = [['alertas', 'Alertas'], ['motivo', 'Motivo'], ['plan', 'Plan'], ['notas', 'Notas'], ['contacto', 'Contacto'], ['documentos', 'Documentos']];
  return `<nav class="ux-index" aria-label="Secciones del resumen">${sections.map(([id, label]) => pBtn(label, 'jump', 'ux-sec-' + id, 'quiet')).join('')}</nav>
  <div class="p-grid ux-summary"><div>
    <section class="p-card" id="ux-sec-alertas"><h2>Alertas médicas</h2><dl class="ux-facts">
      ${fact('Alergias', listOr(c.allergies, 'Sin alergias conocidas'), c.allergies.length > 0)}
      ${fact('Condiciones', listOr(c.conditions, 'Ninguna registrada'), c.conditions.length > 0)}
      ${fact('Medicación actual', listOr(c.medication, 'No toma medicamentos'))}
      ${fact('Anestesia', esc(c.anesthesia))}
      ${fact('Tensión arterial', esc(c.bloodPressure))}
    </dl></section>
    <section class="p-card" id="ux-sec-motivo"><h2>Motivo de consulta</h2><p>${esc(c.reason)}</p><dl class="ux-facts">
      ${fact('Expectativa', esc(c.expectation))}
      ${fact('Hábitos', listOr(c.habits, 'Sin hábitos de riesgo'))}
      ${fact('Higiene oral', esc(c.hygiene))}
      ${fact('Última limpieza', dateLabel(c.lastCleaning))}
      ${fact('Antecedentes', listOr(c.history, 'Sin antecedentes odontológicos'))}
    </dl></section>
    <section class="p-card" id="ux-sec-plan"><h2>Plan de tratamiento</h2>${plans.map(t => `<article class="p-row"><div class="p-grow"><strong>${esc(t.title)}</strong><p>${esc(t.professional)}</p></div>${pTag(t.status)}<div style="width:100%">${(patientPlans[t.id] || []).map(x => `<div class="p-muted">${x.done ? '✓' : '○'} ${esc(x.name)}</div>`).join('')}</div></article>`).join('') || pEmpty('Sin plan registrado', 'Define los próximos pasos en la evolución.')}
      <h3 class="ux-sub">Último registro clínico</h3>${notes.length ? `<p>${esc(notes[0].text)}</p><small class="p-muted">${esc(notes[0].professional)} · ${dateLabel(notes[0].date)}</small><div class="ux-more">${pBtn('Ver todas las evoluciones', 'tab', 'notes', 'quiet')}</div>` : '<p class="p-muted">Aún no hay evoluciones registradas.</p>'}
    </section>
  </div><aside>
    <section class="p-card" id="ux-sec-notas"><h2>Notas y comentarios</h2>
      <div class="ux-note-add"><textarea id="uxPatientNote" rows="2" maxlength="600" placeholder="Escribe una nota sobre ${esc(p.name.split(' ')[0])}…" aria-label="Nueva nota"></textarea>${pBtn('Agregar nota', 'note-add', p.id)}</div>
      ${c.notes.map(n => `<article class="ux-note-item"><p>${esc(n.text)}</p><small>${esc(n.author)} · ${dateLabel(n.date)}</small></article>`).join('') || '<p class="p-muted">Aún no hay notas.</p>'}
      <h3 class="ux-sub">Lo que importa a ${esc(p.name.split(' ')[0])}</h3><p>${esc(v.comfort)}</p><p>${esc(v.privacy)}</p><p class="p-muted">Horario preferido: ${esc(v.schedule)}</p>
    </section>
    <section class="p-card" id="ux-sec-contacto"><h2>Contacto</h2><dl class="ux-facts">
      ${fact('Teléfono', esc(p.phone || 'Sin registrar'))}
      ${fact('Emergencia', esc(c.emergency))}
      ${fact('Sede', esc(p.site))}
    </dl></section>
    <section class="p-card" id="ux-sec-documentos"><h2>Documentos</h2>${c.documents.map(([name, date]) => `<div class="ux-doc"><span>${esc(name)}</span><small>${dateLabel(date)}</small></div>`).join('')}
      <h3 class="ux-sub">Próximos compromisos</h3>${tasks.map(t => pTaskCard(t, true)).join('') || '<p class="p-muted">Sin pendientes con este paciente.</p>'}<div class="ux-more">${pBtn('Crear pendiente', 'task-new', p.id)}</div>
    </section>
  </aside></div>`;
}
const flowPatient = pViews.patient;
pViews.patient = function () {
  const template = document.createElement('template');
  template.innerHTML = flowPatient();
  const root = template.content, a = pCurrent(), p = patient(pro.patient);
  root.querySelector('.p-patient-head')?.insertAdjacentHTML('afterend', `<div class="ux-alerts" aria-label="Alertas clínicas">${alertTags(clinicalProfile(p.id))}</div>`);
  const level = root.querySelector('.p-patient-head .p-actions'); // el nivel de atención va en la misma fila que las alertas
  if (level) { root.querySelector('.ux-alerts').append(...level.querySelectorAll('.p-tag')); level.remove(); }
  if (pro.tab === 'summary') {
    const body = root.querySelector('.p-clinical-tabs')?.nextElementSibling;
    if (body) { body.insertAdjacentHTML('afterend', flowSummary(p)); body.remove(); }
  }
  const head = root.querySelector('.p-head');
  if (head) {
    const top = document.createElement('div');
    top.className = 'ux-patient-top';
    top.innerHTML = `<span class="p-kicker">Ficha clínica</span>${head.querySelector('.p-actions')?.innerHTML || ''}`;
    head.replaceWith(top);
  }
  root.querySelectorAll('.p-patient-head [data-pro="support"], .p-patient-head [data-pro="team-patient"]').forEach(b => b.remove());
  const banner = root.querySelector('.p-banner');
  if (banner && a) {
    const tag = banner.querySelector('.p-tag');
    if (tag) tag.textContent = proStage(a);
    if (flowStep(a) >= 2) banner.querySelector('.p-actions')?.remove(); // el estado ya está junto a la cita
    const note = a.date === FLOW_TODAY && flowStep(a) <= 2 ? journey.chat.filter(m => m.patient === a.patient && m.author !== proName).at(-1) : null;
    if (note) banner.insertAdjacentHTML('afterend', `<p class="ux-reception"><strong>Nota de recepción</strong>${esc(note.text)}</p>`);
  }
  return template.innerHTML;
};

// 6. Mi día: siempre es hoy; cabecera con las dos acciones personales, tarjeta del próximo paciente con su acción
//    directa y sin el bloque de coordinación
const flowToday = pViews.today;
pViews.today = function () {
  pro.date = FLOW_TODAY;
  const template = document.createElement('template');
  template.innerHTML = flowToday();
  const root = template.content;
  root.querySelector('.p-head .p-actions').innerHTML = pBtn('Reservar tiempo', 'block-new') + pBtn('Crear pendiente', 'task-new');
  root.querySelectorAll('.p-stat span').forEach(s => { if (/entregadas/i.test(s.textContent)) s.textContent = 'Atenciones finalizadas'; });
  const focus = root.querySelector('.p-focus');
  const next = focus && appointments.find(x => x.id === Number(focus.querySelector('[data-pro="patient"]')?.dataset.val.split('|')[1]));
  if (next) {
    focus.querySelector('.p-actions').innerHTML = apptAction(next, 'gold', 'gold');
    focus.querySelector('.ux-focus-hint')?.remove();
    const state = [...focus.querySelectorAll('.p-focus-info strong')].at(-1);
    if (state) state.textContent = flowStep(next) === 0 ? 'Por llegar' : proStage(next);
  }
  [...root.querySelectorAll('.p-card')].find(c => c.querySelector('[data-val="team"]'))?.remove();
  return template.innerHTML;
};

// 7. Preferencias: sin la categoría de mensajes del equipo, con el aviso de próxima cita y los avisos del dispositivo
const flowSettings = pViews.settings;
pViews.settings = function () {
  const template = document.createElement('template');
  template.innerHTML = flowSettings();
  const root = template.content;
  root.querySelector('[data-p-setting="team"]')?.closest('label')?.remove();
  root.querySelector('.p-setting')?.insertAdjacentHTML('beforebegin', `<label class="p-setting"><div><strong>Próxima cita</strong><p>Te avisa quién sigue, a qué hora y en qué consultorio.</p></div><input type="checkbox" data-p-setting="next" ${pro.settings.next ? 'checked' : ''}></label>`);
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const status = { unsupported: 'Este navegador no admite avisos del sistema.', denied: 'Bloqueados en el navegador. Permítelos en los permisos del sitio.', granted: 'Activados. El aviso llega aunque estés en otra pestaña o aplicación.', default: 'Recibe el aviso aunque estés en otra pestaña o aplicación.' }[permission];
  root.querySelector('.p-card')?.insertAdjacentHTML('afterend', `<section class="p-card"><h2>En este dispositivo</h2><div class="p-setting ux-device"><div><strong>Avisos fuera de la aplicación</strong><p>${status}</p></div><div class="p-actions">${permission === 'default' ? pBtn('Activar', 'push-enable', '', 'primary') : ''}${pBtn('Probar aviso', 'push-test')}</div></div><p class="p-note">Llegan mientras la herramienta está abierta o en segundo plano.</p></section>`);
  return template.innerHTML;
};

// 8. En computador, los formularios abren con el cursor en el primer campo. En pantallas táctiles el foco
//    queda en "Cerrar", como antes, para que el teclado no tape el formulario al abrirlo
const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
const flowModal = pModal;
pModal = function (title, body, kind = '', label = 'Guardar') {
  flowModal(title, body, kind, label);
  if (!finePointer()) return;
  document.querySelector('.p-modal input:not([type=hidden]):not([type=checkbox]):not([type=file]), .p-modal select, .p-modal textarea')?.focus({ preventScroll: true });
};

// 9. Calendario: franja de días que se toca con el pulgar y lista del día; la semana en tabla solo en pantallas anchas
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
  const head = pHead('DISPONIBILIDAD PERSONAL', 'Mi agenda', 'Tus citas y tu tiempo protegido, en un mismo lugar.', pBtn('Reservar tiempo', 'block-new', '', 'primary'));

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
      ${pro.date === FLOW_TODAY ? '' : pBtn('Volver a hoy', 'date-reset', '', 'quiet')}
    </div>
  </section>`;

  if (pro.mode === 'Semana' && wideScreen()) {
    const grid = week.map(d => `<section class="p-day"><button class="p-day-head ${d === pro.date ? 'active' : ''}" data-pro="day" data-val="${d}">${new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}</button>${pAppointments(d).map(a => `<button class="p-event" data-pro="patient" data-val="${a.patient}|${a.id}"><b>${a.time}–${endTime(a)}</b><span>${esc(patient(a.patient).name)}</span><small>${esc(a.type)}</small></button>`).join('')}${pBlocks(d).map(b => `<button class="p-event block" data-pro="block" data-val="${b.id}"><b>${b.time}–${endTime(b)}</b><span>${esc(b.reason)}</span></button>`).join('')}${load(d) ? '' : '<p class="p-empty">Disponible</p>'}</section>`).join('');
    return head + toolbar + `<div class="p-week">${grid}</div>`;
  }

  const appts = pAppointments(), blocks = pBlocks();
  const summary = appts.length ? `${appts.length} ${appts.length === 1 ? 'cita' : 'citas'}` : 'Sin citas';
  const list = appts.map(a => pAppt(a)).join('') || pEmpty('Sin citas para esta fecha', 'Puedes reservar tiempo de revisión o revisar otro día.');
  const reserved = blocks.map(b => `<article class="p-row"><div class="p-time">${b.time}</div><div class="p-grow"><strong>${esc(b.reason)}</strong><p>Hasta ${endTime(b)} · ${esc(b.site)}</p></div>${pTag('Tiempo protegido', 'amber')}${pBtn('Ver reserva', 'block', b.id)}</article>`).join('');
  return head + toolbar
    + `<section class="p-card"><div class="p-card-head"><h2>${fullDate(pro.date)}</h2>${pTag(summary)}</div><div class="p-agenda-list">${list}${reserved}</div></section>`
    + `<p class="p-note">Tus reservas de tiempo se reflejan en la agenda central. Un cambio de horario conserva la cita hasta que recepción lo confirme.</p>`;
};
pViews.agenda = pAgenda; // pViews guarda la referencia original; se actualiza a la nueva

// 10. Buscador rápido: pacientes, pendientes, secciones y acciones desde cualquier pantalla (Ctrl K o "/")
const findNorm = s => String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const findKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
const findActions = [
  ['task-new~', 'Crear pendiente', 'Un compromiso con fecha y prioridad'],
  ['block-new~', 'Reservar tiempo', 'Protege un espacio en tu agenda'],
  ['nav~notifications', 'Ver notificaciones', 'Llegadas, cambios de agenda y pendientes']
];
function findDraw(query) {
  const list = document.getElementById('uxFindList');
  if (!list) return;
  const term = findNorm(query.trim()), hit = text => findNorm(text).includes(term);
  const item = (go, title, sub, tag = '') => `<button type="button" class="ux-find-item" data-pro="find-go" data-val="${esc(go)}"><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>${tag}</button>`;
  const group = (title, rows) => rows.length ? `<div class="p-kicker ux-find-group">${title}</div>${rows.join('')}` : '';
  let html;
  if (!term) {
    html = group('Tu jornada', pAppointments(FLOW_TODAY).map(a => item(`patient~${a.patient}|${a.id}`, patient(a.patient).name, `${a.time} · ${a.type}`, pTag(proStage(a), proTone(a)))))
      + group('Acciones rápidas', findActions.map(([go, title, sub]) => item(go, title, sub)));
  } else {
    html = group('Pacientes', pPatients().filter(p => hit(p.name)).map(p => item(`patient~${p.id}`, p.name, `${p.age} años · ${p.site}`)))
      + group('Pendientes', pTasks().filter(t => !t.done && hit(t.title)).map(t => item('nav~tasks', t.title, `${patient(t.patient)?.name || 'Organización personal'} · ${dateLabel(t.date)}`)))
      + group('Acciones rápidas', findActions.filter(([, title]) => hit(title)).map(([go, title, sub]) => item(go, title, sub)))
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

// 11. Después de cada dibujo: entrada suave al cambiar de sección, buscador en la barra superior, nombre del
//     paciente en la ruta, franja de días centrada e historial al día
let flowLastView = null;
const flowRender = pRender;
pRender = function () {
  flowRender();
  const root = document.getElementById('professionalApp');
  const content = root.querySelector('.p-content');
  if (content && flowLastView !== pro.view) content.classList.add('ux-enter'); // no se repite al escribir en una búsqueda
  flowLastView = pro.view;
  root.querySelector('.p-top-actions')?.insertAdjacentHTML('afterbegin', `<button type="button" class="p-btn ux-find-btn" data-pro="find" aria-label="Buscar paciente, pendiente o acción" aria-keyshortcuts="Control+K">${icon('search')}<span>Buscar</span><kbd>${findKey}</kbd></button>`);
  const crumb = root.querySelector('.p-top-title span');
  if (crumb && pro.view === 'patient') crumb.textContent = ' / ' + (patient(pro.patient)?.name || 'Paciente');
  const strip = root.querySelector('.ux-strip'), active = strip?.querySelector('.active');
  if (strip && active) strip.scrollLeft = active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2;
  histSync();
};

// 12. El botón Atrás (teléfono o navegador) vuelve a la pantalla anterior en lugar de salir de la herramienta.
//     Cada cambio de sección o de paciente queda en el historial; con un formulario abierto, Atrás solo lo cierra
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
  pro.view = pViews[s.pv] && s.pv !== 'team' ? s.pv : 'today';
  histFromPop = true;
  render();
  window.scrollTo(0, 0);
});

// 13. Avisos de próxima cita: una tarjeta aparece sola con el siguiente paciente, para no estar pendiente de la
//     pantalla. Si el profesional activa los avisos del dispositivo, también llega con la herramienta en segundo
//     plano. No hay servidor de envío: funciona con la herramienta abierta o minimizada, no cuando está cerrada
pro.settings.next = true;
const remindSeen = new Set();
let remindTimer = null, remindHide = null;
const remindHost = document.createElement('div');
remindHost.id = 'uxPush';
remindHost.setAttribute('role', 'status');
remindHost.setAttribute('aria-live', 'polite');
document.body.append(remindHost);

const pushSupported = () => 'Notification' in window;
const pushGranted = () => pushSupported() && Notification.permission === 'granted';
function remindClose() { clearTimeout(remindHide); remindHost.replaceChildren(); }
function remindSoon(ms) { clearTimeout(remindTimer); remindTimer = setTimeout(() => remindShow(remindPick()), ms); }
function remindPick() {
  const list = pMine().filter(a => a.date === FLOW_TODAY).sort((a, b) => a.time.localeCompare(b.time));
  if (list.some(a => flowStep(a) === 2)) return null; // no interrumpe una atención en curso
  return list.find(a => flowStep(a) === 1) || list.find(a => flowStep(a) === 0) || null;
}
function bellSync() {
  if (pro.view === 'notifications') return render();
  const bell = document.querySelector('#professionalApp .p-top-actions [data-val="notifications"]');
  if (!bell) return;
  const unread = pro.notices.filter(n => !n.read).length;
  bell.querySelector('.p-unread')?.remove();
  if (unread) bell.insertAdjacentHTML('beforeend', `<span class="p-unread">${unread}</span>`);
  bell.setAttribute('aria-label', `Notificaciones ${unread} sin leer`);
}
function remindShow(a, force = false) {
  if (!a || !pro.active || (!force && !pro.settings.next)) return;
  const arrived = flowStep(a) === 1, key = a.id + ':' + flowStep(a);
  if (!force && remindSeen.has(key)) return;
  const first = !remindSeen.has(key);
  remindSeen.add(key);
  const p = patient(a.patient), place = a.room || a.site;
  const title = arrived ? 'Tu paciente ya llegó' : 'Próxima cita', detail = `${a.time} · ${a.type} · ${place}`;
  if (first && !arrived) { pNotice('next', title, `${p.name} · ${a.time} · ${place}`, a.patient, a.id); bellSync(); } // la llegada ya tiene su aviso
  remindHost.innerHTML = `<div class="ux-push"><div class="ux-push-icon" aria-hidden="true">${document.querySelector('.brand-mark svg')?.outerHTML || ''}</div><div class="ux-push-body"><small>${title}</small><strong>${esc(p.name)}</strong><span>${esc(detail)}</span><div class="ux-push-actions">${apptAction(a, 'primary', 'primary')}${pBtn('Ahora no', 'remind-close', '', 'quiet')}</div></div><button type="button" class="ux-push-x" data-pro="remind-close" aria-label="Cerrar aviso">×</button></div>`;
  clearTimeout(remindHide);
  remindHide = setTimeout(remindClose, 12000);
  if (pushGranted() && (force || document.visibilityState !== 'visible')) pushSend(title, `${p.name} · ${detail}`, a);
}
async function pushSend(title, body, a) {
  const options = { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'p360-' + a.id, data: { patient: a.patient, visit: a.id } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(title, options);
    const n = new Notification(title, options);
    n.onclick = () => { window.focus(); n.close(); if (pro.active) pOpen(a.patient, a.id); };
  } catch { /* el aviso dentro de la herramienta ya quedó visible */ }
}
async function pushEnable() {
  if (!pushSupported()) return toast('Este navegador no admite avisos del sistema.');
  const result = await Notification.requestPermission();
  if (result === 'granted') { navigator.serviceWorker?.register('sw.js').catch(() => {}); toast('Avisos activados en este dispositivo.'); }
  else toast('El navegador no permitió los avisos.');
  render();
}
if (pushGranted()) navigator.serviceWorker?.register('sw.js').catch(() => {});
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.type === 'p360-open' && pro.active && patient(e.data.patient)) pOpen(e.data.patient, e.data.visit);
});

const remindAction = pAction;
pAction = function (act, val) {
  if (act === 'remind-close') return remindClose();
  if (act === 'push-enable') return pushEnable();
  if (act === 'push-test') {
    toast('El aviso llega en 5 segundos. Puedes cambiar de pestaña o de aplicación.');
    const today = pMine().filter(a => a.date === FLOW_TODAY).sort((a, b) => a.time.localeCompare(b.time));
    return void setTimeout(() => remindShow(remindPick() || today.find(a => flowStep(a) < 3) || today[0], true), 5000);
  }
  if (act === 'begin' || act === 'patient') remindClose(); // al abrir la ficha el aviso ya cumplió
  const result = remindAction(act, val);
  if (act === 'finish') remindSoon(2500); // al finalizar, avisa quién sigue
  return result;
};
const flowEnter = pEnter;
// Al volver a la central se retoma el perfil y la pantalla que estaban abiertos antes de entrar
const central = { user: 'reception', view: 'ruta' };
pEnter = function () {
  if (!pro.active && journey.user !== 'dentist') Object.assign(central, { user: journey.user, view: state.view });
  flowEnter();
  remindSoon(4000);
};
const flowExit = pExit;
pExit = function (handoff = false) {
  clearTimeout(remindTimer); remindClose();
  flowExit(handoff);
  if (handoff) return;
  jSwitch(central.user);
  state.view = central.view;
  render();
};

// Si el espacio ya estaba abierto al cargar la página, vuelve a dibujarlo con estas funciones
if (pro.active) { if (pro.view === 'team') pro.view = 'today'; render(); remindSoon(4000); }
