const express = require("express");
const router = express.Router();

// Parte 1: endpoint preparado para recruitment-sender.
// Los envíos reales se conectarán en la Parte 2/3, después de validar
// la infraestructura de la cola y el estado de Motor.
router.post("/internal/process-sender", async (req, res) => {
  try {
    const payload = req.body || {};

    if (!payload.conversationId || !payload.recruiterInstance || !payload.candidatePhone || !payload.text) {
      return res.status(400).json({
        success: false,
        error: "Payload incompleto para recruitment-sender"
      });
    }

    console.log("Tarea de recruitment-sender recibida:", {
      conversationId: payload.conversationId,
      recruiterInstance: payload.recruiterInstance,
      queuedAt: payload.queuedAt
    });

    // No se envía ningún mensaje todavía. La conexión con Evolution
    // se implementará cuando pasemos el flujo normal a la cola.
    return res.status(200).json({
      success: true,
      prepared: true,
      message: "Tarea recibida; procesamiento de envío pendiente de activación."
    });
  } catch (error) {
    console.error("Error en /internal/process-sender:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
