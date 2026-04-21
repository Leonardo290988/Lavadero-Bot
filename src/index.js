const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const { Pool } = require("pg");

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
  authStrategy: new LocalAuth({ dataPath: "/app/.wwebjs_auth" }),
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

client.on("qr", (qr) => {
  console.log("📱 Escanea este QR con WhatsApp:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ Bot de WhatsApp conectado y listo!");
  clientReady = true;
});

client.on("disconnected", (reason) => {
  console.log("❌ Bot desconectado:", reason);
  clientReady = false;
});

// ======================================
// RESPUESTAS AUTOMÁTICAS A MENSAJES ENTRANTES
// ======================================
client.on("message", async (msg) => {
  // Ignorar mensajes de grupos
  if (msg.from.includes("@g.us")) return;
  // Ignorar mensajes propios
  if (msg.fromMe) return;

  const texto = msg.body.toLowerCase().trim();
  const contact = await msg.getContact();
  const nombre = contact.pushname || "cliente";

  console.log(`📨 Mensaje de ${msg.from}: ${msg.body}`);

  // Delay para parecer más humano (2-4 segundos)
  const delay = 2000 + Math.random() * 2000;
  await new Promise(r => setTimeout(r, delay));

  // Indicador "escribiendo..."
  await client.sendPresenceAvailable();
  await msg.getChat().then(chat => chat.sendStateTyping());
  await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));

  // Detectar palabras clave
  if (/precio|precios|cuánto|cuanto|vale|cuesta|tarifa|lista/.test(texto)) {
    await responderPrecios(msg);
  } else if (/horario|horarios|abren|cierran|atienden|abierto|cuando/.test(texto)) {
    await msg.reply(
      `Hola ${nombre}! 😊\n\nAtendemos de *Lunes a Sábados de 9 a 18hs* 🕐\n\nEstamos en *Hipólito Yrigoyen 1471, Moreno* 📍\n\nCualquier otra consulta escribinos!`
    );
  } else if (/orden|pedido|ropa|lista|listo|está|estado|retir/.test(texto)) {
    await msg.reply(
      `Hola ${nombre}! 👋\n\nPara consultar el estado de tu orden podés hacerlo desde nuestra app 📱\n\nBuscá *Lavaderos Moreno* en Google Play, entrá con tu número de teléfono y desde *Mis órdenes* podés ver el estado en tiempo real.\n\n¡Cualquier consulta escribinos! 😊`
    );
  } else if (/envío|envio|domicilio|delivery|mandan|llevan/.test(texto)) {
    await msg.reply(
      `Hola ${nombre}! 🚚\n\nSí, hacemos envíos a domicilio! Podés solicitarlo desde nuestra app 📱\n\nBuscá *Lavaderos Moreno* en Google Play, entrá desde *Mis órdenes* y seleccioná *Solicitar envío a domicilio*.\n\nEl costo varía según la zona. Cualquier consulta escribinos! 😊`
    );
  } else if (/hola|buenas|buen dia|buenas tardes|buenas noches|saludos/.test(texto)) {
    const hora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", hour12: false });
    const saludo = hora < 12 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches";
    await msg.reply(
      `${saludo} ${nombre}! 😊 Bienvenido a *Lavaderos Moreno*.\n\n¿En qué te podemos ayudar? Podés preguntarnos por precios, horarios, el estado de tu orden, o cualquier otra consulta 🧺`
    );
  } else {
    await msg.reply(
      `Hola ${nombre}! 👋 Gracias por escribirnos.\n\nEn breve te atendemos 😊\n\nMientras tanto si querés podés consultar:\n• *Precios* — escribí "precios"\n• *Horarios* — escribí "horarios"\n• *Estado de tu orden* — escribí "orden"`
    );
  }
});

// ======================================
// FUNCIÓN PARA RESPONDER PRECIOS
// ======================================
async function responderPrecios(msg) {
  try {
    const r = await pool.query(
      `SELECT nombre, precio FROM servicios WHERE activo = true OR activo IS NULL ORDER BY precio ASC`
    );

    let lista = `🧺 *Lista de precios — Lavaderos Moreno*\n\n`;
    for (const s of r.rows) {
      lista += `• ${s.nombre}: *$${Number(s.precio).toLocaleString("es-AR")}*\n`;
    }
    lista += `\n📍 Hipólito Yrigoyen 1471, Moreno\n🕐 Lunes a Sábados de 9 a 18hs`;

    await msg.reply(lista);
  } catch (error) {
    console.error("Error obteniendo precios:", error);
    await msg.reply("Hola! 😊 En breve te pasamos los precios.");
  }
}

// ======================================
// API REST — ENVIAR MENSAJES DESDE EL BACKEND
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
    // Limpiar teléfono y agregar código de país Argentina
    let tel = telefono.replace(/\D/g, "");
    if (tel.startsWith("0")) tel = tel.slice(1);
    if (!tel.startsWith("54")) tel = "54" + tel;
    const chatId = `${tel}@c.us`;

    // Delay para parecer más humano
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

    await client.sendMessage(chatId, mensaje);
    console.log(`✅ Mensaje enviado a ${chatId}`);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error enviando mensaje:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/status", (req, res) => {
  res.json({ conectado: clientReady });
});

// ======================================
// INICIAR
// ======================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 API del bot corriendo en puerto ${PORT}`);
});

client.initialize();
