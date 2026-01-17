# Ghost Keycloak Bridge

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Keycloak](https://img.shields.io/badge/Keycloak-OIDC-current?style=for-the-badge&logo=keycloak&logoColor=white)](https://www.keycloak.org/)
[![Ghost](https://img.shields.io/badge/Ghost-%3E%3D5.0.0-738A94?style=for-the-badge&logo=ghost&logoColor=white)](https://ghost.org/)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/Astocanthus/ghost-keycloak-bridge.svg)](https://github.com/Astocanthus/ghost-keycloak-bridge/issues)

A seamless **SSO (Single Sign-On)** integration between **Keycloak** and self-hosted **Ghost** blogs.

Unlike standard proxies, this bridge creates native Ghost sessions using "Cookie Forgery", allowing users to log in via Keycloak and be recognized as fully authenticated members in Ghost (allowing access to premium content, comments, and newsletters).

## Features

- **True SSO Experience** - Users log in via Keycloak and land on Ghost fully authenticated.
- **Auto-Provisioning** - Automatically creates Ghost members upon first login.
- **Self-Healing Sync** - Uses immutable Keycloak IDs (`sub`) to track users. If a user changes their email in Keycloak, it updates in Ghost automatically without creating duplicates.
- **Native Session Support** - Generates valid `ghost-members-ssr` cookies signed with Ghost's RSA key.
- **Secure & Rootless** - Docker container runs as non-root user (Node 22 Alpine).
- **Lightweight** - <50MB Docker image.

## Architecture

This bridge works by "spoofing" the Ghost authentication process. Since both services share the same root domain, the bridge can set a secure cookie that Ghost accepts.

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Nginx
    participant Bridge
    participant Keycloak
    participant Ghost

    User->>Browser: Click "Login"
    Browser->>Nginx: GET /auth/login
    Nginx->>Bridge: Proxy Request
    Bridge->>Keycloak: Redirect to OIDC Auth
    Keycloak-->>User: Auth Prompt
    User->>Keycloak: Credentials
    Keycloak->>Browser: Redirect to /auth/callback?code=...
    Browser->>Bridge: GET /callback (with code)
    Bridge->>Ghost: Admin API: Find/Create Member
    Bridge->>Bridge: Sign JWT (RS256) with Ghost Private Key
    Bridge->>Browser: Set Cookie: ghost-members-ssr
    Bridge->>Browser: Redirect to Blog Home
    Browser->>Ghost: GET / (with Cookie)
    Ghost-->>User: "Welcome back, Member!"
```

## Quick Start

### Prerequisites

- **Ghost (Self-hosted)**: Admin access to the database.
- **Keycloak**: A realm and a client configured.
- **Domain**: Ghost and this Bridge must share the same root domain (e.g., `blog.example.com` and `blog.example.com/auth/`).

### Installation via Docker Compose

Add the bridge service to your existing stack:

```yaml
version: '3'
services:
  ghost-bridge:
    image: ghcr.io/astocanthus/ghost-keycloak-bridge:latest
    container_name: ghost-bridge
    restart: always
    environment:
      - PORT=3000
      - BLOG_PUBLIC_URL=https://blog.example.com
      - COOKIE_DOMAIN=.example.com
      - GHOST_INTERNAL_URL=http://ghost:2368
      - KEYCLOAK_ISSUER=https://auth.example.com/realms/myrealm
      - KEYCLOAK_ID=ghost-bridge
      - KEYCLOAK_SECRET=your_client_secret
      - CALLBACK_URL=https://blog.example.com/auth/callback
      - GHOST_ADMIN_API_KEY=your_admin_api_key
      - GHOST_PRIVATE_KEY=${GHOST_PRIVATE_KEY}
    depends_on:
      - ghost
```

## Configuration

### 1. Extracting the Private Key (Crucial)

Ghost uses an RSA key pair to sign member sessions. You must extract the Private Key from your Ghost database to allow the bridge to sign valid cookies.

If using MySQL/MariaDB:

```sql
SELECT value FROM settings WHERE key = 'members_private_key';
```

Copy the entire string including `-----BEGIN RSA PRIVATE KEY-----`.

### 2. Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `BLOG_PUBLIC_URL` | Public URL of your blog | `https://blog.example.com` |
| `COOKIE_DOMAIN` | Root domain for cookie sharing (Must start with dot) | `.example.com` |
| `CALLBACK_URL` | Where Keycloak redirects back | `https://blog.example.com/auth/callback` |
| `GHOST_INTERNAL_URL` | Docker network URL to reach Ghost | `http://ghost:2368` |
| `GHOST_ADMIN_API_KEY` | Integration Admin Key | `65a...:82b...` |
| `GHOST_PRIVATE_KEY` | The RSA key found in DB | `-----BEGIN...` |

### 3. Nginx Configuration

You need to map the `/auth/` path to this container.

```nginx
server {
    server_name blog.example.com;

    # Bridge for Authentication
    location /auth/ {
        proxy_pass http://ghost-bridge:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme; # Important for OIDC
    }

    # Ghost Blog
    location / {
        proxy_pass http://ghost:2368;
        # ... standard ghost headers
    }
}
```

## How It Works

### User Synchronization

Instead of relying on emails (which change), this bridge uses Ghost Labels to store the immutable Keycloak User ID.

1. **Login**: Bridge extracts `sub` (UUID) from Keycloak token.
2. **Lookup**: Checks Ghost for a member with label `kc-id-<UUID>`.
3. **Sync**:
   - If found: Updates email/name in Ghost if they changed in Keycloak.
   - If not found: Creates a new member and assigns the label.

### Security

- **Cookie Scope**: Cookies are set with `HttpOnly` and `Secure` flags.
- **Validation**: Ghost validates the JWT signature using its public key. Since we use the correct private key, Ghost accepts the session.

## Development

### Local Setup

```bash
# Clone the repository
git clone https://github.com/Astocanthus/ghost-keycloak-bridge.git
cd ghost-keycloak-bridge

# Install dependencies
npm install

# Create .env file based on example
cp .env.example .env

# Run in dev mode
npm run dev
```

## Troubleshooting

**"Mismatching URL" error:**
Ensure your Nginx config sends `X-Forwarded-Proto $scheme`. The bridge needs to know it's running behind HTTPS.

**User is redirected but not logged in:**
Check the `COOKIE_DOMAIN`. It must encompass the blog's domain. If your blog is `blog.site.com`, the domain should be `.site.com` or `.blog.site.com`.

**Ghost Private Key format:**
Ensure newlines are preserved. In Docker Compose, you can pass the key as a single line string where newlines are replaced by `\n`.

## License

This project is open source and available under the [MIT License](https://opensource.org/licenses/MIT).

## Author

**Benjamin Romeo** - DevOps & Infrastructure Architect

- GitHub: [@Astocanthus](https://github.com/Astocanthus)
- LinkedIn: [Benjamin Romeo](https://www.linkedin.com/in/benjamin-romeo-1a533093/)

## Acknowledgments

- Built for [Ghost](https://ghost.org/)
- Built for the [Low-layer Codermug](https://codermug.low-layer.com) Infrastructure.
