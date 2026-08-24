const buffers = new Map();

const RESPONSE_BUFFER_MS = Number(
  process.env.RESPONSE_BUFFER_MS || 11500
);

function addMessage(conversationId, messageId, text, onComplete) {
  let buffer = buffers.get(conversationId);

  if (!buffer) {
    buffer = {
      messages: [],
      messageIds: new Set(),
      timer: null,
      processing: false
    };
    buffers.set(conversationId, buffer);
  }

  if (messageId && buffer.messageIds.has(messageId)) {
    console.log("Mensaje duplicado ignorado:", messageId);
    return;
  }

  if (messageId) buffer.messageIds.add(messageId);
  buffer.messages.push(text);

  if (buffer.timer) clearTimeout(buffer.timer);

  buffer.timer = setTimeout(async () => {
    if (buffer.processing) return;
    buffer.processing = true;

    try {
      const combinedText = buffer.messages.join("\n");
      buffers.delete(conversationId);
      await onComplete(combinedText);
    } catch (error) {
      buffers.delete(conversationId);
      console.error("Error procesando buffer:", error);
    }
  }, RESPONSE_BUFFER_MS);
}

function clearBuffer(conversationId) {
  const buffer = buffers.get(conversationId);
  if (buffer?.timer) clearTimeout(buffer.timer);
  buffers.delete(conversationId);
}

module.exports = {
  addMessage,
  clearBuffer,
  RESPONSE_BUFFER_MS
};
