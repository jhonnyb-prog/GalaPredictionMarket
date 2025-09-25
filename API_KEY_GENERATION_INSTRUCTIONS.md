# GalaMarket API Key Generation Instructions

## Overview

GalaMarket provides a secure public API system that allows developers, bots, and market makers to interact programmatically with the prediction market platform. To use this API, you need to generate API keys through the admin interface.

## Prerequisites

- **Admin Access**: Only administrators can generate API keys for users
- **User Account**: The user who will use the API key must have a registered account
- **Admin Login**: You must be logged in as an admin user

## Step 1: Enable Admin Mode (Development Only)

⚠️ **Note**: Admin toggle is only available in development mode for security reasons.

1. **Login to GalaMarket**: Navigate to your GalaMarket instance and log in with your user account
2. **Enable Admin Mode**: 
   - Use the developer console or API to send a POST request to `/api/auth/admin-toggle`
   - Body: `{"enable": true}`
   - This grants admin privileges for the current session

## Step 2: Generate API Key

### Via API (Recommended)

Use the following endpoint to create a new API key:

**Endpoint**: `POST /api/admin/apikeys`

**Headers**:
```
Content-Type: application/json
Cookie: sessionId=<your-session-cookie>
```

**Request Body**:
```json
{
  "userId": "user-uuid-here",
  "label": "Bot Trading Key",
  "scopes": ["read", "trade"],
  "rateLimitTier": 1,
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

**Parameters**:
- `userId` (required): UUID of the user who will own this API key
- `label` (required): Human-readable description (1-100 characters)
- `scopes` (required): Array of permissions. Options:
  - `"read"`: Read market data, account balances, positions
  - `"trade"`: Place orders, cancel orders
  - `"admin"`: Administrative operations (use carefully)
- `rateLimitTier` (optional): Rate limit tier (1-10, default: 1)
  - 1 = 60 requests/minute (Basic)
  - 2 = 300 requests/minute (Premium)
  - 3 = 1000 requests/minute (Enterprise)
- `expiresAt` (optional): ISO date string when key expires

**Example Success Response**:
```json
{
  "success": true,
  "apiKey": {
    "id": "ak_1234567890abcdef",
    "userId": "user-uuid-here",
    "label": "Bot Trading Key",
    "scopes": ["read", "trade"],
    "status": "active",
    "rateLimitTier": 1,
    "expiresAt": "2024-12-31T23:59:59.000Z",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "signingSecret": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678901234567890abcdef1234567890abcdef1234567890abcdef123456"
  },
  "message": "API key created successfully. Please save the signing secret as it will not be shown again."
}
```

⚠️ **IMPORTANT**: The `signingSecret` is only displayed once during creation. Save it securely - you cannot retrieve it later!

## Step 3: Provide Credentials to Developer

Give the developer both pieces of information:

1. **API Key ID**: `ak_1234567890abcdef` (used in `X-API-Key` header)
2. **Signing Secret**: `a1b2c3d4e5f6...` (used for HMAC signatures)

## API Key Management

### List API Keys for a User
```
GET /api/admin/apikeys?userId=USER_UUID
```

### Update API Key
```
PATCH /api/admin/apikeys/:keyId
```
Body: `{"status": "suspended", "label": "Updated Label"}`

### Delete API Key
```
DELETE /api/admin/apikeys/:keyId
```

## For Developers: Using the API Keys

### 1. Read-Only Operations (GET requests)

For read-only operations, developers only need the API Key ID:

```javascript
const response = await fetch('https://your-domain.com/public/v1/markets', {
  headers: {
    'X-API-Key': 'ak_1234567890abcdef'
  }
});
```

### 2. Write Operations (POST, PUT, DELETE)

Write operations require HMAC-SHA256 signatures:

```javascript
import crypto from 'crypto';

const apiKeyId = 'ak_1234567890abcdef';
const signingSecret = 'a1b2c3d4e5f6...';
const timestamp = Math.floor(Date.now() / 1000);

// Create order example
const orderData = {
  marketId: 'market-uuid',
  type: 'market',
  side: 'buy',
  outcome: 'yes',
  amount: '100.00'
};

// Create HMAC signature
const method = 'POST';
const path = '/public/v1/orders';
const body = JSON.stringify(orderData);
const message = `${method}${path}${body}${timestamp}`;

const signature = crypto
  .createHmac('sha256', signingSecret)
  .update(message)
  .digest('hex');

// Make authenticated request
const response = await fetch('https://your-domain.com/public/v1/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKeyId,
    'X-Timestamp': timestamp.toString(),
    'X-Signature': signature
  },
  body: body
});
```

## Security Best Practices

1. **Store Safely**: Keep signing secrets in environment variables or secure key storage
2. **Rotate Regularly**: Generate new API keys periodically and delete old ones
3. **Minimal Scopes**: Only grant necessary permissions (read vs trade vs admin)
4. **Monitor Usage**: Check API key usage through the admin interface
5. **Expiration**: Set reasonable expiration dates for API keys
6. **Revoke Immediately**: Suspend or delete compromised API keys immediately

## Rate Limits

- **Tier 1** (Basic): 60 requests/minute
- **Tier 2** (Premium): 300 requests/minute  
- **Tier 3** (Enterprise): 1000 requests/minute

Exceeding rate limits returns a `429 Too Many Requests` response.

## API Documentation

Full API documentation is available at:
- **Interactive Docs**: `https://your-domain.com/docs/api`
- **OpenAPI Spec**: `https://your-domain.com/public/v1/openapi.json`

## Troubleshooting

### Common Issues:

1. **"Invalid API key"**: Check that the API Key ID is correct and the key is active
2. **"HMAC signature verification failed"**: Verify timestamp, signature calculation, and signing secret
3. **"Insufficient scope"**: Ensure the API key has required permissions for the operation
4. **"Rate limit exceeded"**: Wait for rate limit window to reset or upgrade tier

### Getting Help:

- Check the API documentation for endpoint details
- Verify HMAC signature calculation matches the expected format
- Ensure timestamps are within the 5-minute window
- Contact your system administrator for API key issues

---

**Security Warning**: Never share API keys or signing secrets in public repositories, chat messages, or insecure locations. Treat them like passwords.