# TypeScript Standards — Reference

> Applies to all `.ts` and `.tsx` files across all projects.

---

## Function Declaration — Fat-Arrow Only

Always use fat-arrow format. No `function` keyword declarations.

```typescript
// ✅
const myCtrl = async (req: Request, res: Response) => { ... };
const parseTrip = (raw: string): TripData => { ... };
const MyComponent = ({ title }: MyComponentProps) => { ... };

// ❌
function myCtrl(req, res) { ... }
async function parseTrip(raw) { ... }
function MyComponent({ title }) { ... }
```

**Exception — NestJS only:** class methods in NestJS controllers, services, modules, guards, and interceptors use standard method syntax. NestJS decorators (`@Post()`, `@Get()`, `@Injectable()`) don't work correctly on fat-arrow class properties due to `this` binding differences.

```typescript
// ✅ NestJS backend — standard class method
@Controller('user')
export class UserController {
  @Post('auth/code')
  async sendOtp(@Body() dto: SendOtpDto) { ... }
}

// ❌ NestJS backend — fat-arrow breaks decorators
@Controller('user')
export class UserController {
  sendOtp = async (@Body() dto: SendOtpDto) => { ... }
}
```

---

## TypeScript File Section Order

All `.ts` / `.tsx` files follow this section order — no exceptions:

```
1. Internal constants    (as const objects — typeof-derived types must follow their source)
2. Exported constants
3. Internal types        (type aliases, keyof derivations used only within this file)
4. Exported types        (typeof derivations and interfaces consumed by other modules)
5. Internal functions
6. Exported functions
```

> `typeof X` types must appear after `X` is defined — TypeScript constraint, not a violation.

---

## No `any`

- **No `any`** — use `unknown` and narrow, or define a real type
- **No implicit `any`** from untyped function parameters

```typescript
// ✅
const parseResult = (raw: unknown): TripData => {
  if (typeof raw !== 'object' || raw === null) throw new Error('invalid');
  return raw as TripData;
};

// ❌
const parseResult = (raw: any) => raw;
```

---

## `interface` vs `type`

- **Prefer `interface` over `type` for object shapes** — interfaces are extendable and give better error messages
- Use `type` for unions, intersections, and aliases

```typescript
// ✅ Object shapes → interface
interface UserCardProps {
  user: User;
  onSelect: (id: string) => void;
}

// ✅ Unions/intersections → type
type AuthProvider = 'google' | 'sms' | 'apple';
type AdminUser = User & { role: 'admin' };

// ❌ Object shape as type
type UserCardProps = {
  user: User;
  onSelect: (id: string) => void;
};
```

---

## Types File Pattern

Module-local types vs shared types — never dump everything in one catch-all:

| Scope | Where it goes |
|---|---|
| Used only in one file | Co-located `X.types.ts` next to the owning file |
| Used across multiple modules | Shared types file (`src/utils/types.ts`, `libs/shared-types`, etc.) |
| NestJS DTOs | `dto/` subfolder inside the module |

```
// ✅ Module-local → co-located
src/services/AI/geminiService.ts
src/services/AI/geminiService.types.ts   ← GeminiRequestOptions lives here

// ✅ Shared → shared location
src/utils/types.ts                        ← IUserPayload lives here (used in middleware + controllers)

// ❌ Never → inline in consuming file
const callGemini = async (opts: { prompt: string; model: string }) => { ... };
```

**Key rule:** Do NOT grow the shared types file with module-local types. If only one file needs it — co-locate it.

---

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Controllers | `*Ctrl` or `*Controller` | `getProfileDetailCtrl`, `validateUserNameAI` |
| Models | PascalCase (default export) | `UserProfile`, `VehicleProfile` |
| Services | camelCase exports | `callGemini`, `parseOcrData` |
| Utils | camelCase functions | `generateToken`, `isProd` |
| Interfaces | `I*` prefix | `ILogger`, `IVehicleIRInflight` |
| Enums | PascalCase | `ProfileState`, `SsoProvider` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_TTL`, `MAX_RETRY_COUNT` |
| Error codes | `APP_<AREA>_<DETAIL>` | `APP_AUTH_TOKEN_INVALID` |
| MongoDB collections | `snake_case` plural | `userprofiles`, `vehicle_profiles` |
| Redis keys | `domain:entity:identifier` | `auth:session:usr_7a3f92` |
| Test files | `<subject>.spec.ts` | `geminiService.spec.ts` |
| DTO files | `<action>-<entity>.dto.ts` | `verify-otp.dto.ts` |

---

## Export Style

Declare first, export once at the bottom. No inline `export const` or `export let`.

```typescript
// ✅ correct
const myFn = () => {};
let myVar: string;

export { myFn, myVar };

// ✅ correct — models/routers use default export
export default router;

// ❌ wrong — no inline exports
export const myFn = () => {};
export let myVar: string;
```

---

## Props (React / Frontend)

- All props typed with a named interface (`ComponentNameProps`) — no inline type objects
- Callback props prefixed with `on`: `onSelect`, `onChange`, `onClose`

```typescript
// ✅
interface UserCardProps {
  user: User;
  onSelect: (id: string) => void;
}

// ❌
const UserCard = ({ user, onSelect }: { user: any; onSelect: Function }) => {};
```
