/**
 * Processor Lambda
 *
 * Triggered by SQS - processes events and sends notifications.
 * This is the core of the pub/sub system where events meet subscriptions.
 *
 * Flow:
 * 1. Receive event from SQS
 * 2. Store event in Events table
 * 3. Find matching subscriptions
 * 4. Send notifications via appropriate channel
 * 5. Record notification results
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const sesClient = new SESClient({});

// Severity levels in order (for threshold comparison)
// Index matters: LOW=0, MEDIUM=1, HIGH=2, CRITICAL=3
const SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Check if event severity meets subscription threshold
 *
 * @param {string} eventSeverity - The event's severity
 * @param {string} filterSeverity - Subscriber's minimum threshold
 * @returns {boolean} - True if event meets threshold
 */
function meetsSeverityThreshold(eventSeverity, filterSeverity) {
  const eventLevel = SEVERITY_LEVELS.indexOf(eventSeverity);
  const filterLevel = SEVERITY_LEVELS.indexOf(filterSeverity);

  return eventLevel >= filterLevel;
}

/**
 * Store the event in DynamoDB Events table
 */
async function storeEvent(event) {
  const item = {
    ...event,
    processedAt: new Date().toISOString(),
    status: "PROCESSED",
  };

  await docClient.send(
    new PutCommand({
      TableName: process.env.EVENTS_TABLE,
      Item: item,
    })
  );

  console.log(`Event stored: ${event.eventId}`);
  return item;
}

/**
 * Find all active subscriptions for this event type
 * Uses the GSI for efficient lookup
 */
async function findMatchingSubscriptions(eventType) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.SUBSCRIPTIONS_TABLE,
      IndexName: "eventType-index",
      KeyConditionExpression: "eventType = :et",
      FilterExpression: "active = :active",
      ExpressionAttributeValues: {
        ":et": eventType,
        ":active": true,
      },
    })
  );

  console.log(
    `Found ${
      result.Items?.length || 0
    } subscriptions for eventType: ${eventType}`
  );
  return result.Items || [];
}

/**
 * Send email notification via SES
 */
async function sendEmailNotification(subscription, event) {
  const emailParams = {
    Source: process.env.FROM_EMAIL,
    Destination: {
      ToAddresses: [subscription.target],
    },
    Message: {
      Subject: {
        Data: `[${event.severity}] ${event.eventType}: ${event.title}`,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: `
            <h2>Event Notification</h2>
            <p><strong>Type:</strong> ${event.eventType}</p>
            <p><strong>Severity:</strong> ${event.severity}</p>
            <p><strong>Title:</strong> ${event.title}</p>
            <p><strong>Time:</strong> ${event.receivedAt}</p>
            ${
              event.details
                ? `<p><strong>Details:</strong></p><pre>${JSON.stringify(
                    event.details,
                    null,
                    2
                  )}</pre>`
                : ""
            }
            <hr>
            <p><small>Subscription ID: ${
              subscription.subscriptionId
            }</small></p>
        `,
          Charset: "UTF-8",
        },
        Text: {
          Data: `
            Event Notification
            ------------------
            Type: ${event.eventType}
            Severity: ${event.severity}
            Title: ${event.title}
            Time: ${event.receivedAt}
            ${event.details ? `Details: ${JSON.stringify(event.details)}` : ""}

            Subscription ID: ${subscription.subscriptionId}
                                `,
          Charset: "UTF-8",
        },
      },
    },
  };

  await sesClient.send(new SendEmailCommand(emailParams));
  console.log(`Email sent to ${subscription.target}`);
}

/**
 * Send webhook notification via HTTP POST
 */
async function sendWebhookNotification(subscription, event) {
  const payload = {
    eventId: event.eventId,
    eventType: event.eventType,
    severity: event.severity,
    title: event.title,
    details: event.details,
    receivedAt: event.receivedAt,
    subscriptionId: subscription.subscriptionId,
  };

  const response = await fetch(subscription.target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Event-Type": event.eventType,
      "X-Event-Id": event.eventId,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Webhook failed: ${response.status} ${response.statusText}`
    );
  }

  console.log(`Webhook sent to ${subscription.target}`);
}

/**
 * Record notification attempt in Notifications table
 */
async function recordNotification(
  eventId,
  subscription,
  status,
  errorMessage = null
) {
  const item = {
    eventId,
    subscriptionId: subscription.subscriptionId,
    channel: subscription.channel,
    target: subscription.target,
    status,
    attemptedAt: new Date().toISOString(),
  };

  if (errorMessage) {
    item.errorMessage = errorMessage;
  }

  await docClient.send(
    new PutCommand({
      TableName: process.env.NOTIFICATIONS_TABLE,
      Item: item,
    })
  );
}

/**
 * Process a single event - find subscribers and notify them
 */
async function processEvent(event) {
  console.log(`Processing event: ${event.eventId}`);

  await storeEvent(event);

  const subscriptions = await findMatchingSubscriptions(event.eventType);

  // Filter by severity and process each matching subscription
  let notificationCount = 0;

  for (const subscription of subscriptions) {
    if (!meetsSeverityThreshold(event.severity, subscription.severityFilter)) {
      console.log(
        `Skipping ${subscription.subscriptionId}: severity ${event.severity} below threshold ${subscription.severityFilter}`
      );
      continue;
    }

    try {
      if (subscription.channel === "EMAIL") {
        await sendEmailNotification(subscription, event);
      } else if (subscription.channel === "WEBHOOK") {
        await sendWebhookNotification(subscription, event);
      }

      await recordNotification(event.eventId, subscription, "SENT");
      notificationCount++;
    } catch (notifyError) {
      console.error(
        `Failed to notify ${subscription.subscriptionId}:`,
        notifyError
      );

      // Record failure (but don't throw - continue with other subscriptions)
      await recordNotification(
        event.eventId,
        subscription,
        "FAILED",
        notifyError.message
      );
    }
  }

  console.log(
    `Event ${event.eventId}: sent ${notificationCount} notifications`
  );
  return notificationCount;
}

/**
 * Main handler - triggered by SQS
 */
exports.handler = async (sqsEvent) => {
  console.log(`Received ${sqsEvent.Records.length} messages from SQS`);

  // Process each message in the batch
  for (const record of sqsEvent.Records) {
    try {
      const event = JSON.parse(record.body);

      await processEvent(event);
    } catch (error) {
      console.error("Failed to process message:", error);
      console.error("Message body:", record.body);

      // SQS will retry based on redrive policy, then send to DLQ
      throw error;
    }
  }

  console.log("All messages processed successfully");
  return { statusCode: 200 };
};
