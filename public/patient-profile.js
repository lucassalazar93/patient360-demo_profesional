/* Perfil clínico de cada paciente para la ficha del profesional: alertas médicas, motivo de consulta, hábitos,
   antecedentes, contacto de emergencia, documentos y notas. Son datos de ejemplo; un paciente sin perfil propio
   recibe uno neutro la primera vez que se abre su ficha. */
const clinicalProfiles = {
  1: {
    allergies: ['Penicilina'],
    medication: ['Anticonceptivo oral'],
    conditions: [],
    anesthesia: 'Lidocaína con epinefrina, sin reacciones',
    bloodPressure: '112/72 mmHg',
    reason: 'Mejorar la forma y el color de los dientes anteriores.',
    expectation: 'Resultado natural, sin desgastar esmalte.',
    habits: ['Bruxismo nocturno leve', 'Café, 2 tazas al día'],
    hygiene: 'Cepillado 3 veces al día y seda dental diaria',
    lastCleaning: '2026-08-14',
    history: ['Ortodoncia (2014–2016)', 'Blanqueamiento en casa (2023)'],
    emergency: 'Camilo Restrepo · esposo · 300 000 0141',
    documents: [['Consentimiento informado', '2026-09-08'], ['Autorización de fotografías', '2026-09-08'], ['Historia médica actualizada', '2026-09-30']],
    notes: [
      { author: 'Laura · Recepción', date: '2026-09-30', text: 'Prefiere que le expliquen cada paso antes de empezar. Suele llegar 10 minutos antes.' },
      { author: 'Dra. Daniela Tejada', date: '2026-09-08', text: 'Sensibilidad leve en 11 y 21 después del encerado. Aplicar desensibilizante antes de la fase 2.' }
    ]
  },
  2: {
    allergies: [],
    medication: ['Losartán 50 mg al día'],
    conditions: ['Hipertensión controlada'],
    anesthesia: 'Vasoconstrictor en dosis baja',
    bloodPressure: '128/84 mmHg',
    reason: 'Reponer el 36, perdido hace dos años.',
    expectation: 'Recuperar la masticación del lado izquierdo.',
    habits: ['Fumador ocasional'],
    hygiene: 'Cepillado 2 veces al día, sin seda dental',
    lastCleaning: '2026-06-20',
    history: ['Extracción del 36 (2024)', 'Resinas en 26 y 46'],
    emergency: 'Marcela Mejía · hermana · 300 000 0142',
    documents: [['Consentimiento informado', '2026-09-17'], ['Historia médica actualizada', '2026-09-17'], ['Orden de tomografía', '2026-09-17']],
    notes: [
      { author: 'Laura · Recepción', date: '2026-09-28', text: 'Viaja por trabajo. Confirmar sus citas con dos días de anticipación.' },
      { author: 'Dra. Daniela Tejada', date: '2026-09-17', text: 'Tomografía solicitada para medir la altura ósea en la zona del 36. Revisarla antes de definir el implante.' }
    ]
  },
  4: {
    allergies: ['Látex'],
    medication: ['Metformina 850 mg', 'Aspirina 100 mg'],
    conditions: ['Diabetes tipo 2 controlada'],
    anesthesia: 'Sin reacciones. Citas cortas en la mañana',
    bloodPressure: '130/82 mmHg',
    reason: 'Rehabilitar los sectores posteriores y recuperar la dimensión vertical.',
    expectation: 'Masticar sin molestias y proteger los dientes del desgaste.',
    habits: ['Bruxismo', 'No fuma'],
    hygiene: 'Cepillado 2 veces al día y cepillo interdental',
    lastCleaning: '2026-07-30',
    history: ['Coronas en 16 y 26 (2019)', 'Tratamiento periodontal (2022)'],
    emergency: 'Patricia Gómez · esposa · 300 000 0144',
    documents: [['Consentimiento informado', '2026-08-21'], ['Historia médica actualizada', '2026-09-25']],
    notes: [
      { author: 'Laura · Recepción', date: '2026-09-25', text: 'Prefiere citas antes de las 9:00.' },
      { author: 'Dra. Daniela Tejada', date: '2026-08-21', text: 'Usar guantes de nitrilo. Confirmar la glucometría del día antes de procedimientos largos.' }
    ]
  },
  7: {
    allergies: ['AINEs (ibuprofeno)'],
    medication: ['Salbutamol inhalado, si lo necesita'],
    conditions: ['Asma leve'],
    anesthesia: 'Sin reacciones',
    bloodPressure: '108/70 mmHg',
    reason: 'Cerrar el diastema entre 11 y 21.',
    expectation: 'Una opción conservadora y reversible.',
    habits: ['Onicofagia'],
    hygiene: 'Cepillado 3 veces al día y seda dental',
    lastCleaning: '2026-09-02',
    history: ['Sin tratamientos previos de importancia'],
    emergency: 'Gloria Hoyos · madre · 300 000 0147',
    documents: [['Consentimiento informado', '2026-09-20'], ['Autorización de fotografías', '2026-09-20']],
    notes: [
      { author: 'Laura · Recepción', date: '2026-09-29', text: 'Tiene dudas sobre el plan propuesto. Pidió ver casos similares.' },
      { author: 'Dra. Daniela Tejada', date: '2026-09-20', text: 'Trae su inhalador. Formular acetaminofén en lugar de AINEs.' }
    ]
  },
  11: {
    allergies: [],
    medication: ['Warfarina 5 mg'],
    conditions: ['Anticoagulado · fibrilación auricular'],
    anesthesia: 'Sin reacciones',
    bloodPressure: '124/80 mmHg',
    reason: 'Extracción de los terceros molares retenidos (38 y 48).',
    expectation: 'Resolver las molestias sin complicaciones.',
    habits: ['No fuma'],
    hygiene: 'Cepillado 2 veces al día',
    lastCleaning: '2026-05-11',
    history: ['Exodoncia del 18 (2021)'],
    emergency: 'Diana Molina · esposa · 300 000 0151',
    documents: [['Consentimiento informado', '2026-10-01'], ['Historia médica actualizada', '2026-10-01']],
    notes: [
      { author: 'Laura · Recepción', date: '2026-10-01', text: 'Se pone ansioso en la sala de espera. Prefiere pasar directo al consultorio.' },
      { author: 'Dra. Daniela Tejada', date: '2026-10-01', text: 'Pedir INR de menos de 72 horas antes de la cirugía y coordinar con su cardiólogo.' }
    ]
  },
  12: {
    allergies: [],
    medication: ['Vitaminas prenatales'],
    conditions: ['Embarazo · semana 18'],
    anesthesia: 'Lidocaína sin vasoconstrictor',
    bloodPressure: '110/70 mmHg',
    reason: 'Diseño de sonrisa con carillas en el sector anterior.',
    expectation: 'Avanzar con lo que sea seguro durante el embarazo.',
    habits: [],
    hygiene: 'Cepillado 3 veces al día y seda dental',
    lastCleaning: '2026-09-10',
    history: ['Ortodoncia (2018–2020)'],
    emergency: 'Felipe Ruiz · esposo · 300 000 0152',
    documents: [['Consentimiento informado', '2026-10-02'], ['Autorización de fotografías', '2026-10-02']],
    notes: [
      { author: 'Laura · Recepción', date: '2026-10-02', text: 'Prefiere citas a media mañana.' },
      { author: 'Dra. Daniela Tejada', date: '2026-10-02', text: 'Evitar radiografías y posponer el blanqueamiento hasta después del parto. Citas cortas, en posición semisentada.' }
    ]
  }
};

function clinicalProfile(id) {
  return clinicalProfiles[id] ||= {
    allergies: [], medication: [], conditions: [],
    anesthesia: 'Sin reacciones conocidas',
    bloodPressure: '118/76 mmHg',
    reason: 'Valoración general.',
    expectation: 'Por definir en la primera consulta.',
    habits: [],
    hygiene: 'Cepillado 2 veces al día',
    lastCleaning: '2026-08-01',
    history: [],
    emergency: 'Sin registrar',
    documents: [['Consentimiento informado', '2026-09-01']],
    notes: []
  };
}
