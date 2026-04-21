const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
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
let qrActual = null;

client.on("qr", async (qr) => {
  console.log("📱 Escanea este QR con WhatsApp:");
  qrcode.generate(qr, { small: true });
  qrActual = qr;
});

let botStartTime = Date.now();

client.on("ready", () => {
  console.log("✅ Bot de WhatsApp conectado y listo!");
  clientReady = true;
  qrActual = null;
  botStartTime = Date.now(); // Registrar hora de inicio
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
  // Ignorar estados y broadcasts
  if (msg.from.includes("@broadcast")) return;
  if (msg.from === "status@broadcast") return;
  if (msg.type === "e2e_notification") return;
  if (msg.type === "notification_template") return;
  // Ignorar mensajes propios
  if (msg.fromMe) return;
  // Ignorar mensajes vacíos o sin texto
  if (!msg.body || msg.body.trim() === "") return;
  // Ignorar mensajes anteriores al inicio del bot
  const msgTime = msg.timestamp * 1000;
  if (msgTime < botStartTime) return;

  const texto = msg.body.toLowerCase().trim();

  // Responder audios
  if (msg.type === "ptt" || msg.type === "audio") {
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    await msg.getChat().then(chat => chat.sendStateTyping());
    await new Promise(r => setTimeout(r, 1500));
    await msg.reply("Hola! 😊 Por el momento no podemos escuchar audios. Te pedimos que nos escribas tu consulta y te respondemos enseguida 🙏");
    return;
  }

  // Buscar nombre del cliente en la BD por teléfono
  let nombreCliente = null;
  try {
    // Obtener el número real del contacto
    const contact = await msg.getContact();
    const telReal = contact.number || "";
    const ultimos10 = telReal.slice(-10);
    console.log(`🔍 Contacto: ${contact.number} → últimos 10: ${ultimos10}`);
    
    if (ultimos10.length >= 8) {
      const r = await pool.query(`
        SELECT nombre FROM clientes
        WHERE REGEXP_REPLACE(telefono, '[^0-9]', '', 'g') LIKE $1
        LIMIT 1
      `, [`%${ultimos10}%`]);
      console.log(`🔍 Resultado: ${JSON.stringify(r.rows)}`);
      if (r.rows.length > 0) {
        nombreCliente = r.rows[0].nombre.split(" ")[0];
      }
    }
  } catch (e) {
    console.error("Error buscando cliente:", e.message);
  }

  const nombre = nombreCliente || "cliente";
  console.log(`📨 Mensaje de ${nombre}: ${msg.body}`);

  // Delay para parecer más humano (2-4 segundos)
  const delay = 2000 + Math.random() * 2000;
  await new Promise(r => setTimeout(r, delay));

  // Indicador "escribiendo..."
  await client.sendPresenceAvailable();
  await msg.getChat().then(chat => chat.sendStateTyping());
  await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));

  // Detectar palabras clave
  if (/precio|precios|cuánto|cuanto|vale|cuesta|tarifa/.test(texto)) {
    await responderPrecios(msg, nombre);
  } else if (/horario|horarios|abren|cierran|atienden|abierto|cuando/.test(texto)) {
    await msg.reply(
      `Hola ${nombre}! 😊\n\nAtendemos de *Lunes a Sábados de 9 a 18hs* 🕐\n\nEstamos en *Hipólito Yrigoyen 1471, Moreno* 📍\n\nCualquier otra consulta escribinos!`
    );
  } else if (/orden|pedido|ropa|lista|listo|está|lista|estado|retir|terminó|termino|estuvo/.test(texto)) {
    await msg.reply(
      `Hola ${nombre}! 👋\n\nPara consultar el estado de tu orden podés hacerlo desde nuestra app 📱\n\nBuscá *Lavaderos Moreno* en Google Play, entrá con tu número de teléfono y desde *Mis órdenes* podés ver el estado en tiempo real.\n\n¡Cualquier consulta escribinos! 😊`
    );
  } else if (/envío|envio|domicilio|delivery|mandan|llevan/.test(texto)) {
    await msg.reply(
      `Hola ${nombre}! 🚚\n\nSí, hacemos envíos a domicilio! Podés solicitarlo desde nuestra app 📱\n\nBuscá *Lavaderos Moreno* en Google Play, entrá desde *Mis órdenes* y seleccioná *Solicitar envío a domicilio*.\n\nEl costo varía según la zona. Cualquier consulta escribinos! 😊`
    );
  } else if (/alias|mp|mercadopago|mercado pago|transferencia|pagar|pago/.test(texto)) {
    await msg.reply(
      `Hola ${nombre}! 💳\n\nPodés pagarnos por *MercadoPago* con el siguiente alias:\n\n*Lavaderos.moreno*\n_A nombre de Correa Yamila Belen_\n\nCualquier consulta escribinos! 😊`
    );
  } else if (/hola|buenas|buen dia|buenas tardes|buenas noches|saludos/.test(texto)) {
    const hora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", hour12: false });
    const saludo = hora < 12 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches";
    await msg.reply(
      `${saludo} ${nombre}! 😊 Bienvenido a *Lavaderos Moreno*.\n\n¿En qué te podemos ayudar? Podés preguntarnos por precios, horarios, el estado de tu orden, o cualquier otra consulta 🧺`
    );
  } else {
    await msg.reply(
      `Hola ${nombre}! 👋 Gracias por escribirnos.\n\nEn breve te atendemos 😊\n\nMientras tanto si querés podés consultar:\n• *Precios* — escribí "precios"\n• *Horarios* — escribí "horarios"\n• *Estado de tu orden* — escribí "orden"\n• *Alias de pago* — escribí "alias"`
    );
  }
});

