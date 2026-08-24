const axios = require("axios");

const {
  normalizePhone
} = require("./phone");

const {
  isWithinSendingHours
} = require("./schedule");


async function sendMessage(instance, number, text) {

  if (!isWithinSendingHours()) {

    console.log(
      "Mensaje bloqueado: fuera del horario de envío."
    );

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

  console.log(
    "Mensaje enviado correctamente."
  );

  return {
    sent: true,
    data: response.data
  };
}


module.exports = {
  sendMessage
};
