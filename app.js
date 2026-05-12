/* ═══════════════════════════════════════════════
   ParkOffice v2 — Lógica principal
   ═══════════════════════════════════════════════ */

/* ── CONFIGURACIÓN ──────────────────────────────
   👉 Cambia estos valores con los tuyos          */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBLGuzvcLTNUOSU_9NrFHTgBuUbRBpeS1o",
  authDomain:        "parkin-c6e71.firebaseapp.com",
  databaseURL:       "https://parkin-c6e71-default-rtdb.firebaseio.com",
  projectId:         "parkin-c6e71",
  storageBucket:     "parkin-c6e71.firebasestorage.app",
  messagingSenderId: "674692362260",
  appId:             "1:674692362260:web:1c97771b866a2862003701"
};

const EMAILJS_CONFIG = {
  publicKey:  "Pdc2NDCbT43gFArza",
  serviceId:  "service_vgiu9xq",
  templateId: "template_evh4qny"
};

/* ── LÍMITES SEMANALES ──────────────────────── */
const LIMITE = { carro: 2, moto: 4 };

/* ── ESTRUCTURA DE PARQUEADEROS ─────────────── */
const STRUCTURE = [
  {
    id: "car", title: "Parqueadero de carros",
    dotClass: "car", gridClass: "grid-1",
    spots: [{ id: "c1", label: "Puesto C1", tipo: "carro" }]
  },
  {
    id: "mA", title: "Motos — Zona A",
    dotClass: "moto", gridClass: "grid-2",
    spots: [
      { id: "mA1", label: "Puesto A1", tipo: "moto" },
      { id: "mA2", label: "Puesto A2", tipo: "moto" }
    ]
  },
  {
    id: "mB", title: "Motos — Zona B",
    dotClass: "moto", gridClass: "grid-2",
    spots: [
      { id: "mB1", label: "Puesto B1", tipo: "moto" },
      { id: "mB2", label: "Puesto B2", tipo: "moto" }
    ]
  }
];

const ICONS = {
  carro: `<svg viewBox="0 0 24 24"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-3h12l2 3h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>`,
  moto:  `<svg viewBox="0 0 24 24"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h2l2 5M15 6l-3 5H8.5L7 8h5"/><path d="M2 12h3.5"/></svg>`
};

/* ── ESTADO ─────────────────────────────────── */
let db           = null;
let selSpotId    = null;
let selSpotLabel = null;
let selSpotTipo  = null;
let selAvisoId   = null;
let miEmail      = localStorage.getItem('po_email') || null;
let miNombre     = localStorage.getItem('po_nombre') || null;

const IS_CONFIGURED = FIREBASE_CONFIG.apiKey !== "TU_API_KEY";

/* ════════════════════════════════════════════════
   INICIALIZACIÓN
   ════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  renderFecha();

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
  const now = new Date();
  document.getElementById('date-pill').textContent =
    now.toLocaleDateString('es-CO', { weekday:'short', day:'numeric', month:'short' }).toUpperCase();
}

/* ════════════════════════════════════════════════
   RESET SEMANAL — se ejecuta sábado a medianoche
   ════════════════════════════════════════════════ */
function getSabadoMedianoche() {
  const now = new Date();
  const dia = now.getDay(); // 0=Dom, 6=Sab
  const diasHastaSab = (6 - dia + 7) % 7 || 7;
  const sab = new Date(now);
  sab.setDate(now.getDate() + diasHastaSab);
  sab.setHours(0, 0, 0, 0);
  return sab.getTime();
}

async function checkResetSemanal() {
  const ref = db.ref('meta/lastReset');
  const snap = await ref.once('value');
  const lastReset = snap.val() || 0;
  const ahora = Date.now();

  // Calcular el sábado pasado más reciente
  const now = new Date();
  const dia = now.getDay();
  const diasDesdeSab = (dia + 1) % 7; // días desde el último sábado
  const sabPasado = new Date(now);
  sabPasado.setDate(now.getDate() - diasDesdeSab);
  sabPasado.setHours(0, 0, 0, 0);

  if (lastReset < sabPasado.getTime()) {
    // Ya pasó el sábado y no se ha hecho reset → limpiar todo
    await db.ref('parkoffice').remove();
    await db.ref('historial').remove();
    await db.ref('avisos').remove();
    await ref.set(ahora);
    showToast('Semana nueva — parqueaderos liberados 🎉', false);
  }
}

/* ════════════════════════════════════════════════
   FIREBASE — escucha en tiempo real
   ════════════════════════════════════════════════ */
function escucharCambios() {
  db.ref('parkoffice').on('value', snapSpots => {
    db.ref('historial').once('value', snapHist => {
      renderUI(snapSpots.val() || {}, snapHist.val() || {});
      if (miEmail) actualizarQuota(snapSpots.val() || {});
    });
  });
}

/* ════════════════════════════════════════════════
   RENDER PRINCIPAL
   ════════════════════════════════════════════════ */