// ======================================
// FUNCIÓN PARA RESPONDER PRECIOS
// ======================================
async function responderPrecios(msg, nombre) {
  try {
    const r = await pool.query(
      `SELECT nombre, precio FROM servicios WHERE activo = true OR activo IS NULL ORDER BY precio ASC`
    );

    let lista = `Hola ${nombre}! 😊\n\n🧺 *Lista de precios — Lavaderos Moreno*\n\n`;
    for (const s of r.rows) {
      lista += `• ${s.nombre}: *$${Number(s.precio).toLocaleString("es-AR")}*\n`;
    }
    lista += `\n📍 Hipólito Yrigoyen 1471, Moreno\n🕐 Lunes a Sábados de 9 a 18hs`;

    await msg.reply(lista);
  } catch (error) {
    console.error("Error obteniendo precios:", error);
    await msg.reply(`Hola ${nombre}! 😊 En breve te pasamos los precios.`);
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
    if (tel.startsWith("9")) tel = "54" + tel; // ya tiene 9 de celular
    if (!tel.startsWith("54")) tel = "549" + tel; // agregar 54 + 9 (celulares Argentina)
    const chatId = `${tel}@c.us`;

    // Delay para parecer más humano
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

    // Verificar que el número existe en WhatsApp
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      // Probar sin el 9
      const telSin9 = tel.replace("549", "54");
      const chatId2 = `${telSin9}@c.us`;
      const isRegistered2 = await client.isRegisteredUser(chatId2);
      if (!isRegistered2) {
        console.log(`Número no registrado en WhatsApp: ${chatId}`);
        return res.status(404).json({ error: "Número no registrado en WhatsApp" });
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
    return res.send("<h2>✅ Bot ya está conectado!</h2>");
  }
  if (!qrActual) {
    return res.send("<h2>⏳ Esperando QR... recargá la página en unos segundos</h2>");
  }
  try {
    const qrImage = await QRCode.toDataURL(qrActual);
    res.send(`
      <html>
        <body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:40px">
          <h2>📱 Escanea este QR con WhatsApp</h2>
          <p>Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
          <img src="${qrImage}" style="width:300px;height:300px"/>
          <p style="color:gray;font-size:12px">El QR expira en 20 segundos. Si expira, recargá la página.</p>
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
  console.log(`🚀 API del bot corriendo en puerto ${PORT}`);
});

client.initialize();
