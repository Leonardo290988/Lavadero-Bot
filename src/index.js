const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const express = require("express");
const { Pool } = require("pg");
const axios = require("axios");

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ======================================
// CLIENTE WHATSAPP
// ======================================
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "/tmp/.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu"
    ]
  }
});

let clientReady = false;
let qrActual = null;
let botStartTime = Date.now();

client.on("qr", async (qr) => {
  console.log("QR recibido, escanea con WhatsApp");
  qrcode.generate(qr, { small: true });
  qrActual = qr;
});

client.on("ready", () => {
  console.log("Bot de WhatsApp conectado y listo!");
  clientReady = true;
  qrActual = null;
  botStartTime = Date.now();
});

client.on("disconnected", (reason) => {
  console.log("Bot desconectado:", reason);
  clientReady = false;
});

// ======================================
// OBTENER CONTEXTO DEL LAVADERO
// ======================================
async function obtenerContexto() {
  try {
    const servicios = await pool.query(`
      SELECT nombre, precio FROM servicios
      WHERE (activo = true OR activo IS NULL)
        AND nombre != 'Servicio Valet 1/2'
      ORDER BY
        CASE
          WHEN nombre = 'Servicio Valet' THEN 1
          WHEN nombre LIKE 'Acolchado%' THEN 2
          WHEN nombre LIKE 'Lavado Acolchado%' THEN 3
          ELSE 4
        END, precio ASC
    `);

    const listaPrecios = servicios.rows
      .map(s => `- ${s.nombre}: $${Number(s.precio).toLocaleString("es-AR")}`)
      .join("\n");

    return `Sos el asistente virtual de Lavaderos Moreno, una lavandería ubicada en Hipólito Yrigoyen 1471, Moreno, Buenos Aires, Argentina.

INFORMACIÓN DEL NEGOCIO:
- Nombre: Lavaderos Moreno
- Dirección: Hipólito Yrigoyen 1471, Moreno, Buenos Aires
- Horario: Lunes a Sábados de 9 a 18hs (Domingos cerrado)
- Alias MercadoPago: Lavaderos.moreno (a nombre de Correa Yamila Belen)
- Teléfono / WhatsApp: 11 2252 7099
- Instagram: @lavaderos.moreno
- Facebook: Lavaderos Moreno (facebook.com/LavaderosMoreno)
- App móvil: "Lavaderos Moreno" disponible en Google Play

LISTA DE PRECIOS ACTUAL:
${listaPrecios}

PROMOCIONES VIGENTES:
- Acolchados y Frazadas 3x2: llevás 3 acolchados/frazadas (combinables entre sí) y pagás 2 (el más barato es gratis). Válido de Martes a Viernes.
- Camperones 3x2: llevás 3 camperones y pagás 2 (el más barato es gratis). Válido de Martes a Viernes.

INFORMACIÓN ADICIONAL SOBRE PRECIOS:
- Las frazadas tienen el mismo precio que los acolchados del mismo tamaño y tipo
- Las frazadas entran en la promo 3x2 junto con los acolchados (se pueden combinar)

SERVICIO VALET (lavado de ropa):
- El Servicio Valet incluye el lavado y secado de ropa
- Se cobra POR CANASTO (no por prenda individual ni por kilo)
- En un canasto entran aproximadamente entre 10 y 12 prendas, dependiendo del tamaño de las mismas (por ejemplo, remeras y medias ocupan menos que pantalones o camisas)
- Si la ropa supera un canasto pero no alcanza a llenar otro completo, se cobra el Servicio Valet completo + un Servicio Valet 1/2 (medio canasto adicional)
- Ejemplo: si la ropa equivale a un canasto y medio → se cobra 1 Servicio Valet + 1 Servicio Valet 1/2

SISTEMA DE PUNTOS DE FIDELIDAD:
- Por cada $1.000 gastados el cliente suma 1 punto
- Con 100 puntos acumulados: 10% de descuento en la próxima orden
- Con 200 puntos acumulados: 20% de descuento en la próxima orden
- Los puntos se acumulan automáticamente al retirar cada orden
- Hacemos retiros y envíos a domicilio. El cliente lo solicita desde la app Lavaderos Moreno (disponible en Google Play)
- La app permite ver el estado de las órdenes en tiempo real
- Para solicitar retiro o envío: abrir la app → Mis órdenes → Pedir retiro o Retiro y envío
- El costo del envío varía según la zona

IMPORTANTE - HABLAR CON UN HUMANO:
- Si el cliente quiere hablar con una persona del local, debe escribir la palabra "operador"
- Cuando escriba "operador", se le va a avisar y un empleado del local le va a responder personalmente

PRESENTACIÓN INICIAL (MUY IMPORTANTE):
- En tu PRIMER mensaje de la conversación (cuando no hay historial previo), SIEMPRE presentate como asistente virtual de Lavaderos Moreno y avisale al cliente que en cualquier momento puede escribir la palabra "operador" si quiere que lo atienda un empleado del local.
- Hacelo de forma natural, breve y amable. NO uses una fórmula rígida; integralo con la respuesta a su consulta si ya hizo una pregunta.
- A partir del segundo mensaje en adelante, NO te vuelvas a presentar ni repitas lo de "operador" en cada respuesta (solo recordáselo si el cliente está frustrado, te pide hablar con alguien, o el tema escapa a lo que vos podés resolver).
- Ejemplo natural de primer mensaje (NO copiar literal, adaptarlo): "¡Hola! 👋 Soy el asistente virtual de Lavaderos Moreno. Si en cualquier momento querés hablar directamente con un empleado del local, escribí la palabra *operador* y te atiende una persona. Contame, ¿en qué te puedo ayudar?"

INSTRUCCIONES PARA RESPONDER:
- Respondé siempre en español argentino, de forma amigable y cercana
- Usá "vos" en lugar de "tú"
- Sé conciso pero completo
- Si preguntan por precios, mostrá la lista completa
- Si preguntan por el estado de su orden, deciles que lo pueden ver desde la app
- Si te preguntan algo que NO podés resolver o el cliente parece insatisfecho, sugerile que escriba "operador" para hablar con una persona
- No inventes información que no tenés
- No respondas consultas que no tengan que ver con el lavadero
- Usá emojis moderadamente para que sea más amigable
- Máximo 3-4 párrafos por respuesta
- Si el historial de conversación muestra que ya saludaste al cliente, NO vuelvas a saludarlo en cada mensaje`;
  } catch (err) {
    console.error("Error obteniendo contexto:", err.message);
    return "";
  }
}

