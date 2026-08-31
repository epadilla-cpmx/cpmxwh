const { google } = require("googleapis");
const { updateConversation } = require("./conversationUpdater");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/cloud-tasks"]
});

const SENDER_QUEUE = process.env.SENDER_QUEUE || "recruitment-sender";
const SENDER_QUEUE_LOCATION = process.env.SENDER_QUEUE_LOCATION || process.env.CLOUD_TASKS_LOCATION;
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL;
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;

function validateConfig() {
  const missing = [];
  if (!PROJECT_ID) missing.push("GOOGLE_CLOUD_PROJECT");
  if (!SENDER_QUEUE_LOCATION) missing.push("SENDER_QUEUE_LOCATION");
  if (!CLOUD_RUN_URL) missing.push("CLOUD_RUN_URL");
  if (!SERVICE_ACCOUNT_EMAIL) missing.push("GOOGLE_CLIENT_EMAIL");
  if (missing.length) {
    throw new Error(`Faltan variables de recruitment-sender: ${missing.join(", ")}`);
  }
}

async function enqueueMessage(conversation, text, options = {}) {
  if (!conversation?.conversationId) throw new Error("Falta conversationId para encolar mensaje.");
  if (!conversation?.recruiterInstance) throw new Error("Falta recruiterInstance para encolar mensaje.");
  if (!conversation?.candidatePhone) throw new Error("Falta candidatePhone para encolar mensaje.");
  if (!text) throw new Error("No se puede encolar un mensaje vacío.");

  validateConfig();

  const queuedAt = new Date().toISOString();
  await updateConversation(conversation.conversationId, {
    sending: false,
    sendQueuedAt: queuedAt
  });

  const client = await auth.getClient();
  const queuePath = `projects/${PROJECT_ID}/locations/${SENDER_QUEUE_LOCATION}/queues/${SENDER_QUEUE}`;
  const targetUrl = `${CLOUD_RUN_URL.replace(/\/$/, "")}/internal/process-sender`;

  const payload = {
    conversationId: conversation.conversationId,
    recruiterInstance: conversation.recruiterInstance,
    candidatePhone: conversation.candidatePhone,
    text,
    presence: options.presence || "composing",
    queuedAt
  };

  await client.request({
    url: `https://cloudtasks.googleapis.com/v2/${queuePath}/tasks`,
    method: "POST",
    data: {
      task: {
        httpRequest: {
          httpMethod: "POST",
          url: targetUrl,
          headers: { "Content-Type": "application/json" },
          body: Buffer.from(JSON.stringify(payload)).toString("base64"),
          oidcToken: {
            serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
            audience: CLOUD_RUN_URL
          }
        }
      }
    }
  });

  console.log(`Mensaje encolado en ${SENDER_QUEUE}: ${conversation.conversationId} (${conversation.recruiterInstance})`);
  return { queued: true, queuedAt };
}

module.exports = { enqueueMessage };
