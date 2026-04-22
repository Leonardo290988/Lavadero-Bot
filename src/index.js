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
    await msg.reply("Hola! Por el momento no podemos escuchar audios. Te pedimos que nos escribas tu consulta y te respondemos enseguida.");
    return;
  }

  if (!msg.body || msg.body.trim() === "") return;

  const texto = msg.body.toLowerCase().trim();

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

  const nombre = nombreCliente || null;
  const saludo = nombre ? `Hola ${nombre}!` : "Hola!";

  console.log(`Mensaje de ${nombre || "desconocido"}: ${msg.body}`);

  const delay = 2000 + Math.random() * 2000;
  await new Promise(r => setTimeout(r, delay));
  await client.sendPresenceAvailable();
  await msg.getChat().then(chat => chat.sendStateTyping());
  await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));

  if (/precio|precios|cuanto|cuánto|vale|cuesta|tarifa/.test(texto)) {
    await responderPrecios(msg, saludo);
  } else if (/horario|horarios|abren|cierran|atienden|abierto|cuando/.test(texto)) {
    await msg.reply(`${saludo} \n\nAtendemos de *Lunes a Sabados de 9 a 18hs*\n\nEstamos en *Hipolito Yrigoyen 1471, Moreno*\n\nCualquier otra consulta escribinos!`);
  } else if (/orden|pedido|ropa|lista|listo|esta|estado|termino|termino|estuvo/.test(texto)) {
    await msg.reply(`${saludo} \n\nPara consultar el estado de tu orden podes hacerlo desde nuestra app\n\nBusca *Lavaderos Moreno* en Google Play, entra con tu numero de telefono y desde *Mis ordenes* podes ver el estado en tiempo real.\n\nCualquier consulta escribinos!`);
  } else if (/envios|envios|envio|envio|retiro|retiros|retirar|retiran|domicilio|delivery|mandan|llevan/.test(texto)) {
    await msg.reply(`${saludo} \n\nSi, hacemos retiros y envios a domicilio!\n\nPodes solicitarlo facilmente desde nuestra app *Lavaderos Moreno*\n\nDescargala en *Google Play*, ingresa con tu numero de telefono si ya sos cliente, o registrate en unos segundos. Luego selecciona tu orden y toca *Pedir retiro* o *Retiro y envio*.\n\nEl costo varia segun la zona. Cualquier consulta escribinos!`);
  } else if (/alias|mp|mercadopago|mercado pago|transferencia|pagar|pago/.test(texto)) {
    await msg.reply(`${saludo} \n\nPodes pagarnos por *MercadoPago* con el siguiente alias:\n\n*Lavaderos.moreno*\n_A nombre de Correa Yamila Belen_\n\nCualquier consulta escribinos!`);
  } else if (/hola|buenas|buen dia|buenas tardes|buenas noches|saludos/.test(texto)) {
    const hora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", hour12: false });
    const saludoHora = hora < 12 ? "Buenos dias" : hora < 20 ? "Buenas tardes" : "Buenas noches";
    await msg.reply(`${saludoHora}${nombre ? ` ${nombre}` : ""}! Bienvenido a *Lavaderos Moreno*.\n\nEn que te podemos ayudar? Podes preguntarnos por precios, horarios, el estado de tu orden, o cualquier otra consulta.`);
  } else if (/gracias|muchas gracias|grax/.test(texto)) {
    await msg.reply(`${saludo} Gracias a vos! Cualquier consulta que tengas no dudes en escribirnos. Hasta pronto!`);
  } else {
    await msg.reply(`${saludo} Gracias por escribirnos.\n\nEn breve te atendemos.\n\nMientras tanto si queres podes consultar:\n- *Precios* - escribi "precios"\n- *Horarios* - escribi "horarios"\n- *Estado de tu orden* - escribi "orden"\n- *Alias de pago* - escribi "alias"`);
  }
});

// ======================================
// FUNCIÓN PARA RESPONDER PRECIOS
// ======================================
async function responderPrecios(msg, saludo) {
  try {
    const r = await pool.query(`
      SELECT nombre, precio FROM servicios
      WHERE (activo = true OR activo IS NULL)
        AND nombre != 'Servicio Valet 1/2'
      ORDER BY
        CASE
          WHEN nombre = 'Servicio Valet' THEN 1
          WHEN nombre LIKE 'Acolchado%' THEN 2
          WHEN nombre LIKE 'Lavado Acolchado%' THEN 3
          ELSE 4
        END,
        precio ASC
    `);

    let lista = `${saludo}\n\nLista de precios - Lavaderos Moreno\n\n`;
    for (const s of r.rows) {
      lista += `- ${s.nombre}: *$${Number(s.precio).toLocaleString("es-AR")}*\n`;
    }
    lista += `\nHipolito Yrigoyen 1471, Moreno\nLunes a Sabados de 9 a 18hs`;

    await msg.reply(lista);
  } catch (error) {
    console.error("Error obteniendo precios:", error);
    await msg.reply(`${saludo} En breve te pasamos los precios.`);
  }
}

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
