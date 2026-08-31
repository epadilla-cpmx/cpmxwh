require("dotenv").config();

const express = require("express");

const testRoute = require("./routes/test");
const webhookRoute = require("./routes/webhook");
const conversationRoute = require("./routes/conversation");
const internalSenderRoute = require("./routes/internalSender");

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

app.use("/", testRoute);
app.use("/", webhookRoute);
app.use("/", conversationRoute);
app.use("/", internalSenderRoute);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});