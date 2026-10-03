/* Agenda y ciclo de la cita en la plataforma central: vista de día y de semana, panel lateral con una acción
   principal por cita, reserva con horarios sugeridos, reprogramación, cancelación, ausencias, llegada y cola de
   salidas. Aquí solo se dibuja y se despacha: el estado, las reglas y la disponibilidad viven en
   appointments-core.js (P360). La fecha visible es state.agendaDay, la misma que usan los módulos anteriores. */
(() => {
  const PX = 1.5, DAY_START = 480, DAY_END = 1080; // 1,5 px por minuto, de 08:00 a 18:00
  const ag = { mode: 'day', professional: 'Todos', panel: null };
  const CANCEL_REASONS = ['El paciente no puede asistir', 'Enfermedad', 'Motivo económico', 'La clínica reprograma', 'Otro'];
  const PAY_METHODS = ['Transferencia', 'Tarjeta', 'Efectivo'];
  const EVENT_LABELS = { reserva: 'Cita reservada', confirmacion: 'Confirmada por el paciente', sin_respuesta: 'Sin respuesta', cambio_solicitado: 'Cambio de horario solicitado', reprogramacion: 'Reprogramada', cancelacion: 'Cancelada', llegada: 'Llegada', inicio_atencion: 'Inicio de atención', fin_atencion: 'Fin de atención', cobro: 'Cobro', salida: 'Salida administrativa', no_asistio: 'No asistió' };

  // ── Ayudas de formato
  const cap = text => text.charAt(0).toUpperCase() + text.slice(1);
  const dayOf = (date, options) => new Date(date + 'T12:00:00').toLocaleDateString('es-CO', options).replace('.', '');
  const longDay = date => cap(dayOf(date, { weekday: 'long', day: 'numeric', month: 'long' }));
  const shortDay = date => (date === P360.today ? 'Hoy' : date === addDays(P360.today, 1) ? 'Mañana' : cap(dayOf(date, { weekday: 'short', day: 'numeric', month: 'short' })));
  const norm = text => String(text).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const clinicalEnd = a => hhmm(minutes(a.time) + Number(a.clinicalDuration || a.duration));
  const button = (label, action, value = '', style = '') => `<button type="button" class="btn ${style}" data-ag="${action}" data-val="${esc(value)}">${label}</button>`;
  const link = (label, action, value = '') => `<button type="button" class="ag-link" data-ag="${action}" data-val="${esc(value)}">${label}</button>`;
  const visible = a => (state.site === 'Todas las sedes' || a.site === state.site) && (ag.professional === 'Todos' || a.professional === ag.professional);
  const canCheckout = () => ['Recepción', 'Administrador', 'Contabilidad'].includes(userNow().role);
  const allowed = ok => ok || (toast('Esta acción corresponde a otro perfil.'), false);
  const current = () => appointments.find(a => a.id === ag.panel?.id) || null;

  // ── Agenda
  function column(spec, items, blocks) {
    const work = P360.workIntervals(spec.professional || professionals[0], spec.date);
    const events = [...items, ...blocks].sort((a, b) => minutes(a.time) - minutes(b.time));
    const lanes = [];
    events.forEach(e => { let lane = 0; while (lanes[lane]?.some(o => overlap(o, e))) lane++; (lanes[lane] ??= []).push(e); e.lane = lane; });
    const width = Math.max(lanes.length, 1);
    const place = (e, length) => `top:${(minutes(e.time) - DAY_START) * PX}px;height:${length * PX - 3}px;left:calc(${e.lane * 100 / width}% + 3px);width:calc(${100 / width}% - 6px)`;
    const closed = [];
    let cursor = DAY_START;
    [...work, [DAY_END, DAY_END]].forEach(([from, to]) => { if (from > cursor) closed.push([cursor, from]); cursor = Math.max(cursor, to); });
    const slots = [];
    for (let t = DAY_START; t < DAY_END; t += 30) if (work.some(([from, to]) => t >= from && t + 30 <= to)) slots.push(t);
    const now = spec.date === P360.today ? `<div class="ag-now" style="top:${(P360.nowMinute() - DAY_START) * PX}px"><span>${P360.nowTime()}</span></div>` : '';
    return `<section class="ag-col">${spec.head}<div class="ag-canvas" style="height:${(DAY_END - DAY_START) * PX}px">
      ${closed.map(([from, to]) => `<div class="ag-closed" style="top:${(from - DAY_START) * PX}px;height:${(to - from) * PX}px"></div>`).join('')}
      ${slots.map(t => `<button type="button" class="ag-slot" style="top:${(t - DAY_START) * PX}px;height:${30 * PX}px" data-ag="slot" data-val="${spec.date}|${hhmm(t)}|${esc(spec.professional || '')}" aria-label="Reservar ${shortDay(spec.date)} a las ${hhmm(t)}"><span>+ ${hhmm(t)}</span></button>`).join('')}
      ${blocks.map(b => `<button type="button" class="ag-block" style="${place(b, Number(b.duration))}" data-vip-detail="${b.id}"><span>${b.time}–${endTime(b)}</span><b>Tiempo protegido</b><small>${esc(b.reason)}</small></button>`).join('')}
      ${items.map(a => { const phase = P360.phase(a), length = Number(a.clinicalDuration || a.duration), mark = ['confirmada', 'completa'].includes(phase) ? '' : ' · ' + P360.phaseLabels[phase]; return `<button type="button" class="ag-ev is-${phase}${length <= 30 ? ' is-short' : ''}" style="${place(a, length)}" data-ag="open" data-val="${a.id}"><span>${a.time}${mark}</span><b>${esc(patient(a.patient).name)}</b><small>${esc(a.type)}${spec.professional ? '' : ' · ' + esc(a.professional.replace(/^Dra?\. /, ''))}</small></button>`; }).join('')}
      ${now}</div></section>`;
  }
  function agendaView() {
    const date = state.agendaDay, week = ag.mode === 'week';
    const days = week ? Array.from({ length: 6 }, (_, i) => addDays(weekStart(date), i)) : [date];
    const inRange = appointments.filter(a => days.includes(a.date) && visible(a));
    const live = inRange.filter(a => a.status !== 'Cancelada');
    const off = inRange.filter(a => ['cancelada', 'no_asistio'].includes(P360.phase(a))).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const blocks = vipBlocks.filter(b => b.active && days.includes(b.date) && (state.site === 'Todas las sedes' || b.site === state.site));
    const tally = [`${live.length} ${live.length === 1 ? 'cita' : 'citas'}`];
    [['por_confirmar', 'por confirmar'], ['cambio', 'con cambio solicitado'], ['llego', 'en sala'], ['en_atencion', 'en atención'], ['salida', 'en salida']].forEach(([phase, label]) => { const n = live.filter(a => P360.phase(a) === phase).length; if (n) tally.push(`${n} ${label}`); });

    const columns = week
      ? days.map(d => ({ date: d, professional: ag.professional === 'Todos' ? null : ag.professional, head: `<button type="button" class="ag-col-head${d === P360.today ? ' is-today' : ''}" data-ag="day" data-val="${d}"><span>${dayOf(d, { weekday: 'short' })}</span><b>${Number(d.slice(-2))}</b></button>` }))
      : (ag.professional === 'Todos' ? professionals : [ag.professional]).map(name => ({ date, professional: name, head: `<div class="ag-col-head"><b>${esc(name)}</b><span>${live.filter(a => a.professional === name).length} citas</span></div>` }));
    const grid = columns.map(spec => column(spec,
      live.filter(a => a.date === spec.date && (!spec.professional || a.professional === spec.professional)),
      blocks.filter(b => b.date === spec.date && (!spec.professional || b.professional === spec.professional || b.professional === 'Todos'))
    )).join('');
    const hoursRail = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => `<div style="height:${60 * PX}px">${hhmm(DAY_START + i * 60)}</div>`).join('');
    const list = live.filter(a => a.date === date).sort((a, b) => a.time.localeCompare(b.time)).map(a => `<button type="button" class="ag-row is-${P360.phase(a)}" data-ag="open" data-val="${a.id}"><span class="ag-row-time">${a.time}<small>${clinicalEnd(a)}</small></span><span class="ag-row-main"><b>${esc(patient(a.patient).name)}</b><small>${esc(a.type)} · ${esc(a.professional)}</small></span><span class="ag-tag is-${P360.phase(a)}">${P360.phaseLabels[P360.phase(a)]}</span></button>`).join('');
    const protectedTimes = vipBlocks.filter(b => state.site === 'Todas las sedes' || b.site === state.site);

    return `<div class="ag">
      <header class="ag-head"><div><span class="eyebrow">Agenda</span><h1>${week ? `${dateLabel(days[0])} – ${dateLabel(days.at(-1))}` : longDay(date)}</h1><p>${tally.join(' · ')}</p></div>
        <div class="ag-head-actions"><button type="button" class="btn" data-vip-new="1">Proteger horario</button>${button('Nueva cita', 'new', '', 'primary')}</div></header>
      <div class="ag-bar"><div class="ag-nav">${button('‹', 'shift', -1, 'ag-icon')}${button('Hoy', 'today')}${button('›', 'shift', 1, 'ag-icon')}<input type="date" id="agDate" value="${date}" aria-label="Ir a una fecha"></div>
        <div class="ag-nav"><select id="agPro" aria-label="Profesional"><option value="Todos">Todos los profesionales</option>${professionals.map(p => `<option ${ag.professional === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
          <div class="ag-seg" role="group" aria-label="Vista">${[['day', 'Día'], ['week', 'Semana']].map(([mode, label]) => `<button type="button" class="${ag.mode === mode ? 'active' : ''}" data-ag="mode" data-val="${mode}" aria-pressed="${ag.mode === mode}">${label}</button>`).join('')}</div></div></div>
      <div class="ag-board"><div class="ag-scroll"><div class="ag-grid" style="--cols:${columns.length}${week ? ';--col-min:124px' : ''}"><div class="ag-hours"><div class="ag-col-head"></div>${hoursRail}</div>${grid}</div></div></div>
      <div class="ag-list">${list || '<p class="ag-empty">Sin citas este día.</p>'}</div>
      ${off.length ? `<section class="ag-off"><h2>Canceladas y ausencias</h2>${off.map(a => `<button type="button" class="ag-row is-${P360.phase(a)}" data-ag="open" data-val="${a.id}"><span class="ag-row-time">${a.time}<small>${week ? dayOf(a.date, { weekday: 'short' }) : clinicalEnd(a)}</small></span><span class="ag-row-main"><b>${esc(patient(a.patient).name)}</b><small>${esc(a.type)} · ${esc(a.professional)}</small></span><span class="ag-tag is-${P360.phase(a)}">${P360.phaseLabels[P360.phase(a)]}</span></button>`).join('')}</section>` : ''}
      ${protectedTimes.length ? `<details class="ag-protected"><summary>Tiempos protegidos (${protectedTimes.filter(b => b.active).length})</summary>${protectedTimes.map(b => `<div class="ag-protected-row"><span><b>${esc(b.reason)}</b><small>${dateLabel(b.date)} · ${b.time}–${endTime(b)} · ${esc(b.site)} · ${b.professional === 'Todos' ? 'Toda la sede' : esc(b.professional)}</small></span><button type="button" class="btn" data-vip-toggle="${b.id}">${b.active ? 'Liberar' : 'Activar'}</button></div>`).join('')}</details>` : ''}
    </div>`;
  }

  // ── Panel de la cita: qué está pasando, qué hago ahora y, debajo, lo demás
  const closeButton = '<button type="button" class="ag-close" data-ag="close" aria-label="Cerrar">×</button>';
  function slotPicker(query, picked, otherDay) {
    const groups = new Map();
    P360.suggest(query).forEach(s => groups.set(s.date, [...(groups.get(s.date) || []), s]));
    const chip = s => `<button type="button" class="ag-time${picked && picked.date === s.date && picked.time === s.time ? ' active' : ''}" data-ag="pick" data-val="${s.date}|${s.time}">${s.time}</button>`;
    const extra = otherDay ? P360.slots({ ...query, date: otherDay, step: 30 }) : [];
    const shown = picked && [...groups.values()].flat().concat(extra).some(s => s.date === picked.date && s.time === picked.time);
    const chosen = picked && !shown ? `<div class="ag-times"><div><span>${shortDay(picked.date)}</span><div>${chip(picked)}</div></div></div>` : ''; // elegido en la agenda
    const day = otherDay ? `<div class="ag-times"><div><span>${shortDay(otherDay)}</span><div>${extra.map(chip).join('') || '<em>Sin horarios libres ese día</em>'}</div></div></div>` : '';
    const near = `<div class="ag-times">${[...groups].map(([date, list]) => `<div><span>${shortDay(date)}</span><div>${list.map(chip).join('')}</div></div>`).join('') || '<p class="ag-empty">Sin horarios libres en las próximas semanas.</p>'}</div>`;
    const other = `<label class="ag-field ag-other">${otherDay ? 'Día elegido' : 'Otro día'}<input type="date" id="agDay" min="${P360.today}" value="${otherDay || ''}"></label>`;
    return chosen + (otherDay ? other + day + `<p class="ag-hint ag-near">Más cercanos</p>` + near : near + other); // con un día indicado, sus horarios van primero
  }
  function timeline(a) {
    const events = [...(a.events || [])].sort((x, y) => x.at.localeCompare(y.at)), m = P360.metrics(a);
    const facts = [m.wait !== null ? `Espera ${m.wait} min` : '', m.length !== null ? `Atención ${m.length} min de ${m.planned} previstos` : '', m.checkout !== null ? `Salida en ${m.checkout} min` : ''].filter(Boolean);
    const detail = e => e.type === 'reprogramacion' ? `${shortDay(e.from.date)} ${e.from.time} → ${shortDay(e.to.date)} ${e.to.time}${e.reason ? ' · ' + esc(e.reason) : ''}` : e.type === 'cobro' ? `${fmt(e.amount)} · ${esc(e.method)}` : e.reason ? esc(e.reason) : '';
    return events.length ? `<section class="ag-section"><h3>Recorrido</h3>${facts.length ? `<p class="ag-metrics">${facts.join(' · ')}</p>` : ''}<ol class="ag-timeline">${events.map(e => `<li><time>${e.at.slice(0, 10) === a.date ? e.at.slice(11) : dateLabel(e.at.slice(0, 10))}</time><span><b>${EVENT_LABELS[e.type] || e.type}</b>${detail(e) ? `<small>${detail(e)}</small>` : ''}<small>${esc(e.by)}</small></span></li>`).join('')}</ol></section>` : '';
  }
  function apptPanel(p) {
    const a = current();
    if (!a) return '';
    const person = patient(a.patient), main = P360.nextAction(a), money = P360.financeOf(a);
    const head = `<header class="ag-panel-head"><div><span class="ag-tag is-${P360.phase(a)}">${P360.phaseLabels[P360.phase(a)]}</span><h2>${esc(person.name)}</h2><p>${esc(a.type)}</p></div>${closeButton}</header>
      <dl class="ag-facts"><div><dt>Cuándo</dt><dd>${shortDay(a.date)} · ${a.time}–${clinicalEnd(a)}</dd></div><div><dt>Con</dt><dd>${esc(a.professional)}</dd></div><div><dt>Dónde</dt><dd>${esc(a.site)}${a.room ? ' · ' + esc(a.room) : ''}</dd></div><div><dt>Celular</dt><dd>${esc(person.phone)}</dd></div></dl>`;
    const error = p.error ? `<p class="ag-error" role="alert">${esc(p.error)}</p>` : '';

    if (p.sub === 'reschedule') return head + `<section class="ag-section"><h3>Nuevo horario</h3><p class="ag-hint">La cita actual se conserva hasta confirmar el cambio.</p>${slotPicker({ professional: a.professional, site: a.site, duration: a.duration + (a.clinicalDuration ? 0 : Number(a.buffer || 0)), patient: a.patient, ignoreId: a.id }, p.slot, p.day)}
      <label class="ag-field">Motivo (opcional)<input id="agReason" maxlength="120" value="${esc(p.reason || '')}" placeholder="Ej. Lo pidió el paciente"></label>${error}
      <div class="ag-panel-actions">${link('Volver', 'sub', '')}<button type="button" class="btn primary" data-ag="reschedule-save" ${p.slot ? '' : 'disabled'}>${p.slot ? `Confirmar · ${shortDay(p.slot.date)} ${p.slot.time}` : 'Elige un horario'}</button></div></section>`;

    if (p.sub === 'cancel') return head + `<section class="ag-section"><h3>Cancelar la cita</h3><p class="ag-hint">El horario se libera y la cita queda en el historial del paciente.</p>
      <div class="ag-options">${CANCEL_REASONS.map(reason => `<button type="button" class="ag-option${p.reason === reason ? ' active' : ''}" data-ag="reason" data-val="${reason}">${reason}</button>`).join('')}</div>
      <button type="button" class="ag-check${p.followUp ? ' done' : ''}" data-ag="follow"><i>${p.followUp ? '✓' : ''}</i>Crear seguimiento para reagendar</button>${error}
      <div class="ag-panel-actions">${link('Volver', 'sub', '')}${button('Cancelar cita', 'cancel-save', '', 'primary')}</div></section>`;

    if (p.sub === 'pay') return head + `<section class="ag-section"><h3>Cobrar</h3><dl class="ag-facts"><div><dt>Valor</dt><dd>${fmt(money.due)}</dd></div><div><dt>Pagado</dt><dd>${fmt(money.paid)}</dd></div><div><dt>Saldo</dt><dd>${fmt(money.balance)}</dd></div></dl>
      <label class="ag-field">Valor a cobrar<input id="agPayAmount" type="number" inputmode="numeric" min="1" max="${money.balance}" step="1000" value="${p.amount ?? money.balance}"></label>
      <div class="ag-options">${PAY_METHODS.map(method => `<button type="button" class="ag-option${(p.method || PAY_METHODS[0]) === method ? ' active' : ''}" data-ag="method" data-val="${method}">${method}</button>`).join('')}</div>${error}
      <div class="ag-panel-actions">${link('Volver', 'sub', '')}${button('Registrar cobro', 'pay-save', '', 'primary')}</div></section>`;

    const prep = P360.prepItems(a);
    return head + `<section class="ag-focus"><p>${esc(P360.describe(a))}</p>${main ? button(main.label, 'do', main.key, 'primary ag-main') : ''}<div class="ag-others">${P360.otherActions(a).map(o => link(o.label, 'do', o.key)).join('')}</div></section>
      ${prep.length ? `<section class="ag-section" id="agPrep"><h3>Preparación</h3>${prep.map(key => `<button type="button" class="ag-check${a.prepDone?.[key] ? ' done' : ''}" data-ag="prep" data-val="${key}"><i>${a.prepDone?.[key] ? '✓' : ''}</i>${P360.prepLabels[key]}</button>`).join('')}</section>` : ''}
      ${a.note ? `<section class="ag-section"><h3>Observación</h3><p>${esc(a.note)}</p></section>` : ''}${timeline(a)}`;
  }

  // ── Nueva cita: paciente, servicio y horario. Lo demás lo sugiere el sistema
  function bookPanel(p) {
    const person = p.patient ? patient(p.patient) : null, service = services.find(s => s.id === p.serviceId) || null;
    const hasPatient = !!person || !!p.contact, hasService = !!service || p.custom;
    const duration = (service?.duration || 45) + (service?.buffer ?? 15);
    const query = { professional: p.professional, site: p.site, duration, patient: p.patient };
    if (hasService && p.from && !p.slot) { // horario elegido en la agenda: se usa si alcanza para el servicio
      p.slot = P360.slots({ ...query, date: p.from.date }).some(s => s.time === p.from.time) ? { date: p.from.date, time: p.from.time } : null;
      if (!p.slot) p.fromMissed = true;
      p.from = null;
    }
    const ready = hasPatient && hasService && p.slot && (!p.contact || p.contact.name.trim().length > 1) && (!p.custom || p.type.trim());
    const who = person
      ? `<div class="ag-picked"><span><b>${esc(person.name)}</b><small>${esc(person.phone)}</small></span>${p.locked ? '' : link('Cambiar', 'unpick')}</div>`
      : p.contact
        ? `<div class="ag-contact"><label class="ag-field">Nombre<input id="agContactName" value="${esc(p.contact.name)}" maxlength="80"></label><label class="ag-field">Celular<input id="agContactPhone" inputmode="tel" value="${esc(p.contact.phone)}" maxlength="20" placeholder="300 000 0000"></label>${link('Buscar otro paciente', 'unpick')}</div>`
        : `<input id="agSearch" class="ag-search" type="search" autocomplete="off" placeholder="Nombre o celular del paciente" aria-label="Buscar paciente" value="${esc(p.query)}"><div id="agResults">${results(p.query)}</div>`;
    return `<header class="ag-panel-head"><div><span class="eyebrow">${p.title || 'Nueva cita'}</span><h2>${person ? esc(person.name) : 'Reservar'}</h2></div>${closeButton}</header>
      <section class="ag-section"><h3>Paciente</h3>${who}</section>
      ${hasPatient ? `<section class="ag-section"><h3>Servicio</h3><div class="ag-services">${services.map(s => `<button type="button" class="ag-service${p.serviceId === s.id ? ' active' : ''}" data-ag="service" data-val="${s.id}"><b>${esc(s.name)}</b><small>${s.duration} min · ${esc(s.professional)}</small></button>`).join('')}<button type="button" class="ag-service${p.custom ? ' active' : ''}" data-ag="service" data-val="custom"><b>Otro motivo</b><small>45 min</small></button></div>${p.custom ? `<label class="ag-field">Motivo<input id="agType" maxlength="80" value="${esc(p.type)}" placeholder="Ej. Control de implante"></label>` : ''}</section>` : ''}
      ${hasPatient && hasService ? `<section class="ag-section"><h3>Horario</h3><div class="ag-two"><label class="ag-field">Profesional<select id="agBookPro">${professionals.map(name => `<option ${p.professional === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label><label class="ag-field">Sede<select id="agBookSite">${Object.keys(P360.rooms).map(site => `<option ${p.site === site ? 'selected' : ''}>${site}</option>`).join('')}</select></label></div>
        ${p.fromMissed ? '<p class="ag-hint">El horario elegido no alcanza para este servicio. Estos son los más cercanos.</p>' : ''}${slotPicker(query, p.slot, p.day)}
        ${p.noteOpen ? `<label class="ag-field">Observación<input id="agNote" maxlength="160" value="${esc(p.note)}" placeholder="Ej. Llega con acompañante"></label>` : link('Agregar observación', 'note')}</section>` : ''}
      ${p.error ? `<p class="ag-error" role="alert">${esc(p.error)}</p>` : ''}
      <div class="ag-panel-actions ag-panel-foot"><button type="button" class="btn primary ag-main" data-ag="book-save" ${ready ? '' : 'disabled'}>${p.slot ? `Reservar · ${shortDay(p.slot.date)} ${p.slot.time}` : 'Reservar'}</button></div>`;
  }
  function results(text) {
    const q = norm(text.trim()), digits = text.replace(/\D/g, '');
    if (q.length < 2) return '<p class="ag-hint">Escribe al menos dos letras.</p>';
    const found = patients.filter(p => norm(p.name).includes(q) || (digits.length > 3 && p.phone.replace(/\D/g, '').includes(digits))).slice(0, 5);
    return found.map(p => `<button type="button" class="ag-result" data-ag="patient" data-val="${p.id}"><b>${esc(p.name)}</b><small>${esc(p.phone)} · ${esc(p.site)}</small></button>`).join('')
      + (digits.length > 3 || found.some(p => norm(p.name) === q) || (found.length && !q.includes(' ')) ? '' : `<button type="button" class="ag-result is-new" data-ag="contact"><b>Crear contacto «${esc(text.trim())}»</b><small>Solo nombre y celular; el resto se completa después</small></button>`);
  }
  function openBook(seed = {}) {
    const person = seed.patient ? patient(seed.patient) : null;
    const last = person ? appointments.filter(a => a.patient === person.id && a.status !== 'Cancelada').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0] : null;
    const service = services.find(s => s.id === seed.serviceId) || null;
    ag.panel = { kind: 'book', title: seed.title || '', patient: person?.id || null, locked: !!seed.locked, contact: null, query: '', serviceId: service?.id || null, custom: !!seed.type, type: seed.type || '',
      professional: seed.professional || service?.professional || last?.professional || (ag.professional === 'Todos' ? professionals[0] : ag.professional),
      site: seed.site || last?.site || person?.site || (state.site === 'Todas las sedes' ? 'El Tesoro' : state.site),
      proFixed: !!seed.professional, from: seed.date && seed.time ? { date: seed.date, time: seed.time } : null, slot: null, day: seed.day || '', note: '', noteOpen: false, rebookOf: seed.rebookOf || null, after: seed.after || null, error: '' };
    drawPanel();
    document.getElementById('agSearch')?.focus();
  }
  const openAppt = (id, sub = null) => { ag.panel = { kind: 'appt', id: Number(id), sub, slot: null, day: '', reason: sub === 'cancel' ? CANCEL_REASONS[0] : '', followUp: true, error: '' }; drawPanel(); };
  const closePanel = () => { ag.panel = null; drawPanel(); };

  const host = document.createElement('aside'), scrim = document.createElement('div');
  host.id = 'agPanel'; host.className = 'ag-panel'; host.hidden = true; host.setAttribute('aria-label', 'Detalle de la cita');
  scrim.className = 'ag-scrim'; scrim.hidden = true; scrim.dataset.ag = 'close';
  document.body.append(scrim, host);
  function drawPanel() {
    const open = !!ag.panel && !pro.active, scroll = host.scrollTop;
    host.hidden = scrim.hidden = !open;
    host.innerHTML = !open ? '' : ag.panel.kind === 'book' ? bookPanel(ag.panel) : apptPanel(ag.panel);
    host.scrollTop = scroll;
  }

  // ── Salidas: lo que recepción cierra después de la atención. Sin funciones clínicas
  function checkoutView() {
    const queue = P360.checkoutQueue().filter(a => state.site === 'Todas las sedes' || a.site === state.site);
    const done = appointments.filter(a => a.date === P360.today && P360.phase(a) === 'completa').length;
    return `<div class="ag"><header class="ag-head"><div><span class="eyebrow">Salidas</span><h1>${queue.length ? `${queue.length} ${queue.length === 1 ? 'paciente por cerrar' : 'pacientes por cerrar'}` : 'Todo al día'}</h1><p>${done ? `${done} ${done === 1 ? 'salida completada' : 'salidas completadas'} hoy` : 'Cada atención finalizada llega aquí sola.'}</p></div></header>
      ${queue.map(a => { const person = patient(a.patient), money = P360.financeOf(a), control = P360.nextControl(a), next = appointments.find(x => x.id === a.nextAppointment);
        return `<article class="ag-out"><div><h2>${esc(person.name)}</h2><p>Atención finalizada${P360.eventTime(a, 'fin_atencion') ? ' a las ' + P360.eventTime(a, 'fin_atencion') : ''} · ${esc(a.professional)} · ${esc(a.site)}</p>
          <dl class="ag-facts"><div><dt>Realizado</dt><dd>${esc(a.type)}</dd></div><div><dt>Saldo</dt><dd>${money.balance ? fmt(money.balance) : money.due ? 'Pagada' : 'Sin cobro en esta visita'}</dd></div><div><dt>Próximo paso</dt><dd>${next ? `Cita ${shortDay(next.date).toLowerCase()} ${next.time}` : control ? `Control en ${control.days} días` : 'Coordinar próxima cita'}</dd></div></dl></div>
          <div class="ag-out-actions">${money.balance ? button('Cobrar', 'out-pay', a.id, 'primary') : ''}${next ? '' : button('Agendar próxima cita', 'out-next', a.id)}${button('Finalizar salida', 'out-close', a.id, money.balance ? '' : 'primary')}</div></article>`; }).join('') || '<p class="ag-empty">Cuando un profesional finaliza una atención, el paciente aparece aquí para cobrar, agendar y cerrar.</p>'}</div>`;
  }

  // ── Acciones
  const finish = (result, message) => { if (result.error) { if (ag.panel) ag.panel.error = result.error; else toast(result.error); drawPanel(); return false; } render(); if (message) toast(message); return true; };
  function rebook(a, extra = {}) {
    const control = extra.after ? P360.nextControl(a) : null; // la próxima cita toma el control que indica el servicio
    openBook({ patient: a.patient, locked: true, serviceId: control ? null : a.serviceId, type: control ? control.title : a.serviceId ? '' : a.type, professional: a.professional, site: a.site, ...extra, ...(control ? { day: addDays(a.date, control.days) } : {}) });
  }
  function perform(key) {
    const a = current();
    if (!a) return;
    if (key === 'patient') { closePanel(); return selectPatient(a.patient); }
    if (key === 'checkout') { if (!allowed(canCheckout())) return; return P360.financeOf(a).balance ? openAppt(a.id, 'pay') : finish(P360.closeCheckout(a), 'Salida completada.'); }
    if (!allowed(canBook())) return;
    if (key === 'reschedule' || key === 'cancel') return openAppt(a.id, key);
    if (key === 'rebook') return rebook(a, { title: 'Reagendar', rebookOf: a.id });
    if (key === 'next') return rebook(a, { title: 'Próxima cita', after: a.id });
    if (key === 'prep') return document.getElementById('agPrep')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (key === 'confirm') return finish(P360.confirm(a), 'Cita confirmada.');
    if (key === 'noresponse') return finish(P360.noResponse(a), 'Marcada sin respuesta.');
    if (key === 'arrive') return finish(P360.arrive(a), `${patient(a.patient).name} llegó. ${a.professional} ya lo ve en su día.`);
    if (key === 'noshow') return finish(P360.noShow(a), 'Marcada como no asistió.');
  }
  function dispatch(action, value) {
    const p = ag.panel;
    if (action === 'close') return closePanel();
    if (action === 'open') return openAppt(value);
    if (action === 'new') return allowed(canBook()) && openBook();
    if (action === 'slot') { const [date, time, professional] = value.split('|'); return allowed(canBook()) && openBook({ date, time, professional: professional || undefined }); }
    if (action === 'mode') { ag.mode = value; return render(); }
    if (action === 'day') { state.agendaDay = value; ag.mode = 'day'; return render(); }
    if (action === 'today') { state.agendaDay = P360.today; return render(); }
    if (action === 'shift') { state.agendaDay = addDays(state.agendaDay, Number(value) * (ag.mode === 'week' ? 7 : 1)); return render(); }
    if (action === 'out-pay') return allowed(canCheckout()) && openAppt(value, 'pay');
    if (action === 'out-next') { const a = appointments.find(x => x.id === Number(value)); return allowed(canBook()) && rebook(a, { title: 'Próxima cita', after: a.id }); }
    if (action === 'out-close') { const a = appointments.find(x => x.id === Number(value)), balance = P360.financeOf(a).balance; return allowed(canCheckout()) && finish(P360.closeCheckout(a), balance ? `Salida completada. El saldo de ${fmt(balance)} queda en cartera.` : 'Salida completada.'); }
    if (!p) return;
    p.error = '';
    if (action === 'do') return perform(value);
    if (action === 'sub') { p.sub = value || null; p.slot = null; p.day = ''; return drawPanel(); }
    if (action === 'pick') { const [date, time] = value.split('|'); p.slot = { date, time }; return drawPanel(); }
    if (action === 'reason') { p.reason = value; return drawPanel(); }
    if (action === 'follow') { p.followUp = !p.followUp; return drawPanel(); }
    if (action === 'method') { p.method = value; return drawPanel(); }
    if (action === 'prep') { P360.togglePrep(current(), value); return render(); }
    if (action === 'reschedule-save') return finish(P360.reschedule(current(), p.slot, p.reason), 'Cita reprogramada.') && openAppt(p.id);
    if (action === 'cancel-save') return finish(P360.cancel(current(), p.reason, p.followUp), 'Cita cancelada. El horario quedó libre.') && openAppt(p.id);
    if (action === 'pay-save') return finish(P360.charge(current(), Number(p.amount ?? P360.financeOf(current()).balance), p.method || PAY_METHODS[0]), 'Cobro registrado.') && openAppt(p.id);
    if (action === 'patient') { p.patient = Number(value); const person = patient(p.patient); p.site = person.site; p.slot = null; return drawPanel(); }
    if (action === 'contact') { p.contact = { name: cap(p.query.trim()), phone: '' }; drawPanel(); return document.getElementById('agContactPhone')?.focus(); }
    if (action === 'unpick') { p.patient = null; p.contact = null; p.slot = null; drawPanel(); return document.getElementById('agSearch')?.focus(); }
    if (action === 'service') { p.custom = value === 'custom'; p.serviceId = p.custom ? null : Number(value); const service = services.find(s => s.id === p.serviceId); if (service && !p.proFixed) p.professional = service.professional; if (!p.from) p.slot = null; return drawPanel(); }
    if (action === 'note') { p.noteOpen = true; drawPanel(); return document.getElementById('agNote')?.focus(); }
    if (action === 'book-save') {
      if (p.contact && p.contact.phone.replace(/\D/g, '').length < 7) { p.error = 'Escribe el celular del contacto.'; return drawPanel(); }
      const pid = p.patient || P360.createContact({ ...p.contact, site: p.site }).id;
      p.patient = pid; p.contact = null;
      const result = P360.book({ patient: pid, serviceId: p.serviceId, type: p.type, professional: p.professional, site: p.site, date: p.slot.date, time: p.slot.time, note: p.note, rebookOf: p.rebookOf });
      if (result.error) return finish(result);
      if (p.after) appointments.find(a => a.id === p.after).nextAppointment = result.appointment.id;
      if (state.view === 'agenda') state.agendaDay = p.slot.date;
      const label = `${shortDay(p.slot.date)} ${p.slot.time}`;
      ag.panel = null;
      return finish({}, `Cita reservada · ${label}`);
    }
  }
  document.addEventListener('click', e => { const el = e.target.closest('[data-ag]'); if (!el) return; e.preventDefault(); dispatch(el.dataset.ag, el.dataset.val || ''); });
  document.addEventListener('change', e => {
    const el = e.target, p = ag.panel;
    if (el.id === 'agDate' && el.value) { state.agendaDay = el.value; render(); }
    if (el.id === 'agPro') { ag.professional = el.value; render(); }
    if (!p) return;
    if (el.id === 'agBookPro') { p.professional = el.value; p.proFixed = true; p.slot = null; drawPanel(); }
    if (el.id === 'agBookSite') { p.site = el.value; p.slot = null; drawPanel(); }
    if (el.id === 'agDay') { p.day = el.value; drawPanel(); }
  });
  document.addEventListener('input', e => {
    const el = e.target, p = ag.panel;
    if (!p) return;
    if (el.id === 'agSearch') { p.query = el.value; document.getElementById('agResults').innerHTML = results(p.query); }
    if (el.id === 'agContactName') p.contact.name = el.value;
    if (el.id === 'agContactPhone') p.contact.phone = el.value;
    if (el.id === 'agType') { p.type = el.value; document.querySelector('[data-ag="book-save"]').disabled = !(p.slot && p.type.trim()); }
    if (el.id === 'agNote') p.note = el.value;
    if (el.id === 'agReason') p.reason = el.value;
    if (el.id === 'agPayAmount') p.amount = el.value;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ag.panel && !document.querySelector('#modalRoot .modal-back, #modalRoot .p-modal-back')) closePanel(); });

  // ── Conexión con lo existente: los accesos anteriores a "nueva cita" y "detalle" abren los paneles nuevos
  bookingForm = function (opts = {}) {
    if (!allowed(canBook())) return;
    closeModal();
    if (opts.id) return openAppt(opts.id, 'reschedule');
    const fromSlot = !opts.service; // el recorrido guiado propone un servicio, no un horario
    openBook({ patient: opts.service || state.view === 'detalle' ? state.patient : null, serviceId: opts.service, date: fromSlot ? opts.date : undefined, time: fromSlot ? opts.time : undefined });
  };
  detailDialog = function (a) { closeModal(); openAppt(a.id); };
  views.agenda = agendaView;
  views.salidas = checkoutView;
  const baseRender = render;
  render = function () {
    P360.sync();
    baseRender();
    const pending = P360.checkoutQueue().length, nav = document.querySelector('#nav .nav-btn[data-nav="salidas"]');
    if (nav && pending) nav.insertAdjacentHTML('beforeend', `<em>${pending}</em>`);
    drawPanel();
  };
  render();
})();
