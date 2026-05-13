/* ═══════════════════════════════════════════════
   ParkOffice — Lógica principal
   ═══════════════════════════════════════════════ */

/* ── CONFIGURACIÓN ────────────────────────────── */
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBLGuzvcLTNUOSU_9NrFHTgBuUbRBpeS1o",
    authDomain: "parkin-c6e71.firebaseapp.com",
    databaseURL: "https://parkin-c6e71-default-rtdb.firebaseio.com",
    projectId: "parkin-c6e71",
    storageBucket: "parkin-c6e71.firebasestorage.app",
    messagingSenderId: "674692362260",
    appId: "1:674692362260:web:1c97771b866a2862003701"
};

const EMAILJS_CONFIG = {
    publicKey: "Pdc2NDCbT43gFArza",
    serviceId: "service_vgiu9xq",
    templateId: "template_evh4qny"
};

/* ── CONSTANTES ───────────────────────────────── */
const LIMITE = { carro: 2, moto: 4 };
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const DIAS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const STRUCTURE = [{
        id: 'car',
        title: 'Parqueadero de carros',
        dotClass: 'car',
        tipo: 'carro',
        spots: [{ id: 'c1', label: 'Puesto C1', tipo: 'carro' }]
    },
    {
        id: 'mA',
        title: 'Motos — Zona A',
        dotClass: 'moto',
        tipo: 'moto',
        spots: [
            { id: 'mA1', label: 'Puesto A1', tipo: 'moto' },
            { id: 'mA2', label: 'Puesto A2', tipo: 'moto' }
        ]
    },
    {
        id: 'mB',
        title: 'Motos — Zona B',
        dotClass: 'moto',
        tipo: 'moto',
        spots: [
            { id: 'mB1', label: 'Puesto B1', tipo: 'moto' },
            { id: 'mB2', label: 'Puesto B2', tipo: 'moto' }
        ]
    }
];

const ICONS = {
    carro: `<svg viewBox="0 0 24 24"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-3h12l2 3h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>`,
    moto: `<svg viewBox="0 0 24 24"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h2l2 5M15 6l-3 5H8.5L7 8h5"/><path d="M2 12h3.5"/></svg>`
};

/* ── ESTADO GLOBAL ────────────────────────────── */
let db = null;
let selSpot = null; // { id, label, tipo }
let selDiasIdx = []; // días seleccionados en el modal
let selLiberarKey = null; // { spotId, diaIdx }
let selAvisoId = null;

let miEmail = localStorage.getItem('po_email') || null;
let miNombre = localStorage.getItem('po_nombre') || null;

const IS_CONFIGURED = FIREBASE_CONFIG.apiKey !== 'TU_API_KEY';

/* ════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
    renderFecha();
    registrarSW();
    escucharConexion();

    if (!IS_CONFIGURED) {
        document.getElementById('cfg-banner').classList.add('visible');
        renderUI({}, {});
        return;
    }

    firebase.initializeApp(FIREBASE_CONFIG);
    emailjs.init(EMAILJS_CONFIG.publicKey);
    db = firebase.database();

    checkResetSemanal();
    escucharCambios();
});

function renderFecha() {
    document.getElementById('date-pill').textContent =
        new Date().toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}

/* ════════════════════════════════════════════════
   SERVICE WORKER — PWA
   ════════════════════════════════════════════════ */
function registrarSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW error:', e));
    }
}

/* ════════════════════════════════════════════════
   CONEXIÓN — banner offline
   ════════════════════════════════════════════════ */
function escucharConexion() {
    const banner = document.getElementById('offline-banner');
    window.addEventListener('online', () => banner.classList.remove('visible'));
    window.addEventListener('offline', () => banner.classList.add('visible'));
    if (!navigator.onLine) banner.classList.add('visible');
}

/* ════════════════════════════════════════════════
   RESET SEMANAL — sábado a medianoche
   ════════════════════════════════════════════════ */
async function checkResetSemanal() {
    const ref = db.ref('meta/lastReset');
    const snap = await ref.once('value');
    const lastReset = snap.val() || 0;

    const now = new Date();
    const dia = now.getDay(); // 0=Dom, 6=Sab
    const diasDesdeSab = (dia + 1) % 7;
    const sabPasado = new Date(now);
    sabPasado.setDate(now.getDate() - diasDesdeSab);
    sabPasado.setHours(0, 0, 0, 0);

    if (lastReset < sabPasado.getTime()) {
        await Promise.all([
            db.ref('parkoffice').remove(),
            db.ref('historial').remove(),
            db.ref('avisos').remove(),
            ref.set(Date.now())
        ]);
        showToast('Semana nueva — parqueaderos liberados 🎉');
    }
}

