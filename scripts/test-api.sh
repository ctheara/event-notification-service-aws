#!/bin/bash

# Test script for Event Notification API
# Usage: ./test-api.sh
# 
# Make sure to replace API_BASE_URL with your actual API Gateway URL

API_BASE_URL="https://i1v3hdqbd3.execute-api.us-east-2.amazonaws.com/dev"

echo "================================"
echo "Testing Event Notification API"
echo "================================"
echo ""

# Test 1: Valid event
echo "Test 1: Submit valid event"
echo "--------------------------"
curl -s -X POST "${API_BASE_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "deployment",
    "severity": "HIGH",
    "title": "API v2.1 deployed to production",
    "details": {
      "service": "user-api",
      "version": "2.1.0",
      "environment": "production"
    }
  }'

echo ""
echo ""

# Test 2: Invalid event (missing severity)
echo "Test 2: Invalid event (missing severity)"
echo "-----------------------------------------"
curl -s -X POST "${API_BASE_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "deployment",
    "title": "Missing severity field"
  }'

echo ""
echo ""

# Test 3: Invalid severity value
echo "Test 3: Invalid severity value"
echo "-------------------------------"
curl -s -X POST "${API_BASE_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "alert",
    "severity": "SUPER_HIGH",
    "title": "Invalid severity"
  }'

echo ""
echo ""

# Test 4: Different event types
echo "Test 4: Alert event"
echo "-------------------"
curl -s -X POST "${API_BASE_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "alert",
    "severity": "CRITICAL",
    "title": "Database connection pool exhausted",
    "details": {
      "database": "users-db",
      "activeConnections": 100,
      "maxConnections": 100
    }
  }'

echo ""
echo "================================"
echo "Tests complete!"
echo "================================"
