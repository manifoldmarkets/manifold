# Google Cloud Monitoring Quota Exhaustion: Analysis and Resolution

## Issue Summary

Your server was experiencing Google Cloud Monitoring quota exhaustion with the error:
> "Monitored resource has too many time series (custom metrics)."

This occurred because you hit the **200,000 active time series per monitored resource limit** in Google Cloud Monitoring.

## Root Cause Analysis

### The Problem: Unbounded Metric Cardinality

The issue was caused by using **dynamic, unique identifiers as metric labels**, which created an unbounded number of time series. Specifically:

1. **WebSocket Broadcast Metrics** (`ws/broadcasts_sent`):
   - Used `topic` as a label: `{ topic: "answer/OgARzqALOt/update" }`
   - Topics contained unique IDs (answer IDs, contract IDs, user IDs)
   - Each unique topic created a new time series
   - Example problematic topics:
     - `answer/OgARzqALOt/update` 
     - `contract/abc123/new-bet`
     - `user/user456/orders`
     - `private-user/user789`

2. **HTTP Request Metrics** (`http/request_count`, `http/request_latency`):
   - Used full `endpoint` paths as labels
   - Paths contained dynamic IDs like `/v0/user/123abc/portfolio`
   - Each unique endpoint path created a new time series

3. **PostgreSQL Metrics** (`pg/transaction_duration`, `pg/query_count`):
   - Used full SQL queries and endpoints with dynamic values
   - Each unique query/endpoint created a new time series

### Why It Started Working, Then Failed

- **Initially**: Few unique topics/endpoints → low time series count
- **Over time**: More users, contracts, answers → exponential growth in unique identifiers
- **Quota hit**: Once 200,000 active time series reached, GCP rejected new metrics
- **24-hour window**: Time series remain "active" for 24 hours after last write

## Google Cloud Monitoring Limits

- **Time series limit**: 200,000 active time series per monitored resource (GCE instance)
- **Active definition**: Written to within the past 24 hours
- **Cardinality formula**: Number of unique combinations of all label values
- **Non-customizable**: This is a hard system limit

## Fixes Applied

### 1. WebSocket Metrics (Fixed)
**Before**:
```typescript
metrics.inc('ws/broadcasts_sent', { topic })  // ❌ Unbounded
```

**After**:
```typescript
metrics.inc('ws/broadcasts_sent', { category: getTopicCategory(topic) })  // ✅ Bounded
```

- Added `getTopicCategory()` function to map topics to a small set of categories
- Categories: `answer`, `contract`, `user`, `private-user`, `global`, `post`, `other`
- Maximum 7 time series instead of unlimited

### 2. HTTP Request Metrics (Fixed)
**Before**:
```typescript
metrics.inc('http/request_count', { endpoint, baseEndpoint, method })  // ❌ endpoint unbounded
```

**After**:
```typescript
metrics.inc('http/request_count', { baseEndpoint, method })  // ✅ endpoint removed
```

- Removed the full `endpoint` path (which contained dynamic IDs)
- Kept `baseEndpoint` (normalized paths like `/user/*`)
- Significantly reduced cardinality

### 3. PostgreSQL Metrics (Fixed)
**Before**:
```typescript
metrics.push('pg/transaction_duration', duration, {
  endpoint: mctx.endpoint,  // ❌ Full endpoint with IDs
  query,                    // ❌ Full SQL with dynamic values
  successStr,
})
```

**After**:
```typescript
metrics.push('pg/transaction_duration', duration, {
  baseEndpoint: mctx.baseEndpoint,  // ✅ Normalized endpoint
  successStr,                       // ✅ Bounded success/failure
})
```

## Best Practices for Metrics Labels

### ✅ Good Label Values (Bounded)
- Status codes: `success`, `failure`
- Methods: `GET`, `POST`, `PUT`, `DELETE`
- Categories: `user`, `contract`, `answer`
- Regions: `us-east-1`, `europe-west1`
- Instance types: `read`, `write`

### ❌ Bad Label Values (Unbounded)
- User IDs: `user-123abc`
- Contract IDs: `contract-xyz789`
- Timestamps: `2024-01-15T10:30:00Z`
- IP addresses: `192.168.1.100`
- Full URLs: `/api/user/123/contract/456/bet`
- Complete SQL queries: `SELECT * FROM contracts WHERE id = 'abc123'`

### Guidelines
1. **Keep cardinality low**: Aim for < 1,000 unique combinations per metric
2. **Use categories**: Group dynamic values into bounded categories
3. **Avoid unique identifiers**: Never use UUIDs, timestamps, or user IDs directly
4. **Design upfront**: Consider cardinality impact when adding new metrics
5. **Monitor cardinality**: Use GCP Metrics Management page to track cardinality

## Monitoring and Prevention

### Monitor Cardinality
1. Go to GCP Console → Monitoring → Metrics Management
2. Look for metrics with high cardinality
3. Set up alerts for approaching 150,000 time series (75% of limit)

### Code Review Checklist
- [ ] Does this metric use dynamic IDs as labels?
- [ ] Could this metric create >1,000 unique time series?
- [ ] Are label values bounded to a small set?
- [ ] Could we use categories instead of raw values?

## Recovery Time

After deploying these fixes:
- **Immediate**: No new unbounded time series created
- **24 hours**: Old time series become inactive and stop counting toward limit
- **Full recovery**: Metric writing should resume normally within 24 hours

## Additional Resources

- [Google Cloud Monitoring Quotas](https://cloud.google.com/monitoring/quotas)
- [Time Series and Cardinality](https://cloud.google.com/monitoring/api/v3/metric-model#cardinality)
- [Best Practices for Custom Metrics](https://cloud.google.com/monitoring/custom-metrics/creating-metrics)