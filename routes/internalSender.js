const express = require("express");
const router = express.Router();

const {
  processSenderTask
} = require("../services/messageQueue");

function getRetryAfterSeconds() {
  return Math.floor(Math.random() * 4) + 2;
}

router.post("/internal/process-sender", async (req, res) => {
  try {
    const payload = req.body || {};

    if (
      !payload.conversationId ||
      !payload.recruiterInstance ||
      !payload.candidatePhone ||
      !payload.text
    ) {
      return res.status(400).json({
        success: false,
        error: "Payload incompleto para recruitment-sender"
      });
    }

    const result = await processSenderTask(payload);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    if (
      error.code === "INSTANCE_BUSY" ||
      error.code === "QUEUE_TURN_NOT_READY"
    ) {
      const retryAfter = getRetryAfterSeconds();
      res.set("Retry-After", String(retryAfter));

      console.log(
        `Sender ocupado/no listo para ${req.body?.conversationId}. Reintento en ~${retryAfter}s.`
      );

      return res.status(429).json({
        success: false,
        retry: true,
        reason: error.code,
        retryAfter
      });
    }

    console.error("Error en /internal/process-sender:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
