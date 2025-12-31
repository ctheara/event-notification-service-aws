## IAM Resources

Purpose: Execution role for Ingest Lambda fucntion

**Attached Policies**:

1. `AWSLambdaBasicExecutionRole` (AWS managed)
   - Allow Lambda to create log groups and write logs to CloudWatch
2. `sqs-send-message-policy` (inline)
   - Allows Lambda to send messages to the events-queue
   - Limited to SendMessage action only

### Why These Permissions?

The Ingest Lamda only need to: Write logs (for debugging) and Send events to the queue. It does not need: read from SQS, access DynamoDB, or access to SES. Follows least privilage principle.

## SQS Queues

![SQS queues](../assets/sqs_queues.png)

### `events-queue` (Main Queue)

**Purpose**: To hold messages between the Ingest lambda from the Processor lambda. This prevents slow or unreliable downstream dependencies from blocking ingestion, buffers traffic spikes, and ensures messages are retried and processed asynchronously.

**URL**: https://sqs.us-east-2.amazonaws.com/026008176803/events-queue

**Configuration**:

- Type: Standard (we dont need strict ordering)
- Visibility timeout: 30 seconds
- Message retention: 4 days
- Dead-letter queue: events-dlq (3 retries)

### `events-dlq` (Deal-Letter Queue)

**Purpose**: To captures messages that fail processing after 3 times. Check this queue periodically because messages here indicate bugs or bad data.

## DynamoDB Table

![DynamoDB table](../assets/dynamodb_table.png)

## Events Table

This table will be used to store incoming events data.

**Table name**: `Events`  
**Partition key**: `eventId` (string)

**Attributes**:
| Name | Type | Description |
|------|------|-------------|
| eventId | String | Primary key, UUID format (evt_xxx) |
| eventType | String | Category (deployment, alert, etc.) |
| severity | String | LOW, MEDIUM, HIGH, CRITICAL |
| title | String | Brief description |
| details | Map | Arbitrary JSON metadata |
| receivedAt | String | ISO8601, when API received it |
| processedAt | String | ISO8601, when processor handled it |
| status | String | PENDING, PROCESSED, NOTIFIED |
