const axios = require("axios");

async function sendMessage(instance, number, text) {

  const response = await axios.post(
    `${process.env.EVOLUTION_URL}/message/sendText/${instance}`,
    {
      number,
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