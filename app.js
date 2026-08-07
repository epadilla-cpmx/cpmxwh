require("dotenv").config();
console.log(process.env.EVOLUTION_URL);
console.log("SHEET ID:", process.env.JD_SHEETS_ID);

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Cloud Run funcionando correctamente");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "recruitment-engine",
    message: "Servidor activo"
  });
});

app.post("/send-message", async (req, res) => {

  try {

    const response = await axios.post(
      `${process.env.EVOLUTION_URL}/message/sendText/${process.env.INSTANCE_NAME}`,
      {
        number: req.body.number,
        text: req.body.text
      },
      {
        headers: {
          apikey: process.env.EVOLUTION_API_KEY
        }
      }
    );

    res.json({
      status: "mensaje enviado",
      evolution: response.data
    });

  } catch (error) {

    res.status(500).json({
      error: error.message,
      details: error.response?.data
    });

  }

});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});


const testRoute = require("./routes/test");
const webhookRoute = require("./routes/webhook");

app.use("/", testRoute);
app.use("/", webhookRoute);