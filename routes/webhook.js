const express = require("express");
const router = express.Router();

async function handler(req, res) {

  try {

    const data = req.body;

    console.log("Webhook recibido");
    console.log("Evento:", data.event);
    console.log("Instancia:", data.instance);

    // 1. Solo nos interesan mensajes nuevos
    if (data.event !== "messages.upsert") {

      console.log("Evento ignorado");

      return res.sendStatus(200);
    }

    // 2. Extraer información del mensaje
    const key = data.data?.key;

    // 3. Ignorar mensajes enviados por nosotros
    if (key?.fromMe === true) {

      console.log("Mensaje enviado por nosotros. Ignorado.");

      return res.sendStatus(200);
    }

    // 4. Identificar el número que envió el mensaje
    const remoteJid = key?.remoteJid;

    // 5. Ignorar mensajes provenientes de grupos
    if (remoteJid?.endsWith("@g.us")) {

      console.log("Mensaje de grupo. Ignorado.");

      return res.sendStatus(200);
    }

    // 6. Extraer el texto
    const message = data.data?.message;

    const text =
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      "";

    console.log("Número:", remoteJid);
    console.log("Mensaje:", text);

    // 7. Si no encontramos número o texto, ignoramos
    if (!remoteJid || !text) {

      console.log("No se encontró número o texto.");

      return res.sendStatus(200);
    }

    // 8. Aquí posteriormente procesaremos la respuesta
    // de acuerdo con la conversación correspondiente.

    // Respondemos inmediatamente a Evolution
    return res.sendStatus(200);

  } catch (error) {

    console.error("Error procesando webhook:");
    console.error(error);

    return res.status(500).json({
      error: error.message
    });

  }

}

router.post("/webhook", handler);

router.post("/webhook/messages-upsert", handler);

module.exports = router;