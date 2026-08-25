const { findConversationById } = require("./conversationFinder");
const { updateConversation } = require("./conversationUpdater");
const { advanceConversation } = require("./conversationEngine");
const { hasBufferExpired, RESPONSE_BUFFER_MS } = require("./responseBuffer");

async function processConversationBuffer(
  conversationId,
  recruiterInstance,
  scheduledLastMessageAt
) {
  const conversation = await findConversationById(conversationId);

  if (!conversation) return { processed: false, reason: "conversation_not_found" };

  if (conversation.recruiterInstance !== recruiterInstance) {
    return { processed: false, reason: "instance_mismatch" };
  }

  if (conversation.status !== "waiting_answer") {
    return { processed: false, reason: "invalid_status" };
  }

  if (!conversation.pendingResponse) {
    return { processed: false, reason: "empty_buffer" };
  }

  // Cada mensaje programa una tarea. Una tarea antigua no debe procesar
  // el buffer si posteriormente llegó otro mensaje.
  if (
    scheduledLastMessageAt &&
    conversation.lastMessageAt !== scheduledLastMessageAt
  ) {
    return { processed: false, reason: "stale_task" };
  }

  if (conversation.processing) {
    return { processed: false, reason: "already_processing" };
  }

  if (!hasBufferExpired(conversation.lastMessageAt)) {
    return {
      processed: false,
      reason: "buffer_not_expired",
      waitMs: RESPONSE_BUFFER_MS
    };
  }

  const answer = conversation.pendingResponse;
  const processingTimestamp = conversation.lastMessageAt;

  // Lock persistente. Si otro proceso llega después, verá processing=true.
  await updateConversation(conversation.conversationId, {
    processing: true
  });

  try {
    // Volvemos a leer antes de guardar/procesar para evitar trabajar con
    // datos que hayan cambiado durante el procesamiento.
    const latestConversation = await findConversationById(conversationId);

    if (!latestConversation) {
      return { processed: false, reason: "conversation_not_found_after_lock" };
    }

    if (latestConversation.processing !== true) {
      return { processed: false, reason: "processing_lock_lost" };
    }

    if (latestConversation.lastMessageAt !== processingTimestamp) {
      await updateConversation(conversation.conversationId, {
        processing: false
      });
      return { processed: false, reason: "new_message_arrived" };
    }

    if (!latestConversation.pendingResponse) {
      await updateConversation(conversation.conversationId, {
        processing: false
      });
      return { processed: false, reason: "buffer_empty_after_lock" };
    }

    await advanceConversation(latestConversation, latestConversation.pendingResponse);

    // Solo limpiamos el buffer si sigue siendo el mismo lote que procesamos.
    const finalConversation = await findConversationById(conversationId);

    if (
      finalConversation &&
      finalConversation.lastMessageAt === processingTimestamp
    ) {
      await updateConversation(conversation.conversationId, {
        pendingResponse: "",
        lastMessageAt: "",
        processing: false
      });
    }

    return { processed: true };
  } catch (error) {
    await updateConversation(conversation.conversationId, {
      processing: false
    });
    throw error;
  }
}

module.exports = { processConversationBuffer };
