const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { enqueueCommercialProspects } = require("../services/commercialProspecting");

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

router.post("/commercial/prospect", async (req, res) => {
  const expectedKey = process.env.COMMERCIAL_API_KEY;
  const suppliedKey = req.get("x-commercial-api-key");

  if (!expectedKey) {
    console.error("COMMERCIAL_API_KEY no está configurada.");
    return res.status(503).json({ success: false, error: "Módulo comercial no configurado." });
  }
  if (!timingSafeEqualString(suppliedKey, expectedKey)) {
    return res.status(401).json({ success: false, error: "No autorizado." });
  }

  try {
    const result = await enqueueCommercialProspects(req.body || {});
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    console.error("Error en /commercial/prospect:", error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.publicMessage || "No se pudo encolar la prospección."
    });
  }
});

router.post("/internal/commercial-send", async (req, res) => {
  try {
    const { processCommercialTask } = require("../services/commercialProspecting");
    const result = await processCommercialTask(req.body || {});
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Error en /internal/commercial-send:", error.message);
    return res.status(500).json({ success: false, error: "Error procesando el envío comercial." });
  }
});

module.exports = router;