// ======================================
// 🆕 HISTORIAL DE CONVERSACIONES
// Guarda los últimos mensajes de cada chat para dar contexto al bot
// Se limpia automáticamente: solo se conservan los de las últimas 2 horas
// ======================================
const historialPorChat = new Map();
// { "549XXX@c.us": [{ rol: "user"|"assistant", contenido: "...", timestamp: Date }] }

const HISTORIAL_HORAS = 2;
const HISTORIAL_MS = HISTORIAL_HORAS * 60 * 60 * 1000;

// 🆕 Set de mensajes enviados por el BOT (para distinguir de mensajes del empleado)
// Como WhatsApp puede usar formatos distintos de chat ID (@c.us vs @lid),
// trackear por ID es poco confiable. En su lugar, guardamos {texto, timestamp}
// y matcheamos por contenido + tiempo.
const mensajesEnviadosPorBot = [];
// Cada entrada: { texto: string, timestamp: number }

const VENTANA_MATCH_BOT_MS = 30000; // 30 segundos para matchear bot vs empleado

// Limpieza periódica
setInterval(() => {
  const ahora = Date.now();
  // Eliminar entradas viejas
  while (mensajesEnviadosPorBot.length > 0 &&
         (ahora - mensajesEnviadosPorBot[0].timestamp) > VENTANA_MATCH_BOT_MS) {
    mensajesEnviadosPorBot.shift();
  }
}, 30 * 1000);

// 🆕 MARCA INVISIBLE: caracteres de ancho cero que agregamos al final de cada
// mensaje del bot. El cliente NO los ve, pero cuando el mensaje vuelve por
// message_create podemos reconocerlo al instante. Un empleado escribiendo a
// mano nunca va a poner estos caracteres, así que el match es 100% confiable.
// (word-joiner + zero-width-space + zero-width-joiner + word-joiner)
const MARCA_BOT = "\u2060\u200B\u200D\u2060";

function agregarMarcaBot(texto) {
  return (texto || "") + MARCA_BOT;
}

function tieneMarcaBot(texto) {
  return typeof texto === "string" && texto.includes(MARCA_BOT);
}

