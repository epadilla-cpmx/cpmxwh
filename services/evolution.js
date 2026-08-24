const axios = require("axios");
const { normalizePhone } = require("./phone");
const { isWithinSendingHours } = require("./schedule");

const headers = { apikey: process.env.EVOLUTION_API_KEY };

async function sendMessage(instance, number, text, options = {}) {
  if (!isWithinSendingHours()) {
    console.log("Mensaje bloqueado: fuera del horario de envío.");
    return { sent: false, reason: "outside_sending_hours" };
  }

  const normalizedNumber = normalizePhone(number);
  const body = { number: normalizedNumber, text };

  if (options.delayMs) body.delay = options.delayMs;
  if (options.presence) body.presence = options.presence;

  const response = await axios.post(
    `${process.env.EVOLUTION_URL}/message/sendText/${instance}`,
    body,
    { headers }
  );

  console.log("Mensaje enviado correctamente.");
  return { sent: true, data: response.data };
}

async function markMessageAsRead(instance, remoteJid, messageId) {
  if (!remoteJid || !messageId) {
    console.log("No se pudo marcar como leído: faltan remoteJid o messageId.");
    return { marked: false, reason: "missing_message_data" };
  }

  try {
    const response = await axios.post(
      `${process.env.EVOLUTION_URL}/chat/markMessageAsRead/${instance}`,
      {
        readMessages: [{ remoteJid, id: messageId, fromMe: false }]
      },
      { headers }
    );

    console.log("Mensaje marcado como leído.");
    return { marked: true, data: response.data };
  } catch (error) {
    console.error("No se pudo marcar como leído:", error.response?.data || error.message);
    return { marked: false, reason: "evolution_error" };
  }
}

module.exports = { sendMessage, markMessageAsRead };
