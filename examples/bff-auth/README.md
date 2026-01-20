# Backend for Frontend (BFF) Authentication

This example implements the [Backend for Frontend (BFF) authentication pattern](https://zuplo.com/blog/backend-for-frontend-authentication), which optimizes security and user experience for web applications by keeping tokens server-side and using secure HTTP-only cookies for session management.

Instead of exposing access tokens to the browser, the BFF pattern stores tokens securely on the server and uses session cookies to identify users. This protects against XSS attacks and token theft.

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).
- An Auth0 account (or another OAuth identity provider)
- An Upstash Redis account for session storage

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli):

```bash
npx create-zuplo-api@latest --example bff-auth
```

Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## Environment Variables

Set these in your `.env` file locally or in the Zuplo Portal under **Settings > Environment Variables**:

```text
# Auth0 Configuration
# Create a Regular Web Application in Auth0
# https://auth0.com/docs/get-started/auth0-overview/create-applications/regular-web-apps
AUTH0_URL=your-tenant.us.auth0.com
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret

# Upstash Redis Configuration
# Create a Redis database at https://upstash.com
UPSTASH_URL=https://your-redis.upstash.io
UPSTASH_TOKEN=your_upstash_token
```

## How It Works

### Authentication Flow

```text
┌──────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Browser │────>│  Zuplo  │────>│  Auth0  │────>│ Upstash │
│          │<────│   BFF   │<────│         │<────│  Redis  │
└──────────┘     └─────────┘     └─────────┘     └─────────┘
```

1. **Login**: User visits `/auth/login`, gets redirected to Auth0
2. **Callback**: Auth0 redirects to `/auth/callback` with authorization code
3. **Token Exchange**: BFF exchanges code for tokens with Auth0
4. **Session Storage**: Tokens stored in Upstash Redis with session ID
5. **Cookie**: Session ID returned to browser as HTTP-only cookie
6. **API Calls**: Frontend calls `/bff/token` to get access token for API requests

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `/auth/login` | Redirects user to Auth0 login page |
| `/auth/callback` | OAuth callback - exchanges code for tokens |
| `/auth/logout` | Clears session and cookie |
| `/bff/token` | Returns access token for authenticated requests |
| `/bff/sessioninfo` | Returns user profile information |
| `/app` | Sample protected application page |

### Security Features

- **HTTP-only cookies**: Session cookies cannot be accessed by JavaScript
- **Secure flag**: Cookies only sent over HTTPS
- **SameSite=Strict**: Prevents CSRF attacks
- **Server-side token storage**: Access tokens never exposed to browser
- **Token refresh**: Automatic refresh using refresh tokens

## Project Structure

```text
├── config/
│   └── routes.oas.json      # Route definitions
├── modules/
│   └── bff.ts               # BFF authentication handlers
└── docs/
    └── ...                  # Documentation portal
```

## Testing the Flow

1. Start the dev server:

```bash
npm run dev
```

2. Open your browser to `http://localhost:9000/auth/login`

3. Log in with Auth0

4. After redirect, check the session info:

```bash
curl http://localhost:9000/bff/sessioninfo \
  -H "Cookie: app-session=YOUR_SESSION_ID"
```

5. Get an access token for API calls:

```bash
curl http://localhost:9000/bff/token \
  -H "Cookie: app-session=YOUR_SESSION_ID"
```

## Frontend Integration

Your frontend can use the BFF endpoints to manage authentication:

```javascript
// Check if user is logged in
async function getSessionInfo() {
  const response = await fetch('/bff/sessioninfo', {
    credentials: 'include'  // Include cookies
  });
  if (response.status === 401) {
    // Redirect to login
    window.location.href = '/auth/login';
    return null;
  }
  return response.json();
}

// Get access token for API calls
async function getAccessToken() {
  const response = await fetch('/bff/token', {
    credentials: 'include'
  });
  const data = await response.json();
  return data.access_token;
}

// Make authenticated API call
async function callProtectedApi() {
  const token = await getAccessToken();
  return fetch('https://api.example.com/data', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
}
```

## Common Customizations

- **Different identity provider**: Update the OAuth URLs and token exchange logic
- **Different session storage**: Replace Upstash with Redis, DynamoDB, or another store
- **Add claims to session**: Store additional user data from the identity provider
- **Customize cookie settings**: Adjust expiration, domain, or path as needed

## Learn More

- [Backend for Frontend Authentication Blog Post](https://zuplo.com/blog/backend-for-frontend-authentication)
- [Auth0 Regular Web Application Setup](https://auth0.com/docs/get-started/auth0-overview/create-applications/regular-web-apps)
- [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted)
- [OAuth 2.0 BFF Draft Spec](https://www.ietf.org/archive/id/draft-bertocci-oauth2-tmi-bff-01.html)