// Normaliza un texto para comparar: saca invisibles, unifica espacios,
// pasa a minúsculas y normaliza Unicode (para que emojis/saltos no rompan el match)
function normalizarTexto(s) {
  if (!s) return "";
  return s
    .normalize("NFC")
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "") // quitar caracteres de ancho cero
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Distancia de Levenshtein (para medir parecido entre dos textos cortos)
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const fila = Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) fila[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,
        fila[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return fila[b.length];
}

// ¿Dos textos normalizados son "el mismo" con cierta tolerancia? (>= 90% parecido)
function textosSimilares(a, b) {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return true;
  // Para textos largos, comparar es caro: cortamos a 400 chars (suficiente)
  const aa = a.slice(0, 400);
  const bb = b.slice(0, 400);
  const dist = levenshtein(aa, bb);
  const parecido = 1 - dist / Math.max(aa.length, bb.length);
  return parecido >= 0.9;
}

function registrarMensajeBot(texto) {
  mensajesEnviadosPorBot.push({
    texto: (texto || "").trim(),
    normal: normalizarTexto(texto),
    timestamp: Date.now()
  });
}

function esMensajeDelBot(texto) {
  if (!texto) return false;

  // 1) MARCA INVISIBLE → reconocimiento instantáneo y 100% confiable
  if (tieneMarcaBot(texto)) {
    return true;
  }

  // 2) RESPALDO: match tolerante por contenido (por si la marca se perdiera)
  const ahora = Date.now();
  const limpio = normalizarTexto(texto);
  if (!limpio) return false;

  for (let i = mensajesEnviadosPorBot.length - 1; i >= 0; i--) {
    const entry = mensajesEnviadosPorBot[i];
    if ((ahora - entry.timestamp) > VENTANA_MATCH_BOT_MS) break;
    if (entry.normal === limpio || textosSimilares(entry.normal, limpio)) {
      // Match: lo eliminamos para no matchearlo dos veces
      mensajesEnviadosPorBot.splice(i, 1);
      return true;
    }
  }
  return false;
}

function agregarAlHistorial(chatId, rol, contenido) {
  if (!contenido || !contenido.trim()) return;

  const ahora = Date.now();
  let historial = historialPorChat.get(chatId) || [];

  // Limpiar mensajes viejos (más de 2 horas)
  historial = historial.filter(m => ahora - m.timestamp < HISTORIAL_MS);

  historial.push({ rol, contenido: contenido.trim(), timestamp: ahora });

  historialPorChat.set(chatId, historial);
}

function obtenerHistorialParaClaude(chatId) {
  const historial = historialPorChat.get(chatId) || [];
  const ahora = Date.now();

  // Filtrar solo mensajes de las últimas 2 horas
  const recientes = historial.filter(m => ahora - m.timestamp < HISTORIAL_MS);

  // Convertir al formato que espera Claude
  return recientes.map(m => ({
    role: m.rol === "user" ? "user" : "assistant",
    content: m.contenido
  }));
}

// Limpieza periódica de historiales viejos (cada 30 min)
setInterval(() => {
  const ahora = Date.now();
  for (const [chatId, historial] of historialPorChat.entries()) {
    const limpio = historial.filter(m => ahora - m.timestamp < HISTORIAL_MS);
    if (limpio.length === 0) {
      historialPorChat.delete(chatId);
    } else {
      historialPorChat.set(chatId, limpio);
    }
  }
}, 30 * 60 * 1000);

// ======================================
// 🆕 MODO HUMANO
// Cuando un cliente escribe "operador", el bot deja de responder por 5 min
// Si llega un mensaje del cliente o respuesta del empleado, se resetea el timer
// ======================================
const modoHumano = new Map();
// { "549XXX@c.us": { hasta: Date, lastActivity: Date } }

const MODO_HUMANO_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos sin actividad

function activarModoHumano(chatId) {
  const ahora = Date.now();
  modoHumano.set(chatId, {
    hasta: ahora + MODO_HUMANO_TIMEOUT_MS,
    lastActivity: ahora
  });
  console.log(`🧑‍💼 Modo HUMANO activado para ${chatId}`);
}

function refrescarModoHumano(chatId) {
  const estado = modoHumano.get(chatId);
  if (!estado) return false;

  const ahora = Date.now();
  estado.lastActivity = ahora;
  estado.hasta = ahora + MODO_HUMANO_TIMEOUT_MS;
  modoHumano.set(chatId, estado);
  return true;
}

function estaEnModoHumano(chatId) {
  const estado = modoHumano.get(chatId);
  if (!estado) return false;

  const ahora = Date.now();
  if (ahora > estado.hasta) {
    modoHumano.delete(chatId);
    console.log(`🤖 Modo BOT reactivado para ${chatId} (timeout)`);
    return false;
  }
  return true;
}

// Limpieza periódica de modos humanos expirados
setInterval(() => {
  const ahora = Date.now();
  for (const [chatId, estado] of modoHumano.entries()) {
    if (ahora > estado.hasta) {
      modoHumano.delete(chatId);
      console.log(`🤖 Modo BOT reactivado para ${chatId} (limpieza)`);
    }
  }
}, 60 * 1000); // cada 1 minuto

// ======================================
// 🆕 NOTIFICACIÓN DE OPERADOR AL PANEL
// Cuando un cliente pide "operador", guardamos una fila en la DB
// para que los empleados la vean en la campana del panel.
// El bot escribe DIRECTO a la base (ya tiene pool configurado).
// ======================================

// Crear la tabla si no existe (por si el bot arranca antes que el backend)
pool.query(`
  CREATE TABLE IF NOT EXISTS notificaciones_operador (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(80) NOT NULL,
    telefono VARCHAR(40),
    nombre_cliente VARCHAR(120),
    mensaje_cliente TEXT,
    atendido BOOLEAN DEFAULT false,
    fecha_pedido TIMESTAMP DEFAULT NOW(),
    fecha_atendido TIMESTAMP
  )
`).catch(err => console.error("Error creando notificaciones_operador:", err.message));

async function registrarNotificacionOperador(chatId, telefono, nombreCliente, mensajeCliente) {
  try {
    // Evitar duplicados: si ya hay una pendiente para este chat, no creamos otra
    const existe = await pool.query(`
      SELECT id FROM notificaciones_operador
      WHERE chat_id = $1 AND atendido = false
      LIMIT 1
    `, [chatId]);

    if (existe.rows.length > 0) {
      console.log(`🔔 Ya hay una notificación pendiente para ${chatId}, no se duplica`);
      return;
    }

    await pool.query(`
      INSERT INTO notificaciones_operador
        (chat_id, telefono, nombre_cliente, mensaje_cliente)
      VALUES ($1, $2, $3, $4)
    `, [chatId, telefono || null, nombreCliente || null, mensajeCliente || null]);

    console.log(`🔔 Notificación de operador creada para ${nombreCliente || chatId}`);
  } catch (err) {
    console.error("Error registrando notificación de operador:", err.message);
  }
}

async function cerrarNotificacionOperador(chatId) {
  try {
    const r = await pool.query(`
      UPDATE notificaciones_operador
      SET atendido = true, fecha_atendido = NOW()
      WHERE chat_id = $1 AND atendido = false
      RETURNING id
    `, [chatId]);

    if (r.rows.length > 0) {
      console.log(`✅ ${r.rows.length} notificación(es) de operador cerrada(s) para ${chatId}`);
    }
  } catch (err) {
    console.error("Error cerrando notificación de operador:", err.message);
  }
}

// ======================================
// 🆕 DETECTAR SI EL MENSAJE PIDE OPERADOR
// ======================================
function pideOperador(texto) {
  if (!texto) return false;
  const limpio = texto.toLowerCase().trim();
  const palabras = ["operador", "operadora"];
  return palabras.some(p => limpio === p || limpio.includes(p));
}

// 🆕 Helper para enviar mensajes "marcados" como del bot
// Registra el texto limpio (para el respaldo) y envía el texto CON la marca
// invisible al final, para que message_create lo reconozca al instante.
async function enviarMensajeDelBot(msgOrChat, texto) {
  // Registrar el texto LIMPIO antes de enviar (para el match de respaldo)
  registrarMensajeBot(texto);

  // Enviar el texto CON la marca invisible
  const textoConMarca = agregarMarcaBot(texto);

  let sent;
  if (msgOrChat.reply) {
    sent = await msgOrChat.reply(textoConMarca);
  } else if (msgOrChat.sendMessage) {
    sent = await msgOrChat.sendMessage(textoConMarca);
  } else {
    return null;
  }
  return sent;
}

// ======================================
// RESPONDER CON CLAUDE (con historial)
// ======================================
async function responderConClaude(chatId, mensaje, nombreCliente) {
  try {
    const contexto = await obtenerContexto();
    const saludo = nombreCliente ? `El cliente se llama ${nombreCliente}.` : "";

    // Construir el array de mensajes con historial + mensaje nuevo
    const historialPrevio = obtenerHistorialParaClaude(chatId);
    const messages = [
      ...historialPrevio,
      { role: "user", content: mensaje }
    ];

    // 🆕 Si es el PRIMER mensaje de la conversación (sin historial),
    // reforzamos la instrucción para que el bot se presente sí o sí.
    const esPrimerMensaje = historialPrevio.length === 0;
    const instruccionPresentacion = esPrimerMensaje
      ? `\n\n[ATENCIÓN: Este es el PRIMER mensaje del cliente en esta conversación. Es OBLIGATORIO que en tu respuesta te presentes como asistente virtual de Lavaderos Moreno Y le menciones que puede escribir "operador" en cualquier momento para hablar con un empleado del local. Hacelo de forma natural y amable, integrado con la respuesta a su consulta.]`
      : `\n\n[Esta NO es la primera interacción con el cliente. NO te presentes de nuevo ni repitas lo de "operador" (excepto si el cliente está frustrado o pide hablar con alguien).]`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system: `${contexto}\n\n${saludo}${instruccionPresentacion}`,
        messages: messages
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        timeout: 15000
      }
    );

    return response.data.content[0].text;
  } catch (err) {
    console.error("Error llamando a Claude:", err.message);
    return null;
  }
}

