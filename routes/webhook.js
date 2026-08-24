const express = require("express");
const router = express.Router();

const { findConversation } = require("../services/conversationFinder");
const { getConsentResult } = require("../services/consent");
const { updateConversation } = require("../services/conversationUpdater");
const { sendCurrentStep } = require("../services/conversationEngine");
const { markMessageAsRead } = require("../services/evolution");
const { appendMessage } = require("../services/responseBuffer");

async function handler(req, res) {
  try {
    const data = req.body;

    console.log("Webhook recibido");
    console.log("Evento:", data.event);
    console.log("Instancia:", data.instance);

    if (data.event !== "messages.upsert") return res.sendStatus(200);

    const key = data.data?.key;
    if (key?.fromMe === true) return res.sendStatus(200);

    const remoteJid = key?.remoteJid;
    const messageId = key?.id;

    if (!remoteJid || remoteJid.endsWith("@g.us")) return res.sendStatus(200);

    const message = data.data?.message;
    const text = message?.conversation || message?.extendedTextMessage?.text || "";
    if (!text) return res.sendStatus(200);

    await markMessageAsRead(data.instance, remoteJid, messageId);

    const candidatePhone = remoteJid.replace("@s.whatsapp.net", "");
    const conversation = await findConversation(data.instance, candidatePhone);

    if (!conversation) {
      console.log("No se encontró una conversación activa.");
      return res.sendStatus(200);
    }

    if (conversation.status === "waiting_start") {
      const consent = getConsentResult(text);

      if (consent === "accepted") {
        await updateConversation(conversation.conversationId, {
          currentStep: 0,
          status: "waiting_answer",
          pendingResponse: "",
          lastMessageAt: "",
          processing: false,
          lastMessageId: messageId || ""
        });

        await sendCurrentStep({
          ...conversation,
          currentStep: 0,
          status: "waiting_answer"
        });

        return res.sendStatus(200);
      }

      if (consent === "rejected") {
        await updateConversation(conversation.conversationId, {
          status: "cancelled",
          pendingResponse: "",
          lastMessageAt: "",
          processing: false
        });
      }

      return res.sendStatus(200);
    }

    if (conversation.status === "waiting_answer") {
      console.log(
        "Agregando mensaje al buffer. Pregunta actual:",
        conversation.currentStep
      );

      await appendMessage(conversation, messageId, text);
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Error procesando webhook:", error);
    return res.status(500).json({ error: error.message });
  }
}

router.post("/webhook", handler);
router.post("/webhook/messages-upsert", handler);

module.exports = router;
