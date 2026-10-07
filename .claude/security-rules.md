# Security Rules — Reference

> Zero tolerance on PII and secrets. These rules apply at every layer.

---

## PII — Never Hardcode

**Never hardcode PII** (phone numbers, emails, names, real user IDs) in source code. Use `''` or a placeholder.

Applies to:
- `useState` defaults
- Mock data and test fixtures
- Mongoose schema defaults
- Controller/service examples
- Seeder scripts
- Documentation examples

```typescript
// ✅
const [phone, setPhone] = useState('');
const testPhone = '+91XXXXXXXXXX';

// ❌
const [phone, setPhone] = useState('+910000000000');
const testPhone = '+910000000000';  // real number hardcoded
```

---

## Secrets — Never in Source

- No secrets in `.env` files committed to git — use `.env.example` with placeholders only
- All secrets via `getSecret()` (Azure Key Vault) or `EnvService` — never raw `process.env` for sensitive values
- `process.env` is only acceptable for bootstrap-time values: `PORT`, `NODE_ENV`, `OTEL_*`
- Never log: tokens, OTPs, passwords, API keys, JWT secrets, PII

```typescript
// ✅ Key Vault / EnvService
const jwtSecret = await getSecret('JWT_SECRET');

// ❌ Direct env access for secrets
const jwtSecret = process.env.JWT_SECRET;
```

---

## Input Validation

- Validate all `req.body`, `req.query`, `req.params` at the controller boundary — before any DB or service call
- Body size limit: configure `bodyParser.json({ limit: '10kb' })` in index/main
- Phone numbers: validate `+91[6-9]\d{9}` server-side before any DB write (for India-facing services)
- NestJS projects: use `class-validator` DTOs with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`

---

## JWT

- **Minimal payload** — never embed full DB documents in JWT
- Standard claims only: `sub`/`userId`, `email`, `scope`/`profileState`, `client`, `iat`, `exp`
- Never add fields to JWT payload without an explicit auth migration plan
- Tokens verified server-side (not just decoded) — `verifyIdToken()` for Firebase, `verifyToken()` for custom JWT

```typescript
// ✅ Minimal
const token = await generateToken({ userId, email, profileState, client: '<your-app-name>' });

// ❌ Full document
const token = await generateToken({ ...userDocument.toObject() });
```

---

## Auth Middleware

- Auth middleware sets `res.locals.user` from verified token — controllers read from there, not the raw header
- Firebase token issuer check: `https://securetoken.google.com/<your-gcp-project>`
- Dev-only docs (`/api-docs`, `/swagger`, `/docs`): gate behind `devOnlyLocalhost` middleware; return 403 in prod

---

## MongoDB

- Never use `SELECT *` equivalent — always project specific Mongoose fields
- **Soft delete only** in production code — `isDeleted: true` flag, never `deleteOne()` / `findByIdAndDelete()`

---

## OWASP Top 10 — Constant Vigilance

Before writing any controller or route handler, mentally check:
- **Injection**: all user input parameterised or sanitised before DB / shell / external calls
- **Broken Auth**: tokens verified, not just decoded; sessions invalidated on logout
- **Sensitive Data Exposure**: PII never in logs, never in JWT, never in URL params
- **XSS**: never trust `req.body` strings in HTML context without escaping
- **Security Misconfiguration**: Helmet enabled, CORS restricted, no debug endpoints in prod
- **Insecure Deserialization**: validate shape of parsed JSON before using