// ======================================
// BUFFER DE MENSAJES (debounce por número)
// ======================================
const mensajesBuffer = new Map();
const DEBOUNCE_MS = 5000; // 🆕 5 segundos (antes era 6)

async function procesarBuffer(from) {
  const buffer = mensajesBuffer.get(from);
  if (!buffer) return;

  const { mensajes, lastMsg, nombreCliente } = buffer;
  mensajesBuffer.delete(from);

  const textoCompleto = mensajes.join("\n").trim();
  if (!textoCompleto) return;

  // 🆕 Si está en modo humano, no responder
  if (estaEnModoHumano(from)) {
    console.log(`🧑‍💼 Modo humano activo, no se responde a ${from}`);
    // Igualmente guardamos en historial para tener contexto cuando vuelva el bot
    agregarAlHistorial(from, "user", textoCompleto);
    return;
  }

  console.log(`Procesando buffer de ${nombreCliente || from}: "${textoCompleto}"`);

  // 🆕 Detectar si el cliente pidió operador
  if (pideOperador(textoCompleto)) {
    activarModoHumano(from);

    await lastMsg.getChat().then(chat => chat.sendStateTyping());
    await new Promise(r => setTimeout(r, 1500));

    const saludo = nombreCliente ? `Perfecto ${nombreCliente}` : "Perfecto";
    const respuesta = `${saludo} 👍\n\nEn breve un empleado del local te va a responder personalmente. Por favor esperá unos minutos 🙏\n\nNuestro horario de atención es de Lunes a Sábados de 9 a 18hs.`;
    await enviarMensajeDelBot(lastMsg, respuesta);

    // Guardar en historial
    agregarAlHistorial(from, "user", textoCompleto);
    agregarAlHistorial(from, "assistant", respuesta);

    // 🆕 Registrar notificación en el panel del lavadero (campana)
    // Intentamos obtener el teléfono real del contacto para el link de WhatsApp
    let telefonoCliente = null;
    try {
      const contact = await lastMsg.getContact();
      telefonoCliente = contact.number || null;
    } catch (e) {
      // Si no se puede, dejamos null (el chat_id igual identifica al cliente)
    }
    await registrarNotificacionOperador(from, telefonoCliente, nombreCliente, textoCompleto);

    // 🆕 Marcar el chat como NO LEÍDO para que el empleado lo vea
    try {
      const chat = await lastMsg.getChat();
      await chat.markUnread();
      console.log(`📬 Chat ${from} marcado como NO LEÍDO para el empleado`);
    } catch (e) {
      console.error("Error marcando como no leído:", e.message);
    }
    return;
  }

  // Flujo normal: responder con Claude usando historial
  await client.sendPresenceAvailable();
  await lastMsg.getChat().then(chat => chat.sendStateTyping());
  await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));

  const respuesta = await responderConClaude(from, textoCompleto, nombreCliente);

  // Guardar el mensaje del cliente en el historial
  agregarAlHistorial(from, "user", textoCompleto);

  if (respuesta) {
    await enviarMensajeDelBot(lastMsg, respuesta);
    agregarAlHistorial(from, "assistant", respuesta);
  } else {
    const saludo = nombreCliente ? `Hola ${nombreCliente}!` : "Hola!";
    const fallback = `${saludo} 👋 Gracias por escribirnos. En breve te atendemos 😊\n\nSi querés hablar con una persona del local, escribí "operador".`;
    await enviarMensajeDelBot(lastMsg, fallback);
    agregarAlHistorial(from, "assistant", fallback);
  }
}