/* ════════════════════════════════════════════════
   FIREBASE — escucha tiempo real
   ════════════════════════════════════════════════ */
function escucharCambios() {
    db.ref('parkoffice').on('value', snapSpots => {
        db.ref('historial').once('value', snapHist => {
            const data = snapSpots.val() || {};
            renderUI(data, snapHist.val() || {});
            if (miEmail) renderQuota(data);
        });
    }, err => {
        console.error('Firebase error:', err);
        showToast('Error de conexión con la base de datos', true);
    });
}

/* ════════════════════════════════════════════════
   RENDER PRINCIPAL
   ════════════════════════════════════════════════ */
function renderUI(data, historial) {
    const container = document.getElementById('main-content');
    container.innerHTML = '';

    const hoy = getDiaHoy();
    let libresHoy = 0,
        ocupHoy = 0,
        total = 0;

    STRUCTURE.forEach((section, si) => {
                if (si > 0) {
                    const hr = document.createElement('hr');
                    hr.className = 'divider';
                    container.appendChild(hr);
                }

                const sec = document.createElement('div');
                sec.className = 'section';
                const libresZona = section.spots.filter(s => !data[`${s.id}_${hoy}`] ? .ocupado).length;

                sec.innerHTML = `
      <div class="section-hdr">
        <div class="section-dot ${section.dotClass}"></div>
        <span class="section-title">${section.title}</span>
        <span class="section-count">${libresZona}/${section.spots.length} hoy</span>
      </div>
    `;
                container.appendChild(sec);

                section.spots.forEach(s => {
                            const card = document.createElement('div');
                            card.className = 'spot-card';

                            const diasLibres = DIAS.filter((_, i) => !data[`${s.id}_${i}`] ? .ocupado).length;

                            card.innerHTML = `
        <div class="spot-header">
          <div class="spot-icon-wrap ${s.tipo}">
            <i class="ti ${s.tipo === 'carro' ? 'ti-car' : 'ti-motorbike'}" aria-hidden="true"></i>
          </div>
          <div>
            <div class="spot-label">${s.label}</div>
            <div class="spot-sub">${diasLibres} día${diasLibres !== 1 ? 's' : ''} libre${diasLibres !== 1 ? 's' : ''} esta semana</div>
          </div>
        </div>
        <div class="week-grid" id="wg-${s.id}"></div>
      `;
                            sec.appendChild(card);

                            const grid = card.querySelector(`#wg-${s.id}`);
                            DIAS.forEach((dNombre, i) => {
                                        const key = `${s.id}_${i}`;
                                        const res = data[key];
                                        const esMio = res ? .email === miEmail && res ? .ocupado;
                                        const cls = esMio ? 'mio' : res ? .ocupado ? 'ocupado' : 'libre';
                                        const esHoy = i === hoy;

                                        const cell = document.createElement('div');
                                        cell.className = `day-cell ${cls}${esHoy ? ' hoy' : ''}`;
                                        cell.id = `cell-${key}`;
                                        cell.innerHTML = `
          <div class="day-name">${dNombre}</div>
          <div class="day-num">${esHoy ? 'hoy' : i + 1}</div>
          <div class="day-badge ${cls}">${esMio ? 'Tuyo' : res?.ocupado ? 'Ocup.' : 'Libre'}</div>
          ${res?.ocupado ? `<div class="day-who">${res.nombre || ''}</div>` : ''}
          ${esMio ? `<button class="day-liberar" onclick="pedirLiberar('${s.id}','${i}','${s.label}','${dNombre}',event)">Liberar</button>` : ''}
          ${res?.ocupado && !esMio ? `<button class="day-liberar" style="color:var(--amber)" onclick="abrirAvisoModal('${key}','${s.label} — ${dNombre}',event)">Avisarme</button>` : ''}
        `;
        if (!res?.ocupado && i >= hoy) cell.onclick = () => abrirModal(s, i);
        grid.appendChild(cell);

        total++;
        res?.ocupado ? ocupHoy++ : libresHoy++;
      });

      // Contar solo del día de hoy para las stats
      total = 0; libresHoy = 0; ocupHoy = 0;
      STRUCTURE.forEach(sec2 => sec2.spots.forEach(sp => {
        total++;
        data[`${sp.id}_${hoy}`]?.ocupado ? ocupHoy++ : libresHoy++;
      }));
    });
  });

  document.getElementById('s-libre').textContent = libresHoy;
  document.getElementById('s-ocup').textContent  = ocupHoy;
  document.getElementById('s-total').textContent = total;

  renderHistorial(historial);
}

