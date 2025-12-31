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

**URL**: https://sqs.us-east-2.amazonaws.com/026008176803/events-queue

**Configuration**:

- Type: Standard (we dont need strict ordering)
- Visibility timeout: 30 seconds
- Message retention: 4 days
- Dead-letter queue: events-dlq (3 retries)

### `events-dlq` (Deal-Letter Queue)

**Purpose**: To captures messages that fail processing after 3 times. Check this queue periodically because messages here indicate bugs or bad data.