// ======================================
// 🆕 TRANSCRIPCIÓN DE AUDIOS (Whisper / OpenAI)
// ======================================
const MAX_AUDIO_SEG = 120; // si el audio dura más de esto, pedimos que escriban

// Llama a la API de Whisper de OpenAI para transcribir un audio de WhatsApp
async function transcribirAudio(msg) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error("⚠️ Falta OPENAI_API_KEY: no se pueden transcribir audios");
      return { ok: false, motivo: "sin_api_key" };
    }

    const media = await msg.downloadMedia();
    if (!media || !media.data) {
      return { ok: false, motivo: "sin_data" };
    }

    const buffer = Buffer.from(media.data, "base64");
    const mimetype = (media.mimetype || "audio/ogg").split(";")[0];
    const ext = mimetype.includes("mp4") || mimetype.includes("m4a") ? "m4a"
              : mimetype.includes("mpeg") || mimetype.includes("mp3") ? "mp3"
              : "ogg";

    // FormData y Blob nativos (Node 18+)
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimetype }), `audio.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "es");

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Error Whisper:", resp.status, errText.slice(0, 200));
      return { ok: false, motivo: "api_error" };
    }

    const data = await resp.json();
    const texto = (data.text || "").trim();
    return { ok: true, texto };
  } catch (err) {
    console.error("Error transcribiendo audio:", err.message);
    return { ok: false, motivo: "excepcion" };
  }
}

// Detecta transcripciones vacías, demasiado cortas o "alucinaciones" típicas de
// Whisper cuando el audio es ruido/silencio (devuelve textos basura conocidos)
function transcripcionInvalida(texto) {
  if (!texto) return true;
  // Si casi no tiene letras/números, no sirve
  if (texto.replace(/[^a-záéíóúñü0-9]/gi, "").length < 2) return true;

  const t = texto.toLowerCase();
  const basura = [
    "subtítulos realizados por",
    "subtitulado por",
    "subtítulos por",
    "gracias por ver el video",
    "¡gracias por ver",
    "amara.org",
    "subtitles by",
    "thanks for watching"
  ];
  return basura.some(b => t.includes(b));
}

// ======================================
// MENSAJES ENTRANTES (DEL CLIENTE)
// ======================================
client.on("message", async (msg) => {
  if (msg.from.includes("@g.us")) return;
  if (msg.from.includes("@broadcast")) return;
  if (msg.from === "status@broadcast") return;
  if (msg.type === "e2e_notification") return;
  if (msg.type === "notification_template") return;
  if (msg.fromMe) return; // Los `fromMe` se manejan en message_create
  const msgTime = msg.timestamp * 1000;
  if (msgTime < botStartTime) return;

  // 🆕 Si el chat estaba en modo humano y llega mensaje del cliente, refrescar timer
  // (cada actividad del cliente extiende el modo humano otros 5 min)
  if (estaEnModoHumano(msg.from)) {
    refrescarModoHumano(msg.from);
    // También guardamos en historial para tener contexto cuando vuelva el bot
    if (msg.body && msg.body.trim()) {
      agregarAlHistorial(msg.from, "user", msg.body.trim());
    }
    console.log(`🧑‍💼 Mensaje recibido en modo humano de ${msg.from} (no se responde)`);

    // Volver a marcar como no leído por si WhatsApp lo leyó al procesar
    try {
      const chat = await msg.getChat();
      await chat.markUnread();
    } catch (e) {
      // Silencioso
    }
    return;
  }

  // 🆕 AUDIOS: transcribir con Whisper y procesarlos como si fueran texto.
  // Si el audio es muy largo o no se entiende, pedimos que escriban.
  let textoEntrante = null;

  if (msg.type === "ptt" || msg.type === "audio") {
    const duracion = Number(msg.duration) || 0;

    // Audio demasiado largo → pedir que escriba
    if (duracion > MAX_AUDIO_SEG) {
      await msg.getChat().then(c => c.sendStateTyping()).catch(() => {});
      await new Promise(r => setTimeout(r, 1200));
      const resp = `Uy, ese audio es bastante largo 😅 Para poder ayudarte bien, ¿me lo escribís en un mensaje? 🙏\n\nSi preferís hablar con una persona del local, escribí "operador".`;
      await enviarMensajeDelBot(msg, resp);
      agregarAlHistorial(msg.from, "assistant", resp);
      return;
    }

    // Mostrar "escribiendo..." mientras transcribimos
    await msg.getChat().then(c => c.sendStateTyping()).catch(() => {});
    const resultado = await transcribirAudio(msg);

    // No se pudo transcribir o no se entiende → pedir que escriba
    if (!resultado.ok || transcripcionInvalida(resultado.texto)) {
      const resp = `Perdón, no llegué a entender bien tu audio 🙈 ¿Me lo escribís en un mensaje así te ayudo? 🙏\n\nSi preferís hablar con una persona del local, escribí "operador".`;
      await enviarMensajeDelBot(msg, resp);
      agregarAlHistorial(msg.from, "assistant", resp);
      return;
    }

    textoEntrante = resultado.texto;
    console.log(`🎙️ Audio transcripto de ${msg.from}: "${textoEntrante}"`);
  } else {
    // Mensaje de texto normal
    if (!msg.body || msg.body.trim() === "") return;
    textoEntrante = msg.body.trim();
  }

  // Buscar nombre del cliente
  let nombreCliente = null;
  const bufferExistente = mensajesBuffer.get(msg.from);

  if (bufferExistente) {
    nombreCliente = bufferExistente.nombreCliente;
  } else {
    try {
      const contact = await msg.getContact();
      const telReal = contact.number || "";
      const ultimos10 = telReal.slice(-10);
      if (ultimos10.length >= 8) {
        const r = await pool.query(`
          SELECT nombre FROM clientes
          WHERE REGEXP_REPLACE(telefono, '[^0-9]', '', 'g') LIKE $1
          LIMIT 1
        `, [`%${ultimos10}%`]);
        if (r.rows.length > 0) {
          nombreCliente = r.rows[0].nombre.split(" ")[0];
        }
      }
    } catch (e) {
      console.error("Error buscando cliente:", e.message);
    }
  }

  console.log(`Mensaje de ${nombreCliente || msg.from}: "${textoEntrante}"`);

  if (bufferExistente) {
    clearTimeout(bufferExistente.timer);
    bufferExistente.mensajes.push(textoEntrante);
    bufferExistente.lastMsg = msg;
    bufferExistente.timer = setTimeout(() => procesarBuffer(msg.from), DEBOUNCE_MS);
  } else {
    const nuevoBuffer = {
      mensajes: [textoEntrante],
      lastMsg: msg,
      nombreCliente,
      timer: setTimeout(() => procesarBuffer(msg.from), DEBOUNCE_MS)
    };
    mensajesBuffer.set(msg.from, nuevoBuffer);
  }
});

// ======================================
// 🆕 MENSAJES SALIENTES (DEL EMPLEADO/DUEÑO)
// Capturamos los mensajes que escribe el empleado en WhatsApp
// para guardar el contexto y refrescar el modo humano
// ======================================
client.on("message_create", async (msg) => {
  if (!msg.fromMe) return; // Solo los que SALEN
  if (msg.from.includes("@g.us")) return;
  if (msg.from.includes("@broadcast")) return;
  if (msg.to === "status@broadcast") return;

  const msgTime = msg.timestamp * 1000;
  if (msgTime < botStartTime) return;

  const chatId = msg.to;
  if (!chatId) return;
  if (!msg.body || msg.body.trim() === "") return;

  // 🆕 Detección por texto + timestamp (no por ID porque WhatsApp usa formatos
  // distintos de chat ID @c.us y @lid que no matchean)
  if (esMensajeDelBot(msg.body)) {
    console.log(`✅ Mensaje identificado como del BOT (chat: ${chatId})`);
    return;
  }

  // 🆕 Es un mensaje del EMPLEADO/DUEÑO escribiendo manualmente desde WhatsApp
  console.log(`👤 Mensaje del empleado a ${chatId}: "${msg.body.substring(0, 60)}..."`);

  // Guardar en historial como "assistant" (para que el bot lo vea como contexto)
  agregarAlHistorial(chatId, "assistant", msg.body.trim());

  // Si el chat NO estaba en modo humano y el empleado responde,
  // activamos modo humano automáticamente (asumimos que tomó la conversación)
  if (!estaEnModoHumano(chatId)) {
    activarModoHumano(chatId);
    console.log(`🧑‍💼 Modo humano AUTO-activado: el empleado tomó la conversación`);
  } else {
    refrescarModoHumano(chatId);
  }

  // 🆕 El empleado respondió → cerrar la notificación de operador pendiente (cierre automático)
  await cerrarNotificacionOperador(chatId);
});

// ======================================
// API REST
// ======================================
app.post("/enviar", async (req, res) => {
  const { telefono, mensaje } = req.body;

  if (!clientReady) {
    return res.status(503).json({ error: "Bot no conectado" });
  }

  if (!telefono || !mensaje) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  try {
    let tel = telefono.replace(/\D/g, "");
    if (tel.startsWith("0")) tel = tel.slice(1);
    if (tel.startsWith("9")) tel = "54" + tel;
    if (!tel.startsWith("54")) tel = "549" + tel;
    const chatId = `${tel}@c.us`;

    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

    const isRegistered = await client.isRegisteredUser(chatId);
    let chatIdFinal = chatId;

    if (!isRegistered) {
      const telSin9 = tel.replace("549", "54");
      const chatId2 = `${telSin9}@c.us`;
      const isRegistered2 = await client.isRegisteredUser(chatId2);
      if (!isRegistered2) {
        return res.status(404).json({ error: "Numero no registrado en WhatsApp" });
      }
      chatIdFinal = chatId2;
    }

    // 🆕 Registrar como mensaje del bot ANTES de enviar
    registrarMensajeBot(mensaje);

    const sent = await client.sendMessage(chatIdFinal, agregarMarcaBot(mensaje));

    // 🆕 Guardar mensajes automáticos del backend en el historial también
    agregarAlHistorial(chatIdFinal, "assistant", mensaje);

    console.log(`Mensaje enviado a ${chatIdFinal}`);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error enviando mensaje:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/status", (req, res) => {
  res.json({ conectado: clientReady });
});

// 🆕 Endpoint para ver el estado del modo humano (debug)
app.get("/modo-humano", (req, res) => {
  const ahora = Date.now();
  const activos = [];
  for (const [chatId, estado] of modoHumano.entries()) {
    activos.push({
      chatId,
      minutosRestantes: Math.round((estado.hasta - ahora) / 60000)
    });
  }
  res.json({ total: activos.length, chats: activos });
});

// 🆕 Endpoint para DESACTIVAR el modo humano de un chat (o de todos)
// GET /modo-humano/reset → desactiva todos
// GET /modo-humano/reset?chatId=549XXX@c.us → desactiva uno
app.get("/modo-humano/reset", (req, res) => {
  const { chatId } = req.query;
  if (chatId) {
    modoHumano.delete(chatId);
    return res.json({ ok: true, mensaje: `Modo humano desactivado para ${chatId}` });
  }
  const total = modoHumano.size;
  modoHumano.clear();
  res.json({ ok: true, mensaje: `Modo humano desactivado para ${total} chat(s)` });
});

app.get("/qr", async (req, res) => {
  if (clientReady) {
    return res.send("<h2>Bot ya esta conectado!</h2>");
  }
  if (!qrActual) {
    return res.send("<h2>Esperando QR... recarga en unos segundos</h2>");
  }
  try {
    const qrImage = await QRCode.toDataURL(qrActual);
    res.send(`
      <html>
        <body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:40px">
          <h2>Escanea este QR con WhatsApp</h2>
          <p>WhatsApp - Dispositivos vinculados - Vincular dispositivo</p>
          <img src="${qrImage}" style="width:300px;height:300px"/>
          <p style="color:gray;font-size:12px">El QR expira en 20 segundos. Si expira, recarga la pagina.</p>
        </body>
      </html>
    `);
  } catch (e) {
    res.send("<h2>Error generando QR</h2>");
  }
});

// ======================================
// INICIAR
// ======================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API del bot corriendo en puerto ${PORT}`);
});

client.initialize();