/* ════════════════════════════════════════════════
   QUOTA
   ════════════════════════════════════════════════ */
function renderQuota(data) {
  let carros = 0, motos = 0;
  STRUCTURE.forEach(sec => sec.spots.forEach(s => {
    DIAS.forEach((_, i) => {
      const res = data[`${s.id}_${i}`];
      if (res?.email === miEmail && res?.ocupado) {
        s.tipo === 'carro' ? carros++ : motos++;
      }
    });
  }));

  const pC = document.getElementById('pips-car');
  const pM = document.getElementById('pips-moto');
  pC.innerHTML = ''; pM.innerHTML = '';

  for (let i = 0; i < LIMITE.carro; i++) {
    const p = document.createElement('div');
    p.className = 'pip ' + (i < carros ? 'used' : 'free');
    pC.appendChild(p);
  }
  for (let i = 0; i < LIMITE.moto; i++) {
    const p = document.createElement('div');
    p.className = 'pip ' + (i < motos ? 'used' : 'free');
    pM.appendChild(p);
  }

  document.getElementById('quota-bar').style.display = 'grid';
}

/* ════════════════════════════════════════════════
   HISTORIAL
   ════════════════════════════════════════════════ */
function renderHistorial(historial) {
  const lista = document.getElementById('historial-list');
  const items = Object.values(historial).sort((a, b) => b.ts - a.ts).slice(0, 20);

  if (!items.length) {
    lista.innerHTML = '<div class="historial-empty">Sin reservas esta semana</div>';
    return;
  }

  lista.innerHTML = items.map(h => `
    <div class="historial-item">
      <div class="hist-dot ${h.tipo}"></div>
      <span class="hist-name">${h.nombre}</span>
      <span class="hist-meta">${h.spot}</span>
      <span class="hist-day">${h.dia}</span>
    </div>
  `).join('');
}

/* ════════════════════════════════════════════════
   MODAL RESERVA — selección de días
   ════════════════════════════════════════════════ */
function abrirModal(spot, diaPreseleccionado) {
  selSpot    = spot;
 selDiasIdx = diaPreseleccionado >= getDiaHoy() ? [diaPreseleccionado] : [];

  document.getElementById('modal-icon').innerHTML    = ICONS[spot.tipo];
  document.getElementById('modal-title-el').textContent = `Reservar ${spot.label}`;
  document.getElementById('modal-sub').textContent   = 'Elige los días y confirma';
  document.getElementById('inp-name').value  = miNombre || '';
  document.getElementById('inp-email').value = miEmail  || '';

  renderChipsDias();
  // Al inicio de renderChipsDias, limpiar días pasados de la selección
selDiasIdx = selDiasIdx.filter(i => i >= getDiaHoy());
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => {
    const inp = miNombre ? document.getElementById('inp-email') : document.getElementById('inp-name');
    inp.focus();
  }, 80);
}

function renderChipsDias() {
  const container = document.getElementById('modal-dias');
  container.innerHTML = '';
  if (!selSpot) return;

  // Obtener estado actual desde Firebase
  db.ref('parkoffice').once('value', snap => {
    const data = snap.val() || {};
    DIAS.forEach((d, i) => {
      const key    = `${selSpot.id}_${i}`;
      const res    = data[key];
      const esMio  = res?.email === miEmail && res?.ocupado;
      const pasado = i < getDiaHoy();
      const bloqueado = (res?.ocupado && !esMio) || pasado;

      const chip = document.createElement('div');
      chip.className = 'dia-chip' +
        (selDiasIdx.includes(i) ? ' sel' : '') +
        (bloqueado ? ' ocup' : '');
      chip.textContent = pasado ? `${d} ✗` : d;
      chip.title = pasado ? 'Día ya pasado' : '';

      if (!bloqueado) {
        chip.onclick = () => {
          if (esMio) return;
          if (selDiasIdx.includes(i)) {
            selDiasIdx = selDiasIdx.filter(x => x !== i);
          } else {
            selDiasIdx.push(i);
          }
          renderChipsDias();
        };
      }
      container.appendChild(chip);
    });
  });
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  selSpot    = null;
  selDiasIdx = [];
}

