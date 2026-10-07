# Backend Patterns — Node.js / Express Reference

> Conventions for Express + TypeScript backends.
> NestJS-specific patterns are noted where they differ.

---

## Layer Architecture

| Layer | Folder | Responsibility | May import from |
|---|---|---|---|
| Routes | `src/routes/` | URL mapping + Swagger JSDoc | `controllers/` only |
| Controllers | `src/controllers/` | Request parsing, validation, response | `models/`, `services/` |
| Services | `src/services/` | External integrations, business logic | `models/`, `utils/` |
| Models | `src/models/` | Mongoose schemas + model exports | Nothing except Mongoose |
| Middlewares | `src/middlewares/` | JWT auth, request guards | `utils/` only |
| Config | `src/config/` | SDK init (Firebase, Swagger, AI prompts) | `utils/` only |
| Utils | `src/utils/` | Logger, JWT helpers, Key Vault, enums, types | Nothing from the above |

**Dependency rules:**
- Services must NOT import from controllers or routes
- Middlewares must NOT import from controllers
- Utils must NOT import from controllers, routes, or models
- Bootstrap file (`index.ts`) — no business logic

---

## Controller Pattern

```typescript
import { Request, Response } from 'express';
import logger from '../utils/logger';

const myCtrl = async (req: Request, res: Response) => {
  try {
    const { field } = req.body;

    // 1. Validate inputs at the boundary
    if (!field) {
      res.status(400).json({ message: 'field required' });
      return;   // ← early return after EVERY res.* call
    }

    // 2. Business logic / DB calls
    const result = await someService(field);

    // 3. Respond
    res.status(200).json({ data: result });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'descriptive error message', err });
  }
};

export { myCtrl };
```

Rules:
- Fat-arrow only — no `function` keyword
- Every `res.*` call followed by `return`
- All `req.body` / `req.query` / `req.params` validated before use
- `try/catch` wrapping all async logic
- `logger.error(err)` before responding with 500
- Declare then export — no inline `export const`

---

## Service Pattern

```typescript
import logger from '../utils/logger';

const callExternalApi = async (input: string): Promise<ApiResult> => {
  try {
    const result = await externalSdk.doSomething(input);
    return result;
  } catch (err) {
    logger.error('[ServiceName] callExternalApi failed:', err);
    throw err;    // re-throw — controller handles the response
  }
};

export { callExternalApi };
```

Rules:
- Services do NOT set `res.*` — they return data or throw
- Services do NOT import from controllers or routes
- Business logic lives here — controllers are thin request/response mappers

---

## Route Pattern

```typescript
import { Router } from 'express';
import { myCtrl } from '../controllers/myController';

const router = Router();

/**
 * @swagger
 * /api/v1/resource:
 *   post:
 *     summary: Brief description
 *     tags: [Resource]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/resource', myCtrl);

export default router;
```

Rules:
- Every route has a `@swagger` JSDoc annotation
- Swagger only exposed in dev mode + localhost
- Routes import from `controllers/` only

---

## Model Pattern (Mongoose)

```typescript
import { model, Schema } from 'mongoose';

const userProfileSchema = new Schema(
  {
    userId:      { type: String, required: true, unique: true },
    email:       { type: String, sparse: true },   // sparse: true for optional unique fields
    phoneNumber: { type: String, sparse: true },
    isDeleted:   { type: Boolean, default: false }, // always — soft delete
    // ... domain fields
  },
  { timestamps: true }   // always — provides createdAt + updatedAt
);

// Always explicit collection name as 3rd arg — never rely on auto-pluralisation
const UserProfile = model('UserProfile', userProfileSchema, 'userprofiles');
export default UserProfile;
```

**Mongoose rules:**
- `{ timestamps: true }` on every schema — no exceptions
- Explicit collection name always
- Soft delete pattern (`isDeleted: false` default) — never `deleteOne()` / `findByIdAndDelete()` on production data
- `index: true` on fields queried frequently
- `sparse: true` on optional unique fields (existing docs have no value)
- String IDs for application entities when using `generateRandomId()`

---

## Middleware Pattern

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/private';
import logger from '../utils/logger';

const privateRouteMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.sendStatus(401);
      return;
    }
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token);
    res.locals.user = payload.data;
    next();
  } catch (err) {
    logger.warn('Auth failed:', err);
    res.sendStatus(401);
  }
};

export { privateRouteMiddleware };
```

---

## API Response Envelopes

```typescript
// Success — data response
res.status(200).json({ data: result });

// Success with metadata
res.status(200).json({ data: result, meta: { total: 100, page: 1 } });

// Success — AI/validation response
res.status(200).json({ success: true, data: result });

// Client error
res.status(400).json({ message: 'human readable description', code: 'APP_AREA_DETAIL' });

// Auth error — pure status
res.sendStatus(401);

// Server error
res.status(500).json({ message: 'descriptive error message', err });
```

---

## Error Code Convention

Format: `APP_<AREA>_<DETAIL>`

```
APP_AUTH_TOKEN_INVALID
APP_AUTH_TOKEN_EXPIRED
APP_PROFILE_NOT_FOUND
APP_TRIP_OCR_FAILED
APP_AI_CONFIDENCE_LOW
```

---

## Enums Pattern

```typescript
// src/utils/enums/enums.ts
import enumData from '../static/enum.json';

const getAllProfileStates = (): string[] => enumData.profileStates;
const getAllSsoProviders = (): string[] => enumData.ssoProviders;

export { getAllProfileStates, getAllSsoProviders };
```

Load enums from `static/enum.json` — editable without recompile.

---

## NestJS Differences (when using NestJS)

| Pattern | Express | NestJS |
|---|---|---|
| Function declarations | Fat-arrow everywhere | Class methods (decorators require it) |
| Validation | Manual in controller | `class-validator` DTOs + global `ValidationPipe` |
| Error throwing | `res.status(400).json(...)` | `throw new BadRequestException('...')` |
| DI | Manual imports | `@Injectable()`, `@InjectModel()` |
| Config | `getSecret()` / env | `EnvService` (wraps process.env with typed access) |
| Exports | Named export block | `export class MyService {}` |

NestJS `ValidationPipe` settings (in `main.ts`):
```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // strips extra fields
  forbidNonWhitelisted: true,   // throws 400 on extra fields
  transform: true,              // auto-transforms to DTO class instances
}));
```
