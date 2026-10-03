/* Datos de demostración: al aparecer un formulario, rellena sus campos vacíos con datos ficticios
   para recorrer el flujo sin escribir. Cada campo se rellena una sola vez y nunca sobrescribe lo que el usuario escribe. */
(() => {
  const DATE = '2026-10-05'; // fecha de referencia del demo, la misma que usa el espacio profesional
  const BASE = {
    name:'Camila Herrera', phone:'300 000 0199', email:'camila.demo@example.com', age:'32',
    title:'Valoración de control', reason:'Revisión de prueba', result:'Se confirmó la próxima cita',
    condition:'Caries en seguimiento', other:'Registro de prueba', note:'Detalle de prueba',
    label:'Radiografía de prueba', location:'Consultorio 1', next:'Revisar el plan y confirmar la siguiente fase',
    notes:'Llamar antes de confirmar la cita', preferred:'Mañana, 9:00 a.m.', language:'Español',
    schedule:'Lunes a viernes, 8:00 a.m. – 12:00 m.', comfort:'Música suave y agua tibia',
    privacy:'Atención privada, sin acompañantes', logistics:'Acceso por parqueadero interno',
    code:'DEMO-001', zone:'Medellín · El Poblado', residence:'Medellín', placement:'Instagram Reels',
    originCampaign:'Campaña demo Instagram', domain:'demo.patient360.test',
    amount:'500000', price:'500000', agreedPrice:'450000', buffer:'15', duration:'60',
    date:DATE, time:'10:00', end:'11:00'
  };
  // Mensajes por campo concreto (id del control) y por tipo de formulario (data-kind de la ventana de cita)
  const BY_ID = {
    pNoteText:'Evolución de prueba: hallazgos y plan acordados con la paciente.',
    jChatText:'Hola, ¿me confirman el horario de mañana?',
    pChatText:'Recibido. Confirmamos la cita con la paciente.',
    uChatText:'Confirmo mi cita de mañana. ¿Me pueden recordar la hora?',
    jMessageText:'Gracias, confirmo mi asistencia.',
    uTemplateText:'Hola {nombre}, le recordamos su cita de mañana en {sede}. Responda SI para confirmar.'
  };
  const BY_KIND = {
    task:{title:'Revisar el plan de tratamiento'},
    block:{reason:'Revisión de casos clínicos'},
    reschedule:{reason:'Propongo el jueves a las 9:00 a.m.'},
    support:{reason:'Necesito apoyo para preparar el consultorio.'},
    resolve:{result:'Plan revisado con la paciente.'},
    handoff:{next:'Confirmar el saldo pendiente con administración'}
  };

  const seen = new WeakSet();
  let demoFile = null;
  let lastAttach = 0;

  const clampDate = (v, min, max) => (min && v < min ? min : max && v > max ? max : v);

  function valueFor(el, form) {
    const kind = form.dataset.kind || '';
    if (BY_ID[el.id]) return BY_ID[el.id];
    if (BY_KIND[kind]?.[el.name]) return BY_KIND[kind][el.name];
    if (el.name === 'text') return form.querySelector('[name="visit"]') ? BY_ID.pNoteText : 'Mensaje de prueba.';
    return BASE[el.name] ?? 'Dato de prueba';
  }

  async function demoImage() {
    if (demoFile) return demoFile;
    const c = document.createElement('canvas');
    c.width = 640; c.height = 420;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 640, 420);
    grad.addColorStop(0, '#173c44'); grad.addColorStop(1, '#d4ae80');
    g.fillStyle = grad; g.fillRect(0, 0, 640, 420);
    g.fillStyle = '#ffffff'; g.font = 'bold 34px sans-serif'; g.fillText('Imagen de prueba', 40, 80);
    g.font = '22px sans-serif'; g.fillText('Patient 360 · demo', 40, 120);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    demoFile = new File([blob], 'imagen-demo.png', { type: 'image/png' });
    return demoFile;
  }

  async function attachFile(el) {
    if (Date.now() - lastAttach < 1500) return; // evita bucles si el archivo vuelve a renderizar el formulario
    lastAttach = Date.now();
    const dt = new DataTransfer();
    dt.items.add(await demoImage());
    el.files = dt.files;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fill(el, form) {
    if (seen.has(el)) return;
    seen.add(el);
    if (el.disabled || el.readOnly || ['hidden', 'submit', 'button', 'reset'].includes(el.type)) return;

    if (el.tagName === 'SELECT') {
      const current = el.options[el.selectedIndex];
      if (current?.value) return;
      const first = [...el.options].find(o => o.value && !o.disabled);
      if (first) el.value = first.value;
      return;
    }
    if (el.type === 'checkbox') { if (el.required && !el.checked) el.checked = true; return; }
    if (el.type === 'radio') {
      const group = [...form.querySelectorAll(`input[type="radio"][name="${el.name}"]`)];
      if (!group.some(r => r.checked) && group[0] === el) el.checked = true;
      return;
    }
    if (el.type === 'file') {
      if (!el.files.length && (el.accept || '').includes('image')) attachFile(el);
      return;
    }
    if (el.value !== '') return;

    if (el.type === 'number') {
      let v = Number(BASE[el.name] ?? el.min ?? 1);
      if (el.min !== '' && v < Number(el.min)) v = Number(el.min);
      if (el.max !== '' && v > Number(el.max)) v = Number(el.max);
      el.value = String(v);
      return;
    }
    if (el.type === 'date') { el.value = clampDate(BASE.date, el.min, el.max); return; }
    if (el.type === 'time') { el.value = BASE[el.name] ?? BASE.time; return; }

    let v = valueFor(el, form);
    if (el.maxLength > 0) v = v.slice(0, el.maxLength);
    el.value = v;
  }

  function fillForm(form) {
    form.querySelectorAll('input, select, textarea').forEach(el => fill(el, form));
  }

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches?.('form')) fillForm(node);
    node.querySelectorAll?.('form').forEach(fillForm);
  }

  new MutationObserver(records => {
    for (const r of records) r.addedNodes.forEach(scan);
  }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
})();
