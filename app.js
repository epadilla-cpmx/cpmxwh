const express = require("express");

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

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});