# MongoDB / Mongoose Conventions — Reference

---

## Schema Rules (non-negotiable)

### 1. Always `{ timestamps: true }`
Every schema gets `timestamps: true`. No exceptions. Provides `createdAt` and `updatedAt` automatically.

```typescript
new Schema({ ... }, { timestamps: true })
```

### 2. Always explicit collection name
Pass the collection name as the 3rd arg to `model()`. Never rely on Mongoose's auto-pluralisation — it's unpredictable with non-standard names.

```typescript
const UserProfile = model('UserProfile', userProfileSchema, 'userprofiles');
```

### 3. Soft delete — never hard delete in production

Every schema that represents a user-facing entity gets an `isDeleted` field:
```typescript
isDeleted: { type: Boolean, default: false, index: true }
```

Never call `deleteOne()`, `findByIdAndDelete()`, or `deleteMany()` on production data. Set `isDeleted: true` instead.

```typescript
// ✅ Correct
await UserProfile.findByIdAndUpdate(id, { isDeleted: true });

// ❌ Wrong — irreversible
await UserProfile.findByIdAndDelete(id);
```

Why: GDPR requests, audit trails, and data recovery all require soft delete. Hard deletes create forensic and compliance gaps.

### 4. String IDs for application entities

Use `generateRandomId()` (or equivalent) for application-level entity IDs. Don't expose MongoDB ObjectIds in APIs.

```typescript
userId: { type: String, required: true, unique: true }
// Set on create: userId: generateRandomId()
```

### 5. Index discipline

```typescript
// Fields queried frequently
firebaseUid: { type: String, index: true }

// Optional unique fields (docs before the field was added have no value)
phoneNumber: { type: String, unique: true, sparse: true }
email:       { type: String, unique: true, sparse: true }
```

`sparse: true` on a unique field means `null`/`undefined` values are excluded from the unique index — prevents duplicate key errors when the field doesn't exist on old documents.

---

## Query Discipline

**Never query without a projection** — always specify the fields you need:

```typescript
// ✅ Projection — only fetch what you need
const user = await UserProfile.findOne(
  { firebaseUid: uid },
  { userId: 1, email: 1, profileState: 1, phoneVerified: 1 }
);

// ❌ No projection — fetches the entire document
const user = await UserProfile.findOne({ firebaseUid: uid });
```

**Always include `isDeleted: false` in queries on soft-deleted collections:**
```typescript
const user = await UserProfile.findOne({ userId, isDeleted: false });
```

---

## Update Pattern

```typescript
// findOneAndUpdate with returnDocument: 'after' to get the updated doc
const updated = await UserProfile.findOneAndUpdate(
  { userId, isDeleted: false },
  { $set: { phoneVerified: true, lastLoginAt: new Date() } },
  { new: true, projection: { userId: 1, email: 1, profileState: 1 } }
);

if (!updated) {
  res.status(404).json({ message: 'User not found' });
  return;
}
```

---

## Schema Template

```typescript
import { model, Schema } from 'mongoose';

const entitySchema = new Schema(
  {
    entityId:   { type: String, required: true, unique: true },
    // ... domain fields
    isDeleted:  { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,    // always
  }
);

const Entity = model('Entity', entitySchema, 'entities');   // always explicit collection name
export default Entity;
```

---

## Multiple Connections

When the project uses multiple MongoDB connections:

```typescript
// Primary connection (conn1) — default
import { model, Schema } from 'mongoose';

// Secondary connection (conn2) — for a separate database
import conn2 from '../utils/index';   // wherever conn2 is exported

const EntityOnConn2 = conn2.model('Entity', entitySchema, 'entities');
export default EntityOnConn2;
```

Document which connection each model uses in the model file header comment.

---

## Collections Naming Reference

| Pattern | Example |
|---|---|
| `snake_case` plural | `userprofiles`, `vehicle_profiles`, `trip_logs` |
| All lowercase | `userloginprofiles`, `vehicleimagerecog` |
| No camelCase in collection names | `userProfiles` ❌ |
