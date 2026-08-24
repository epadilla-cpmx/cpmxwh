const express = require("express");
const router = express.Router();
const {
  findConversation
} = require("../services/conversationFinder");


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

   const candidatePhone =
  remoteJid.replace("@s.whatsapp.net", "");

console.log(
  "Buscando conversación para:",
  candidatePhone
);

const conversation =
  await findConversation(
    data.instance,
    candidatePhone
  );

if (!conversation) {

  console.log(
    "No se encontró una conversación activa."
  );

  return res.sendStatus(200);
}

console.log(
  "Conversación encontrada:",
  conversation
);


// --------------------------------------------------
// PROCESAR ESTADO ACTUAL
// --------------------------------------------------

if (conversation.status === "waiting_start") {

  console.log(
    "La conversación está esperando consentimiento."
  );

  console.log(
    "Respuesta recibida:",
    text
  );

  // Por ahora solamente registramos
  // la respuesta para depurar.
  // La lógica de consentimiento vendrá después.

  return res.sendStatus(200);
}


// --------------------------------------------------
// OTROS ESTADOS
// --------------------------------------------------

console.log(
  "Estado actual:",
  conversation.status
);

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