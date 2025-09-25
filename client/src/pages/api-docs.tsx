import { useEffect } from 'react';

export default function ApiDocs() {
  useEffect(() => {
    // Set page title for SEO
    document.title = 'API Documentation - Gala 8Ball';
    
    // Add meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Comprehensive API documentation for Gala 8Ball prediction market platform. Learn how to integrate bots and market makers with our REST API.');
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = 'Comprehensive API documentation for Gala 8Ball prediction market platform. Learn how to integrate bots and market makers with our REST API.';
      document.getElementsByTagName('head')[0].appendChild(meta);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4" data-testid="text-title">
            API Documentation
          </h1>
          <p className="text-lg text-muted-foreground mb-6">
            Comprehensive REST API for bots and market makers to interact with the Gala 8Ball prediction market platform.
          </p>
          
          {/* Quick Start Guide */}
          <div className="bg-card border rounded-lg p-6 mb-8">
            <h2 className="text-2xl font-semibold mb-4">Quick Start</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">1. Get an API Key</h3>
                <p className="text-sm text-muted-foreground">
                  Contact our support team to obtain API keys for your application. Keys are provided in the format: <code className="bg-muted px-1 rounded">keyId.secret</code>
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">2. Authentication</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Include only your API key ID in the <code className="bg-muted px-1 rounded">X-API-Key</code> header (never send the secret):
                </p>
                <div className="bg-muted p-3 rounded text-sm font-mono">
                  curl -H "X-API-Key: your-key-id" https://gala8ball.com/public/v1/markets
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">3. HMAC Signature (for write operations)</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Write operations require HMAC-SHA256 signatures. Include these headers:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <code className="bg-muted px-1 rounded">X-Timestamp</code>: Unix timestamp in seconds</li>
                  <li>• <code className="bg-muted px-1 rounded">X-Signature</code>: HMAC-SHA256 of method+path+body+timestamp</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">4. Rate Limits</h3>
                <p className="text-sm text-muted-foreground">
                  Rate limits are enforced per API key. Check the <code className="bg-muted px-1 rounded">X-RateLimit-*</code> headers in responses for current usage.
                </p>
              </div>
            </div>
          </div>

          {/* Example Code */}
          <div className="bg-card border rounded-lg p-6 mb-8">
            <h2 className="text-2xl font-semibold mb-4">Example Code</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">JavaScript/Node.js</h3>
                <div className="bg-muted p-4 rounded text-sm font-mono overflow-x-auto">
                  <pre>{`const crypto = require('crypto');

// Simple GET request (keyId only)
async function getMarkets() {
  const response = await fetch('/public/v1/markets', {
    headers: {
      'X-API-Key': 'your-key-id'
    }
  });
  return response.json();
}

// POST request with HMAC (keyId + secret for signing)
async function createOrder(keyId, signingSecret, orderData) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(orderData);
  const message = \`POST/public/v1/orders\${body}\${timestamp}\`;
  const signature = crypto
    .createHmac('sha256', signingSecret)
    .update(message)
    .digest('hex');
  
  const response = await fetch('/public/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': keyId,  // Only keyId in header
      'X-Timestamp': timestamp.toString(),
      'X-Signature': signature
    },
    body
  });
  return response.json();
}`}</pre>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">Python</h3>
                <div className="bg-muted p-4 rounded text-sm font-mono overflow-x-auto">
                  <pre>{`import hmac
import hashlib
import time
import json
import requests

class Gala8BallAPI:
    def __init__(self, key_id, signing_secret):
        self.key_id = key_id
        self.signing_secret = signing_secret
        self.base_url = '/public/v1'
    
    def get_markets(self):
        headers = {'X-API-Key': self.key_id}  # Only keyId in header
        response = requests.get(f"{self.base_url}/markets", headers=headers)
        return response.json()
    
    def create_order(self, order_data):
        timestamp = int(time.time())
        body = json.dumps(order_data)
        message = f"POST/public/v1/orders{body}{timestamp}"
        signature = hmac.new(
            self.signing_secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': self.key_id,  # Only keyId in header
            'X-Timestamp': str(timestamp),
            'X-Signature': signature
        }
        
        response = requests.post(f"{self.base_url}/orders", 
                               headers=headers, 
                               data=body)
        return response.json()`}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Swagger UI Container */}
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="p-4 border-b bg-muted/30">
            <h2 className="text-xl font-semibold">Interactive API Explorer</h2>
            <p className="text-sm text-muted-foreground">
              Explore and test all available endpoints using the interactive documentation below.
            </p>
          </div>
          
          <div id="swagger-ui" className="min-h-screen">
            {/* Swagger UI will be rendered here */}
          </div>
        </div>
      </div>

      {/* Load Swagger UI from CDN */}
      <div 
        dangerouslySetInnerHTML={{
          __html: `
            <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
            <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
            <script>
              window.onload = function() {
                const ui = SwaggerUIBundle({
                  url: '/public/v1/openapi.json',
                  dom_id: '#swagger-ui',
                  deepLinking: true,
                  presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIBundle.presets.standalone
                  ],
                  plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                  ],
                  layout: "StandaloneLayout",
                  tryItOutEnabled: true,
                  requestInterceptor: function(request) {
                    // Add default headers
                    request.headers['Accept'] = 'application/json';
                    return request;
                  },
                  onComplete: function() {
                    // Add custom styling
                    const style = document.createElement('style');
                    style.textContent = \`
                      .swagger-ui .topbar { display: none; }
                      .swagger-ui { font-family: inherit; }
                      .swagger-ui .info { margin: 0; }
                    \`;
                    document.head.appendChild(style);
                  }
                });
              }
            </script>
          `
        }}
      />
    </div>
  );
}