/* ════════════════════════════════════════════════
   CONFIRMAR RESERVA
   ════════════════════════════════════════════════ */
async function confirmarReserva() {
  const nombre = document.getElementById('inp-name').value.trim();
  const email  = document.getElementById('inp-email').value.trim();
  if (!nombre || !email) { sacudirModal('modal'); return; }
  if (!selDiasIdx.length) { showToast('Elige al menos un día', true); return; }

  // Verificar límite
  const snap = await db.ref('parkoffice').once('value');
  const data  = snap.val() || {};
  let carros  = 0, motos = 0;

  STRUCTURE.forEach(sec => sec.spots.forEach(s => {
    DIAS.forEach((_, i) => {
      const res = data[`${s.id}_${i}`];
      if (res?.email === email && res?.ocupado) {
        s.tipo === 'carro' ? carros++ : motos++;
      }
    });
  }));

  const nuevasCarro = selSpot.tipo === 'carro' ? selDiasIdx.length : 0;
  const nuevasMoto  = selSpot.tipo === 'moto'  ? selDiasIdx.length : 0;

  if (carros + nuevasCarro > LIMITE.carro) {
    showToast(`Límite: máximo ${LIMITE.carro} días de carro por semana`, true);
    closeModal(); return;
  }
  if (motos + nuevasMoto > LIMITE.moto) {
    showToast(`Límite: máximo ${LIMITE.moto} días de moto por semana`, true);
    closeModal(); return;
  }

  const btn = document.getElementById('btn-confirm');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    const ahora = new Date();
    const hora  = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const fecha = ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

    const updates = {};
    selDiasIdx.forEach(i => {
      updates[`parkoffice/${selSpot.id}_${i}`] = {
        ocupado: true, nombre, email,
        tipo: selSpot.tipo, hora, fecha, ts: Date.now()
      };
      updates[`historial/${Date.now()}_${i}`] = {
        nombre, email, spot: selSpot.label,
        tipo: selSpot.tipo, dia: DIAS[i], hora, fecha, ts: Date.now()
      };
    });

    await db.ref().update(updates);

    miNombre = nombre; miEmail = email;
    localStorage.setItem('po_nombre', nombre);
    localStorage.setItem('po_email',  email);

    const diasStr = selDiasIdx.map(i => DIAS[i]).join(', ');
    await enviarCorreo(nombre, email, selSpot.label, fecha, hora, diasStr);

    closeModal();

    // Animación en los días reservados
    selDiasIdx.forEach(i => {
      setTimeout(() => {
        const cell = document.getElementById(`cell-${selSpot.id}_${i}`);
        if (cell) { cell.classList.add('pop-anim'); setTimeout(() => cell.classList.remove('pop-anim'), 400); }
      }, 100);
    });

    showToast(`Reservado para ${diasStr} 🎉`);

  } catch (e) {
    console.error(e);
    showToast('Error al guardar. Intenta de nuevo.', true);
  }

  btn.disabled = false; btn.textContent = 'Reservar';
}

/* ════════════════════════════════════════════════
   LIBERAR — pide confirmación primero
   ════════════════════════════════════════════════ */
function pedirLiberar(spotId, diaIdx, spotLabel, diaNombre, e) {
  e.stopPropagation();
  selLiberarKey = { spotId, diaIdx };
  document.getElementById('liberar-sub').textContent =
    `¿Liberar ${spotLabel} del ${diaNombre}? Esta acción no se puede deshacer.`;
  document.getElementById('modal-liberar-overlay').classList.add('open');
}

function closeLiberarModal() {
  document.getElementById('modal-liberar-overlay').classList.remove('open');
  selLiberarKey = null;
}

async function confirmarLiberar() {
  if (!selLiberarKey) return;
  const { spotId, diaIdx } = selLiberarKey;
  closeLiberarModal();

  try {
    await db.ref(`parkoffice/${spotId}_${diaIdx}`).remove();
    showToast('Puesto liberado');
  } catch (e) {
    showToast('Error al liberar', true);
  }
}

/* ════════════════════════════════════════════════
   MODAL AVISO
   ════════════════════════════════════════════════ */