function renderUI(data, historial) {
  const container = document.getElementById('main-content');
  container.innerHTML = '';
  let libres = 0, ocupados = 0, total = 0;

  STRUCTURE.forEach((section, si) => {
    if (si > 0) {
      const hr = document.createElement('hr');
      hr.className = 'divider';
      container.appendChild(hr);
    }

    const sec = document.createElement('div');
    sec.className = 'section';
    const libresZona = section.spots.filter(s => !data[s.id]?.ocupado).length;

    sec.innerHTML = `
      <div class="section-hdr">
        <div class="section-dot ${section.dotClass}"></div>
        <span class="section-title">${section.title}</span>
        <span class="section-count">${libresZona}/${section.spots.length}</span>
      </div>
      <div class="${section.gridClass}" id="grid-${section.id}"></div>
    `;
    container.appendChild(sec);

    const grid = sec.querySelector(`#grid-${section.id}`);
    section.spots.forEach(s => {
      const st    = data[s.id] || {};
      const esMio = st.ocupado && st.email === miEmail;
      const cls   = esMio ? 'mio' : st.ocupado ? 'ocupado' : 'libre';
      const badgeTxt = esMio ? 'Tuyo' : st.ocupado ? 'Ocupado' : 'Libre';
      const subTxt   = esMio
        ? 'Reservado por ti'
        : st.ocupado ? (st.nombre || 'Ocupado')
        : 'Toca para reservar';

      const el = document.createElement('div');
      el.className = `spot ${cls}`;
      el.id = `spot-${s.id}`;
      el.innerHTML = `
        <div class="spot-icon">${ICONS[s.tipo]}</div>
        <div class="spot-info">
          <div class="spot-name">${s.label}</div>
          <div class="spot-sub">${subTxt}</div>
        </div>
        <div class="spot-right">
          <span class="badge badge-${cls}">${badgeTxt}</span>
          ${esMio
            ? `<button class="liberar-btn" onclick="liberarPuesto('${s.id}',event)">Liberar</button>`
            : st.ocupado
              ? `<button class="aviso-btn" onclick="abrirAvisoModal('${s.id}','${s.label}',event)">Avisarme</button>`
              : ''
          }
        </div>
      `;
      if (!st.ocupado) el.onclick = () => abrirModal(s.id, s.label, s.tipo);
      grid.appendChild(el);

      total++;
      st.ocupado ? ocupados++ : libres++;
    });
  });

  document.getElementById('s-libre').textContent = libres;
  document.getElementById('s-ocup').textContent  = ocupados;
  document.getElementById('s-total').textContent = total;

  renderHistorial(historial);
}

/* ════════════════════════════════════════════════
   QUOTA — cuántas reservas le quedan al usuario
   ════════════════════════════════════════════════ */
