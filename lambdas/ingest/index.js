/**
 * Ingest Lambda
 *
 * Receives events from API Gateway, validates them, and sends to SQS.
 * Returns immediately with 202 Accepted - processing happens asynchronously.
 */

const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

// Initialize SQS client outside handler for connection reuse
const sqsClient = new SQSClient({});
const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Generate a unique event ID
 * Format: evt_<timestamp>_<random>
 */
function generateEventId() {
  const timestamp = Date.now().toString(36); // Base36 for shorter string
  const random = Math.random().toString(36).substring(2, 8);
  return `evt_${timestamp}_${random}`;
}

/**
 * Validate the incoming event payload
 * Returns { valid: boolean, errors: string[] }
 */
function validateEvent(body) {
  const errors = [];

  // Required fields
  if (!body.eventType || typeof body.eventType !== "string") {
    errors.push("eventType is required and must be a string");
  }

  if (!body.severity || typeof body.severity !== "string") {
    errors.push("severity is required and must be a string");
  } else if (!VALID_SEVERITIES.includes(body.severity.toUpperCase())) {
    errors.push(`severity must be one of: ${VALID_SEVERITIES.join(", ")}`);
  }

  if (!body.title || typeof body.title !== "string") {
    errors.push("title is required and must be a string");
  }

  // Optional: details must be an object if provided
  if (body.details !== undefined && typeof body.details !== "object") {
    errors.push("details must be an object if provided");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Build HTTP response object
 */
function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // CORS headers - needed if calling from browser
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body),
  };
}

/**
 * Main Lambda handler
 *
 * @param {object} event - API Gateway event object
 * @returns {object} - API Gateway response object
 */
exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  let body;
  try {
    // API Gateway may send body as string or object depending on config
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch (parseError) {
    console.error("Failed to parse request body:", parseError);
    return buildResponse(400, {
      error: "Invalid JSON in request body",
    });
  }

  // Validate the payload
  const validation = validateEvent(body);
  if (!validation.valid) {
    console.log("Validation failed:", validation.errors);
    return buildResponse(400, {
      error: "Validation failed",
      details: validation.errors,
    });
  }

  // Build the event object
  const eventId = generateEventId();
  const eventMessage = {
    eventId,
    eventType: body.eventType.toLowerCase(),
    severity: body.severity.toUpperCase(),
    title: body.title,
    details: body.details || {},
    receivedAt: new Date().toISOString(),
    status: "PENDING",
  };

  // Send to SQS
  try {
    const command = new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify(eventMessage),
    });

    const result = await sqsClient.send(command);
    console.log("Message sent to SQS:", result.MessageId);

    // Return 202 Accepted - indicates message is queued for processing
    return buildResponse(202, {
      eventId,
      status: "accepted",
      message: "Event queued for processing",
    });
  } catch (sqsError) {
    console.error("Failed to send to SQS:", sqsError);

    // Return 500 for internal errors
    return buildResponse(500, {
      error: "Failed to queue event",
      message: "Please try again later",
    });
  }
};