function abrirAvisoModal(key, label, e) {
  e.stopPropagation();
  selAvisoId = key;
  document.getElementById('aviso-sub').textContent = `Te avisamos cuando se libere ${label}`;
  document.getElementById('aviso-name').value  = miNombre || '';
  document.getElementById('aviso-email').value = miEmail  || '';
  document.getElementById('modal-aviso-overlay').classList.add('open');
  setTimeout(() => document.getElementById('aviso-name').focus(), 80);
}

function closeAvisoModal() {
  document.getElementById('modal-aviso-overlay').classList.remove('open');
  selAvisoId = null;
}

async function confirmarAviso() {
  const nombre = document.getElementById('aviso-name').value.trim();
  const email  = document.getElementById('aviso-email').value.trim();
  if (!nombre || !email) { sacudirModal('modal-aviso'); return; }

  const btn = document.getElementById('btn-aviso');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    await db.ref(`avisos/${selAvisoId.replace(/\//g,'_')}/${email.replace(/\./g,'_')}`).set({
      nombre, email, ts: Date.now()
    });
    miNombre = nombre; miEmail = email;
    localStorage.setItem('po_nombre', nombre);
    localStorage.setItem('po_email',  email);
    closeAvisoModal();
    showToast('Te avisamos cuando se libere 🔔', false, 'amber');
  } catch (e) {
    showToast('Error. Intenta de nuevo.', true);
  }

  btn.disabled = false; btn.textContent = 'Avisarme';
}

/* ════════════════════════════════════════════════
   NOTIFICAR AVISOS cuando alguien libera
   ════════════════════════════════════════════════ */
async function notificarAvisos(key, label) {
  const snap   = await db.ref(`avisos/${key.replace(/\//g,'_')}`).once('value');
  const avisos = snap.val();
  if (!avisos) return;

  const fecha = new Date().toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' });
  const hora  = new Date().toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });

  await Promise.all(Object.values(avisos).map(a =>
    emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
      to_name: a.nombre, to_email: a.email,
      spot_label: `${label} (¡ya está libre!)`,
      fecha, hora, dias: '—'
    }).catch(err => console.warn('Aviso email error:', err))
  ));

  await db.ref(`avisos/${key.replace(/\//g,'_')}`).remove();
}

/* ════════════════════════════════════════════════
   EMAILJS
   ════════════════════════════════════════════════ */
async function enviarCorreo(nombre, email, label, fecha, hora, dias) {
  if (!IS_CONFIGURED) return;
  try {
    await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
      to_name: nombre, to_email: email,
      spot_label: label, fecha, hora,
      dias: dias || fecha
    });
  } catch (e) { console.warn('EmailJS error:', e); }
}

/* ════════════════════════════════════════════════
   COMPARTIR LINK
   ════════════════════════════════════════════════ */
async function compartirLink() {
  const url = 'https://parkoffice.netlify.app';
  if (navigator.share) {
    await navigator.share({ title: 'ParkOffice', text: 'Reserva tu parqueadero', url });
  } else {
    await navigator.clipboard.writeText(url);
    showToast('Link copiado al portapapeles 📋', false, 'amber');
  }
}

/* ════════════════════════════════════════════════
   UTILIDADES
   ════════════════════════════════════════════════ */
function getDiaHoy() {
  const d = new Date().getDay();
  if (d === 0 || d === 6) return 4; // fin de semana → mostrar viernes
  return d - 1; // 1=Lun=0 ... 5=Vie=4
}

function showToast(msg, esError = false, tipo = '') {
  const t   = document.getElementById('toast');
  const dot = document.getElementById('toast-dot');
  document.getElementById('toast-msg').textContent = msg;
  dot.className = 'toast-dot' + (esError ? ' red' : tipo ? ` ${tipo}` : '');
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

function sacudirModal(id) {
  const m = document.getElementById(id);
  m.style.animation = 'none'; void m.offsetWidth;
  m.style.animation = 'shake 0.3s ease';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal(); closeLiberarModal(); closeAvisoModal();
  }
  if (e.key === 'Enter') {
    if (document.getElementById('modal-overlay').classList.contains('open'))         confirmarReserva();
    if (document.getElementById('modal-liberar-overlay').classList.contains('open')) confirmarLiberar();
    if (document.getElementById('modal-aviso-overlay').classList.contains('open'))   confirmarAviso();
  }
});