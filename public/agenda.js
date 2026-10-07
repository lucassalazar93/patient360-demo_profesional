/* Agenda y ciclo de la cita en la plataforma central: vista de día y de semana, panel lateral con una acción
   principal por cita, reserva con horarios sugeridos, reprogramación, cancelación, ausencias, llegada y cola de
   salidas. Aquí solo se dibuja y se despacha: el estado, las reglas y la disponibilidad viven en
   appointments-core.js (P360). La fecha visible es state.agendaDay, la misma que usan los módulos anteriores. */
(() => {
  const PX = 1.5, DAY_START = 480, DAY_END = 1080; // 1,5 px por minuto, de 08:00 a 18:00
  const ag = { mode: 'day', professional: 'Todos', panel: null, contact: null, contactOpen: false, flash: null };
  const CANCEL_REASONS = ['El paciente no puede asistir', 'Enfermedad', 'Motivo económico', 'La clínica reprograma', 'Otro'];
  const PAY_METHODS = ['Transferencia', 'Tarjeta', 'Efectivo'];
  const EVENT_LABELS = { reserva: 'Cita reservada', confirmacion: 'Confirmada por el paciente', sin_respuesta: 'Sin respuesta', cambio_solicitado: 'Cambio de horario solicitado', reprogramacion: 'Reprogramada', cancelacion: 'Cancelada', llegada: 'Llegada', inicio_atencion: 'Inicio de atención', fin_atencion: 'Fin de atención', cobro: 'Cobro', salida: 'Salida administrativa', no_asistio: 'No asistió', seguimiento: 'Seguimiento programado' };

  // ── Ayudas de formato
  const cap = text => text.charAt(0).toUpperCase() + text.slice(1);
  const dayOf = (date, options) => new Date(date + 'T12:00:00').toLocaleDateString('es-CO', options).replace('.', '');
  const longDay = date => cap(dayOf(date, { weekday: 'long', day: 'numeric', month: 'long' }));
  const shortDay = date => (date === P360.today ? 'Hoy' : date === addDays(P360.today, 1) ? 'Mañana' : date === addDays(P360.today, -1) ? 'Ayer' : cap(dayOf(date, { weekday: 'short', day: 'numeric', month: 'short' })));
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
      <dl class="ag-facts"><div><dt>Cuándo</dt><dd>${shortDay(a.date)} · ${a.time}–${clinicalEnd(a)} · ${Number(a.clinicalDuration || a.duration)} min</dd></div><div><dt>Con</dt><dd>${esc(a.professional)}</dd></div><div><dt>Dónde</dt><dd>${esc(a.site)}${a.room ? ' · ' + esc(a.room) : ''}</dd></div><div><dt>Celular</dt><dd>${esc(person.phone)}</dd></div></dl>`;
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
    const sent = a.confirmMessage && P360.stateOf(a).visit === 'pendiente' ? `<section class="ag-section"><h3>Mensaje enviado</h3><div class="in-msg is-out"><p>${esc(a.confirmMessage)}</p><time>WhatsApp · entregado</time></div></section>` : '';
    return head + `<section class="ag-focus"><p>${esc(P360.describe(a))}</p>${main ? button(main.label, 'do', main.key, (main.quiet ? '' : 'primary ') + 'ag-main') : ''}<div class="ag-others">${P360.otherActions(a).map(o => link(o.label, 'do', o.key)).join('')}</div></section>${sent}
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
    if (p.compact) return `<header class="ag-panel-head"><div><span class="eyebrow">${p.title || 'Agendar'}</span><h2>${esc(person.name)}</h2><p>${esc(service?.name || p.type)} · ${service?.duration || 45} min</p></div>${closeButton}</header>
      <section class="ag-section"><div class="ag-picked"><span><b>${esc(p.professional)}</b><small>${esc(p.site)}</small></span>${link('Cambiar', 'expand')}</div>${slotPicker(query, null, p.day)}</section>${p.error ? `<p class="ag-error" role="alert">${esc(p.error)}</p>` : ''}`;
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
    ag.panel = { kind: 'book', compact: !!seed.compact && !!person && (!!service || !!seed.type), title: seed.title || '', patient: person?.id || null, locked: !!seed.locked, contact: null, query: '', serviceId: service?.id || null, custom: !!seed.type, type: seed.type || '',
      professional: seed.professional || service?.professional || last?.professional || (ag.professional === 'Todos' ? professionals[0] : ag.professional),
      site: seed.site || last?.site || person?.site || (state.site === 'Todas las sedes' ? 'El Tesoro' : state.site),
      proFixed: !!seed.professional, from: seed.date && seed.time ? { date: seed.date, time: seed.time } : null, slot: null, day: seed.day || '', note: '', noteOpen: false, rebookOf: seed.rebookOf || null, after: seed.after || null, error: '' };
    drawPanel();
    document.getElementById('agSearch')?.focus();
  }
  const openAppt = (id, sub = null) => { ag.panel = { kind: 'appt', id: Number(id), sub, slot: null, day: '', reason: sub === 'cancel' ? CANCEL_REASONS[0] : '', followUp: true, error: '' }; drawPanel(); };
  const closePanel = () => { ag.panel = null; drawPanel(); };
  function donePanel(p) {
    const a = appointments.find(x => x.id === p.id);
    return `<div class="ag-done"><span class="ag-done-mark" aria-hidden="true">✓</span><span class="eyebrow">Cita reservada</span><h2>${esc(patient(a.patient).name)}</h2><p>${esc(a.type)}</p><p>${esc(a.professional)}</p><p class="ag-done-when">${longDay(a.date)} · ${a.time}</p>${button('Ver cita', 'see', a.id, 'primary ag-main')}${link('Cerrar', 'close')}</div>`;
  }

  const host = document.createElement('aside'), scrim = document.createElement('div');
  host.id = 'agPanel'; host.className = 'ag-panel'; host.hidden = true; host.setAttribute('aria-label', 'Detalle de la cita');
  scrim.className = 'ag-scrim'; scrim.hidden = true; scrim.dataset.ag = 'close';
  document.body.append(scrim, host);
  function drawPanel() {
    const open = !!ag.panel && !pro.active, scroll = host.scrollTop;
    host.hidden = scrim.hidden = !open;
    host.innerHTML = !open ? '' : ag.panel.kind === 'book' ? bookPanel(ag.panel) : ag.panel.kind === 'done' ? donePanel(ag.panel) : apptPanel(ag.panel);
    host.scrollTop = scroll;
  }

  // ── Salidas: lo que recepción cierra después de la atención. Sin funciones clínicas
  // Qué falta para cerrar una salida: resolver el pago de la visita y definir qué ocurre después
  function exitStatus(a) {
    const money = P360.financeOf(a), control = P360.nextControl(a), next = appointments.find(x => x.id === a.nextAppointment) || null, follow = a.followUp || null;
    const pay = { money, done: money.balance === 0 || money.paid > 0 };
    const cont = { next, follow, done: !!(next || follow), text: a.plan?.next?.[0] || (control ? `Control en ${control.days} días` : 'Coordinar la próxima cita'), action: a.plan ? ['Crear seguimiento', 'out-follow'] : ['Agendar próxima', 'out-next'] };
    return { pay, cont, ready: pay.done && cont.done };
  }
  function checkoutView() {
    const queue = P360.checkoutQueue().filter(a => state.site === 'Todas las sedes' || a.site === state.site);
    const done = appointments.filter(a => a.date === P360.today && P360.phase(a) === 'completa').length;
    const f = ag.flash, flash = f ? `<section class="ag-flash"><span class="ag-done-mark" aria-hidden="true">✓</span><div><span class="eyebrow">Salida finalizada</span><h2>${esc(patient(f.patient).name)}</h2>${f.followUps.map(t => `<p><b>Seguimiento programado · ${shortDay(t.date)} ${t.time}</b><br>${esc(t.title)}</p>`).join('') || '<p>Sin seguimiento pendiente: ya tiene su próxima cita.</p>'}</div>${f.followUps.length ? button('Ver seguimiento', 'go', 'seguimiento', 'primary') : ''}</section>` : '';
    return `<div class="ag"><header class="ag-head"><div><span class="eyebrow">Salidas</span><h1>${queue.length ? `${queue.length} ${queue.length === 1 ? 'paciente por cerrar' : 'pacientes por cerrar'}` : 'Todo al día'}</h1><p>${done ? `${done} ${done === 1 ? 'salida completada' : 'salidas completadas'} hoy` : 'Cada atención finalizada llega aquí sola.'}</p></div></header>
      ${flash}${queue.map(a => { const person = patient(a.patient), estimate = a.plan ? P360.catalogValue(a.plan.title) : null, st = exitStatus(a), money = st.pay.money, c = st.cont;
        const payBlock = st.pay.done
          ? `<section class="ag-todo"><span class="ag-todo-label">Pago de hoy</span><p class="ag-todo-ok"><i aria-hidden="true">✓</i>${money.due ? 'Pago registrado' : 'Sin cobro en esta visita'}</p>${money.balance ? `<p class="ag-todo-note">Saldo en cartera ${fmt(money.balance)}</p>` : ''}</section>`
          : `<section class="ag-todo"><span class="ag-todo-label">Pago de hoy</span><span class="ag-todo-hint">Valor pendiente</span><p class="ag-todo-value">${fmt(money.balance)}</p>${button('Registrar pago', 'out-pay', a.id, 'primary')}</section>`;
        const contBlock = c.done
          ? `<section class="ag-todo"><span class="ag-todo-label">Continuidad</span><p class="ag-todo-ok"><i aria-hidden="true">✓</i>${c.next ? 'Próxima cita agendada' : 'Seguimiento programado'}</p><p class="ag-todo-note">${c.next ? `${shortDay(c.next.date)} · ${c.next.time}` : `${shortDay(c.follow.date)} · ${c.follow.time}`}</p></section>`
          : `<section class="ag-todo"><span class="ag-todo-label">Continuidad</span><p class="ag-todo-text">${esc(c.text)}</p>${button(c.action[0], c.action[1], a.id, 'primary')}</section>`;
        const closeBtn = st.ready ? button('Finalizar salida', 'out-close', a.id, 'primary') : `<button type="button" class="btn" disabled title="Falta resolver el pago y la continuidad" data-ag="out-close" data-val="${a.id}">Finalizar salida</button>`;
        return `<article class="ag-exit"><div class="ag-exit-head"><h2>${esc(person.name)}</h2><p>Atención terminada${P360.eventTime(a, 'fin_atencion') ? ' a las ' + P360.eventTime(a, 'fin_atencion') : ''} · ${esc(a.professional)}</p>
          <dl class="ag-facts"><div><dt>Realizado</dt><dd>${esc(a.type)}</dd></div>${a.plan ? `<div><dt>Tratamiento recomendado</dt><dd>${esc(a.plan.title)}</dd></div>${estimate !== null ? `<div><dt>Valor estimado del catálogo</dt><dd>${fmt(estimate)}</dd></div>` : ''}` : ''}</dl></div>
          <div class="ag-todo-grid">${payBlock}${contBlock}</div><div class="ag-exit-foot">${closeBtn}</div></article>`; }).join('') || (flash ? '' : '<p class="ag-empty">Cuando un profesional finaliza una atención, el paciente aparece aquí para cobrar, agendar y cerrar.</p>')}</div>`;
  }


  // ── Contactos: donde empieza la relación con el paciente. Conversaciones simuladas; la de Sofía es el caso guiado
  const today0 = P360.today;
  const inbox = [
    { id: 'sofia', name: 'Sofía Restrepo', phone: '300 000 0190', source: 'Instagram', campaign: 'Sonrisa consciente', interest: 'Diseño de sonrisa', service: 'Valoración estética', professional: professionals[0], site: 'El Tesoro', duration: 45, patient: null, replied: false,
      messages: [{ from: 'in', text: 'Hola, quisiera información sobre diseño de sonrisa.', at: '08:21', day: today0 }],
      suggestion: 'Hola Sofía 👋 Claro. Podemos comenzar con una valoración estética para conocer tu caso y proponerte un plan a tu medida. ¿Te gustaría agendarla?',
      profile: { consult: { clinical: ['Interesada en diseño de sonrisa.', 'Ansiedad dental.'], reception: ['Prefiere contacto por WhatsApp.'] }, allergies: [], medication: [], conditions: ['Ansiedad dental'], anesthesia: 'Sin reacciones conocidas', bloodPressure: '110/70 mmHg', reason: 'Quiere mejorar el color y la forma de los dientes anteriores.', expectation: 'Un resultado natural para su grado en diciembre.', habits: ['Café, 2 tazas al día'], hygiene: 'Cepillado 3 veces al día y seda dental', lastCleaning: '2026-07-18', history: ['Ortodoncia (2015–2017)'], emergency: 'Marta Restrepo · madre · 300 000 0191', documents: [['Consentimiento informado', today0]], notes: [{ author: 'Laura · Recepción', date: today0, text: 'Llegó por Instagram preguntando por diseño de sonrisa. Prefiere que le escriban por WhatsApp.' }] } },
    { id: 'mariana', name: 'Mariana Vélez', phone: '300 000 0103', source: 'WhatsApp', interest: 'Control de ortodoncia', kind: 'reschedule', patient: 3, replied: false,
      messages: [{ from: 'in', text: 'Buenos días, hoy no alcancé a llegar. ¿Puedo pasar el control para otro día?', at: '08:12', day: today0 }],
      suggestion: 'Hola Mariana, claro que sí. Ya te busco un nuevo horario con el Dr. Mateo.' },
    { id: 'carlos', name: 'Carlos Arango', phone: '300 000 0109', source: 'WhatsApp', interest: 'Control de ortodoncia', patient: 9, replied: true,
      messages: [{ from: 'out', text: 'Hola Carlos, te recordamos tu control de hoy a las 09:00 con el Dr. Mateo Cárdenas.', at: '07:30', day: today0 }, { from: 'in', text: 'Confirmado, allá estaré.', at: '07:42', day: today0 }] }
  ];
  const contactById = id => inbox.find(c => c.id === id) || null;
  const ensureFicha = c => { // la ficha se crea al primer movimiento, con lo que la conversación ya dijo
    if (c.patient) return;
    c.patient = P360.createContact({ name: c.name, phone: c.phone, site: c.site, source: c.source, campaign: c.campaign, interest: c.interest, age: 29 }).id;
    if (c.profile) clinicalProfiles[c.patient] = c.profile;
    say(c, 'sys', 'Ficha creada en Patient 360');
  };
  const contactOf = pid => inbox.find(c => c.patient === pid) || null;
  const say = (c, from, text) => c.messages.push({ from, text, at: P360.nowTime(), day: P360.today });
  const latestVisit = c => (c.patient ? appointments.filter(a => a.patient === c.patient).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0] : null) || null;
  const when = m => (m.day === P360.today ? (P360.nowMinute() - minutes(m.at) < 60 ? `Hace ${Math.max(1, P360.nowMinute() - minutes(m.at))} min` : m.at) : `${shortDay(m.day)} ${m.at}`);
  // Qué está pasando con el contacto y cuál es su acción principal
  function contactStage(c) {
    const a = latestVisit(c);
    if (!c.replied) return c.kind === 'reschedule' ? { tag: 'Reprogramar', tone: 'cambio' } : { tag: 'Nuevo', tone: 'por_confirmar' };
    if (!a) return { tag: 'Respondido', tone: 'confirmada', next: !!c.service };
    const follow = P360.phase(a) === 'completa' ? careTasks.find(t => t.patient === c.patient && !t.done && t.auto) : null;
    if (follow) return { tag: 'En seguimiento', tone: 'llego', action: button('Ver seguimiento', 'go', 'seguimiento'), follow };
    const rebook = c.kind === 'reschedule' && ['no_asistio', 'cancelada', 'cambio'].includes(P360.phase(a)); // sigue pendiente de reprogramar
    return { tag: rebook ? 'Reprogramar' : P360.phaseLabels[P360.phase(a)], tone: rebook ? 'cambio' : P360.phase(a), action: button('Ver cita', 'see', a.id, c.id === 'sofia' && P360.phase(a) === 'por_confirmar' ? 'primary' : ''), visit: a };
  }
  function contactsView() {
    const fresh = inbox.filter(c => !c.replied).length, selected = contactById(ag.contact) || inbox[0], stage = contactStage(selected), last = c => c.messages.at(-1);
    const list = inbox.map(c => { const st = contactStage(c); return `<button type="button" class="in-item${c.id === selected.id ? ' active' : ''}${c.replied ? '' : ' unread'}" data-ag="contact-open" data-val="${c.id}"><span class="in-top"><b>${esc(c.name)}</b><time>${when(last(c))}</time></span><small>${esc(c.source)} · ${esc(c.interest)}</small><span class="in-preview">${esc(last(c).text)}</span><span class="ag-tag is-${st.tone}">${st.tag}</span></button>`; }).join('');
    const bubbles = selected.messages.map(m => m.from === 'sys' ? `<p class="in-sys">${esc(m.text)}</p>` : `<div class="in-msg is-${m.from}"><p>${esc(m.text)}</p><time>${m.day === P360.today ? m.at : shortDay(m.day) + ' ' + m.at}</time></div>`).join('');
    const draft = selected.draft ?? selected.suggestion, task = selected.followUp;
    const foot = !selected.replied
      ? `<div class="in-composer"><small>Respuesta sugerida</small><div class="in-field"><textarea id="inDraft" rows="3" maxlength="600" aria-label="Respuesta a ${esc(selected.name)}">${esc(draft)}</textarea><button type="button" class="btn primary" data-ag="reply" data-val="${selected.id}"${draft.trim() ? '' : ' disabled'}>Enviar</button></div></div>`
      : stage.next ? `<div class="in-next"><small>Siguiente paso</small><b>${esc(selected.service)}</b><span>${selected.duration} min · ${esc(selected.professional)}</span><div class="in-next-actions">${button(`Agendar ${selected.service.split(' ')[0].toLowerCase()}`, 'contact-book', selected.id, 'primary')}${task ? `<span class="in-muted">Seguimiento creado · ${shortDay(task.date)} ${task.time}</span>` : link('Crear seguimiento', 'contact-follow', selected.id)}</div></div>`
      : stage.follow ? `<div class="in-visit"><span><b>${esc(stage.follow.title)}</b><small>Seguimiento · ${shortDay(stage.follow.date)} ${stage.follow.time}</small></span>${stage.action}</div>`
      : stage.visit ? `<div class="in-visit"><span><b>${esc(stage.visit.type)}</b><small>${shortDay(stage.visit.date)} · ${stage.visit.time} · ${esc(stage.visit.professional)}</small></span>${stage.action}</div>` : stage.action;
    return `<div class="ag in${ag.contactOpen ? ' is-open' : ''}"><header class="ag-head"><div><span class="eyebrow">Contactos</span><h1>${fresh ? `${fresh} ${fresh === 1 ? 'contacto por responder' : 'contactos por responder'}` : 'Todo respondido'}</h1></div></header>
      <div class="in-grid"><div class="in-list">${list}</div>
        <section class="in-chat" aria-label="Conversación con ${esc(selected.name)}"><header><button type="button" class="ag-link in-back" data-ag="contact-back">‹ Contactos</button><div><h2>${esc(selected.name)}</h2><p>${esc(selected.source)} · ${esc(selected.interest)} · ${esc(selected.phone)}</p></div><span class="ag-tag is-${stage.tone}">${stage.tag}</span></header>
          <div class="in-messages">${bubbles}</div><footer>${foot}</footer></section></div></div>`;
  }

  // ── Seguimiento: lo que Patient 360 deja programado para que ningún paciente se pierda
  function followView() {
    const list = careTasks.filter(t => !t.done && t.owner !== proName && (t.auto || t.date >= P360.today)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    return `<div class="ag"><header class="ag-head"><div><span class="eyebrow">Seguimiento</span><h1>${list.length ? `${list.length} ${list.length === 1 ? 'seguimiento pendiente' : 'seguimientos pendientes'}` : 'Sin seguimientos pendientes'}</h1><p>Patient 360 los programa solo al cerrar cada visita.</p></div></header>
      ${list.map(t => `<article class="ag-out${t.fresh ? ' is-fresh' : ''}"><div><h2>${esc(patient(t.patient)?.name || 'Paciente')}</h2><p>${shortDay(t.date)}${t.time ? ' · ' + t.time : ''} · ${esc(t.owner)}${t.fresh ? ' · <b>recién creado</b>' : ''}</p><p class="fu-text">${esc(t.title)}</p></div><div class="ag-out-actions">${button('Contactar', 'fu-contact', t.id, 'primary')}${button('Marcar hecho', 'fu-done', t.id)}</div></article>`).join('') || '<p class="ag-empty">Cuando cierres una salida, el siguiente contacto con el paciente aparecerá aquí.</p>'}</div>`;
  }

  // ── Acciones
  const finish = (result, message) => { if (result.error) { if (ag.panel) ag.panel.error = result.error; else toast(result.error); drawPanel(); return false; } render(); if (message) toast(message); return true; };
  function rebook(a, extra = {}) {
    const control = extra.after && !a.plan ? P360.nextControl(a) : null; // la próxima cita toma el plan recomendado o el control del servicio
    const type = extra.after && a.plan ? a.plan.title + ' · inicio' : control ? control.title : a.serviceId ? '' : a.type;
    openBook({ patient: a.patient, locked: true, compact: true, serviceId: type ? null : a.serviceId, type, professional: a.professional, site: a.site, ...extra, ...(control ? { day: addDays(a.date, control.days) } : {}) });
  }
  function perform(key) {
    const a = current();
    if (!a) return;
    if (key === 'patient') { closePanel(); return selectPatient(a.patient); }
    if (key === 'travel') { P360.travelTo(a); state.view = 'agenda'; ag.mode = 'day'; render(); return toast(`${longDay(P360.today)} · ${P360.nowTime()}`); }
    if (key === 'aspro') { closePanel(); return pEnter(); }
    if (key === 'checkout') {
      if (!allowed(canCheckout())) return;
      const st = exitStatus(a);
      if (!st.pay.done) return openAppt(a.id, 'pay');
      if (!st.ready) { closePanel(); return go('salidas'); } // falta definir la continuidad: se resuelve en Salidas
      return finish(P360.closeCheckout(a), 'Salida finalizada.');
    }
    if (!allowed(canBook())) return;
    if (key === 'reschedule' || key === 'cancel') return openAppt(a.id, key);
    if (key === 'rebook') return rebook(a, { title: 'Reagendar', rebookOf: a.id });
    if (key === 'next') return rebook(a, { title: 'Próxima cita', after: a.id });
    if (key === 'prep') return document.getElementById('agPrep')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (key === 'confirm') {
      const result = P360.confirm(a), c = contactOf(a.patient);
      if (c && result.message) { say(c, 'out', result.message); say(c, 'in', '¡Listo, ahí estaré!'); }
      return finish(result, 'Mensaje enviado. Cita confirmada.');
    }
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
    if (action === 'out-follow') { if (!allowed(canCheckout())) return; P360.scheduleFollowUp(appointments.find(x => x.id === Number(value))); return finish({}, 'Seguimiento programado.'); }
    if (action === 'out-close') {
      if (!allowed(canCheckout())) return;
      const a = appointments.find(x => x.id === Number(value));
      if (!exitStatus(a).ready) return toast('Resuelve el pago y la continuidad para finalizar la salida.');
      const balance = P360.financeOf(a).balance, result = P360.closeCheckout(a), tasks = [a.followUp, ...(result.followUps || [])].filter(Boolean);
      careTasks.forEach(t => { t.fresh = false; });
      if (!result.error) { tasks.forEach(t => { t.fresh = true; }); ag.flash = { patient: a.patient, followUps: tasks }; }
      return finish(result, balance ? `Salida finalizada. El saldo de ${fmt(balance)} queda en cartera.` : 'Salida finalizada.');
    }
    if (action === 'go') return go(value);
    if (action === 'see') { const a = appointments.find(x => x.id === Number(value)); state.view = 'agenda'; state.agendaDay = a.date; ag.mode = 'day'; render(); return openAppt(a.id); }
    if (action === 'contact-open') { ag.contact = value; ag.contactOpen = true; return render(); }
    if (action === 'contact-back') { ag.contactOpen = false; return render(); }
    if (action === 'reply') {
      const c = contactById(value), text = (document.getElementById('inDraft')?.value ?? c.draft ?? c.suggestion).trim();
      if (!text) return toast('Escribe la respuesta antes de enviar.');
      c.replied = true; delete c.draft;
      Object.assign(ag, { contact: c.id, contactOpen: true });
      say(c, 'out', text);
      return render();
    }
    if (action === 'contact-follow') {
      const c = contactById(value);
      ensureFicha(c);
      c.followUp = { id: nextId(careTasks), patient: c.patient, title: `Retomar la conversación sobre ${c.interest.toLowerCase()}`, date: addDays(P360.today, 1), time: '10:00', owner: 'Laura Martínez', done: false, auto: true, fresh: true };
      careTasks.push(c.followUp);
      say(c, 'sys', `Seguimiento creado · ${shortDay(c.followUp.date).toLowerCase()} ${c.followUp.time}`);
      return render();
    }
    if (action === 'contact-book') {
      const c = contactById(value);
      if (!allowed(canBook())) return;
      ensureFicha(c);
      return openBook({ patient: c.patient, locked: true, compact: true, type: c.service, professional: c.professional, site: c.site, title: `Agendar ${c.service.split(' ')[0].toLowerCase()}` });
    }
    if (action === 'fu-done') { const t = careTasks.find(x => x.id === Number(value)); t.done = true; render(); return toast('Seguimiento hecho.'); }
    if (action === 'fu-contact') { const t = careTasks.find(x => x.id === Number(value)), c = contactOf(t.patient); if (!c) return selectPatient(t.patient); Object.assign(ag, { contact: c.id, contactOpen: true }); return go('contactos'); }
    if (!p) return;
    p.error = '';
    if (action === 'do') return perform(value);
    if (action === 'sub') { p.sub = value || null; p.slot = null; p.day = ''; return drawPanel(); }
    if (action === 'pick') { const [date, time] = value.split('|'); p.slot = { date, time }; return p.compact ? dispatch('book-save', '') : drawPanel(); }
    if (action === 'expand') { p.compact = false; return drawPanel(); }
    if (action === 'reason') { p.reason = value; return drawPanel(); }
    if (action === 'follow') { p.followUp = !p.followUp; return drawPanel(); }
    if (action === 'method') { p.method = value; return drawPanel(); }
    if (action === 'prep') { P360.togglePrep(current(), value); return render(); }
    if (action === 'reschedule-save') return finish(P360.reschedule(current(), p.slot, p.reason), 'Cita reprogramada.') && openAppt(p.id);
    if (action === 'cancel-save') return finish(P360.cancel(current(), p.reason, p.followUp), 'Cita cancelada. El horario quedó libre.') && openAppt(p.id);
    if (action === 'pay-save') return finish(P360.charge(current(), Number(p.amount ?? P360.financeOf(current()).balance), p.method || PAY_METHODS[0]), 'Pago registrado.') && (state.view === 'salidas' ? closePanel() : openAppt(p.id));
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
      const c = contactOf(pid);
      if (c) say(c, 'sys', `Cita reservada · ${dayOf(p.slot.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${p.slot.time}`);
      ag.panel = { kind: 'done', id: result.appointment.id };
      return finish({});
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
    if (el.id === 'inDraft') {
      (contactById(ag.contact) || inbox[0]).draft = el.value;
      const send = document.querySelector('.in-field .btn');
      if (send) send.disabled = !el.value.trim();
      return;
    }
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
  const STORY = ['contactos', 'agenda', 'salidas', 'seguimiento'];
  Object.assign(views, { contactos: contactsView, agenda: agendaView, salidas: checkoutView, seguimiento: followView });
  jNavItems.unshift(['contactos', 'Contactos', 'bell'], ['agenda', 'Agenda', 'calendar'], ['salidas', 'Salidas', 'wallet'], ['seguimiento', 'Seguimiento', 'heart'], ['pacientes', 'Pacientes', 'users']);
  roleScope.Recepción = [...STORY, 'pacientes']; // las pantallas anteriores siguen disponibles en el perfil Administrador
  roleScope.Administrador.push('contactos', 'seguimiento');
  const baseRender = render;
  render = function () {
    P360.sync();
    if (!pro.active && userNow().role === 'Recepción' && !roleScope.Recepción.includes(state.view) && state.view !== 'detalle') state.view = 'contactos';
    if (state.view !== 'salidas') ag.flash = null;
    baseRender();
    if (STORY.includes(state.view)) document.querySelector('#content .u-context')?.remove(); // la guía del recorrido anterior no hace falta aquí
    if (userNow().role === 'Recepción') document.querySelector('#nav .d-clinic-access')?.remove(); // recepción no usa el acceso clínico
    document.querySelector('#nav .p-central-entry')?.remove(); // el acceso al espacio profesional es el botón de la barra superior
    const badge = (view, count) => { const nav = document.querySelector(`#nav .nav-btn[data-nav="${view}"]`); if (nav && count) nav.insertAdjacentHTML('beforeend', `<em>${count}</em>`); };
    badge('salidas', P360.checkoutQueue().length);
    badge('contactos', inbox.filter(c => !c.replied).length);
    const chat = document.querySelector('.in-messages');
    if (chat) chat.scrollTop = chat.scrollHeight;
    drawPanel();
  };
  render();
})();
