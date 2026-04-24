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
- Horario: Lunes a Sábados de 9 a 18hs
- Alias MercadoPago: Lavaderos.moreno (a nombre de Correa Yamila Belen)

LISTA DE PRECIOS ACTUAL:
${listaPrecios}

PROMOCIONES VIGENTES:
- Acolchados y Frazadas 3x2: llevás 3 acolchados/frazadas (combinables entre sí) y pagás 2 (el más barato es gratis). Válido de Martes a Viernes.
- Camperones 3x2: llevás 3 camperones y pagás 2 (el más barato es gratis). Válido de Martes a Viernes.

INFORMACIÓN ADICIONAL SOBRE PRECIOS:
- Las frazadas tienen el mismo precio que los acolchados del mismo tamaño y tipo
- Las frazadas entran en la promo 3x2 junto con los acolchados (se pueden combinar)

SISTEMA DE PUNTOS DE FIDELIDAD:
- Por cada $1.000 gastados el cliente suma 1 punto
- Con 100 puntos acumulados: 10% de descuento en la próxima orden
- Con 200 puntos acumulados: 20% de descuento en la próxima orden
- Los puntos se acumulan automáticamente al retirar cada orden
- Hacemos retiros y envíos a domicilio. El cliente lo solicita desde la app Lavaderos Moreno (disponible en Google Play)
- La app permite ver el estado de las órdenes en tiempo real
- Para solicitar retiro o envío: abrir la app → Mis órdenes → Pedir retiro o Retiro y envío
- El costo del envío varía según la zona

INSTRUCCIONES PARA RESPONDER:
- Respondé siempre en español argentino, de forma amigable y cercana
- Usá "vos" en lugar de "tú"
- Sé conciso pero completo
- Si preguntan por precios, mostrá la lista completa
- Si preguntan por el estado de su orden, deciles que lo pueden ver desde la app
- No inventes información que no tenés
- No respondas consultas que no tengan que ver con el lavadero
- Usá emojis moderadamente para que sea más amigable
- Máximo 3-4 párrafos por respuesta`;
  } catch (err) {
    console.error("Error obteniendo contexto:", err.message);
    return "";
  }
}

// ======================================
// RESPONDER CON CLAUDE
// ======================================
async function responderConClaude(mensaje, nombreCliente) {
  try {
    const contexto = await obtenerContexto();
    const saludo = nombreCliente ? `El cliente se llama ${nombreCliente}.` : "";

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system: `${contexto}\n\n${saludo}`,
        messages: [{ role: "user", content: mensaje }]
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
// RESPUESTAS AUTOMÁTICAS A MENSAJES ENTRANTES
// ======================================
client.on("message", async (msg) => {
  if (msg.from.includes("@g.us")) return;
  if (msg.from.includes("@broadcast")) return;
  if (msg.from === "status@broadcast") return;
  if (msg.type === "e2e_notification") return;
  if (msg.type === "notification_template") return;
  if (msg.fromMe) return;
  const msgTime = msg.timestamp * 1000;
  if (msgTime < botStartTime) return;

  // Responder audios
  if (msg.type === "ptt" || msg.type === "audio") {
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    await msg.getChat().then(chat => chat.sendStateTyping());
    await new Promise(r => setTimeout(r, 1500));
    await msg.reply("Hola! 😊 Por el momento no podemos escuchar audios. Te pedimos que nos escribas tu consulta y te respondemos enseguida 🙏");
    return;
  }

  if (!msg.body || msg.body.trim() === "") return;

  // Buscar nombre del cliente en la BD por teléfono
  let nombreCliente = null;
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

  console.log(`Mensaje de ${nombreCliente || "desconocido"}: ${msg.body}`);

  // Delay para parecer más humano
  const delay = 2000 + Math.random() * 2000;
  await new Promise(r => setTimeout(r, delay));
  await client.sendPresenceAvailable();
  await msg.getChat().then(chat => chat.sendStateTyping());

  // Llamar a Claude para generar respuesta
  const respuesta = await responderConClaude(msg.body, nombreCliente);

  if (respuesta) {
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));
    await msg.reply(respuesta);
  } else {
    // Fallback si Claude falla
    const saludo = nombreCliente ? `Hola ${nombreCliente}!` : "Hola!";
    await msg.reply(`${saludo} 👋 Gracias por escribirnos. En breve te atendemos 😊`);
  }
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
    if (!isRegistered) {
      const telSin9 = tel.replace("549", "54");
      const chatId2 = `${telSin9}@c.us`;
      const isRegistered2 = await client.isRegisteredUser(chatId2);
      if (!isRegistered2) {
        return res.status(404).json({ error: "Numero no registrado en WhatsApp" });
      }
      await client.sendMessage(chatId2, mensaje);
    } else {
      await client.sendMessage(chatId, mensaje);
    }

    console.log(`Mensaje enviado a ${chatId}`);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error enviando mensaje:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/status", (req, res) => {
  res.json({ conectado: clientReady });
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
