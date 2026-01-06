# Event Notification Service on AWS

An event-driven notification system built on AWS serverless architecture. Publishers submit events via REST API, and subscribers receive notifications through email or webhooks based on their filtering preferences. See the [AWS Setup Documentation](docs/aws-setup.md) for details.

## Architecture

```
Publisher
    │
    │ POST /events
    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐
│ API Gateway │──> │   Lambda    │───>│        SQS          │
└─────────────┘    │  (Ingest)   │    │   (events-queue)    │
                   └─────────────┘    └──────────┬──────────┘
                                                 │
                                                 ▼
            ┌──────────────────┐       ┌─────────────────────┐
            │     DynamoDB     │<──────│      Lambda         │
            │    (Events &     │       │    (Processor)      │
            │  Notifications)  │       │                     │
            └──────────────────┘       └─────────┬───────────┘
                                                 │
                                          ┌──────┴──────┐
                                          ▼             ▼
                                      ┌───────┐    ┌─────────┐
                                      │  SES  │    │ Webhook │
                                      │(Email)│    │  (HTTP) │
                                      └───────┘    └─────────┘

        ┌────────────┐     ┌──────────────┐
        │    DLQ     │────>│  CloudWatch  │────> Alert Email
        │ (failures) │     │    Alarm     │
        └────────────┘     └──────────────┘
```

## Features

- **Event Ingestion**: REST API accepts events with type, severity, and metadata
- **Subscription**: Subscribers register with filters for event type and severity
- **Multi-channel Delivery**: Notifications via email (SES) or webhook
- **Decoupled Processing**: SQS buffers events for reliable async processing
- **Error Handling**: Dead-letter queue captures failed messages for debugging

## AWS Services Used

| Service                                           | Purpose                                     |
| ------------------------------------------------- | ------------------------------------------- |
| [API Gateway](docs/aws-setup.md#api-gateway)      | REST API entry point with API key auth      |
| [Lambda](docs/aws-setup.md#lambda)                | Serverless compute (3 functions)            |
| [SQS](docs/aws-setup.md#sqs-queues)               | Message queue + dead-letter queue           |
| [DynamoDB](docs/aws-setup.md#dynamodb-table)      | Events, Subscriptions, Notifications tables |
| [SES](docs/aws-setup.md#ses-simple-email-service) | Email delivery for notifications            |
| SNS                                               | Broadcase alerts from CloudWatch alarm      |
| [CloudWatch](docs/aws-setup.md#cloudwatch-alarms) | Logging, monitoring and alerting            |
| [IAM](docs/aws-setup.md#iam-resources)            | Least-privilege access control              |

## API Endpoints

### POST /events

Submit a new event for processing.

```json
{
  "eventType": "deployment",
  "severity": "HIGH",
  "title": "API v2.1 deployed to production",
  "details": {
    "service": "user-api",
    "version": "2.1.0"
  }
}
```

### POST /subscriptions

Create a new subscription to receive notifications.

```json
{
  "eventType": "deployment",
  "severityFilter": "HIGH",
  "channel": "EMAIL",
  "target": "ops-team@company.com"
}
```
