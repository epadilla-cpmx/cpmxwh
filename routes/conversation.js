const express = require("express");
const router = express.Router();

const {
  getScript
} = require("../services/scriptLoader");

const {
  createConversation
} = require("../services/conversations");

const {
  enqueueMessage
} = require("../services/messageQueue");

const INITIAL_MESSAGE_DELAY_MS =
  Number(
    process.env.INITIAL_MESSAGE_DELAY_MS ||
    process.env.MESSAGE_DELAY_MS ||
    30000
  );

router.post("/conversation/start", async (req, res) => {
  try {
    const data = req.body;

    console.log("Solicitud de inicio de entrevista recibida:");
    console.log(JSON.stringify(data, null, 2));

    if (!data.recruiterInstance) {
      return res.status(400).json({ error: "Falta recruiterInstance" });
    }

    if (!data.scriptId) {
      return res.status(400).json({ error: "Falta scriptId" });
    }

    if (!data.candidates || !Array.isArray(data.candidates)) {
      return res.status(400).json({ error: "Falta candidates" });
    }

    if (data.candidates.length === 0) {
      return res.status(400).json({ error: "No hay candidatos para iniciar" });
    }

    console.log("Reclutador:", data.recruiterInstance);
    console.log("Guion:", data.scriptId);
    console.log("Vacante:", data.vacancy.name);
    console.log("Candidatos:", data.candidates.length);

    const conversations = [];
    const script = getScript(data.scriptId);

    console.log("Guion cargado:", script.id);
    console.log("Número de preguntas:", script.steps.length);

    for (let i = 0; i < data.candidates.length; i++) {
      const candidate = data.candidates[i];

      console.log("Creando conversación para:", candidate.name);

      const conversation = await createConversation({
        recruiterInstance: data.recruiterInstance,
        recruiterName: data.recruiterName,
        candidatePhone: candidate.phone,
        candidateName: candidate.name,
        vacancyId: data.vacancy.id,
        vacancyName: data.vacancy.name,
        scriptId: data.scriptId
      });

      // Se conserva el comportamiento anterior de 30 s entre candidatos,
      // pero sin mantener abierto el request de Cloud Run durante la espera.
      const scheduleDelayMs = INITIAL_MESSAGE_DELAY_MS * (i + 1);

      console.log(
        `Encolando mensaje inicial para ${candidate.name}; programado en ${scheduleDelayMs} ms.`
      );

      await enqueueMessage(
        {
          ...conversation,
          recruiterInstance: data.recruiterInstance,
          candidatePhone: candidate.phone,
          conversationId: conversation.conversationId
        },
        conversation.greeting,
        {
          scheduleDelayMs
        }
      );

      conversations.push(conversation);
      console.log("Conversación creada:", conversation);
    }

    res.status(200).json({
      success: true,
      message: "Conversaciones creadas correctamente",
      conversations
    });
  } catch (error) {
    console.error("Error en /conversation/start:");
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
