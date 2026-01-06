# Event Notification Service on AWS

An event-driven notification system built on AWS serverless architecture. Publishers submit events via REST API, and subscribers receive notifications through email or webhooks based on their filtering preferences.

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
```

## Features

- **Event Ingestion**: REST API accepts events with type, severity, and metadata
- **Subscription**: Subscribers register with filters for event type and severity
- **Multi-channel Delivery**: Notifications via email (SES) or webhook
- **Decoupled Processing**: SQS buffers events for reliable async processing
- **Error Handling**: Dead-letter queue captures failed messages for debugging

## AWS Services Used

| Service     | Purpose                                     |
| ----------- | ------------------------------------------- |
| API Gateway | REST API entry point                        |
| Lambda      | Serverless compute (3 functions)            |
| SQS         | Message queue + dead-letter queue           |
| DynamoDB    | Events, Subscriptions, Notifications tables |
| SES         | Email delivery                              |
| CloudWatch  | Logging and monitoring                      |
| IAM         | Least-privilege access control              |

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