function actualizarQuota(data) {
  const reservasPersona = Object.values(data).filter(s => s.email === miEmail && s.ocupado);
  const carros = reservasPersona.filter(s => s.tipo === 'carro').length;
  const motos  = reservasPersona.filter(s => s.tipo === 'moto').length;

  const restCar  = Math.max(0, LIMITE.carro - carros);
  const restMoto = Math.max(0, LIMITE.moto  - motos);

  document.getElementById('quota-car').textContent  = restCar;
  document.getElementById('quota-moto').textContent = restMoto;
  document.getElementById('quota-car').className    = 'quota-val' + (restCar  === 0 ? ' agotado' : '');
  document.getElementById('quota-moto').className   = 'quota-val' + (restMoto === 0 ? ' agotado' : '');
  document.getElementById('my-quota').style.display = 'grid';
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
      <div class="historial-dot ${h.tipo}"></div>
      <div class="historial-info">
        <div class="historial-name">${h.nombre}</div>
        <div class="historial-meta">${h.spot} · ${h.tipo}</div>
      </div>
      <div class="historial-fecha">${h.hora}</div>
    </div>
  `).join('');
}

/* ════════════════════════════════════════════════
   MODAL RESERVA
   ════════════════════════════════════════════════ */
function abrirModal(id, label, tipo) {
  selSpotId    = id;
  selSpotLabel = label;
  selSpotTipo  = tipo;

  document.getElementById('modal-icon').innerHTML    = ICONS[tipo];
  document.getElementById('modal-title').textContent = `Reservar ${label}`;
  document.getElementById('modal-sub').textContent   = 'Ingresa tus datos para confirmar';
  document.getElementById('inp-name').value  = miNombre || '';
  document.getElementById('inp-email').value = miEmail  || '';
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => {
    const inp = miNombre ? document.getElementById('inp-email') : document.getElementById('inp-name');
    inp.focus();
  }, 80);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  selSpotId = null;
}

/* ════════════════════════════════════════════════
   CONFIRMAR RESERVA
   ════════════════════════════════════════════════ */
async function confirmarReserva() {
  const nombre = document.getElementById('inp-name').value.trim();
  const email  = document.getElementById('inp-email').value.trim();
  if (!nombre || !email) { sacudirModal('modal'); return; }

  // Verificar límite semanal
  const snapSpots = await db.ref('parkoffice').once('value');
  const data = snapSpots.val() || {};
  const reservasPersona = Object.values(data).filter(s => s.email === email && s.ocupado);
  const carros = reservasPersona.filter(s => s.tipo === 'carro').length;
  const motos  = reservasPersona.filter(s => s.tipo === 'moto').length;

  if (selSpotTipo === 'carro' && carros >= LIMITE.carro) {
    showToast(`Ya usaste tus ${LIMITE.carro} reservas de carro esta semana`, true);
    closeModal(); return;
  }
  if (selSpotTipo === 'moto' && motos >= LIMITE.moto) {
    showToast(`Ya usaste tus ${LIMITE.moto} reservas de moto esta semana`, true);
    closeModal(); return;
  }

  const btn = document.getElementById('btn-confirm');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    const ahora = new Date();
    const hora  = ahora.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
    const fecha = ahora.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' });

    await db.ref(`parkoffice/${selSpotId}`).set({
      ocupado: true, nombre, email,
      tipo: selSpotTipo,
      hora, fecha, ts: Date.now()
    });

    // Guardar en historial
    await db.ref('historial').push({
      nombre, email, spot: selSpotLabel,
      tipo: selSpotTipo, hora, fecha, ts: Date.now()
    });

    // Guardar nombre/correo en localStorage para recordarlo
    miNombre = nombre; miEmail = email;
    localStorage.setItem('po_nombre', nombre);
    localStorage.setItem('po_email',  email);

    // Notificar a quien estaba esperando este puesto
    await notificarAvisos(selSpotId, selSpotLabel);

    await enviarCorreo(nombre, email, selSpotLabel, fecha, hora);

    closeModal();
    setTimeout(() => {
      const el = document.getElementById(`spot-${selSpotId}`);
      if (el) { el.classList.add('animar'); setTimeout(() => el.classList.remove('animar'), 500); }
    }, 100);
    showToast(`Puesto apartado para ${nombre} 🎉`, false);

  } catch (e) {
    console.error(e);
    showToast('Error al guardar. Intenta de nuevo.', true);
  }

  btn.disabled = false; btn.textContent = 'Reservar';
}

/* ════════════════════════════════════════════════
   LIBERAR PUESTO
   ════════════════════════════════════════════════ */
async function liberarPuesto(id, e) {
  e.stopPropagation();
  if (!IS_CONFIGURED) { showToast('Configura Firebase primero', true); return; }
  await db.ref(`parkoffice/${id}`).remove();
  showToast('Puesto liberado', false);
}

/* ════════════════════════════════════════════════
   MODAL AVISO — suscribirse cuando se libere
   ════════════════════════════════════════════════ */
function abrirAvisoModal(id, label, e) {
  e.stopPropagation();
  selAvisoId = id;
  document.getElementById('aviso-sub').textContent   = `Te avisamos cuando se libere ${label}`;
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
    await db.ref(`avisos/${selAvisoId}/${email.replace(/\./g,'_')}`).set({ nombre, email, ts: Date.now() });
    miNombre = nombre; miEmail = email;
    localStorage.setItem('po_nombre', nombre);
    localStorage.setItem('po_email',  email);
    closeAvisoModal();
    showToast(`Te avisamos cuando se libere 🔔`, false, 'amber');
  } catch(e) {
    console.error(e);
    showToast('Error. Intenta de nuevo.', true);
  }

  btn.disabled = false; btn.textContent = 'Avisarme';
}

/* ════════════════════════════════════════════════
   NOTIFICAR AVISOS — cuando alguien libera un puesto
   ════════════════════════════════════════════════ */
async function notificarAvisos(spotId, spotLabel) {
  const snap = await db.ref(`avisos/${spotId}`).once('value');
  const avisos = snap.val();
  if (!avisos) return;

  const fecha = new Date().toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' });
  const hora  = new Date().toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });

  const promesas = Object.values(avisos).map(a =>
    emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
      to_name:    a.nombre,
      to_email:   a.email,
      spot_label: `${spotLabel} (¡ya está libre!)`,
      fecha, hora
    }).catch(err => console.warn('Aviso email error:', err))
  );

  await Promise.all(promesas);
  await db.ref(`avisos/${spotId}`).remove();
}

/* ════════════════════════════════════════════════
   EMAILJS — confirmación de reserva
   ════════════════════════════════════════════════ */
async function enviarCorreo(nombre, email, label, fecha, hora) {
  if (!IS_CONFIGURED) return;
  try {
    await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
      to_name: nombre, to_email: email, spot_label: label, fecha, hora
    });
  } catch(e) { console.warn('EmailJS error:', e); }
}

/* ════════════════════════════════════════════════
   UTILIDADES
   ════════════════════════════════════════════════ */
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
  if (e.key === 'Escape') { closeModal(); closeAvisoModal(); }
  if (e.key === 'Enter') {
    if (document.getElementById('modal-overlay').classList.contains('open')) confirmarReserva();
    if (document.getElementById('modal-aviso-overlay').classList.contains('open')) confirmarAviso();
  }
});
