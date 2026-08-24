const axios = require("axios");

const {
  normalizePhone
} = require("./phone");


async function sendMessage(instance, number, text) {

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

  return response.data;
}


module.exports = {
  sendMessage
};