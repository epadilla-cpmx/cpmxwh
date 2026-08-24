const axios = require("axios");

const {
  normalizePhone
} = require("./phone");

const {
  isWithinSendingHours
} = require("./schedule");


async function sendMessage(instance, number, text) {

  if (!isWithinSendingHours()) {
    console.log("Mensaje bloqueado: fuera del horario de envío.");
    return {
      sent: false,
      reason: "outside_sending_hours"
    };
  }

  const normalizedNumber =
    normalizePhone(number);

  const response = await axios.post(
    `${process.env.EVOLUTION_URL}/message/sendText/${instance}`,
    {
      number: normalizedNumber,
      text
    },
    {
      headers: {
        apikey: process.env.EVOLUTION_API_KEY
      }
    }
  );

  console.log("Mensaje enviado correctamente.");

  return {
    sent: true,
    data: response.data
  };
}


async function markMessageAsRead(
  instance,
  remoteJid,
  messageId
) {

  const response = await axios.post(
    `${process.env.EVOLUTION_URL}/chat/markMessageAsRead/${instance}`,
    {
      readMessages: [
        {
          remoteJid,
          id: messageId
        }
      ]
    },
    {
      headers: {
        apikey: process.env.EVOLUTION_API_KEY
      }
    }
  );

  return response.data;
}


async function sendPresence(
  instance,
  number,
  presence,
  delayMs = 0
) {

  const response = await axios.post(
    `${process.env.EVOLUTION_URL}/chat/sendPresence/${instance}`,
    {
      number,
      delay: delayMs,
      presence
    },
    {
      headers: {
        apikey: process.env.EVOLUTION_API_KEY
      }
    }
  );

  return response.data;
}


module.exports = {
  sendMessage,
  markMessageAsRead,
  sendPresence
};
