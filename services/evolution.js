const axios = require("axios");

async function sendMessage(number, text) {

  const response = await axios.post(
    `${process.env.EVOLUTION_URL}/message/sendText/${process.env.INSTANCE_NAME}`,
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