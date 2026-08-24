const { findConversationById } = require("./conversationFinder");
const { updateConversation } = require("./conversationUpdater");
const { advanceConversation } = require("./conversationEngine");
const { hasBufferExpired, RESPONSE_BUFFER_MS } = require("./responseBuffer");

async function processConversationBuffer(conversationId, recruiterInstance) {
  const conversation = await findConversationById(conversationId);

  if (!conversation) return { processed: false, reason: "conversation_not_found" };
  if (conversation.recruiterInstance !== recruiterInstance) {
    return { processed: false, reason: "instance_mismatch" };
  }
  if (conversation.status !== "waiting_answer") return { processed: false, reason: "invalid_status" };
  if (!conversation.pendingResponse) return { processed: false, reason: "empty_buffer" };
  if (conversation.processing) return { processed: false, reason: "already_processing" };

  if (!hasBufferExpired(conversation.lastMessageAt)) {
    return {
      processed: false,
      reason: "buffer_not_expired",
      waitMs: RESPONSE_BUFFER_MS
    };
  }

  const answer = conversation.pendingResponse;

  await updateConversation(conversation.conversationId, {
    processing: true
  });

  try {
    await advanceConversation(conversation, answer);

    await updateConversation(conversation.conversationId, {
      pendingResponse: "",
      lastMessageAt: "",
      processing: false
    });

    return { processed: true };
  } catch (error) {
    await updateConversation(conversation.conversationId, {
      processing: false
    });
    throw error;
  }
}

module.exports = { processConversationBuffer };
