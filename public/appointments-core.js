/* Núcleo de citas de Patient 360: reloj, estados por dimensión, línea de tiempo de la visita, disponibilidad y
   comandos. No dibuja nada. Las pantallas leen el estado desde aquí y solo escriben mediante comandos, de modo
   que al conectar un servidor cada comando pasa a ser una llamada y las pantallas no cambian.

   Convive con el almacenamiento anterior (a.status, visitFlow, a.changeRequested): lo conserva como base, expone
   sobre él las dimensiones separadas y registra en la línea de tiempo los cambios que hagan los módulos
   anteriores (ver sync). Las tres entidades siguen separadas: paciente, cita y tratamiento. */
const P360 = (() => {
  let TODAY = '2026-10-05'; // cambia cuando la simulación adelanta el reloj (travelTo)
  const CHECKOUT_TASK = 'Coordinar la salida y la próxima cita'; // tarea que recibe recepción cuando el profesional finaliza

  // ── Reloj único. Hoy arranca a las 08:24 y avanza en tiempo real; con servidor se reemplaza por la hora real
  let clockReal = Date.now(), clockMinute = 8 * 60 + 24;
  const lastMinute = 18 * 60;
  const nowMinute = () => Math.min(clockMinute + Math.floor((Date.now() - clockReal) / 60000), lastMinute);
  const nowTime = () => hhmm(nowMinute());
  const stamp = (time = nowTime()) => `${TODAY}T${time}`;
  const actor = () => (pro.active ? proName : userNow().name);

  // ── Recursos y horarios. Una cita ocupa un profesional y un consultorio; agregar otro recurso es sumar una
  //    lista aquí y una comprobación en slots(), sin tocar las pantallas
  const rooms = { 'El Tesoro': ['Consultorio 1', 'Consultorio 2', 'Consultorio 3'], Laureles: ['Consultorio 1', 'Consultorio 2'] };
  const weekdayHours = [[480, 750], [810, 1080]]; // 08:00–12:30 y 13:30–18:00, con descanso al mediodía
  const hours = { 1: weekdayHours, 2: weekdayHours, 3: weekdayHours, 4: weekdayHours, 5: weekdayHours, 6: [[480, 720]] };
  const schedules = {}; // horario propio por profesional: { 'Dra. …': { 1: [[inicio, fin]], … } }
  const weekday = date => new Date(date + 'T12:00:00Z').getUTCDay();
  const workIntervals = (professional, date) => schedules[professional]?.[weekday(date)] || hours[weekday(date)] || [];

  // ── Preparación: requisitos según el servicio. Una cita sin requisitos no muestra preparación
  const prepLabels = { historia: 'Historia médica actualizada', consentimiento: 'Consentimiento informado', panoramica: 'Radiografía panorámica', fotos: 'Fotografías iniciales', modelos: 'Modelos de estudio' };
  const prepRules = [
    [/valoraci/i, []],
    [/implant|cirug/i, ['historia', 'consentimiento', 'panoramica']],
    [/dise[ñn]o|est[ée]tic/i, ['consentimiento', 'fotos']],
    [/rehabilit/i, ['historia', 'modelos']]
  ];
  const prepItems = a => (a.prepItems ||= (prepRules.find(([rule]) => rule.test(a.type)) || [null, []])[1]);
  const prepPending = a => prepItems(a).filter(key => !a.prepDone?.[key]);

  // ── Seguimiento: reglas por servicio. Los contactos se crean como tareas al cerrar la salida; el control
  //    indica cuándo conviene la próxima cita. Las automatizaciones futuras leen esta misma tabla
  const followUpRules = [
    [/cirug|extracc|exodoncia/i, [{ days: 1, title: 'Seguimiento 24 horas tras el procedimiento' }, { days: 8, title: 'Control posoperatorio', control: true }]],
    [/implant/i, [{ days: 1, title: 'Seguimiento 24 horas' }, { days: 15, title: 'Control de implante', control: true }]],
    [/valoraci/i, [{ days: 1, title: 'Contactar para conocer su decisión', decision: true }]],
    [/dise[ñn]o|est[ée]tic|blanque/i, [{ days: 15, title: 'Control de diseño de sonrisa', control: true }]]
  ];
  const followUpsFor = a => (followUpRules.find(([rule]) => rule.test(a.type)) || [null, []])[1];
  const nextControl = a => followUpsFor(a).find(step => step.control) || null;

  // ── Catálogo de tratamientos (maqueta). El valor estimado de un tratamiento recomendado se lee de aquí: la consulta
  //    clínica solo define el tratamiento y recepción ve el valor en Salidas. No es un catálogo configurable
  const treatmentCatalog = { 'diseño de sonrisa': 7200000 };
  const catalogValue = title => treatmentCatalog[String(title).trim().toLowerCase()] ?? null;

  // ── Precio de referencia para citas sin servicio de catálogo
  const priceRules = [[/cirug/i, 650000], [/implant/i, 320000], [/limpieza/i, 220000], [/dise[ñn]o|est[ée]tic/i, 250000], [/ortodoncia/i, 120000]];
  const serviceOf = a => services.find(s => s.id === a.serviceId) || null;
  const priceFor = type => (priceRules.find(([rule]) => rule.test(type)) || [null, 180000])[1];

  // ── Línea de tiempo: cada evento guarda qué pasó, cuándo y quién lo hizo
  const STEP_EVENT = ['', 'llegada', 'inicio_atencion', 'fin_atencion', 'salida'];
  const snapshot = a => ({ step: flowStep(a), status: a.status, change: !!a.changeRequested });
  function log(a, type, data = {}, time) {
    (a.events ||= []).push({ type, at: stamp(time), by: actor(), ...data });
    a.seen = snapshot(a);
  }
  const lastEvent = (a, type) => (a.events || []).filter(e => e.type === type).at(-1) || null;
  const eventTime = (a, type) => lastEvent(a, type)?.at.slice(11) || '';
  function adopt(a) {
    a.duration = Number(a.duration || 45);
    a.agreedPrice ??= serviceOf(a)?.price ?? (a.treatment ? 0 : priceFor(a.type)); // una fase de un plan se cobra en el plan
    a.events ||= [];
    a.prepDone ||= {};
    a.seen = snapshot(a);
  }
  // Registra los cambios hechos por módulos anteriores (WhatsApp simulado, espacio profesional, recorrido guiado)
  function sync() {
    for (const a of appointments) {
      if (!a.seen) { adopt(a); log(a, 'reserva'); continue; }
      const was = a.seen, now = snapshot(a);
      if (now.status !== was.status && now.status === 'Cancelada') log(a, 'cancelacion');
      if (now.status !== was.status && now.status === 'Confirmada') log(a, 'confirmacion');
      if (now.change && !was.change) log(a, 'cambio_solicitado');
      for (let step = was.step + 1; step <= now.step; step++) log(a, STEP_EVENT[step]);
      a.seen = now;
    }
  }

  // ── Estados por dimensión. Nadie los ve todos a la vez: nextAction y describe los traducen
  function financeOf(a) {
    const bill = invoices.find(i => i.visit === a.id) || null;
    const due = bill ? bill.amount : Number(a.agreedPrice || 0);
    const paid = bill ? invoicePaid(bill.id) : 0;
    return { bill, due, paid, balance: Math.max(0, due - paid), state: paid >= due ? 'pagada' : paid ? 'parcial' : 'pendiente' };
  }
  function stateOf(a) {
    const step = flowStep(a);
    return {
      booking: a.status === 'Cancelada' ? 'cancelada' : a.changeRequested ? 'cambio_solicitado' : 'reservada',
      confirmation: a.status === 'Confirmada' || a.status === 'Atendida' || step > 0 ? 'confirmada' : a.noResponse ? 'sin_respuesta' : 'pendiente',
      preparation: prepPending(a).length ? 'pendiente' : 'lista',
      visit: a.noShow ? 'no_asistio' : ['pendiente', 'llego', 'en_atencion', 'finalizada', 'finalizada'].at(step),
      checkout: step === 3 ? 'pendiente' : step === 4 ? 'cerrada' : null,
      finance: financeOf(a).state
    };
  }
  const isLate = a => a.date < TODAY || (a.date === TODAY && minutes(a.time) + 15 <= nowMinute());
  const isAhead = a => a.date > TODAY || (a.date === TODAY && minutes(a.time) - 5 > nowMinute());
  const waitMinutes = a => Math.max(0, nowMinute() - minutes(eventTime(a, 'llegada') || nowTime()));

  // Macroestado visible: una palabra para la agenda y una frase para el detalle
  function phase(a) {
    const s = stateOf(a);
    if (s.booking === 'cancelada') return 'cancelada';
    if (s.visit === 'no_asistio') return 'no_asistio';
    if (s.checkout === 'cerrada') return 'completa';
    if (s.checkout === 'pendiente') return 'salida';
    if (s.visit === 'en_atencion') return 'en_atencion';
    if (s.visit === 'llego') return 'llego';
    if (s.booking === 'cambio_solicitado') return 'cambio';
    return s.confirmation === 'confirmada' ? 'confirmada' : 'por_confirmar';
  }
  const phaseLabels = { cancelada: 'Cancelada', no_asistio: 'No asistió', completa: 'Completa', salida: 'En salida', en_atencion: 'En atención', llego: 'En clínica', cambio: 'Cambio solicitado', confirmada: 'Confirmada', por_confirmar: 'Por confirmar' };
  function describe(a) {
    const s = stateOf(a), p = phase(a);
    if (p === 'cancelada') { const reason = lastEvent(a, 'cancelacion')?.reason; return 'Cita cancelada' + (reason ? ' · ' + reason : ''); }
    if (p === 'no_asistio') return 'El paciente no asistió';
    if (p === 'completa') return 'Visita completa' + (eventTime(a, 'salida') ? ' · salida ' + eventTime(a, 'salida') : '');
    if (p === 'salida') return 'Atención finalizada' + (eventTime(a, 'fin_atencion') ? ' a las ' + eventTime(a, 'fin_atencion') : '') + ' · pendiente de salida';
    if (p === 'en_atencion') return 'En atención' + (eventTime(a, 'inicio_atencion') ? ' desde las ' + eventTime(a, 'inicio_atencion') : '');
    if (p === 'llego') return `Llegó a las ${eventTime(a, 'llegada') || nowTime()} · espera ${waitMinutes(a)} min`;
    if (p === 'cambio') return 'El paciente pidió cambiar el horario';
    if (p === 'por_confirmar') return s.confirmation === 'sin_respuesta' ? 'Sin respuesta del paciente' : 'Confirmación pendiente';
    return s.preparation === 'pendiente' ? 'Confirmada · falta ' + prepLabels[prepPending(a)[0]].toLowerCase() : 'Confirmada';
  }
  // La acción principal: qué debe hacer ahora quien opera la clínica
  function nextAction(a) {
    const s = stateOf(a), today = a.date === TODAY;
    if (s.booking === 'cancelada') return { key: 'rebook', label: 'Reagendar' };
    if (s.visit === 'no_asistio') return { key: 'rebook', label: 'Contactar y reagendar' };
    if (s.checkout === 'cerrada') return null;
    if (s.checkout === 'pendiente') return { key: 'checkout', label: s.finance === 'pagada' ? 'Finalizar salida' : 'Cobrar salida' };
    if (s.visit !== 'pendiente') return null; // llegó o en atención: el siguiente paso es del profesional
    if (s.booking === 'cambio_solicitado') return { key: 'reschedule', label: 'Reprogramar' };
    if (a.date < TODAY) return { key: 'noshow', label: 'Marcar no asistió' };
    if (today) return { key: 'arrive', label: 'Paciente llegó' };
    if (s.confirmation !== 'confirmada') return { key: 'confirm', label: 'Confirmar paciente' };
    if (s.preparation === 'pendiente') return { key: 'prep', label: 'Completar preparación' };
    return { key: 'travel', label: 'Adelantar a la hora de la cita', quiet: true }; // nada pendiente hasta ese día
  }
  function otherActions(a) {
    const s = stateOf(a), main = nextAction(a)?.key, list = [];
    const add = (key, label) => { if (key !== main) list.push({ key, label }); };
    if (s.booking !== 'cancelada' && s.visit === 'pendiente') {
      if (s.confirmation !== 'confirmada') add('confirm', 'Confirmar');
      add('reschedule', 'Reprogramar');
      if (isLate(a)) add('noshow', 'No asistió');
      add('cancel', 'Cancelar');
      if (isAhead(a)) add('travel', 'Adelantar a la hora de la cita');
    }
    if (['llego', 'en_atencion'].includes(s.visit) && a.professional === proName) add('aspro', `Ver como ${a.professional.startsWith('Dra.') ? 'la' : 'el'} ${a.professional}`);
    if (s.checkout === 'cerrada') add('next', 'Agendar próxima cita');
    add('patient', 'Ver paciente');
    return list;
  }
  function metrics(a) {
    const at = type => { const t = eventTime(a, type); return t ? minutes(t) : null; };
    const arrived = at('llegada'), started = at('inicio_atencion'), ended = at('fin_atencion'), left = at('salida');
    const gap = (from, to) => (from === null || to === null ? null : Math.max(0, to - from));
    return { wait: gap(arrived, started), delay: started === null ? null : started - minutes(a.time), length: gap(started, ended), planned: Number(a.clinicalDuration || a.duration), checkout: gap(ended, left) };
  }

  // ── Disponibilidad
  const span = a => Number(a.duration || 45) + (a.clinicalDuration ? 0 : Number(a.buffer || 0));
  const interval = a => [minutes(a.time), minutes(a.time) + span(a)];
  const holds = a => a.status !== 'Cancelada' && !a.noShow;
  const crosses = (start, end, a) => start < interval(a)[1] && interval(a)[0] < end;
  // Consultorio libre en ese intervalo; primero el que el profesional ya usa en esa sede
  function freeRoom(site, date, start, end, ignoreId, professional = null) {
    const usual = appointments.filter(a => a.professional === professional && a.site === site && a.room).sort((a, b) => (a.date === date ? 0 : 1) - (b.date === date ? 0 : 1))[0]?.room;
    const order = [...(rooms[site] || [])].sort((a, b) => (a === usual ? 0 : 1) - (b === usual ? 0 : 1));
    return order.find(room => !appointments.some(a => a.id !== ignoreId && holds(a) && a.date === date && a.site === site && a.room === room && crosses(start, end, a))) || '';
  }
  function busy(professional, site, date, ignoreId) {
    return [
      ...appointments.filter(a => a.id !== ignoreId && holds(a) && a.date === date && a.professional === professional),
      ...vipBlocks.filter(b => b.active && b.date === date && (b.professional === professional || (b.professional === 'Todos' && b.site === site)))
    ];
  }
  // Horarios libres de un día para un profesional, una sede y una duración
  function slots({ professional, site, duration, date, patient: pid = null, ignoreId = null, step = 15 }) {
    const taken = busy(professional, site, date, ignoreId);
    const own = appointments.filter(a => a.id !== ignoreId && holds(a) && a.date === date && a.patient === pid);
    const earliest = date < TODAY ? Infinity : date === TODAY ? Math.ceil((nowMinute() + 5) / step) * step : 0;
    const found = [];
    for (const [from, to] of workIntervals(professional, date)) {
      for (let start = Math.max(from, earliest); start + duration <= to; start += step) {
        const end = start + duration;
        if (taken.some(x => crosses(start, end, x)) || own.some(x => crosses(start, end, x))) continue;
        const room = freeRoom(site, date, start, end, ignoreId, professional);
        if (room) found.push({ date, time: hhmm(start), room });
      }
    }
    return found;
  }
  // Primeros horarios sugeridos: por día, el más cercano a la mañana, al mediodía y a la tarde
  function suggest(query, total = 7) {
    const picks = [];
    for (let offset = 0; offset < 28 && picks.length < total; offset++) {
      const free = slots({ ...query, date: addDays(TODAY, offset), step: 30 }), day = [];
      for (const target of [540, 690, 900]) {
        const best = free.filter(s => !day.includes(s)).sort((a, b) => Math.abs(minutes(a.time) - target) - Math.abs(minutes(b.time) - target))[0];
        if (best) day.push(best);
      }
      picks.push(...day.sort((a, b) => a.time.localeCompare(b.time)));
    }
    return picks.slice(0, total);
  }
  // Devuelve el motivo por el que un horario no sirve, o '' si está libre
  function check(candidate, ignoreId = null) {
    const start = minutes(candidate.time), end = start + candidate.duration;
    if (!candidate.date || candidate.date < TODAY) return 'Elige una fecha desde hoy.';
    if (!workIntervals(candidate.professional, candidate.date).some(([from, to]) => start >= from && end <= to)) return 'Ese horario queda fuera de la jornada del profesional.';
    const clash = busy(candidate.professional, candidate.site, candidate.date, ignoreId).find(x => crosses(start, end, x));
    if (clash) return clash.patient ? `Se cruza con la cita de ${patient(clash.patient).name} (${clash.time}–${endTime(clash)}).` : 'Ese horario está reservado como tiempo protegido.';
    if (appointments.some(a => a.id !== ignoreId && holds(a) && a.date === candidate.date && a.patient === candidate.patient && crosses(start, end, a))) return 'El paciente ya tiene otra cita en ese horario.';
    return freeRoom(candidate.site, candidate.date, start, end, ignoreId) ? '' : 'No hay consultorio libre en esa sede a esa hora.';
  }

  // ── Comandos. Cada uno valida, cambia el estado, deja su evento y devuelve { error } si no pudo
  const queueMessages = a => { jCancelMessages(a); jQueue(a); };
  function createContact({ name, phone, site, source = 'Por registrar', campaign = 'Sin campaña', interest = '', age = '—' }) {
    const record = { id: nextId(patients), name: name.trim(), age, site, source, campaign, interest, phone: phone.trim(), email: 'Sin correo', status: 'Nueva', consent: true, created: TODAY, last: TODAY, nextAction: 'Completar datos del paciente', attribution: { residence: 'Por registrar', evidence: 'Declarado por paciente', firstTouch: TODAY } };
    patients.push(record);
    return record;
  }
  function book({ patient: pid, serviceId = null, type = '', professional, site, date, time, note = '', origin = '', rebookOf = null }) {
    const service = services.find(s => s.id === serviceId) || null;
    const clinicalDuration = service?.duration || 45, buffer = service?.buffer ?? 15;
    const a = { patient: pid, date, time, duration: clinicalDuration + buffer, clinicalDuration, buffer, serviceId: service?.id || null, type: (service?.name || type).trim(), professional, site, agreedPrice: service?.price ?? priceFor(type), status: 'Reservada', note: note.trim(), origin };
    if (!a.type) return { error: 'Elige el servicio o escribe el motivo de la cita.' };
    const error = check(a);
    if (error) return { error };
    a.id = nextId(appointments);
    a.room = freeRoom(site, date, minutes(time), minutes(time) + a.duration, null, professional);
    a.treatment = treatments.find(t => t.patient === pid && t.professional === professional && t.status === 'En progreso')?.id || null;
    appointments.push(a);
    adopt(a);
    log(a, 'reserva', rebookOf ? { rebookOf } : {});
    queueMessages(a);
    logOperation(`${patient(pid).name}: cita reservada con ${professional}`);
    return { appointment: a };
  }
  function confirm(a) {
    if (stateOf(a).visit !== 'pendiente' || a.status === 'Cancelada') return { error: 'Esta cita ya no admite confirmación.' };
    a.status = 'Confirmada'; a.noResponse = false;
    const when = a.date === TODAY ? 'hoy' : a.date === addDays(TODAY, 1) ? 'mañana' : 'el ' + new Date(a.date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    a.confirmMessage = `Hola ${patient(a.patient).name.split(' ')[0]}, te esperamos ${when} a las ${a.time} para tu ${a.type.toLowerCase()} con ${a.professional.startsWith('Dra.') ? 'la' : 'el'} ${a.professional}.`;
    log(a, 'confirmacion', { message: a.confirmMessage });
    return { message: a.confirmMessage };
  }
  function noResponse(a) {
    a.noResponse = true;
    log(a, 'sin_respuesta');
    return {};
  }
  function reschedule(a, { date, time }, reason = '') {
    if (flowStep(a) > 0 || a.status === 'Cancelada') return { error: 'Solo se reprograma una cita que no ha iniciado.' };
    const error = check({ ...a, date, time, duration: span(a) }, a.id);
    if (error) return { error };
    const from = { date: a.date, time: a.time };
    Object.assign(a, { date, time, room: freeRoom(a.site, date, minutes(time), minutes(time) + span(a), a.id, a.professional), status: 'Reservada', changeRequested: false, noResponse: false, noShow: false });
    log(a, 'reprogramacion', { from, to: { date, time }, reason: reason.trim() });
    queueMessages(a);
    logOperation(`${patient(a.patient).name}: cita reprogramada`);
    return {};
  }
  function cancel(a, reason = '', followUp = false) {
    if (flowStep(a) > 0) return { error: 'Una visita iniciada se cierra desde su salida.' };
    a.status = 'Cancelada'; a.changeRequested = false;
    log(a, 'cancelacion', { reason });
    jCancelMessages(a);
    if (followUp) careTasks.push({ id: nextId(careTasks), patient: a.patient, visit: a.id, title: 'Reagendar cita cancelada · ' + a.type, date: addDays(TODAY, 1), owner: 'Laura Martínez', done: false });
    logOperation(`${patient(a.patient).name}: cita cancelada`);
    return {};
  }
  function arrive(a) {
    if (a.status === 'Cancelada' || flowStep(a) !== 0 || a.date !== TODAY) return { error: 'La llegada solo se registra en una cita de hoy que no ha iniciado.' };
    a.noShow = false; a.changeRequested = false;
    visitFlow[a.id] = 1;
    log(a, 'llegada');
    if (a.professional === proName) pNotice('arrival', 'Paciente en recepción', patient(a.patient).name + ' ya está en la clínica.', a.patient, a.id);
    logOperation(patient(a.patient).name + ': llegada registrada');
    return {};
  }
  function noShow(a) {
    if (flowStep(a) !== 0 || a.status === 'Cancelada') return { error: 'Solo aplica a una cita que no inició.' };
    a.noShow = true;
    log(a, 'no_asistio');
    jCancelMessages(a);
    return {};
  }
  function togglePrep(a, key) {
    a.prepDone[key] = !a.prepDone[key];
    return {};
  }
  function charge(a, amount, method) {
    const money = financeOf(a);
    if (!Number.isFinite(amount) || amount <= 0 || amount > money.balance) return { error: 'El cobro debe ser mayor que cero y no superar el saldo.' };
    const bill = money.bill || { id: nextId(invoices), patient: a.patient, treatment: a.treatment, date: a.date, amount: money.due, number: 'CTA-' + a.id, visit: a.id };
    if (!money.bill) invoices.push(bill);
    payments.push({ id: nextId(payments), patient: a.patient, invoice: bill.id, date: a.date, amount, method });
    state.period = a.date.slice(0, 7);
    log(a, 'cobro', { amount, method });
    logOperation(`Cobro de ${fmt(amount)} · ${patient(a.patient).name}`);
    return {};
  }
  // Continuidad: una salida no termina sin definir qué ocurre después. Aquí, un seguimiento para el día siguiente
  function scheduleFollowUp(a) {
    if (a.followUp) return { task: a.followUp };
    const title = a.plan ? `Contactar para conocer su decisión sobre ${a.plan.title.toLowerCase()}` : 'Contactar para dar seguimiento a la visita';
    const task = { id: nextId(careTasks), patient: a.patient, visit: a.id, title, date: addDays(a.date, 1), time: '10:00', owner: 'Laura Martínez', done: false, auto: true };
    careTasks.push(task);
    a.followUp = task;
    log(a, 'seguimiento', { title });
    logOperation(patient(a.patient).name + ': seguimiento programado');
    return { task };
  }
  function closeCheckout(a) {
    if (flowStep(a) !== 3) return { error: 'La visita debe estar en salida.' };
    visitFlow[a.id] = 4; a.status = 'Atendida';
    log(a, 'salida');
    careTasks.filter(t => t.visit === a.id && !t.done && t.title === CHECKOUT_TASK).forEach(t => { t.done = true; t.result = 'Salida completada'; }); // la tarea de salida se cierra sola
    const created = followUpsFor(a).filter(step => !step.control && !(step.decision && (a.nextAppointment || a.followUp))).map(step => ({ id: 0, patient: a.patient, visit: a.id, title: step.decision && a.plan ? `Contactar para conocer su decisión sobre el ${a.plan.title.toLowerCase()}` : step.title, date: addDays(a.date, step.days), time: '10:00', owner: step.owner || 'Laura Martínez', done: false, auto: true }));
    created.forEach(task => { task.id = nextId(careTasks); careTasks.push(task); });
    jFollow(a);
    logOperation(patient(a.patient).name + ': salida completada');
    return { followUps: created };
  }

  // ── Simulación: adelanta el reloj a cinco minutos antes de una cita. Lo anterior a ese momento queda atendido
  function travelTo(a) {
    TODAY = a.date; clockReal = Date.now(); clockMinute = Math.max(480, minutes(a.time) - 5);
    pro.date = TODAY; // el espacio profesional trabaja siempre sobre el día del escenario
    appointments.filter(x => x.id !== a.id && holds(x) && flowStep(x) < 4 && (x.date < TODAY || (x.date === TODAY && interval(x)[1] <= clockMinute)))
      .forEach(x => { visitFlow[x.id] = 4; x.status = 'Atendida'; x.seen = snapshot(x); });
    careTasks.filter(t => t.auto && !t.done && t.date < TODAY).forEach(t => { t.done = true; }); // los seguimientos de días anteriores ya se hicieron
    Object.assign(state, { agendaDay: TODAY, calendarAnchor: TODAY, flowDate: TODAY });
  }

  // ── Datos de ejemplo de la jornada: las citas del profesional y las de sus colegas, en distintos momentos
  function seed() {
    pSeed();
    appointments.forEach(adopt);
    // Lo anterior a hoy ya ocurrió: queda como historial cerrado
    appointments.filter(a => a.date < TODAY && a.status !== 'Cancelada').forEach(a => { visitFlow[a.id] = 4; a.status = 'Atendida'; a.seen = snapshot(a); });
    const missed = appointments.find(a => a.id === 505);
    if (missed) { delete visitFlow[505]; Object.assign(missed, { status: 'Confirmada', noShow: true }); missed.events.push({ type: 'no_asistio', at: missed.date + 'T09:35', by: 'Laura Martínez' }); missed.seen = snapshot(missed); }

    const add = (pid, time, serviceId, type, professional, site, room, status, extra = {}) => {
      const service = services.find(s => s.id === serviceId) || null, clinicalDuration = service?.duration || 45, buffer = service?.buffer ?? 15;
      const a = { id: nextId(appointments), patient: pid, date: TODAY, time, duration: clinicalDuration + buffer, clinicalDuration, buffer, serviceId, type: service?.name || type, professional, site, room, status, treatment: null, ...extra };
      appointments.push(a); adopt(a);
      return a;
    };
    const past = (a, type, time, data = {}) => { a.events.push({ type, at: stamp(time), by: 'Laura Martínez', ...data }); a.seen = snapshot(a); };
    const [mateo, sara] = [professionals[1], professionals[2]];

    const absent = add(3, '08:00', 2, '', mateo, 'Laureles', 'Consultorio 1', 'Confirmada', { treatment: 102, noShow: true });
    past(absent, 'no_asistio', '08:20');
    add(9, '09:00', 2, '', mateo, 'Laureles', 'Consultorio 1', 'Confirmada');
    add(6, '10:30', null, 'Valoración de ortodoncia', mateo, 'Laureles', 'Consultorio 1', 'Por confirmar', { noResponse: true });

    const inChair = add(10, '08:15', 3, '', sara, 'El Tesoro', 'Consultorio 3', 'Confirmada');
    visitFlow[inChair.id] = 2;
    past(inChair, 'llegada', '08:06'); past(inChair, 'inicio_atencion', '08:16', { by: sara });
    add(5, '09:45', 1, '', sara, 'El Tesoro', 'Consultorio 3', 'Confirmada');
    add(8, '11:15', null, 'Valoración de control', sara, 'El Tesoro', 'Consultorio 3', 'Reservada');
    const dropped = add(6, '16:00', 3, '', sara, 'El Tesoro', 'Consultorio 3', 'Cancelada');
    past(dropped, 'cancelacion', '08:05', { reason: 'El paciente no puede asistir' });

    // Mañana: la agenda ya tiene movimiento y deja libres las 09:00, 11:30 y 15:00 de la Dra. Daniela
    const tomorrow = addDays(TODAY, 1), early = appointments.find(a => a.proDemo && a.date === tomorrow);
    if (early) early.time = '08:00';
    add(8, '10:00', 3, '', sara, 'El Tesoro', 'Consultorio 3', 'Confirmada', { date: tomorrow });
    add(5, '15:00', 1, '', sara, 'El Tesoro', 'Consultorio 3', 'Reservada', { date: tomorrow });
    // Seguimientos ya programados, para que la lista no empiece vacía
    careTasks.push({ id: nextId(careTasks), patient: 6, visit: dropped.id, title: 'Reagendar la limpieza cancelada', date: TODAY, time: '11:00', owner: 'Laura Martínez', done: false, auto: true });
    careTasks.push({ id: nextId(careTasks), patient: 4, title: 'Recordar el control de rehabilitación del miércoles', date: tomorrow, time: '09:00', owner: 'Laura Martínez', done: false, auto: true });

    // Citas de la Dra. Daniela: la primera ya llegó; cirugía con una radiografía pendiente
    const mine = appointments.filter(a => a.proDemo && a.date === TODAY);
    if (mine[0]) past(mine[0], 'llegada', '08:21');
    mine.forEach(a => prepItems(a).forEach(key => { a.prepDone[key] = !(/cirug/i.test(a.type) && key === 'panoramica'); }));
  }

  seed();
  Object.assign(state, { agendaDay: TODAY, calendarAnchor: TODAY, flowDate: TODAY });

  return {
    get today() { return TODAY; }, travelTo, isAhead, catalogValue, checkoutTask: CHECKOUT_TASK, nowMinute, nowTime, rooms, hours, workIntervals, prepLabels, phaseLabels,
    stateOf, phase, describe, nextAction, otherActions, metrics, financeOf, serviceOf, eventTime, isLate,
    prepItems, prepPending, followUpsFor, nextControl, slots, suggest, check, sync,
    createContact, scheduleFollowUp, book, confirm, noResponse, reschedule, cancel, arrive, noShow, togglePrep, charge, closeCheckout,
    checkoutQueue: () => appointments.filter(a => flowStep(a) === 3 && a.status !== 'Cancelada').sort((a, b) => (eventTime(a, 'fin_atencion') || a.time).localeCompare(eventTime(b, 'fin_atencion') || b.time))
  };
})();
