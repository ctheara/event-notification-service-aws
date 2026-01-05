/**
 * Subscription Lambda
 *
 * Handles creation of notification subscriptions.
 * Subscribers specify what events they care about and how to notify them.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

// DocumentClient simplifies working with JSON - no need to specify types
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const VALID_CHANNELS = ["EMAIL", "WEBHOOK"];

/**
 * Generate unique subscription ID
 * Format: sub_<timestamp>_<random>
 */
function generateSubscriptionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sub_${timestamp}_${random}`;
}

/**
 * Basic email validation
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Basic URL validation for webhooks
 */
function isValidWebhookUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate subscription payload
 * Returns { valid: boolean, errors: string[] }
 */
function validateSubscription(body) {
  const errors = [];

  if (!body.eventType || typeof body.eventType !== "string") {
    errors.push("eventType is required and must be a string");
  }

  if (!body.severityFilter || typeof body.severityFilter !== "string") {
    errors.push("severityFilter is required and must be a string");
  } else if (!VALID_SEVERITIES.includes(body.severityFilter.toUpperCase())) {
    errors.push(
      `severityFilter must be one of: ${VALID_SEVERITIES.join(", ")}`
    );
  }

  if (!body.channel || typeof body.channel !== "string") {
    errors.push("channel is required and must be a string");
  } else if (!VALID_CHANNELS.includes(body.channel.toUpperCase())) {
    errors.push(`channel must be one of: ${VALID_CHANNELS.join(", ")}`);
  }

  if (!body.target || typeof body.target !== "string") {
    errors.push("target is required and must be a string");
  } else if (body.channel) {
    const channel = body.channel.toUpperCase();
    if (channel === "EMAIL" && !isValidEmail(body.target)) {
      errors.push("target must be a valid email address for EMAIL channel");
    } else if (channel === "WEBHOOK" && !isValidWebhookUrl(body.target)) {
      errors.push("target must be a valid HTTP/HTTPS URL for WEBHOOK channel");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Build HTTP response
 */
function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body),
  };
}

/**
 * Main handler
 */
exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch (parseError) {
    console.error("Failed to parse request body:", parseError);
    return buildResponse(400, {
      error: "Invalid JSON in request body",
    });
  }

  const validation = validateSubscription(body);
  if (!validation.valid) {
    console.log("Validation failed:", validation.errors);
    return buildResponse(400, {
      error: "Validation failed",
      details: validation.errors,
    });
  }

  // Build subscription record
  const subscriptionId = generateSubscriptionId();
  const subscription = {
    subscriptionId,
    eventType: body.eventType.toLowerCase(),
    severityFilter: body.severityFilter.toUpperCase(),
    channel: body.channel.toUpperCase(),
    target: body.target,
    active: true,
    createdAt: new Date().toISOString(),
  };

  // Store in DynamoDB
  try {
    await docClient.send(
      new PutCommand({
        TableName: process.env.SUBSCRIPTIONS_TABLE,
        Item: subscription,
      })
    );

    console.log("Subscription created:", subscriptionId);

    return buildResponse(201, {
      subscriptionId,
      status: "active",
      message: "Subscription created successfully",
    });
  } catch (dbError) {
    console.error("Failed to store subscription:", dbError);
    return buildResponse(500, {
      error: "Failed to create subscription",
      message: "Please try again later",
    });
  }
};
