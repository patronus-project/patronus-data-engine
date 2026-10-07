# API Conventions — Reference

---

## URL Structure

```
Public (no auth):   /api/v1/public/**
Private (JWT auth): /api/v1/**
```

All private routes protected by `privateRouteMiddleware` (checks Bearer token, sets `res.locals.user`).

---

## Response Envelopes

Be consistent within a project. Pick one style and stick to it.

```typescript
// Standard data response
res.status(200).json({ data: result });

// With pagination metadata
res.status(200).json({ data: result, meta: { total: 100, page: 1, pageSize: 20 } });

// AI / validation response (legacy shape — some projects use this)
res.status(200).json({ success: true, data: result });

// Client error
res.status(400).json({ message: 'human readable description', code: 'APP_AUTH_TOKEN_INVALID' });

// Auth — pure status (no body needed)
res.sendStatus(401);

// Not found
res.status(404).json({ message: 'User not found' });

// Server error
res.status(500).json({ message: 'descriptive error message', err });
```

Every `res.*` call must be followed by `return` to prevent "headers already sent" errors:

```typescript
if (!userId) {
  res.status(400).json({ message: 'userId required' });
  return;  // ← mandatory
}
```

---

## JWT Payload — Minimal

**Never embed full DB documents in JWT.** Minimal claims only.

```typescript
// ✅ Minimal payload
const token = await generateToken({
  userId,
  email,
  profileState,
  client: '<your-app-name>'
});

// ❌ Full document
const token = await generateToken({ ...user.toObject() });
```

Standard claims: `userId` (or `sub`), `email`, `scope`/`profileState`, `client`, `iat`, `exp`.

Do not add fields to the JWT payload without a documented auth migration plan — existing sessions carry the old shape.

---

## Swagger Annotations

Every route must have a `@swagger` JSDoc annotation in the route file.

```typescript
/**
 * @swagger
 * /api/v1/public/auth/code:
 *   post:
 *     summary: Authenticate via Firebase Google Sign-In
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [authProvider, ssoData]
 *             properties:
 *               authProvider:
 *                 type: string
 *                 enum: [firebase, otpless]
 *               ssoData:
 *                 type: object
 *                 properties:
 *                   idToken:
 *                     type: string
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Missing or invalid fields
 *       401:
 *         description: Token verification failed
 */
router.post('/auth/code', verifyAuthCtrl);
```

**Swagger access rules:**
- `/api-docs` — only in dev mode + localhost (blocked by `devOnlyLocalhost` middleware in dev; 403 in prod)
- Never expose Swagger in production

---

## HTTP Method Semantics

| Method | Use case |
|---|---|
| `GET` | Read-only fetch, no side effects, idempotent |
| `POST` | Create new resource or trigger action (non-idempotent) |
| `PUT` | Full replacement of a resource |
| `PATCH` | Partial update of a resource |
| `DELETE` | Remove / soft-delete a resource |

---

## Error Code Convention

Format: `APP_<AREA>_<DETAIL>`

```
APP_AUTH_TOKEN_INVALID      — JWT signature or format invalid
APP_AUTH_TOKEN_EXPIRED      — JWT past expiry
APP_AUTH_FIREBASE_FAILED    — Firebase token verification failed
APP_PROFILE_NOT_FOUND       — User profile does not exist
APP_PROFILE_INCOMPLETE      — Profile missing required fields
APP_TRIP_OCR_FAILED         — Google Vision failed to parse image
APP_AI_CONFIDENCE_LOW       — Gemini response below confidence threshold
APP_INPUT_MISSING           — Required field absent in request body
APP_INPUT_INVALID           — Field present but fails validation
```

---

## Rate Limiting (if applicable)

Document any rate-limiting middleware here (per-project). Common patterns:
- `express-rate-limit` on public auth endpoints
- Redis-backed counters for OTP send limits
- Exponential backoff for AI/external service calls
