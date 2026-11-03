/* Datos de ejemplo: planta de construcción modular en acero (valores ilustrativos) */
(function (root) {
  function T(id, name, station, skill, hh, cmin, cmax, wait, preds) {
    return { id, name, station, skill, hh, cmin, cmax, wait: wait || 0, preds: preds || [] };
  }
  const standard = [
    { id: 'T1', name: "Limpieza de caños", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: [], src: 'node-4' },
    { id: 'T2', name: "Traslado de caños", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T1"], src: 'node-mvqs77s091' },
    { id: 'T3', name: "Corte de caños de columnas y vigas conformadas", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T2"], src: 'node-5' },
    { id: 'T4', name: "Armado de pantallas", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T3"], src: 'node-6' },
    { id: 'T5', name: "Armado de escuadra de parrilla", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T3"], src: 'node-mvqsk4hj79' },
    { id: 'T6', name: "Armado de jaula principal: columnas, vigas y correas", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T4", "T5"], src: 'node-12' },
    { id: 'T7', name: "Punteado de correas de parrilla", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T6"], src: 'node-mvqsmz9o63' },
    { id: 'T8', name: "Armado de cáncamos de izaje", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T6"], src: 'node-mvs4ktrc70' },
    { id: 'T9', name: "Soldadura corrida de parrilla inferior", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T7", "T8"], src: 'node-9' },
    { id: 'T10', name: "Soldado de cáncamos de izaje", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T9"], src: 'node-mvqrko0b18' },
    { id: 'T11', name: "Corte y punteado de topes de placa", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T9"], src: 'node-mvqrta7i34' },
    { id: 'T12', name: "Soldadura corrida de topes de placa", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T10", "T11"], src: 'node-14' },
    { id: 'T13', name: "Desbaste de jaula completa", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T12"], src: 'node-mvs1gclx15' },
    { id: 'T14', name: "Perforado de topes de placa", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T13"], src: 'node-13' },
    { id: 'T15', name: "Limpieza de estructura y topes", station: 'E1', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T14"], src: 'node-15' },
    { id: 'T16', name: "Pintado completo de estructura y topes", station: 'E1', skill: 'Pintura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T15"], src: 'node-16' },
    { id: 'T17', name: "Sellado de topes de placa", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T16"], src: 'node-mvs23frq62' },
    { id: 'T18', name: "Colocación de paneles de muro", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T17"], src: 'node-18' },
    { id: 'T19', name: "Corte de paneles de muro", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T17"], src: 'node-mvs1wdvf93' },
    { id: 'T20', name: "Perforado de paneles de muro", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T18", "T19"], src: 'node-mvqt0akj21' },
    { id: 'T21', name: "Remachado de paneles de muro", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T18", "T19"], src: 'node-mvqt0woa52' },
    { id: 'T22', name: "Sellado perimetral exterior de paneles de muro", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T20", "T21"], src: 'node-mvs25xdv32' },
    { id: 'T23', name: "Sellado de estructura para paneles de techo", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T22"], src: 'node-mvqt2hhl54' },
    { id: 'T24', name: "Colocación de paneles de techo", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T23"], src: 'node-20' },
    { id: 'T25', name: "Atornillado de paneles de techo", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T23"], src: 'node-mvqt3xkx63' },
    { id: 'T26', name: "Pintado del lado interno de zinguerías", station: 'E2', skill: 'Pintura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T24", "T25"], src: 'node-21' },
    { id: 'T27', name: "Colocación de embellecedores de muro interiores", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T26"], src: 'node-22' },
    { id: 'T28', name: "Sellado perimetral de techo", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T27"], src: 'node-mvs2hi6345' },
    { id: 'T29', name: "Sellado interno (embellecedores, puerta y ventana)", station: 'E2', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T28"], src: 'node-mvs65mra85' },
    { id: 'T30', name: "Pintado completo de estructura", station: 'E2', skill: 'Pintura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T29"], src: 'node-27' },
    { id: 'T31', name: "Pintado y corte de fenólicos de piso", station: 'E3', skill: 'Pintura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T30"], src: 'node-29' },
    { id: 'T32', name: "Colocación y atornillado de placas OSB", station: 'E3', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T31"], src: 'node-mvqttt0p37' },
    { id: 'T33', name: "Pintado de placa con Kekol", station: 'E3', skill: 'Pintura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T32"], src: 'node-mvs2ramp85' },
    { id: 'T34', name: "Colocación de piso de PVC", station: 'E3', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T33"], src: 'node-31' },
    { id: 'T35', name: "Colocación de zócalos", station: 'E3', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T34"], src: 'node-mvqu98me83' },
    { id: 'T36', name: "Colocación de umbral de puerta", station: 'E3', skill: 'Panelería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T35"], src: 'node-mvqu9m6c62' },
    { id: 'T37', name: "Cortado de panel para puerta (según medida)", station: 'E4', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T36"], src: 'node-33' },
    { id: 'T38', name: "Corte, armado y pintado anticorrosivo de marco y premarco exterior", station: 'E4', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T36"], src: 'node-mvqtz0qx29' },
    { id: 'T39', name: "Armado de puerta y desbaste de marco", station: 'E4', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T37", "T38"], src: 'node-35' },
    { id: 'T40', name: "Colocación de premarco de puerta", station: 'E4', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T39"], src: 'node-36' },
    { id: 'T41', name: "Colocación de puerta", station: 'E4', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T40"], src: 'node-37' },
    { id: 'T42', name: "Perforado y remachado de premarco de puerta", station: 'E4', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T41"], src: 'node-mvs5ejhe37' },
    { id: 'T43', name: "Perforado y remachado de marco de puerta", station: 'E4', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T42"], src: 'node-mvs5f0yu96' },
    { id: 'T44', name: "Cortado y pintado anticorrosivo de soleras para puertas", station: 'E4', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T42"], src: 'node-mvs5htrv80' },
    { id: 'T45', name: "Cortado de panel para ventana (según medida)", station: 'E5', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T43", "T44"], src: 'node-39' },
    { id: 'T46', name: "Armado y pintado de premarco de ventana", station: 'E5', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T43", "T44"], src: 'node-mvqu60qb51' },
    { id: 'T47', name: "Colocación de premarco de ventana", station: 'E5', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T45", "T46"], src: 'node-40' },
    { id: 'T48', name: "Perforado y remachado de premarco de ventana", station: 'E5', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T47"], src: 'node-mvs3d3lv40' },
    { id: 'T49', name: "Colocación de carpintería de aluminio", station: 'E5', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T48"], src: 'node-mvquaksb61' },
    { id: 'T50', name: "Sellado completo de ventanas", station: 'E5', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T49"], src: 'node-mvv3wupq79' },
    { id: 'T51', name: "Colocación de cortinas roller blackout", station: 'E5', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T50"], src: 'node-43' },
    { id: 'T52', name: "Segunda mano de pintura anticorrosiva", station: 'E6', skill: 'Pintura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T51"], src: 'node-mvs5zm5s69' },
    { id: 'T53', name: "Secado de pintura anticorrosiva exterior", station: 'E6', skill: '', hh: null, cmin: 1, cmax: 2, wait: null, preds: ["T52"], src: 'node-mvs61hzv29' },
    { id: 'T54', name: "Instalación de muebles", station: 'E7', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T53"], src: 'node-mvs6aslh33' },
    { id: 'T55', name: "Tomas e interruptores según diseño", station: 'E8', skill: 'Electricidad', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T54"], src: 'node-45' },
    { id: 'T56', name: "Caños colocados firmemente", station: 'E8', skill: 'Electricidad', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T55"], src: 'node-46' },
    { id: 'T57', name: "Armado y pintado de jaula exterior para condensadora de aire acondicionado", station: 'E8', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T55"], src: 'node-mvs5onz829' },
    { id: 'T58', name: "Anclaje de jaula exterior para condensadora de aire acondicionado", station: 'E8', skill: 'Soldadura', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T56", "T57"], src: 'node-mvs5r0sq67' },
    { id: 'T59', name: "Tablero con llaves térmicas y disyuntor, etiquetado", station: 'E8', skill: 'Electricidad', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T56", "T57"], src: 'node-mvtim4rr76' },
    { id: 'T60', name: "Luz de emergencia y cartel de salida", station: 'E8', skill: 'Electricidad', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T58", "T59"], src: 'node-48' },
    { id: 'T61', name: "Canalización", station: 'E8', skill: 'Electricidad', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T60"], src: 'node-49' },
    { id: 'T62', name: "Colocación de carpintería de aluminio", station: 'E9', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T61"], src: 'node-mvqn64g334' },
    { id: 'T63', name: "Sellado completo de ventanas", station: 'E9', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T62"], src: 'node-mvqn7wxk10' },
    { id: 'T64', name: "Colocación de zócalos y umbral de puerta", station: 'E9', skill: 'Terminaciones', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T63"], src: 'node-mvza5kgt55' },
    { id: 'T65', name: "Colocación de soleras de puerta y ventanas", station: 'E9', skill: 'Carpintería', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T64"], src: 'node-mvza7f0k82' },
    { id: 'T66', name: "Remover plásticos protectores de paneles", station: 'E9', skill: 'Terminaciones', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T65"], src: 'node-mvqtdqor2' },
    { id: 'T67', name: "Limpieza final y control de calidad", station: 'E10', skill: 'Calidad', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T66"], src: 'node-59' },
    { id: 'T68', name: "Pruebas de funcionamiento realizadas", station: 'E10', skill: 'Calidad', hh: null, cmin: 1, cmax: 2, wait: 0, preds: ["T67"], src: 'node-60' }
  ];
  const sanitary = [
    T('T1', 'Limpieza, trazado y corte de caños y topes', 'E1', 'Soldadura', 6, 1, 2, 0, []),
    T('T2', 'Parrilla inferior reforzada para bateas', 'E1', 'Soldadura', 12, 2, 3, 0, ['T1']),
    T('T3', 'Armado de pantallas, izaje y soldadura de jaula', 'E1', 'Soldadura', 14, 2, 3, 0, ['T2']),
    T('T4', 'Pintura primer mano de estructura', 'E1', 'Pintura', 4, 1, 2, 6, ['T3']),
    T('T5', 'Paneles de muro y techo con zinguería', 'E2', 'Panelería', 26, 2, 4, 0, ['T4']),
    T('T6', 'Fenólico, membrana y piso vinílico sanitario', 'E3', 'Terminaciones', 10, 1, 2, 4, ['T5']),
    T('T7', 'Vanos, puerta de acceso y ventilaciones', 'E4', 'Carpintería', 8, 1, 2, 2, ['T5']),
    T('T8', 'Cañerías de agua fría, caliente y desagüe', 'E11', 'Sanitaria', 14, 1, 2, 0, ['T5']),
    T('T9', 'Instalación eléctrica y termotanque', 'E8', 'Electricidad', 10, 1, 2, 0, ['T5']),
    T('T10', 'Cubículos sanitarios, mesada y piedra', 'E11', 'Sanitaria', 16, 2, 3, 0, ['T6', 'T8']),
    T('T11', 'Artefactos, griferías, cerraduras de boxes y topes', 'E11', 'Sanitaria', 10, 1, 2, 0, ['T10']),
    T('T12', 'Sellado sanitario y terminaciones', 'E9', 'Terminaciones', 6, 1, 2, 0, ['T7', 'T9', 'T11']),
    T('T13', 'Prueba hidráulica de estanqueidad', 'E10', 'Calidad', 3, 1, 1, 4, ['T12']),
    T('T14', 'Ensayo eléctrico, limpieza y embalaje', 'E10', 'Calidad', 4, 1, 2, 0, ['T13'])
  ];
  const guard = [
    T('T1', 'Corte y armado de estructura compacta', 'E1', 'Soldadura', 8, 1, 2, 0, []),
    T('T2', 'Pintura primer mano', 'E1', 'Pintura', 2, 1, 1, 6, ['T1']),
    T('T3', 'Paneles de muro y techo', 'E2', 'Panelería', 10, 2, 3, 0, ['T2']),
    T('T4', 'Piso fenólico y vinílico', 'E3', 'Terminaciones', 4, 1, 2, 4, ['T3']),
    T('T5', 'Puerta, ventanales y rejas', 'E4', 'Carpintería', 6, 1, 2, 0, ['T3']),
    T('T6', 'Instalación eléctrica y reflector exterior', 'E8', 'Electricidad', 6, 1, 1, 0, ['T3']),
    T('T7', 'Terminaciones y sellado', 'E9', 'Terminaciones', 4, 1, 2, 0, ['T4', 'T5', 'T6']),
    T('T8', 'Ensayos y embalaje', 'E10', 'Calidad', 2, 1, 1, 0, ['T7'])
  ];

  const sample = {
    version: 2,
    planName: 'Programa de planta · noviembre–diciembre',
    calendar: {
      start: '2026-11-09',
      hours: [0, 9, 9, 9, 9, 9, 0],
      holidays: ['2026-11-23', '2026-12-07', '2026-12-08', '2026-12-25']
    },
    skills: ['Soldadura', 'Pintura', 'Panelería', 'Carpintería', 'Electricidad', 'Sanitaria', 'Terminaciones', 'Calidad'],
    stations: [
      { id: 'E1', name: 'Estructura metálica', cap: 2 },
      { id: 'E2', name: 'Paneles y cerramientos', cap: 2 },
      { id: 'E3', name: 'Piso', cap: 2 },
      { id: 'E4', name: 'Aberturas: puertas', cap: 2 },
      { id: 'E5', name: 'Aberturas: ventanas', cap: 2 },
      { id: 'E6', name: 'Terminaciones antes de subcontratistas', cap: 2 },
      { id: 'E7', name: 'Instalación de carpintería', cap: 2 },
      { id: 'E8', name: 'Electricidad', cap: 2 },
      { id: 'E9', name: 'Terminaciones', cap: 2 },
      { id: 'E10', name: 'Control final y limpieza', cap: 2 },
      { id: 'E11', name: 'Instalación sanitaria', cap: 2 }
    ],
    workers: [
      { id: 'W1', name: 'Julián Sosa', skills: ['Soldadura'], pct: 100, active: true },
      { id: 'W2', name: 'Matías Ríos', skills: ['Soldadura', 'Panelería'], pct: 100, active: true },
      { id: 'W3', name: 'Diego Ferreyra', skills: ['Soldadura'], pct: 100, active: true },
      { id: 'W4', name: 'Pablo Quiroga', skills: ['Soldadura', 'Carpintería'], pct: 100, active: true },
      { id: 'W5', name: 'Ramiro Ortiz', skills: ['Panelería'], pct: 100, active: true },
      { id: 'W6', name: 'Lucas Gómez', skills: ['Panelería', 'Terminaciones', 'Pintura'], pct: 100, active: true },
      { id: 'W7', name: 'Nahuel Vega', skills: ['Panelería'], pct: 100, active: true },
      { id: 'W8', name: 'Franco Díaz', skills: ['Carpintería', 'Terminaciones'], pct: 100, active: true },
      { id: 'W9', name: 'Sergio Molina', skills: ['Electricidad'], pct: 100, active: true },
      { id: 'W10', name: 'Tomás Aguilar', skills: ['Electricidad'], pct: 100, active: true },
      { id: 'W11', name: 'Hernán Pereyra', skills: ['Sanitaria', 'Terminaciones'], pct: 100, active: true },
      { id: 'W12', name: 'Emiliano Paz', skills: ['Terminaciones', 'Sanitaria', 'Pintura'], pct: 100, active: true },
      { id: 'W13', name: 'Gabriel Luna', skills: ['Calidad', 'Electricidad'], pct: 50, active: true }
    ],
    models: [
      { id: 'M1', name: 'Planta libre (secuencia Vicuña 3PL)', tasks: standard },
      { id: 'M2', name: 'Módulo sanitario con boxes', tasks: sanitary },
      { id: 'M3', name: 'Garita de seguridad', tasks: guard }
    ],
    projects: [
      { id: 'P1', name: 'Campamento minero, fase 1', client: 'Cliente A', model: 'M1', qty: 4, release: '2026-11-09', due: '2026-12-04', prio: 1 },
      { id: 'P2', name: 'Núcleo sanitario de campamento', client: 'Cliente A', model: 'M2', qty: 2, release: '2026-11-09', due: '2026-12-11', prio: 1 },
      { id: 'P3', name: 'Oficinas de obra Ruta 40', client: 'Cliente B', model: 'M1', qty: 2, release: '2026-11-16', due: '2026-12-11', prio: 2 },
      { id: 'P4', name: 'Garitas de acceso parque industrial', client: 'Cliente C', model: 'M3', qty: 3, release: '2026-11-23', due: '2026-12-14', prio: 3 },
      { id: 'P5', name: 'Aula modular escuela rural', client: 'Cliente D', model: 'M1', qty: 1, release: '2026-11-30', due: '2026-12-18', prio: 2 }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = sample;
  else root.PLAN_SAMPLE = sample;
})(this);
