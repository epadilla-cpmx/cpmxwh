const express = require("express");
const router = express.Router();

const { findConversation } = require("../services/conversationFinder");
const { getConsentResult } = require("../services/consent");
const { updateConversation } = require("../services/conversationUpdater");
const { sendCurrentStep, advanceConversation } = require("../services/conversationEngine");
const { markMessageAsRead } = require("../services/evolution");

async function handler(req, res) {
  try {
    const data = req.body;

    console.log("Webhook recibido");
    console.log("Evento:", data.event);
    console.log("Instancia:", data.instance);

    if (data.event !== "messages.upsert") {
      console.log("Evento ignorado");
      return res.sendStatus(200);
    }

    const key = data.data?.key;

    if (key?.fromMe === true) {
      console.log("Mensaje enviado por nosotros. Ignorado.");
      return res.sendStatus(200);
    }

    const remoteJid = key?.remoteJid;

    if (!remoteJid) {
      console.log("No se encontró remoteJid.");
      return res.sendStatus(200);
    }

    if (remoteJid.endsWith("@g.us")) {
      console.log("Mensaje de grupo. Ignorado.");
      return res.sendStatus(200);
    }

    const message = data.data?.message;
    const text =
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      "";

    console.log("Número:", remoteJid);
    console.log("Mensaje:", text);

    if (!text) {
      console.log("Mensaje sin texto. Ignorado.");
      return res.sendStatus(200);
    }

    const candidatePhone =
      remoteJid.replace("@s.whatsapp.net", "");

    console.log("Buscando conversación para:", candidatePhone);

    const conversation = await findConversation(
      data.instance,
      candidatePhone
    );

    if (!conversation) {
      console.log("No se encontró una conversación activa.");
      return res.sendStatus(200);
    }

    console.log("Conversación encontrada:", conversation);

    if (key?.id) {
      try {
        await markMessageAsRead(
          data.instance,
          remoteJid,
          key.id
        );
        console.log("Mensaje marcado como leído.");
      } catch (error) {
        console.error(
          "No se pudo marcar como leído:",
          error.message
        );
      }
    }

    if (conversation.status === "waiting_start") {
      console.log("La conversación está esperando consentimiento.");

      const consent = getConsentResult(text);

      console.log("Resultado del consentimiento:", consent);

      if (consent === "accepted") {
        await updateConversation(
          conversation.conversationId,
          { currentStep: 0, status: "waiting_answer" }
        );

        const updatedConversation = {
          ...conversation,
          currentStep: 0,
          status: "waiting_answer"
        };

        console.log("Consentimiento aceptado.");

        await sendCurrentStep(updatedConversation);
        return res.sendStatus(200);
      }

      if (consent === "rejected") {
        await updateConversation(
          conversation.conversationId,
          { status: "cancelled" }
        );

        console.log("Entrevista cancelada por el candidato.");
        return res.sendStatus(200);
      }

      console.log(
        "Respuesta ambigua. No se modifica la conversación."
      );
      return res.sendStatus(200);
    }

    if (conversation.status === "waiting_answer") {
      console.log(
        "Procesando respuesta de la pregunta:",
        conversation.currentStep
      );

      await advanceConversation(
        conversation,
        text
      );

      return res.sendStatus(200);
    }

    console.log("Estado actual:", conversation.status);
    return res.sendStatus(200);

  } catch (error) {
    console.error("Error procesando webhook:");
    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}

router.post("/webhook", handler);
router.post("/webhook/messages-upsert", handler);

module.exports = router;
