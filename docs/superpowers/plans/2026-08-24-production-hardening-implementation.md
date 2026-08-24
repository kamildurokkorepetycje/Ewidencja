# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wdrożyć zatwierdzony projekt utwardzenia aplikacji Ewidencja, przetestować migracje `008–014` wyłącznie lokalnie/testowo i przygotować bezpieczny, ręczny runbook produkcyjny bez wykonywania zmian na produkcji.

**Architecture:** PostgreSQL/Supabase pozostaje rozstrzygającą granicą ownership, RLS, transakcji, kolejności przejazdów i matematyki paliwa. Next.js udostępnia cienkie, uwierzytelnione API walidowane przez Zod, a React zarządza draftem i podglądem liczonym przez Decimal.js. Prace przebiegają zgodnie z `expand → backfill → validate → constrain → switch`; stare pola paliwowe pozostają read-only do osobno zatwierdzonego cleanupu.

**Tech Stack:** Next.js 15/React 19/TypeScript, Supabase PostgreSQL + RLS + SECURITY DEFINER RPC, Zod, Decimal.js, Vitest, Testing Library, Supabase CLI/Docker, Playwright, axe-core, ExcelJS, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-08-24-production-hardening-design.md` (commit `7d10f59`)

## Global Constraints

- Nie uruchamiać migracji `008–014`, backfillu, maintenance mode ani zmian konfiguracji na produkcyjnym Supabase bez osobnej zgody.
- Nie odczytywać ani nie kopiować produkcyjnych sekretów, dumpów ani danych do repozytorium.
- Wszystkie testy DB uruchamiać wyłącznie dla URL z hostem `localhost`, `127.0.0.1` albo `::1`; helper ma przerwać przed pierwszym DDL dla innego hosta.
- Zachować niezacommitowaną zmianę użytkownika w `middleware.ts`; nie resetować, nie stashować i nie włączać jej do commitów.
- Jeżeli zadanie wymaga `middleware.ts`, zatrzymać się na wskazanym gate, pokazać diff i uzyskać decyzję przed edycją.
- Każdą zmianę logiki paliwa, sequence, cascade, date-only, RLS, RPC i concurrency prowadzić red → green → refactor.
- `fuel_purchases` jest po switch jedynym źródłem sumy tankowań; `trips.fuel_purchased` pozostaje legacy/read-only.
- Nie zgadywać historycznych korekt 5%/10%; zwykła edycja zachowuje `legacy`.
- Używać `NUMERIC` bez zaokrągleń pośrednich; wykonywać dokładnie jedno `ROUND(fuel_end_exact, 1)` i przekazywać ten wynik następnemu przejazdowi.
- Krytyczne RPC: pusty/restrykcyjny `search_path`, kwalifikowane nazwy, `auth.uid() IS NOT NULL`, bez dynamic SQL i bez wejściowego `user_id`; `EXECUTE` tylko `authenticated`.
- Nie stosować `npm audit fix --force`; każde high/critical klasyfikować indywidualnie, a nierozwiązany critical runtime traktować jako blocker produkcji.
- Nie rozszerzać pełnego audit trail, RBAC, offline mode ani cleanupu legacy w tym planie.
- Każdy commit obejmuje wyłącznie pliki wymienione w zadaniu; przed commitem uruchomić `git diff --check` i `git status --short`.

## File and Interface Map

Docelowe, stabilne interfejsy między zadaniami:

```ts
type FuelCalculationAction = 'preserve_legacy' | 'switch_to_norm' | 'recalculate_norm'

type FuelPurchaseCommand = {
  id?: string
  expected_updated_at?: string
  vehicle_id: string
  trip_id: string | null
  date: string
  liters: string
  amount_gross: string | null
  invoice_number: string | null
  notes: string | null
}

type SaveTripCommand = {
  trip_id?: string
  expected_updated_at?: string
  trip: TripCommandFields
  fuel_purchases: FuelPurchaseCommand[]
  allowances: AllowanceCommand[]
  fuel_action: FuelCalculationAction
}
```

RPC przekazywane między DB i API:

```sql
public.save_trip_with_children(jsonb) RETURNS jsonb
public.save_fuel_purchase(jsonb) RETURNS jsonb
public.delete_fuel_purchase(uuid, timestamptz) RETURNS jsonb
public.recalculate_vehicle_trips(uuid, date, integer) RETURNS jsonb
public.delete_trip_and_recalculate(uuid, timestamptz) RETURNS jsonb
```

Wszystkie kwoty/liczby dziesiętne w command JSON są stringami z kropką jako separatorem, aby uniknąć utraty precyzji w JavaScript. RPC konwertują je jawnie do `NUMERIC` po walidacji.

Główne nowe katalogi:

```text
tests/
  unit/
  components/
  database/{fixtures,helpers,migrations,rls,rpc}/
  e2e/
lib/
  domain/{fuel,date-only,validation}/
  schemas/
  server/
components/trips/sections/
components/ui/states/
ops/{checks,maintenance,recovery}/
docs/{runbooks,security}/
```

---

## FAZA 0 — środowisko i baseline

### Task 1: Odizoluj implementację i zabezpiecz zmianę `middleware.ts`

**Files:**
- Read only: `middleware.ts`
- Read only: `docs/superpowers/specs/2026-08-24-production-hardening-design.md`
- Create at execution time: sibling worktree `../ewidencja-nextjs-hardening`

**Interfaces:**
- Consumes: commit specyfikacji `7d10f59` i brudny główny worktree.
- Produces: branch `feat/production-hardening` w czystym worktree; oryginalny worktree pozostaje nietknięty.

- [ ] **Step 1: Udokumentuj stan bez zapisywania artefaktów**

Run:

```powershell
git status --short
git diff -- middleware.ts
Get-FileHash -Algorithm SHA256 middleware.ts
git rev-parse --short HEAD
```

Expected: `middleware.ts` jest jedyną znaną zmianą roboczą, hash jest widoczny w logu sesji, HEAD zawiera `7d10f59` lub jego potomka.

- [ ] **Step 2: Użyj wymaganego skillu worktree**

Invoke: `superpowers:using-git-worktrees`.

Run według wyniku skillu, docelowo:

```powershell
git worktree add "..\ewidencja-nextjs-hardening" -b feat/production-hardening HEAD
git -C "..\ewidencja-nextjs-hardening" status --short
```

Expected: nowy worktree jest czysty; oryginalny nadal pokazuje wyłącznie zmianę `middleware.ts`.

- [ ] **Step 3: Ustaw checkpoint wykonawczy**

Run:

```powershell
git -C "..\ewidencja-nextjs-hardening" branch --show-current
git status --short
```

Expected: implementacja odbywa się na `feat/production-hardening`; brak commita w tym tasku.

### Task 2: Ustanów powtarzalny baseline i nieinteraktywny lint

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: czysty worktree z Task 1.
- Produces: skrypty `lint`, `type-check`, `test`, `test:unit`, `test:db`, `test:e2e`; Vitest ze środowiskiem `jsdom` dla komponentów.

- [ ] **Step 1: Zapisz wyniki baseline przed zmianą zależności**

Run:

```powershell
npm ci
npm run type-check
npm run build
npm run lint
npm audit --json
```

Expected: typecheck/build mają znany wynik; stary `next lint` jest interaktywnym/niedziałającym baseline; audit niczego nie modyfikuje.

- [ ] **Step 2: Dodaj minimalny failing smoke test konfiguracji**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('loads the @ alias', async () => {
    const { cn } = await import('@/lib/utils/cn')
    expect(cn('a', false && 'b')).toBe('a')
  })
})
```

Run: `npm run test:unit -- tests/unit/smoke.test.ts`

Expected: FAIL, ponieważ skrypt/config Vitest jeszcze nie istnieje.

- [ ] **Step 3: Dodaj toolchain testowy i ESLint**

Run:

```powershell
npm install --save-dev vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event eslint-plugin-testing-library eslint-plugin-playwright
```

Configure:

```json
{
  "lint": "eslint . --max-warnings=0",
  "test": "vitest run",
  "test:unit": "vitest run tests/unit tests/components",
  "test:db": "vitest run --config vitest.database.config.ts",
  "test:e2e": "playwright test"
}
```

`vitest.config.ts` ma mapować `@` do root repo i wczytywać `vitest.setup.ts`; setup importuje `@testing-library/jest-dom/vitest`.

- [ ] **Step 4: Zweryfikuj toolchain**

Run:

```powershell
npm run lint
npm run type-check
npm run test:unit -- tests/unit/smoke.test.ts
npm run build
```

Expected: wszystkie cztery komendy exit 0 i nie pytają o konfigurację.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json eslint.config.mjs vitest.config.ts vitest.setup.ts tests/unit/smoke.test.ts
git diff --cached --check
git commit -m "test: establish noninteractive quality baseline"
```

### Task 3: Skonfiguruj wyłącznie lokalny Supabase test harness

**Files:**
- Modify: `.gitignore`
- Create: `supabase/config.toml`
- Create: `vitest.database.config.ts`
- Create: `tests/database/helpers/local-database.ts`
- Create: `tests/database/helpers/migrations.ts`
- Create: `tests/database/local-guard.test.ts`

**Interfaces:**
- Consumes: Supabase CLI/Docker oraz migracje `001–007`.
- Produces: `assertLocalDatabaseUrl(url)`, `resetLocalDatabaseThrough(migrationName)` i `applyMigration(file)`.

- [ ] **Step 1: Napisz failing test blokady zdalnego DB**

```ts
expect(() => assertLocalDatabaseUrl('postgresql://x:y@db.example.com/postgres'))
  .toThrow('Refusing non-local database')
expect(() => assertLocalDatabaseUrl('postgresql://x:y@127.0.0.1:54322/postgres'))
  .not.toThrow()
```

Run: `npm run test:db -- tests/database/local-guard.test.ts`

Expected: FAIL, helper nie istnieje.

- [ ] **Step 2: Zainicjalizuj lokalną konfigurację**

Run:

```powershell
npx supabase init
npx supabase start
npx supabase status
```

Expected: lokalne kontenery działają; `supabase/config.toml` nie zawiera linku ani ref produkcji. `.gitignore` obejmuje `supabase/.temp/`, lokalne dumpy i raporty zawierające sekrety.

- [ ] **Step 3: Zaimplementuj guard i runner**

`assertLocalDatabaseUrl` parsuje `URL.hostname` i dopuszcza wyłącznie `localhost`, `127.0.0.1`, `[::1]`. `resetLocalDatabaseThrough` odtwarza lokalny `public`, uruchamia migracje w porządku leksykalnym do wskazanego pliku i nie czyta zmiennych produkcyjnych.

- [ ] **Step 4: Zweryfikuj reset `001–007`**

Run:

```powershell
npm run test:db -- tests/database/local-guard.test.ts
npx supabase db reset --local
```

Expected: guard PASS; lokalny reset aplikuje `001–007`; produkcja nie jest połączona.

- [ ] **Step 5: Commit**

```powershell
git add .gitignore supabase/config.toml vitest.database.config.ts tests/database/helpers
git commit -m "test: add local-only Supabase harness"
```

**Checkpoint F0:** czysty worktree implementacyjny, zachowany oryginalny `middleware.ts`, nieinteraktywny quality gate i lokalna baza gotowa. Run: `npm run lint && npm run type-check && npm run test:unit && npm run build`.

## FAZA 1 — fundament testów bazy

### Task 4: Dodaj anonimowy fixture o kształcie produkcyjnym

**Files:**
- Create: `tests/database/fixtures/production-shape.sql`
- Create: `tests/database/fixtures/negative-ownership.sql`
- Create: `tests/database/helpers/fixtures.ts`
- Create: `tests/database/fixtures.test.ts`

**Interfaces:**
- Consumes: lokalny reset i guard z Task 3.
- Produces: stałe UUID `USER_A`, `USER_B`, `USER_C`; fixture 3/2/17/2/23/16/15/1/5/88 zgodny ze specyfikacją.

- [ ] **Step 1: Napisz failing test liczności**

Test ma oczekiwać: 3 users, 2 vehicles, 17 clients, 2 drivers, 23 trips, 16 legacy trips, 15 fuel purchases, 5 hotel distances, 88 allowances; 1 legacy trip bez purchase.

Run: `npm run test:db -- tests/database/fixtures.test.ts`

Expected: FAIL, fixture nie istnieje.

- [ ] **Step 2: Utwórz deterministyczny fixture**

Użyj stałych `USER_A=00000000-0000-0000-0000-0000000000a1`, `USER_B=00000000-0000-0000-0000-0000000000b2`, `USER_C=00000000-0000-0000-0000-0000000000c3`, syntetycznych nazw `User A Client 01` i dat niezwiązanych z produkcją. Pięć hotel distances ma zgodnych właścicieli hotelu i klienta. Piętnaście fuel purchases dokładnie odpowiada legacy fingerprint; szesnasty trip nie ma wpisu.

- [ ] **Step 3: Dodaj fixture negatywny**

Osobne inserty tworzą: cross-owner trip→vehicle, hotel/client różnych ownerów, null source owner, duplikat registration/code, nullable vehicle i niejednoznaczne fuel match. Każdy scenariusz jest uruchamiany osobno, nie w pozytywnym fixture.

- [ ] **Step 4: Zweryfikuj brak danych rzeczywistych**

Run:

```powershell
npm run test:db -- tests/database/fixtures.test.ts
rg -n -i "@|supabase\.co|service_role|eyJ" tests/database/fixtures
```

Expected: test PASS; wyszukiwanie nie znajduje emaili, URL ani tokenów (syntetyczne adresy, jeśli wymagane, używają domeny `example.invalid`).

- [ ] **Step 5: Commit**

```powershell
git add tests/database/fixtures tests/database/helpers/fixtures.ts tests/database/fixtures.test.ts
git commit -m "test: add anonymized production-shape database fixtures"
```

### Task 5: Dodaj helpery USER A/USER B i izolowane scenariusze migracji

**Files:**
- Create: `tests/database/helpers/auth-context.ts`
- Create: `tests/database/helpers/scenario.ts`
- Create: `tests/database/helpers/catalog.ts`
- Create: `tests/database/auth-context.test.ts`

**Interfaces:**
- Consumes: deterministyczne UUID/fixture z Task 4 i local DB guard z Task 3.
- Produces: `asAuthenticated(userId, fn)`, `asAnon(fn)`, `asNoJwt(fn)`, `expectSqlState(code)`, `queryCatalog()`.

- [ ] **Step 1: Napisz failing test claimów JWT**

Test wykonuje `select auth.uid()` kolejno jako USER A, USER B, anon i brak JWT; oczekuje odpowiednich UUID/null.

- [ ] **Step 2: Uruchom test red**

Run: `npm run test:db -- tests/database/auth-context.test.ts`

Expected: FAIL, helpery nie istnieją.

- [ ] **Step 3: Zaimplementuj kontekst transakcyjny**

Helper ustawia lokalnie rolę i `request.jwt.claims`, zawsze wykonuje rollback po callbacku i nigdy nie przyjmuje URL spoza `assertLocalDatabaseUrl`.

- [ ] **Step 4: Uruchom test green**

Run: `npm run test:db -- tests/database/auth-context.test.ts`

Expected: PASS dla czterech kontekstów, brak przecieku claimów między testami.

- [ ] **Step 5: Commit**

```powershell
git add tests/database/helpers tests/database/auth-context.test.ts
git commit -m "test: add authenticated database scenario helpers"
```

### Task 6: Zamroź czerwone testy istniejących luk ownership/RLS

**Files:**
- Create: `tests/database/rls/legacy-gaps.test.ts`
- Create: `tests/database/migrations/pre-008-state.test.ts`

**Interfaces:**
- Consumes: reset tylko przez `007` i helpery USER A/B.
- Produces: regresje pokazujące brak RLS `hotel_locations`, brak owner w `hotel_client_distances` i brak composite ownership.

- [ ] **Step 1: Napisz testy oczekiwanego bezpiecznego zachowania**

USER B nie może SELECT hotelu A, wstawić distance hotel A→client B ani utworzyć trip z vehicle A. Test katalogu oczekuje RLS enabled na obu hotel tables.

- [ ] **Step 2: Potwierdź czerwony baseline**

Run: `npm run test:db -- tests/database/rls/legacy-gaps.test.ts`

Expected: co najmniej opisane trzy asercje FAIL na schemacie `001–007`; nie poprawiaj ich w tym tasku.

- [ ] **Step 3: Oznacz testy jako jawny red baseline bez wyłączania**

Umieść je w osobnym skrypcie `test:db:red-baseline`, aby główny CI nie był zielony przed Fazą 2. Nie stosuj `.skip`; testy zostaną przeniesione do zwykłego suite po `010`.

- [ ] **Step 4: Commit**

```powershell
git add tests/database/rls/legacy-gaps.test.ts tests/database/migrations/pre-008-state.test.ts package.json package-lock.json
git commit -m "test: expose legacy ownership and rls gaps"
```

**Checkpoint F1:** fixture i auth context są zielone; kontrolowany red baseline dokumentuje dokładnie znane luki `001–007`.

## FAZA 2 — migracje ownership `008–010`

### Task 7: Dodaj `008_ownership_expand.sql`

**Files:**
- Create: `supabase/migrations/008_ownership_expand.sql`
- Create: `tests/database/migrations/008-ownership-expand.test.ts`
- Create: `ops/checks/008_ownership_expand_pre.sql`
- Create: `ops/checks/008_ownership_expand_post.sql`
- Create: `ops/recovery/008_ownership_expand_reverse.sql`

**Interfaces:**
- Consumes: migracje `001–007`, fixture i migration runner z Fazy 1.
- Produces: nullable UUID `user_id` i indeksy dla `hotel_client_distances`, `hotels`, `import_logs`, `audit_logs`.

- [ ] **Step 1: Napisz test niezmienności danych**

Test zapisuje counts i hash projekcji rekordów przed `008`, aplikuje migrację, oczekuje nowych nullable kolumn i identycznych counts/hash.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:db -- tests/database/migrations/008-ownership-expand.test.ts`

Expected: FAIL z brakiem `user_id`.

- [ ] **Step 3: Dodaj pre-check, migrację i post-check**

SQL używa `ADD COLUMN IF NOT EXISTS`, sprawdza przez `pg_catalog` typ `uuid`, dodaje cztery indeksy `IF NOT EXISTS` i nie wykonuje `UPDATE`, `NOT NULL` ani backfillu.

- [ ] **Step 4: Zweryfikuj green i ponowne wykonanie**

Run:

```powershell
npm run test:db -- tests/database/migrations/008-ownership-expand.test.ts
npm run test:db -- tests/database/migrations/008-ownership-expand.test.ts
```

Expected: oba przebiegi PASS; zero zmian danych.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/008_ownership_expand.sql tests/database/migrations/008-ownership-expand.test.ts ops/checks/008_ownership_expand_*.sql ops/recovery/008_ownership_expand_reverse.sql
git commit -m "db: add ownership expansion migration"
```

### Task 8: Dodaj jednoznaczny backfill `009_ownership_backfill.sql`

**Files:**
- Create: `supabase/migrations/009_ownership_backfill.sql`
- Create: `tests/database/migrations/009-ownership-backfill.test.ts`
- Create: `ops/checks/009_ownership_backfill_pre.sql`
- Create: `ops/checks/009_ownership_backfill_post.sql`
- Create: `ops/recovery/009_ownership_backfill_reverse.sql`

**Interfaces:**
- Consumes: kolumny z `008`.
- Produces: jednoznaczne owner mappings dla distances/hotels/import/audit; zero null owner w pozytywnym fixture.

- [ ] **Step 1: Napisz testy pozytywne i negatywne**

Pozytywny test oczekuje dokładnie 5 przypisanych distances. Negatywne scenariusze: hotel/client różnych ownerów, orphan hotel, hotel invoice wskazywany przez tripy różnych ownerów oraz null `created_by`/`changed_by`; każdy oczekuje przerwania i rollbacku całej migracji.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:db -- tests/database/migrations/009-ownership-backfill.test.ts`

Expected: FAIL, owner pozostaje null.

- [ ] **Step 3: Zaimplementuj transakcyjny backfill**

Przed `UPDATE` bloki `DO` liczą niejednoznaczności i rzucają wyjątek. Mapowania są wyłącznie:

```text
distance ← zgodny owner hotel_location i client
hotel invoice ← jednoznaczny trips.user_id
import_log ← created_by
audit_log ← changed_by
```

- [ ] **Step 4: Zweryfikuj green, rollback i reverse script**

Run: `npm run test:db -- tests/database/migrations/009-ownership-backfill.test.ts`

Expected: pozytywny PASS; każdy negatywny scenariusz pozostawia całą tabelę bez częściowego backfillu; reverse zeruje tylko kolumny dodane przez `008` przed constraints.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/009_ownership_backfill.sql tests/database/migrations/009-ownership-backfill.test.ts ops/checks/009_* ops/recovery/009_*
git commit -m "db: backfill per-user ownership"
```

### Task 9: Wymuś ownership, per-user unique i RLS w `010`

**Files:**
- Create: `supabase/migrations/010_ownership_constraints_rls.sql`
- Create: `tests/database/migrations/010-constraints.test.ts`
- Create: `tests/database/rls/ownership.test.ts`
- Create: `tests/database/rls/audit-logs.test.ts`
- Delete after copying assertions: `tests/database/rls/legacy-gaps.test.ts`
- Delete after copying assertions: `tests/database/migrations/pre-008-state.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `ops/checks/010_ownership_constraints_rls_pre.sql`
- Create: `ops/checks/010_ownership_constraints_rls_post.sql`
- Create: `ops/recovery/010_ownership_constraints_rls.md`

**Interfaces:**
- Consumes: kompletny backfill `009`.
- Produces: `NOT NULL`, `UNIQUE(user_id,id)`, per-user registration/code, niezbędne composite FK, pełne RLS i bezpieczne profile/role.

- [ ] **Step 1: Przenieś red baseline do docelowych testów**

Skopiuj asercje do docelowych suites, usuń dwa pliki red-baseline i osobny skrypt `test:db:red-baseline` z `package.json`. Rozszerz asercje o USER A→B dla wszystkich tabel, audit logs SELECT-only, metadata role bez wpływu, `security_invoker` report views oraz brak admin policies.

- [ ] **Step 2: Dodaj testy constraints i vehicle pre-check**

Testuj osobno: null `trips.vehicle_id`, null `fuel_purchases.vehicle_id`, globalny duplikat registration/code różnych userów dozwolony, duplikat tego samego usera odrzucony, `hotel_client_distances` unikalne przez `(user_id,hotel_id,client_id)` oraz każdy composite FK cross-owner odrzucony. Fuel vehicle `NOT NULL` następuje tylko przy zerowym raporcie; brakująca wartość nigdy nie jest przypisywana.

- [ ] **Step 3: Potwierdź red**

Run:

```powershell
npm run test:db -- tests/database/migrations/010-constraints.test.ts
npm run test:db -- tests/database/rls/ownership.test.ts tests/database/rls/audit-logs.test.ts
```

Expected: FAIL na schemacie do `009`.

- [ ] **Step 4: Zaimplementuj `010`**

Identyfikuj stare UNIQUE przez `pg_constraint`/`pg_attribute`, nie nazwę. Dodaj wymagane parent `UNIQUE(user_id,id)`, child composite FK jako `NOT VALID`, potem `VALIDATE CONSTRAINT`. Ustaw `ENABLE ROW LEVEL SECURITY`; polityki używają `USING` i `WITH CHECK`. `handle_new_user()` nie ufa `raw_user_meta_data.role`. Jeśli composite `SET NULL` nie zachowuje `user_id` na dostępnej wersji PostgreSQL, test ma zatrzymać implementację i wymagać decyzji zamiast triggera.

`ops/recovery/010_ownership_constraints_rls.md` zabrania automatycznego powrotu do liberalnych polityk; wskazuje maintenance, forward fix i PITR/zweryfikowany restore jako jedyne dopuszczone ścieżki zależnie od momentu awarii.

- [ ] **Step 5: Zweryfikuj pełną macierz**

Run:

```powershell
npm run test:db -- tests/database/migrations/010-constraints.test.ts tests/database/rls
npx supabase db reset --local
```

Expected: wszystkie testy PASS; wszystkie FK `convalidated=true`; `hotel_locations` i distances mają RLS; audit user nie ma INSERT/UPDATE/DELETE.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/010_ownership_constraints_rls.sql tests/database/migrations tests/database/rls package.json package-lock.json ops/checks/010_* ops/recovery/010_ownership_constraints_rls.md
git commit -m "db: enforce ownership constraints and rls"
```

**Checkpoint F2:** lokalne `001–010` przechodzą; test USER A→USER B jest zielony; produkcja pozostaje nietknięta.

## FAZA 3 — model paliwa `011–012`

### Task 10: Zdefiniuj dokładną matematykę paliwa w TypeScript

**Files:**
- Create: `lib/domain/fuel/types.ts`
- Create: `lib/domain/fuel/calculate-preview.ts`
- Create: `lib/domain/fuel/format.ts`
- Create: `tests/unit/fuel/calculate-preview.test.ts`
- Create: `tests/unit/fuel/format.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Vitest z Task 2 i zatwierdzony kontrakt matematyki ze specyfikacji.
- Produces: `calculateFuelPreview(input): FuelPreview`, `formatFuelQuantity(value, maxFractionDigits)`, typy action/command zgodne z mapą.

- [ ] **Step 1: Napisz failing tests precyzji**

Przypadki: litry `36.42`, wiele tankowań, korekta 0/5/10, `58.17→58.2`, `58.14→58.1`, `58.15→58.2`, przekazanie zaokrąglonego końca następnemu trip i brak zbędnych zer w UI (`7.2000→7,2`, `36.42→36,42`).

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/unit/fuel`

Expected: FAIL, moduły nie istnieją.

- [ ] **Step 3: Dodaj Decimal.js i minimalną implementację**

Run: `npm install decimal.js`

Implementacja nie używa `number` do matematyki; zwraca stringi decimal. Finalne zaokrąglenie stosuje `Decimal.ROUND_HALF_UP`, aby odpowiadać PostgreSQL `NUMERIC` dla dodatnich wartości.

- [ ] **Step 4: Zweryfikuj green i brak starej matematyki w nowych modułach**

Run:

```powershell
npm run test:unit -- tests/unit/fuel
rg -n "parseFloat|Math\.round|toFixed" lib/domain/fuel
```

Expected: tests PASS; wyszukiwanie nie znajduje matematyki opartej na float (formatowanie przez `Intl.NumberFormat` jest dozwolone po konwersji wartości prezentacyjnej).

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json lib/domain/fuel tests/unit/fuel
git commit -m "test: add exact fuel calculation cases"
```

### Task 11: Rozszerz model paliwa w `011_fuel_model_expand.sql`

**Files:**
- Create: `supabase/migrations/011_fuel_model_expand.sql`
- Create: `tests/database/migrations/011-fuel-model.test.ts`
- Create: `ops/checks/011_fuel_model_expand_pre.sql`
- Create: `ops/checks/011_fuel_model_expand_post.sql`
- Create: `ops/recovery/011_fuel_model_expand_reverse.sql`

**Interfaces:**
- Consumes: ownership constraints/RLS z `010` i exact fuel contract z Task 10.
- Produces: `fuel_norm_used numeric(8,4)`, `fuel_adjustment_percent`, `fuel_used_exact numeric(12,6)`, `fuel_calculation_mode`, provenance backfill oraz bezstratne `liters numeric(12,4)`.

- [ ] **Step 1: Napisz failing schema/data tests**

Testuje dozwolone korekty 0/5/10, odrzucenie 7, tryby legacy/norm, unikalny nie-null `legacy_source_trip_id`, zachowanie `36.42` i niezmienność wszystkich legacy fields.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:db -- tests/database/migrations/011-fuel-model.test.ts`

Expected: FAIL z brakiem kolumn.

- [ ] **Step 3: Zaimplementuj expand bez backfillu tankowań**

Użyj constraints nazwanych jawnie, częściowego UNIQUE na `legacy_source_trip_id IS NOT NULL` i jawnego sprawdzenia, że poszerzenie typu liters jest bezstratne. Nie usuwaj ani nie aktualizuj starych pól `trips`.

Reverse usuwa wyłącznie nowe kolumny/constraint/index przed ich użyciem; nie zwęża automatycznie typu `liters`, jeśli jakakolwiek wartość nie mieści się bezstratnie w starym typie.

- [ ] **Step 4: Zweryfikuj idempotencję i dane**

Run: `npm run test:db -- tests/database/migrations/011-fuel-model.test.ts`

Expected: PASS; counts/hashes legacy bez zmian.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/011_fuel_model_expand.sql tests/database/migrations/011-fuel-model.test.ts ops/checks/011_* ops/recovery/011_fuel_model_expand_reverse.sql
git commit -m "db: add normalized fuel model"
```

### Task 12: Dodaj deduplikujący backfill `012_fuel_legacy_backfill.sql`

**Files:**
- Create: `supabase/migrations/012_fuel_legacy_backfill.sql`
- Create: `tests/database/migrations/012-fuel-backfill.test.ts`
- Create: `tests/database/fixtures/fuel-ambiguities.sql`
- Create: `ops/checks/012_fuel_legacy_backfill_pre.sql`
- Create: `ops/checks/012_fuel_legacy_backfill_post.sql`
- Create: `ops/recovery/012_fuel_legacy_backfill_reverse.sql`

**Interfaces:**
- Consumes: fixture 16 legacy/15 purchase/1 brak.
- Produces: 16 jednoznacznych provenance links, dokładnie jeden nowy purchase, legacy mode i exact used.

- [ ] **Step 1: Napisz failing test klasyfikacji 15+1**

Sprawdź fingerprint `user_id,trip_id,vehicle_id,liters,invoice_number,date`, flags istniejących `false`, nowego `true`, `fuel_used_exact=fuel_used`, `mode=legacy`, brak zmiany fuel_end/legacy fields.

- [ ] **Step 2: Dodaj negatywne i retry tests**

Scenariusze: dwa match, przypisany niezgodny wpis, potencjalny standalone, null vehicle, różny owner. Każdy przerywa całość. Ponowne wykonanie nie tworzy drugiego zakupu i albo kończy no-op, albo kontrolowaną odmową opisaną przez test.

- [ ] **Step 3: Potwierdź red**

Run: `npm run test:db -- tests/database/migrations/012-fuel-backfill.test.ts`

Expected: FAIL, brak provenance/backfill.

- [ ] **Step 4: Zaimplementuj preflight classification i backfill**

W jednej transakcji najpierw materializuj klasyfikację w tymczasowej tabeli, zgłoś wszystkie klasy 3–5, dopiero potem oznacz 15 i wstaw 1 z konfliktem chronionym przez unique index. Nie modyfikuj historycznego `fuel_end` ani łańcucha.

- [ ] **Step 5: Zweryfikuj green, retry i recovery**

Run: `npm run test:db -- tests/database/migrations/012-fuel-backfill.test.ts`

Expected: PASS; po retry nadal 16 purchases ogółem dla fixture; recovery usuwa wyłącznie rekord z flagą true i czyści markery pozostałych.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/012_fuel_legacy_backfill.sql tests/database/migrations/012-fuel-backfill.test.ts tests/database/fixtures/fuel-ambiguities.sql ops/checks/012_* ops/recovery/012_*
git commit -m "db: backfill legacy fuel purchases without duplicates"
```

**Checkpoint F3:** testy Decimal i DB potwierdzają precyzję; `012` rozpoznaje 15 i tworzy 1 wyłącznie lokalnie.

## FAZA 4 — `trip_sequence` i atomowe RPC `013`

### Task 13: Dodaj sequence, raport kolejności i resequencing

**Files:**
- Create: `supabase/migrations/013_trip_atomic_operations.sql`
- Create: `tests/database/rpc/trip-sequence.test.ts`
- Create: `ops/checks/013_trip_atomic_operations_pre.sql`
- Create: `ops/checks/013_trip_sequence_report.sql`
- Create: `ops/checks/013_trip_atomic_operations_post.sql`

**Interfaces:**
- Consumes: `012` provenance, ownership/RLS `010` i exact fuel contract Task 10.
- Produces: `trip_sequence integer`, deferrable unique, helper SQL `private.compact_trip_sequence(uuid,uuid,date)`.

- [ ] **Step 1: Napisz failing tests kolejności**

Testy obejmują 0/1/wiele trip tego samego dnia, import historyczny, tie `created_at`, kompaktowe 1..N, przeniesienie między datami i pojazdami oraz deterministyczne `date_from,trip_sequence,id`.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:db -- tests/database/rpc/trip-sequence.test.ts`

Expected: FAIL, kolumna/helper nie istnieją.

- [ ] **Step 3: Dodaj pre-check raportujący każdą grupę `count>1`**

Raport zawiera `user_id,vehicle_id,date_from,count,array_agg(id order by created_at,id)`. Migracja nie może ukryć raportu; produkcyjne wykonanie wymaga ręcznej akceptacji operatora.

- [ ] **Step 4: Dodaj backfill i deferrable unique**

Backfill używa `row_number() over (partition by user_id,vehicle_id,date_from order by created_at,id)`. Helper pracuje w jednej transakcji i nie zmienia innych ownerów.

- [ ] **Step 5: Zweryfikuj green**

Run: `npm run test:db -- tests/database/rpc/trip-sequence.test.ts`

Expected: PASS; po każdej operacji obie grupy mają dokładnie `1..N`.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/013_trip_atomic_operations.sql tests/database/rpc/trip-sequence.test.ts ops/checks/013_trip_atomic_operations_pre.sql ops/checks/013_trip_sequence_report.sql ops/checks/013_trip_atomic_operations_post.sql
git commit -m "db: add deterministic compact trip sequence"
```

### Task 14: Dodaj rozstrzygającą matematykę i cascade w DB

**Files:**
- Modify: `supabase/migrations/013_trip_atomic_operations.sql`
- Create: `tests/database/rpc/fuel-math.test.ts`
- Create: `tests/database/rpc/cascade.test.ts`

**Interfaces:**
- Consumes: sequence/lock helper z Task 13 oraz normalized/backfilled fuel `011–012`.
- Produces: private helpers `private.calculate_trip_fuel` i `private.recalculate_vehicle_chain`; public wrapper `recalculate_vehicle_trips(uuid,date,integer)`.

- [ ] **Step 1: Napisz failing SQL math tests**

Powtórz przypadki z Decimal.js i porównaj string reprezentacji NUMERIC, w tym wiele purchases i przekazanie rounded final do kolejnego trip.

- [ ] **Step 2: Napisz failing cascade tests**

Edycja/usunięcie/przeniesienie na tej samej dacie, odpięty purchase `trip_id=NULL`, standalone wykluczony, stary i nowy vehicle chain, historyczny legacy preserve.

- [ ] **Step 3: Potwierdź red**

Run: `npm run test:db -- tests/database/rpc/fuel-math.test.ts tests/database/rpc/cascade.test.ts`

Expected: FAIL, helpery nie istnieją.

- [ ] **Step 4: Zaimplementuj minimalne private helpers**

Utwórz schemat `private`, odbierz do niego dostęp `PUBLIC`/`anon`/`authenticated` i pozostaw helpery niewywoływalne z API. Wzór: `SUM(liters)` tylko dla bieżącego `trip_id`; exact used bez round; exact end bez round; jeden `round(fuel_end_exact,1)`. Blokuj advisory/row locks dla vehicle UUID w stałej kolejności. Cascade sortuje `date_from,trip_sequence,id`.

- [ ] **Step 5: Zweryfikuj green i zgodność TS/DB**

Run:

```powershell
npm run test:unit -- tests/unit/fuel
npm run test:db -- tests/database/rpc/fuel-math.test.ts tests/database/rpc/cascade.test.ts
```

Expected: wszystkie przypadki mają identyczne string results.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/013_trip_atomic_operations.sql tests/database/rpc/fuel-math.test.ts tests/database/rpc/cascade.test.ts
git commit -m "db: centralize exact trip fuel cascade"
```

### Task 15: Dodaj atomowy `save_trip_with_children`

**Files:**
- Modify: `supabase/migrations/013_trip_atomic_operations.sql`
- Create: `tests/database/rpc/save-trip.test.ts`
- Create: `tests/database/rpc/transactionality.test.ts`

**Interfaces:**
- Consumes: DB math/cascade Task 14 i command contract z mapy planu.
- Produces: `public.save_trip_with_children(p_command jsonb) returns jsonb` zgodny z `SaveTripCommand`.

- [ ] **Step 1: Napisz failing create/update tests**

Create z dwoma purchases i allowances; update z add/edit/delete purchase; draft delete usuwa dopiero podczas RPC; response zwraca cały agregat i nowe timestamps.

- [ ] **Step 2: Napisz failing rollback/concurrency tests**

Wymuś child constraint error po zapisie trip i oczekuj braku jakiejkolwiek zmiany. Nieaktualny trip `expected_updated_at` oraz nieaktualny `expected_updated_at` dowolnego fuel child zwracają `CONCURRENT_MODIFICATION` i rollback.

- [ ] **Step 3: Potwierdź red**

Run: `npm run test:db -- tests/database/rpc/save-trip.test.ts tests/database/rpc/transactionality.test.ts`

Expected: FAIL, RPC nie istnieje.

- [ ] **Step 4: Zaimplementuj whitelistę JSON w SQL**

RPC odczytuje wyłącznie jawne klucze, ignoruje/odrzuca computed/user fields, weryfikuje ownership vehicle/client/driver/hotel, wymaga `fuel_purchases.vehicle_id = trips.vehicle_id` dla attached purchase, lockuje trip i istniejące purchases, obsługuje trzy fuel actions oraz synchronizuje allowances bez częściowego commita.

- [ ] **Step 5: Zweryfikuj green**

Run: `npm run test:db -- tests/database/rpc/save-trip.test.ts tests/database/rpc/transactionality.test.ts`

Expected: PASS; jedno wywołanie = jedna transakcja; legacy non-fuel edit zachowuje mode i exact values.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/013_trip_atomic_operations.sql tests/database/rpc/save-trip.test.ts tests/database/rpc/transactionality.test.ts
git commit -m "db: add atomic trip aggregate rpc"
```

### Task 16: Dodaj standalone fuel i bezpieczne usuwanie trip

**Files:**
- Modify: `supabase/migrations/013_trip_atomic_operations.sql`
- Create: `tests/database/rpc/fuel-purchase.test.ts`
- Create: `tests/database/rpc/delete-trip.test.ts`

**Interfaces:**
- Consumes: aggregate transaction/locks z Task 15 i cascade Task 14.
- Produces: `save_fuel_purchase(jsonb)`, `delete_fuel_purchase(uuid,timestamptz)`, `delete_trip_and_recalculate(uuid,timestamptz)`.

- [ ] **Step 1: Napisz failing fuel RPC tests**

Create/update/delete standalone i attached; optimistic timestamp; zmiana trip/date/vehicle; cross-owner UUID; dokładne `36.42`; neutralne standalone bez ostrzeżenia blokującego.

- [ ] **Step 2: Napisz failing delete-trip tests**

Usunięcie ustawia purchase `trip_id=NULL`, zachowuje dokument, usuwa allowances cascade, kompaktuje sequence i przelicza dalsze trip bez odpiętego tankowania.

- [ ] **Step 3: Potwierdź red**

Run: `npm run test:db -- tests/database/rpc/fuel-purchase.test.ts tests/database/rpc/delete-trip.test.ts`

Expected: FAIL, RPC nie istnieją.

- [ ] **Step 4: Zaimplementuj trzy RPC i zweryfikuj green**

Run: `npm run test:db -- tests/database/rpc/fuel-purchase.test.ts tests/database/rpc/delete-trip.test.ts`

Expected: PASS; dokument pozostaje, ale nie uczestniczy w łańcuchu.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/013_trip_atomic_operations.sql tests/database/rpc/fuel-purchase.test.ts tests/database/rpc/delete-trip.test.ts
git commit -m "db: add safe fuel and trip deletion rpc"
```

### Task 17: Utwardź SECURITY DEFINER i równoległość

**Files:**
- Modify: `supabase/migrations/013_trip_atomic_operations.sql`
- Create: `tests/database/rpc/security-definer.test.ts`
- Create: `tests/database/rpc/concurrency.test.ts`
- Create: `ops/checks/013_rpc_security_post.sql`
- Create: `ops/recovery/013_trip_atomic_operations_reverse.sql`

**Interfaces:**
- Consumes: wszystkie funkcje `013` z Tasks 13–16 i auth context Task 5.
- Produces: finalne bezpieczne sygnatury/ACL, katalogowe asercje wymagane później przez `014`.

- [ ] **Step 1: Napisz failing security catalog tests**

Każde RPC: `prosecdef=true`, owner to `postgres`, `proconfig` zawiera `search_path=""`, body używa wyłącznie kwalifikowanych nazw i nie zawiera dynamic SQL, brak EXECUTE PUBLIC/anon, EXECUTE authenticated. Wywołanie bez JWT, z nieprawidłowym JWT i USER A→B jest odrzucone. Jeżeli lokalny/hostowany Supabase nie pozwala zachować ownera `postgres`, zatrzymaj task i uzgodnij dedykowaną rolę `NOLOGIN` zamiast osłabiać pre-check `014`.

- [ ] **Step 2: Napisz failing concurrency tests**

Dwa połączenia edytują ten sam trip/fuel; tylko jedno zatwierdza. Dwa vehicle locks są pobierane w tej samej kolejności, test ma timeout wykrywający deadlock.

- [ ] **Step 3: Potwierdź red i utwardź definicje**

Run: `npm run test:db -- tests/database/rpc/security-definer.test.ts tests/database/rpc/concurrency.test.ts`

Expected przed poprawką: FAIL co najmniej na domyślnych grants/search_path. Po zmianie: PASS bez deadlocku.

- [ ] **Step 4: Zweryfikuj całe `013` od czystej bazy**

Run:

```powershell
npx supabase db reset --local
npm run test:db -- tests/database/rpc
```

Expected: wszystkie RPC tests PASS; reverse script działa wyłącznie przed nowymi zapisami i usuwa tylko obiekty `013`.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/013_trip_atomic_operations.sql tests/database/rpc ops/checks/013_rpc_security_post.sql ops/recovery/013_trip_atomic_operations_reverse.sql
git commit -m "security: harden atomic trip rpc boundary"
```

**Checkpoint F4:** lokalne `001–013`, math/cascade/transaction/concurrency/security przechodzą; bezpośredni DML nie jest jeszcze odebrany.

## FAZA 5 — API i domena

### Task 18: Wygeneruj typy DB i rozdziel schematy draft/command

**Files:**
- Create: `lib/supabase/database.types.ts`
- Create: `lib/schemas/common.ts`
- Create: `lib/schemas/trip-draft.ts`
- Create: `lib/schemas/trip-command.ts`
- Create: `lib/schemas/fuel-purchase-draft.ts`
- Create: `lib/schemas/fuel-purchase-command.ts`
- Create: `lib/schemas/allowance-command.ts`
- Create: `tests/unit/schemas/trip-command.test.ts`
- Create: `tests/unit/schemas/fuel-command.test.ts`
- Modify: `lib/types/index.ts`

**Interfaces:**
- Consumes: DB po `013` i interfejsy z mapy planu.
- Produces: strict Zod command schemas `.strict()`, osobne czytelne draft schemas i generowane `Database` types.

- [ ] **Step 1: Napisz failing whitelist/coercion tests**

Command odrzuca `user_id`, `fuel_end`, `fuel_used_exact`, `created_at`, obcy computed field, niepoprawny action i decimal z przecinkiem. Draft przyjmuje polski przecinek i pusty string, ale transformacja do command daje canonical decimal string z kropką.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/unit/schemas`

Expected: FAIL, moduły nie istnieją.

- [ ] **Step 3: Zaimplementuj schematy i wygeneruj typy lokalnie**

Run:

```powershell
npx supabase gen types typescript --local
```

Zapisz wygenerowany output do `lib/supabase/database.types.ts` jako mechanicznie generowany plik. `common.ts` definiuje `uuidSchema`, `dateOnlySchema`, `decimalStringSchema`, nullable variants. `trip-command.ts` eksportuje `saveTripCommandSchema` i `SaveTripCommand`.

- [ ] **Step 4: Usuń ręczne duplikaty wyłącznie po przepięciu importów**

`lib/types/index.ts` re-eksportuje row types z `Database`, a typy UI pozostają domenowe. Nie usuwaj typu, dopóki `rg` pokazuje import konsumenta.

- [ ] **Step 5: Zweryfikuj green**

Run:

```powershell
npm run test:unit -- tests/unit/schemas
npm run type-check
```

Expected: PASS; `saveTripCommandSchema.parse({ user_id: '00000000-0000-0000-0000-0000000000a1' })` jest odrzucone.

- [ ] **Step 6: Commit**

```powershell
git add lib/supabase/database.types.ts lib/schemas lib/types/index.ts tests/unit/schemas
git commit -m "refactor: add generated database and command types"
```

### Task 19: Dodaj wspólne bezpieczne helpery route handlers

**Files:**
- Create: `lib/server/api/auth.ts`
- Create: `lib/server/api/body.ts`
- Create: `lib/server/api/errors.ts`
- Create: `lib/server/api/response.ts`
- Create: `lib/server/api/maintenance.ts`
- Create: `tests/unit/server/api-helpers.test.ts`

**Interfaces:**
- Consumes: server Supabase client i strict schemas z Task 18.
- Produces: `requireUser()`, `parseJsonCommand(request,schema,{maxBytes})`, `mapDatabaseError(error)`, `mutationGuard(request)`.

- [ ] **Step 1: Napisz failing tests kontraktu HTTP**

Przypadki: brak sesji 401 `UNAUTHENTICATED`, zły JSON/za duże body 400/413, Zod 400 `VALIDATION_ERROR`, concurrency 409, ownership 403/404 bez ujawnienia UUID, maintenance mutation 503, raw SQL message ukryta.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/unit/server/api-helpers.test.ts`

Expected: FAIL, helpery nie istnieją.

- [ ] **Step 3: Zaimplementuj minimalne helpery**

`requireUser` korzysta wyłącznie z server Supabase client. `parseJsonCommand` czyta tekst po sprawdzeniu `content-length` i rzeczywistego rozmiaru UTF-8. `mapDatabaseError` mapuje wyłącznie jawne kody aplikacyjne, pozostałe na `INTERNAL_ERROR`.

- [ ] **Step 4: Zweryfikuj green**

Run: `npm run test:unit -- tests/unit/server/api-helpers.test.ts`

Expected: PASS i brak stack trace/raw SQL w odpowiedziach.

- [ ] **Step 5: Commit**

```powershell
git add lib/server/api tests/unit/server/api-helpers.test.ts
git commit -m "refactor: centralize authenticated api boundaries"
```

### Task 20: Przełącz API trips i fuel na RPC

**Files:**
- Modify: `app/api/trips/route.ts`
- Modify: `app/api/trips/[id]/route.ts`
- Modify: `app/api/fuel/route.ts`
- Modify: `app/api/fuel/[id]/route.ts`
- Delete after consumers migrate: `lib/utils/recalculate.ts`
- Create: `tests/unit/api/trips-route.test.ts`
- Create: `tests/unit/api/fuel-route.test.ts`

**Interfaces:**
- Consumes: schemas Task 18, API helpers Task 19, RPC Task 15–16.
- Produces: POST/PATCH/DELETE jako cienkie mapowanie do pojedynczego RPC; GET zachowuje RLS i zwraca fuel children.

- [ ] **Step 1: Napisz failing route tests**

Mock server client rejestruje wywołania. Dla każdej mutacji oczekuj dokładnie jednego `.rpc(...)`, braku `.from('trips').insert/update/delete`, odrzucenia extra fields i poprawnego statusu error mapping.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/unit/api/trips-route.test.ts tests/unit/api/fuel-route.test.ts`

Expected: FAIL, obecne route wykonują wiele nieatomowych operacji/direct DML.

- [ ] **Step 3: Zastąp mutacje RPC**

POST/PATCH trip przekazują jeden `SaveTripCommand`; DELETE wywołuje `delete_trip_and_recalculate`. Fuel POST/PATCH wywołuje `save_fuel_purchase`; DELETE przekazuje expected timestamp do `delete_fuel_purchase`. Nie ustawiaj `user_id` w payload.

- [ ] **Step 4: Zaktualizuj GET contracts**

Trip detail dołącza `fuel_purchases` i `trip_allowances`. Lista sortuje `date_from desc, trip_sequence desc, id desc`; brak filtrowania i stronicowania w pamięci. Fuel lista ma DB range/count.

- [ ] **Step 5: Usuń starą aplikacyjną cascade po potwierdzeniu braku importów**

Run: `rg -n "cascadeRecalculateTrips|lib/utils/recalculate" app components lib`

Expected przed usunięciem: zero konsumentów. Dopiero wtedy usuń `lib/utils/recalculate.ts`.

- [ ] **Step 6: Zweryfikuj green**

Run:

```powershell
npm run test:unit -- tests/unit/api
npm run type-check
rg -n "\.from\('(trips|fuel_purchases|trip_allowances)'\)\.(insert|update|delete)" app lib components
```

Expected: tests/typecheck PASS; wyszukiwanie nie znajduje bezpośrednich mutacji krytycznych tabel.

- [ ] **Step 7: Commit**

```powershell
git add app/api/trips app/api/fuel lib/utils/recalculate.ts tests/unit/api
git commit -m "refactor: route trip and fuel mutations through rpc"
```

### Task 21: Dodaj date-only i trójpoziomową walidację domenową

**Files:**
- Create: `lib/domain/date-only/index.ts`
- Create: `lib/domain/validation/trip-validation.ts`
- Create: `tests/unit/date-only.test.ts`
- Create: `tests/unit/trip-validation.test.ts`
- Modify: `lib/utils/calculations.ts`
- Modify: `lib/utils/validation.ts`
- Modify: `lib/utils/formatting.ts`

**Interfaces:**
- Consumes: Vitest Task 2 i command/date wymagania specyfikacji; API Task 20 będzie pierwszym konsumentem.
- Produces: `parseDateOnly`, `compareDateOnly`, `addDays`, `inclusiveRange`, `ValidationIssue{level:'error'|'suggestion'|'info'}`.

- [ ] **Step 1: Napisz failing date tests**

Europe/Warsaw DST: 2026-03-28..30 i 2026-10-24..26, leap day, reversed range, brak `Date` UTC drift.

- [ ] **Step 2: Napisz failing validation tests**

Brak wymaganej daty/vehicle = error. Brak invoice, nietypowa trasa/zużycie i standalone = suggestion/info. Tylko error blokuje command.

- [ ] **Step 3: Potwierdź red**

Run: `npm run test:unit -- tests/unit/date-only.test.ts tests/unit/trip-validation.test.ts`

Expected: FAIL, nowe moduły nie istnieją.

- [ ] **Step 4: Zaimplementuj bez UTC coercion**

Date-only jest parsowane regexem + walidacją kalendarzową; `addDays` operuje na liczbach roku/miesiąca/dnia w kontrolowanym UTC wyłącznie wewnątrz helpera i zwraca string. Usuń domenowe `new Date('YYYY-MM-DD')`, `toISOString().slice(0,10)`, `setDate()` z logiki trip/allowance.

- [ ] **Step 5: Zweryfikuj green i grep**

Run:

```powershell
npm run test:unit -- tests/unit/date-only.test.ts tests/unit/trip-validation.test.ts
rg -n "new Date\([^)]*date_|toISOString\(\)\.slice\(0, ?10\)|setDate\(" app components lib
```

Expected: tests PASS; pozostałe trafienia są wyłącznie uzasadnionymi timestampami, nie date-only.

- [ ] **Step 6: Commit**

```powershell
git add lib/domain/date-only lib/domain/validation lib/utils/calculations.ts lib/utils/validation.ts lib/utils/formatting.ts tests/unit/date-only.test.ts tests/unit/trip-validation.test.ts
git commit -m "refactor: centralize date-only and validation semantics"
```

**Checkpoint F5:** API command jest ostateczną whitelistą, krytyczne mutacje mają pojedyncze RPC, a date-only i error levels mają unit tests.

## FAZA 6 — wiele tankowań w UI

### Task 22: Wydziel stan draftu agregatu bez zmiany wyglądu

**Files:**
- Create: `components/trips/useTripDraft.ts`
- Create: `components/trips/trip-draft-mapper.ts`
- Create: `tests/components/use-trip-draft.test.tsx`
- Create: `tests/unit/trip-draft-mapper.test.ts`
- Modify: `components/trips/TripForm.tsx`

**Interfaces:**
- Consumes: draft/command schemas Task 18, API contract Task 20 i istniejący `TripForm`.
- Produces: hook zarządzający `fuel_purchases[]`, deleted stack z pierwotnym indeksem, allowances i dirty state; mapper draft→command.

- [ ] **Step 1: Napisz failing reducer/hook tests**

Add/edit/delete/undo purchase, undo odtwarza pełny rekord i ten sam index; wielokrotne undo; edycja niezwiązana z paliwem zachowuje `preserve_legacy`; command zawiera expected timestamps.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/components/use-trip-draft.test.tsx tests/unit/trip-draft-mapper.test.ts`

Expected: FAIL, hook/mapper nie istnieją.

- [ ] **Step 3: Zaimplementuj hook i mapper**

Nie zmieniaj jeszcze markup sekcji. `TripForm` korzysta z hooka, ale wysyła już `SaveTripCommand`; nie czyta computed fuel fields jako zaufanych wejść.

- [ ] **Step 4: Zweryfikuj brak regresji**

Run:

```powershell
npm run test:unit -- tests/components/use-trip-draft.test.tsx tests/unit/trip-draft-mapper.test.ts
npm run type-check
```

Expected: PASS; obecny formularz renderuje się, a stan wielu tankowań jest niezależny.

- [ ] **Step 5: Commit**

```powershell
git add components/trips/useTripDraft.ts components/trips/trip-draft-mapper.ts components/trips/TripForm.tsx tests/components/use-trip-draft.test.tsx tests/unit/trip-draft-mapper.test.ts
git commit -m "refactor: introduce aggregate trip draft state"
```

### Task 23: Wydziel sekcje TripForm i workflow wielu tankowań

**Files:**
- Create: `components/trips/sections/TripBasicInfo.tsx`
- Create: `components/trips/sections/ClientSelector.tsx`
- Create: `components/trips/sections/RouteSection.tsx`
- Create: `components/trips/sections/MileageSection.tsx`
- Create: `components/trips/sections/FuelSection.tsx`
- Create: `components/trips/sections/FuelPurchaseList.tsx`
- Create: `components/trips/sections/FuelPurchaseForm.tsx`
- Create: `components/trips/sections/AllowanceSection.tsx`
- Create: `components/trips/sections/HotelSection.tsx`
- Create: `components/trips/sections/TripSummary.tsx`
- Create: `components/trips/sections/TripValidationSummary.tsx`
- Create: `tests/components/fuel-section.test.tsx`
- Modify: `components/trips/TripForm.tsx`

**Interfaces:**
- Consumes: `useTripDraft`, fuel draft schema.
- Produces: kontrolowane, małe sekcje; FuelSection emituje `add/edit/remove/undo` bez zapisu DB.

- [ ] **Step 1: Napisz failing FuelSection tests**

Render dwa purchases, dokładna suma, edit zachowuje id/timestamp, delete nie wywołuje fetch, undo odtwarza dane/index, save parent wysyła cały agregat.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/components/fuel-section.test.tsx`

Expected: FAIL, komponenty nie istnieją.

- [ ] **Step 3: Wydziel sekcje po jednej bez rewrite**

Po każdym wydzieleniu uruchom `npm run type-check`. `TripForm` pozostaje orchestrator, nie powiela walidacji ani matematyki. Inline create client zostaje na obecnym API i zostanie utwardzone w Fazie 7.

- [ ] **Step 4: Zweryfikuj green**

Run:

```powershell
npm run test:unit -- tests/components/fuel-section.test.tsx
npm run type-check
```

Expected: PASS; `TripForm.tsx` nie zawiera bezpośredniej mutacji `fuel_purchases` ani pojedynczego pola `fuel_purchased` jako source of truth.

- [ ] **Step 5: Commit**

```powershell
git add components/trips/TripForm.tsx components/trips/sections tests/components/fuel-section.test.tsx
git commit -m "refactor: split trip form into stable sections"
```

### Task 24: Dodaj legacy actions, preview i precyzyjne formatowanie

**Files:**
- Modify: `components/trips/sections/FuelSection.tsx`
- Modify: `components/trips/sections/TripSummary.tsx`
- Create: `components/trips/sections/LegacyFuelPanel.tsx`
- Create: `tests/components/legacy-fuel.test.tsx`
- Create: `tests/components/fuel-preview.test.tsx`

**Interfaces:**
- Consumes: Decimal preview Task 10 i action model RPC.
- Produces: jawne `preserve_legacy`, `switch_to_norm`, `recalculate_norm`; UI `7,2`, `36,42`, `58,2`.

- [ ] **Step 1: Napisz failing legacy/preview tests**

Non-fuel edit nie pokazuje automatycznego switch; zmiana normy/korekty wymaga jawnego potwierdzenia; samo dodanie tankowania nie przełącza legacy; preview dwóch zakupów odpowiada DB cases.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/components/legacy-fuel.test.tsx tests/components/fuel-preview.test.tsx`

Expected: FAIL przed UI.

- [ ] **Step 3: Zaimplementuj neutralny panel i formatting**

Przycisk `Przelicz według normy` ustawia jawny action. Pola computed są read-only. UI usuwa zbędne zera, lecz nigdy nie mutuje wartości draft/source przez formatting.

- [ ] **Step 4: Zweryfikuj green i cały unit suite**

Run: `npm run test:unit`

Expected: PASS; legacy pozostaje przewidywalny.

- [ ] **Step 5: Commit**

```powershell
git add components/trips/sections tests/components/legacy-fuel.test.tsx tests/components/fuel-preview.test.tsx
git commit -m "feat: support explicit legacy and multiple fuel workflow"
```

**Checkpoint F6:** TripForm zapisuje agregat, wiele purchases działa jako draft, undo jest bezstratne, legacy nie przełącza się automatycznie.

## FAZA 7 — walidacja i pozostałe ekrany

### Task 25: Utwardź CRUD clients/vehicles/drivers i dezaktywację

**Files:**
- Create: `lib/schemas/client-command.ts`
- Create: `lib/schemas/vehicle-command.ts`
- Create: `lib/schemas/driver-command.ts`
- Modify: `app/api/clients/route.ts`
- Modify: `app/api/clients/[id]/route.ts`
- Modify: `app/api/vehicles/route.ts`
- Modify: `app/api/vehicles/[id]/route.ts`
- Modify: `app/api/drivers/route.ts`
- Modify: `app/api/drivers/[id]/route.ts`
- Modify: `app/(dashboard)/klienci/page.tsx`
- Modify: `app/(dashboard)/pojazdy/page.tsx`
- Modify: `app/(dashboard)/kierowcy/page.tsx`
- Create: `tests/unit/api/entity-routes.test.ts`

**Interfaces:**
- Consumes: API helpers Task 19, generated types Task 18 i ownership DB `010`.
- Produces: strict whitelists, per-user conflicts, domyślna dezaktywacja i dependency-aware permanent delete.

- [ ] **Step 1: Napisz failing API tests**

Odrzuć `user_id`, unknown fields i destructive force bez zależności check. Standard DELETE z historią zmienia `is_active=false`; permanent delete tylko bez zależności i z jawnym confirm tokenem w command.

- [ ] **Step 2: Potwierdź red i zaimplementuj strict schemas/API**

Run przed zmianą: `npm run test:unit -- tests/unit/api/entity-routes.test.ts` → FAIL. Po zmianie route nie używają `insert({...body})` ani `update(body)`.

- [ ] **Step 3: Zaktualizuj UI akcji**

Primary action to `Dezaktywuj`. `Usuń trwale` jest drugorzędne, widoczne dopiero po dependency check i wymaga wpisania nazwy/rejestracji w confirm dialog.

- [ ] **Step 4: Zweryfikuj green i grep**

Run:

```powershell
npm run test:unit -- tests/unit/api/entity-routes.test.ts
rg -n "insert\(\{ ?\.\.\.body|update\(body\)" app/api
npm run type-check
```

Expected: PASS; grep bez trafień.

- [ ] **Step 5: Commit**

```powershell
git add lib/schemas/*-command.ts app/api/clients app/api/vehicles app/api/drivers 'app/(dashboard)/klienci/page.tsx' 'app/(dashboard)/pojazdy/page.tsx' 'app/(dashboard)/kierowcy/page.tsx' tests/unit/api/entity-routes.test.ts
git commit -m "security: whitelist entity mutations and prefer deactivation"
```

### Task 26: Uporządkuj hotels, distances i allowances

**Files:**
- Create: `lib/schemas/hotel-command.ts`
- Create: `lib/schemas/hotel-distance-command.ts`
- Modify: `app/api/hotels/route.ts`
- Modify: `app/api/hotels/[id]/route.ts`
- Modify: `app/api/hotels/[id]/clients/route.ts`
- Modify: `app/api/hotels/[id]/clients/[entryId]/route.ts`
- Modify: `app/api/allowances/route.ts`
- Modify: `app/(dashboard)/hotele/page.tsx`
- Modify: `app/(dashboard)/diety/page.tsx`
- Create: `tests/unit/api/hotels-allowances.test.ts`

**Interfaces:**
- Consumes: composite ownership/RLS `010`; trip allowances mutations przez aggregate RPC dla TripForm.
- Produces: osobne bezpieczne command routes dla standalone management.

- [ ] **Step 1: Napisz failing tests**

Cross-owner hotel/client UUID jest odrzucone, `user_id` nie jest przyjmowane, distance upsert jest per-user, allowance day poza trip range jest odrzucony, permanent delete nie niszczy historii.

- [ ] **Step 2: Potwierdź red i zaimplementuj**

Run przed: `npm run test:unit -- tests/unit/api/hotels-allowances.test.ts` → FAIL. Route używają strict schemas, session i RLS; krytyczna zmiana allowance powiązana z trip przechodzi przez `save_trip_with_children` albo dedykowaną bezpieczną ścieżkę zachowującą transakcję.

- [ ] **Step 3: Zweryfikuj green**

Run:

```powershell
npm run test:unit -- tests/unit/api/hotels-allowances.test.ts
npm run test:db -- tests/database/rls/ownership.test.ts
```

Expected: PASS; USER B nie może użyć UUID USER A.

- [ ] **Step 4: Commit**

```powershell
git add lib/schemas/hotel* app/api/hotels app/api/allowances 'app/(dashboard)/hotele/page.tsx' 'app/(dashboard)/diety/page.tsx' tests/unit/api/hotels-allowances.test.ts
git commit -m "security: enforce hotel and allowance ownership commands"
```

### Task 27: Przenieś listy, raporty i sumy do DB

**Files:**
- Modify: `app/api/trips/route.ts`
- Modify: `app/api/fuel/route.ts`
- Modify: `app/api/reports/route.ts`
- Modify: `app/api/export/route.ts`
- Modify: `app/(dashboard)/page.tsx`
- Modify: `app/(dashboard)/przejazdy/page.tsx`
- Modify: `app/(dashboard)/paliwo/page.tsx`
- Modify: `app/(dashboard)/raporty/page.tsx`
- Modify: `lib/utils/calculations.ts`
- Modify: `lib/utils/export.ts`
- Create: `tests/unit/api/query-routes.test.ts`
- Create: `tests/database/reports.test.ts`

**Interfaces:**
- Consumes: thin API/error helpers, `fuel_purchases` source of truth i DB pagination capability.
- Produces: bounded `page/pageSize`, DB search/count/filter; raport/dashboard/export sumują purchases, nigdy `trips.fuel_purchased`.

- [ ] **Step 1: Napisz failing query/report tests**

Testuje page boundary, search w DB, stabilny order, filtr has-errors bez pobrania całej tabeli, sumę wielu purchases, standalone wykluczony z trip chain ale uwzględniony w osobnym raporcie zakupów.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/unit/api/query-routes.test.ts; npm run test:db -- tests/database/reports.test.ts`

Expected: FAIL, obecne filtrowanie/slice i legacy sumy.

- [ ] **Step 3: Zaimplementuj DB pagination/report projections**

Użyj RLS-aware SQL view/RPC `security_invoker` lub jawnych queries z range/count. Maksymalny page size 100. Raporty nie przyjmują user_id i zawsze działają w sesji.

- [ ] **Step 4: Zweryfikuj green i source-of-truth grep**

Run:

```powershell
npm run test:unit -- tests/unit/api/query-routes.test.ts
npm run test:db -- tests/database/reports.test.ts
rg -n "totalFuel.*fuel_purchased|SUM\(.*trips\.fuel_purchased" app lib
```

Expected: PASS; brak raportowych sum z legacy field.

- [ ] **Step 5: Commit**

```powershell
git add app/api/trips/route.ts app/api/fuel/route.ts app/api/reports/route.ts app/api/export/route.ts 'app/(dashboard)' lib/utils/calculations.ts lib/utils/export.ts tests/unit/api/query-routes.test.ts tests/database/reports.test.ts
git commit -m "refactor: move private list and report queries to database"
```

**Checkpoint F7:** pozostałe CRUD mają whitelists/ownership, dezaktywacja chroni historię, listy są stronicowane w DB, raporty używają purchases.

## FAZA 8 — import i zależności

### Task 28: Zastąp `xlsx` przez ExcelJS i napraw `import_logs`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Rewrite: `lib/utils/excel.ts`
- Modify: `app/api/import/route.ts`
- Modify: `app/(dashboard)/import/page.tsx`
- Modify: `docs/IMPORT_GUIDE.md`
- Create: `lib/schemas/import-command.ts`
- Create: `tests/unit/import/excel.test.ts`
- Create: `tests/unit/import/csv.test.ts`
- Create: `tests/unit/api/import-route.test.ts`
- Create: `tests/fixtures/import/clients.xlsx`
- Create: `tests/fixtures/import/trips.csv`

**Interfaces:**
- Consumes: command/RPC import path, per-user unique `010` i date-only Task 21.
- Produces: tylko przetestowane `.xlsx`/`.csv`, limity 5 MB/10 sheets/5000 rows/100 columns, zapis do `import_logs`, per-user code upsert.

- [ ] **Step 1: Napisz failing parser/limit/API tests**

Poprawny xlsx/csv, odrzucenie `.xls`, macro/unknown extension, za duży plik/sheet/rows/columns, formula treated as data policy, row errors bez stack trace, brak globalnego merge po nazwie.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/unit/import tests/unit/api/import-route.test.ts`

Expected: FAIL, obecny parser korzysta z `xlsx` i route ma niespójny model.

- [ ] **Step 3: Usuń podatną bibliotekę i dodaj ExcelJS**

Run:

```powershell
npm uninstall xlsx
npm install exceljs
```

Parser sprawdza MIME, rozszerzenie i magic bytes ZIP dla xlsx; CSV ma jawny UTF-8/delimiter policy. Import trip zachowuje kolejność wierszy jako sequence i idzie bezpieczną command/RPC path.

- [ ] **Step 4: Zaimplementuj `import_logs` zgodnie ze schematem DB**

Używaj `filename,total_rows,imported,failed,errors,created_by/user_id` zgodnie z typami po migracjach; nie odwołuj się do nieistniejącej `imports`.

- [ ] **Step 5: Zweryfikuj green i usunięcie xlsx**

Run:

```powershell
npm run test:unit -- tests/unit/import tests/unit/api/import-route.test.ts
npm ls xlsx
rg -n "from ['\"]xlsx|require\(['\"]xlsx" . -g '!node_modules/**'
```

Expected: tests PASS; `npm ls xlsx` nie znajduje pakietu; grep bez importów.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json lib/utils/excel.ts lib/schemas/import-command.ts app/api/import/route.ts 'app/(dashboard)/import/page.tsx' docs/IMPORT_GUIDE.md tests/unit/import tests/unit/api/import-route.test.ts tests/fixtures/import
git commit -m "security: replace xlsx and constrain imports"
```

### Task 29: Wykonaj kontrolowany upgrade Next i klasyfikację advisories

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `docs/security/dependency-review.md`

**Interfaces:**
- Consumes: aktualny audit i oficjalne advisories w dniu implementacji.
- Produces: poprawiona stabilna wersja Next i tabela każdego high/critical: runtime/dev, reachability, advisory, fixed version, resolution, upgrade impact.

- [ ] **Step 1: Zapisz niezmieniający audit i dependency tree**

Run:

```powershell
npm audit --json
npm outdated
npm ls next react react-dom @ducanh2912/next-pwa jspdf dompurify sharp postcss @babel/core
```

Expected: raport wejściowy bez automatycznej naprawy.

- [ ] **Step 2: Zweryfikuj oficjalne fixed versions**

Korzystaj z primary advisories/GitHub Security Advisory i release notes. Dla każdego finding uzupełnij wszystkie pięć pól; nierozwiązany critical runtime nadaj status `PRODUCTION BLOCKER`.

- [ ] **Step 3: Zaktualizuj Next w najmniejszym bezpiecznym zakresie**

Po potwierdzeniu w Step 2, że najnowsza linia 15.x zawiera wymagane poprawki, wybierz i zainstaluj ją deterministycznie:

```powershell
$nextCandidates = npm view next@15 version --json | ConvertFrom-Json
$nextTarget = $nextCandidates[-1]
if (-not $nextTarget) { throw 'Nie znaleziono stabilnej wersji Next 15.x' }
npm install "next@$nextTarget" "eslint-config-next@$nextTarget"
```

Jeżeli oficjalne advisory nie wskazuje bezpiecznej wersji 15.x, zatrzymaj task i przedstaw wpływ migracji major zamiast automatycznie instalować Next 16. Expected: wybrana wersja jest poprawiona dla dotyczących projektu advisory; brak `--force`.

- [ ] **Step 4: Pełna weryfikacja po upgrade**

Run:

```powershell
npm run lint
npm run type-check
npm run test:unit
npm run test:db
npm run build
npm audit --json
```

Expected: quality gates PASS; każdy pozostały high/critical ma klasyfikację, nie jest ignorowany zbiorczo.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json docs/security/dependency-review.md
git commit -m "security: update Next and document dependency advisories"
```

**Checkpoint F8:** `xlsx` nie istnieje, `.xls` nie jest deklarowane, import limits są przetestowane, dependency report ma jawne blockery.

## FAZA 9 — PWA, auth i security

### Task 30: Usuń prywatny runtime cache i zdecyduj o service workerze testem

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `next.config.ts`
- Delete if generated artifacts are tracked: `public/sw.js`
- Delete if generated artifacts are tracked: `public/swe-worker-5c72df51bb1f6ee0.js`
- Delete if generated artifacts are tracked: `public/workbox-f1770938.js`
- Modify: `.gitignore`
- Create: `tests/unit/security/pwa-config.test.ts`
- Create: `tests/e2e/cache.spec.ts`

**Interfaces:**
- Consumes: stabilny build/dependency baseline po Task 29 oraz cache wymagania specyfikacji.
- Produces: brak cache API/RSC/auth HTML/dashboard; manifest pozostaje.

- [ ] **Step 1: Napisz failing config/cache tests**

Static inspection odrzuca `cacheOnFrontEndNav:true`, `aggressiveFrontEndNavCaching:true` i runtime rules dla `/api`, RSC lub document. E2E po logout sprawdza, że back/reload nie pokazuje prywatnego dashboardu i CacheStorage nie zawiera private responses.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/unit/security/pwa-config.test.ts`

Expected: FAIL na obecnym `next.config.ts`.

- [ ] **Step 3: Wyłącz service worker w pierwszym wydaniu, jeśli allowlista nie jest dowodliwa**

Domyślny plan: usuń wrapper PWA z build pierwszego wydania, wykonaj `npm uninstall @ducanh2912/next-pwa`, pozostaw manifest/ikony i usuń wygenerowane worker files z repo. Alternatywa jest dopuszczalna wyłącznie, jeśli test udowodni allowlistę wersjonowanych static assets bez dokumentów/API/RSC.

- [ ] **Step 4: Zweryfikuj build/cache**

Run:

```powershell
npm run test:unit -- tests/unit/security/pwa-config.test.ts
npm run build
rg -n "NetworkFirst|StaleWhileRevalidate|/api|_rsc" public -g '*.js'
```

Expected: unit/build PASS; brak workera cache'ującego prywatne ścieżki.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json next.config.ts .gitignore public tests/unit/security/pwa-config.test.ts tests/e2e/cache.spec.ts
git commit -m "security: disable private PWA caching"
```

### Task 31: Usuń runtime service role i wykonaj gate `middleware.ts`

**Files:**
- Delete: `lib/supabase/admin.ts`
- Modify: environment documentation in `docs/SETUP.md`
- Read/approval gate: original worktree `middleware.ts`
- Modify only after explicit user decision: `middleware.ts`
- Modify: `app/auth/signout/route.ts`
- Create: `tests/unit/security/auth-boundary.test.ts`

**Interfaces:**
- Consumes: session/API boundary Task 19 i wynik PWA cleanup Task 30.
- Produces: runtime bez `SUPABASE_SERVICE_ROLE_KEY`, kontrolowany auth/logout, bezpiecznie uzgodniona wersja middleware.

- [ ] **Step 1: Napisz failing auth boundary tests**

Brak service role env nie psuje runtime; brak/expired session prowadzi do login; logout czyści auth cookies i prywatny client query state/cache; redirect jest allowlistowany.

- [ ] **Step 2: Znajdź wszystkich konsumentów admin client**

Run:

```powershell
rg -n "createAdminClient|SUPABASE_SERVICE_ROLE_KEY|lib/supabase/admin" . -g '!node_modules/**'
```

Expected: lista jest kompletna. Przenieś tworzenie/zapraszanie userów poza runtime; usuń client dopiero po zerowej liczbie konsumentów.

- [ ] **Step 3: Wykonaj obowiązkowy gate przed `middleware.ts`**

Run w oryginalnym worktree:

```powershell
$sourceWorkspace = 'D:\Programy\Projekty Aplikacji\ewidencja-nextjs'
git -C $sourceWorkspace diff -- middleware.ts
Get-FileHash -Algorithm SHA256 "$sourceWorkspace\middleware.ts"
git diff -- middleware.ts
```

Expected: pokaż użytkownikowi istniejącą zmianę `try/catch` oraz proponowany patch auth. **Zatrzymaj wykonanie tego tasku i uzyskaj zgodę na merge; nie edytuj, nie stashuj i nie kopiuj pliku automatycznie.**

- [ ] **Step 4: Po zgodzie wykonaj minimalny merge**

Zachowaj semantykę user diffu, dodaj wyłącznie zatwierdzone auth zachowanie i nie wprowadzaj maintenance do middleware, jeśli route-level guard wystarcza dla aplikacji. Rozwiązany diff pokaż ponownie przed commitem.

- [ ] **Step 5: Zweryfikuj auth i brak sekretu**

Run:

```powershell
npm run test:unit -- tests/unit/security/auth-boundary.test.ts
npm run type-check
rg -n "SUPABASE_SERVICE_ROLE_KEY|createAdminClient" app components lib middleware.ts
```

Expected: tests PASS; grep bez runtime trafień.

- [ ] **Step 6: Commit bez przypadkowych zmian**

```powershell
git add lib/supabase/admin.ts docs/SETUP.md app/auth/signout/route.ts tests/unit/security/auth-boundary.test.ts
# middleware.ts dodaj tylko po osobnej zgodzie i sprawdzeniu diffu
git status --short
git commit -m "security: remove runtime service-role dependency"
```

Jeżeli zatwierdzony middleware jest osobnym logicznym patchem, commit: `security: harden authenticated route middleware`.

### Task 32: Dodaj kompatybilne security headers, CSP i `next/font`

**Files:**
- Create: `lib/server/security/headers.ts`
- Create: `tests/unit/security/headers.test.ts`
- Modify: `next.config.ts`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `vercel.json`
- Create: `docs/security/csp.md`

**Interfaces:**
- Consumes: finalny zestaw runtime origins po Tasks 29–31.
- Produces: etap 1 CSP zgodny z faktycznie używanymi Next/Supabase/Vercel sources; nosniff, referrer, frame, permissions; HSTS tylko production HTTPS.

- [ ] **Step 1: Napisz failing header tests**

Sprawdź brak wildcard sources, brak przypadkowego `unsafe-eval`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, nosniff i bezpieczny referrer. Testuje osobno dev/prod.

- [ ] **Step 2: Zinwentaryzuj wymagane sources**

Z build/runtime network log wypisz self, konkretny Supabase HTTPS/WSS host i Vercel wymagane origins. Każde `unsafe-inline`, jeśli Next wymaga go w etapie 1, jest ograniczone do konkretnej dyrektywy i opisane jako jawne ryzyko/hardening step; nie dodawaj go zbiorczo.

- [ ] **Step 3: Zastąp Google link przez `next/font`**

`app/layout.tsx` importuje Inter z `next/font/google`; usuń preconnect i zewnętrzny stylesheet. Usuń `maximumScale:1`.

- [ ] **Step 4: Zaimplementuj i zweryfikuj**

Run:

```powershell
npm run test:unit -- tests/unit/security/headers.test.ts
npm run build
npm run type-check
```

Expected: PASS; font jest self-hosted; CSP nie blokuje login/API w lokalnym smoke.

- [ ] **Step 5: Commit**

```powershell
git add lib/server/security tests/unit/security/headers.test.ts next.config.ts app/layout.tsx app/globals.css vercel.json docs/security/csp.md
git commit -m "security: add compatible headers and self-hosted fonts"
```

**Checkpoint F9:** brak prywatnego cache i runtime service role; auth change uzgodniona; CSP ma udokumentowany, wąski etap kompatybilny.

## FAZA 10 — mobile-first redesign

### Task 33: Ustanów dostępne UI primitives i stany

**Files:**
- Modify: `components/ui/Modal.tsx`
- Create: `components/ui/BottomSheet.tsx`
- Create: `components/ui/ResponsiveDialog.tsx`
- Create: `components/ui/ConfirmDialog.tsx`
- Create: `components/ui/states/LoadingState.tsx`
- Create: `components/ui/states/EmptyState.tsx`
- Create: `components/ui/states/ErrorState.tsx`
- Modify: `components/ui/Input.tsx`
- Modify: `components/ui/Select.tsx`
- Modify: `components/ui/DatePicker.tsx`
- Create: `tests/components/dialog-accessibility.test.tsx`
- Create: `tests/components/form-controls-accessibility.test.tsx`

**Interfaces:**
- Consumes: Testing Library Task 2 i istniejące UI controls.
- Produces: responsive modal/sheet bez swipe-close, focus trap/return, dirty confirm, aria error contracts, wspólne loading/empty/error.

- [ ] **Step 1: Napisz failing keyboard/focus tests**

Open przenosi focus, Tab zostaje w dialogu, Escape przy clean zamyka, dirty pokazuje confirm, close przywraca trigger; title/description są powiązane aria. Inputs używają `aria-invalid` i `aria-describedby`.

- [ ] **Step 2: Potwierdź red**

Run: `npm run test:unit -- tests/components/dialog-accessibility.test.tsx tests/components/form-controls-accessibility.test.tsx`

Expected: FAIL dla brakującego sheet/focus behavior.

- [ ] **Step 3: Zaimplementuj primitives**

Desktop modal, mobile bottom/fullscreen sheet przez media query/hook. Uwzględnij safe area, visual viewport keyboard offset i scroll lock. Brak swipe gesture.

- [ ] **Step 4: Zweryfikuj green**

Run: `npm run test:unit -- tests/components/dialog-accessibility.test.tsx tests/components/form-controls-accessibility.test.tsx`

Expected: PASS bez timer/focus flakiness.

- [ ] **Step 5: Commit**

```powershell
git add components/ui tests/components/dialog-accessibility.test.tsx tests/components/form-controls-accessibility.test.tsx
git commit -m "ui: add accessible responsive dialog primitives"
```

### Task 34: Napraw shell, MobileNav, sticky actions i unsaved changes

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `components/layout/MobileNav.tsx`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `components/layout/Header.tsx`
- Create: `lib/hooks/useUnsavedChanges.ts`
- Create: `components/layout/QuickActionDialog.tsx`
- Create: `tests/components/mobile-navigation.test.tsx`
- Create: `tests/components/unsaved-changes.test.tsx`

**Interfaces:**
- Consumes: ResponsiveDialog/ConfirmDialog Task 33 i auth shell Task 31.
- Produces: MobileNav ukryty na add/edit trip routes; quick action tylko Trip/Tankowanie; internal custom confirm + standard beforeunload.

- [ ] **Step 1: Napisz failing navigation tests**

Na `/przejazdy/dodaj` i `/przejazdy/:id/edytuj` nav jest ukryty; sticky actions są osiągalne nad safe area. Internal navigation dirty pokazuje custom dialog; beforeunload ustawia `preventDefault/returnValue` bez custom text.

- [ ] **Step 2: Potwierdź red i zaimplementuj**

Run przed: `npm run test:unit -- tests/components/mobile-navigation.test.tsx tests/components/unsaved-changes.test.tsx` → FAIL. Po implementacji MobileNav central `+` ma wyłącznie dwa CTA.

- [ ] **Step 3: Usuń niespójność `user_profiles`**

Sidebar czyta `profiles`; role nie pokazują dostępu do cudzych danych i nie pochodzą z raw metadata.

- [ ] **Step 4: Zweryfikuj green**

Run:

```powershell
npm run test:unit -- tests/components/mobile-navigation.test.tsx tests/components/unsaved-changes.test.tsx
npm run type-check
```

Expected: PASS; brak overlap z nav/sticky/footer.

- [ ] **Step 5: Commit**

```powershell
git add 'app/(dashboard)/layout.tsx' components/layout lib/hooks/useUnsavedChanges.ts tests/components/mobile-navigation.test.tsx tests/components/unsaved-changes.test.tsx
git commit -m "ui: make mobile navigation safe for editing"
```

### Task 35: Przebuduj dashboard i główne listy mobile-first

**Files:**
- Modify: `app/(dashboard)/page.tsx`
- Modify: `app/(dashboard)/przejazdy/page.tsx`
- Modify: `app/(dashboard)/paliwo/page.tsx`
- Create: `components/dashboard/OperationalSummary.tsx`
- Create: `components/dashboard/RecentTrips.tsx`
- Create: `components/trips/TripCard.tsx`
- Create: `components/fuel/FuelPurchaseCard.tsx`
- Create: `components/ui/ResponsiveList.tsx`
- Create: `tests/components/dashboard.test.tsx`
- Create: `tests/components/responsive-lists.test.tsx`

**Interfaces:**
- Consumes: DB list/report API Task 27 i UI states Task 33.
- Produces: lekki dashboard (vehicle, odometer, fuel, month, recent, 2 CTA), cards mobile/tables desktop.

- [ ] **Step 1: Napisz failing content/responsive tests**

Dashboard nie renderuje dodatkowych wykresów; cards mają najważniejsze dane/actions; liczba kolumn wynika z min width/content, nie sztywno z viewportu.

- [ ] **Step 2: Potwierdź red i zaimplementuj**

Run przed: `npm run test:unit -- tests/components/dashboard.test.tsx tests/components/responsive-lists.test.tsx` → FAIL. Użyj CSS grid `repeat(auto-fit,minmax(...))` tylko gdy zawartość pozostaje czytelna; dla 360 dopuszczalna jedna kolumna.

- [ ] **Step 3: Dodaj komplet stanów**

Każda lista: initial skeleton, true empty, filtered empty, retry error, stale data podczas refetch. Czerwony tylko errors/destructive.

- [ ] **Step 4: Zweryfikuj green**

Run: `npm run test:unit -- tests/components/dashboard.test.tsx tests/components/responsive-lists.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add 'app/(dashboard)/page.tsx' 'app/(dashboard)/przejazdy/page.tsx' 'app/(dashboard)/paliwo/page.tsx' components/dashboard components/trips/TripCard.tsx components/fuel components/ui/ResponsiveList.tsx tests/components/dashboard.test.tsx tests/components/responsive-lists.test.tsx
git commit -m "ui: add mobile-first operational dashboard and lists"
```

### Task 36: Ujednolić pozostałe ekrany i TripForm responsive/accessibility

**Files:**
- Modify: `components/trips/TripForm.tsx`
- Modify: `components/trips/sections/*.tsx`
- Modify: `app/(dashboard)/klienci/page.tsx`
- Modify: `app/(dashboard)/klienci/[id]/page.tsx`
- Modify: `app/(dashboard)/hotele/page.tsx`
- Modify: `app/(dashboard)/pojazdy/page.tsx`
- Modify: `app/(dashboard)/kierowcy/page.tsx`
- Modify: `app/(dashboard)/diety/page.tsx`
- Modify: `app/(dashboard)/raporty/page.tsx`
- Modify: `app/(dashboard)/ustawienia/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/components/trip-form-accessibility.test.tsx`
- Create: `tests/components/entity-screens.test.tsx`

**Interfaces:**
- Consumes: primitives Tasks 33–35.
- Produces: sekcyjne/collapsible mobile TripForm, desktop expanded cards/sticky summary, cards/table screens i pełne a11y contracts.

- [ ] **Step 1: Napisz failing TripForm accessibility tests**

Error otwiera sekcję i focusuje pole; validation summary ma aria-live; labels/descriptions są powiązane; sticky save pozostaje dostępne przy keyboard/safe area; no horizontal overflow w semantic DOM fixture.

- [ ] **Step 2: Napisz failing entity screen state tests**

Clients/hotels/vehicles/drivers/allowances/reports/settings mają mobile card, desktop table gdzie sensowne, loading/empty/error i keyboard-operable actions.

- [ ] **Step 3: Potwierdź red i implementuj ekran po ekranie**

Po każdym ekranie uruchom odpowiadający test i `npm run type-check`. Nie dodawaj nowych dashboard modules ani nowych encji.

- [ ] **Step 4: Zweryfikuj component suite i axe unit checks**

Run:

```powershell
npm run test:unit -- tests/components
npm run type-check
npm run lint
```

Expected: PASS; brak niedostępnych dialogów/inputs wykrytych przez testy.

- [ ] **Step 5: Commit**

```powershell
git add components/trips 'app/(dashboard)' app/globals.css tests/components/trip-form-accessibility.test.tsx tests/components/entity-screens.test.tsx
git commit -m "ui: complete accessible mobile-first application screens"
```

**Checkpoint F10:** viewport-independent czytelność, brak nav overlap, pełne stany, focus/keyboard/aria pozostają częścią DoD.

## FAZA 11 — E2E i final verification

### Task 37: Dodaj Playwright, axe i macierz viewportów

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/auth.setup.ts`
- Create: `tests/e2e/trip-fuel.spec.ts`
- Create: `tests/e2e/legacy.spec.ts`
- Create: `tests/e2e/concurrency.spec.ts`
- Modify: `tests/e2e/cache.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/overflow.spec.ts`

**Interfaces:**
- Consumes: ukończone UI/API/DB Tasks 1–36 i lokalne USER A/B fixture.
- Produces: projekty 360×800, 390×844, 430×932, 768×1024, 1366×768, 1920×1080; lokalne auth storage dla USER A/B.

- [ ] **Step 1: Dodaj zależności i failing smoke**

Run: `npm install --save-dev @playwright/test @axe-core/playwright`

Pierwszy test loguje się lokalnym USER A i oczekuje dashboardu. Run `npm run test:e2e -- --project=390` ma FAIL przed config/fixture wiring.

- [ ] **Step 2: Skonfiguruj wyłącznie lokalny web/DB**

Config uruchamia local Supabase i Next test server; `baseURL` jest localhost. Setup nie zapisuje tokenów w repo; `.auth/` jest gitignored.

- [ ] **Step 3: Dodaj scenariusze wykonawcze**

Happy path: login, vehicle/client, trip, dwa purchases, exact preview/result, edit, cascade, draft delete/undo, save, report, logout/cache. Osobno: legacy preserve/switch; stale timestamp 409 z zachowaniem draftu; USER B nie widzi danych A.

- [ ] **Step 4: Dodaj axe i overflow**

Na każdym kluczowym ekranie `AxeBuilder().analyze()` bez serious/critical violations. Overflow test oczekuje `document.documentElement.scrollWidth <= window.innerWidth` na wszystkich sześciu viewportach.

- [ ] **Step 5: Uruchom pełną macierz**

Run:

```powershell
npx playwright install --with-deps chromium
npm run test:e2e
```

Expected: wszystkie projekty PASS; screenshots/traces tylko przy failure i bez prywatnych danych.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json playwright.config.ts tests/e2e .gitignore
git commit -m "test: add mobile desktop accessibility e2e coverage"
```

### Task 38: Dodaj CI i wykonaj pełny quality gate

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `scripts/verify.ps1`
- Create: `scripts/verify.sh`
- Modify: `README.md`

**Interfaces:**
- Consumes: komplet test suites z Tasks 2–37 i dependency policy Task 29.
- Produces: joby static, unit, database, build, e2e, security; brak automatycznego production deploy/migrate.

- [ ] **Step 1: Zdefiniuj joby i zależności**

Static: npm ci/lint/typecheck. Unit. Database: Supabase local + reset + db tests. Build. E2E po database/build. Security generuje audit artifact i blokuje wyłącznie według zatwierdzonej klasyfikacji; unresolved critical runtime ma jawny failing gate.

- [ ] **Step 2: Dodaj lokalne skrypty parity**

Oba skrypty wykonują w tej kolejności: lint, typecheck, unit, local DB reset/tests, build, E2E. Przerywają przy pierwszym błędzie i guardują localhost DB.

- [ ] **Step 3: Uruchom pełną weryfikację**

Run:

```powershell
./scripts/verify.ps1
npm audit --json
git diff --check
git status --short
```

Expected: verify exit 0; audit jest zgodny z dependency review; status nie zawiera sekretów, dumpów, `.auth`, generated workers ani przypadkowego `middleware.ts`.

- [ ] **Step 4: Commit**

```powershell
git add .github/workflows/ci.yml scripts/verify.ps1 scripts/verify.sh README.md
git commit -m "ci: enforce full local and pull-request verification"
```

**Checkpoint F11:** lint/typecheck/unit/db/build/E2E/axe przechodzą lokalnie; CI nie ma production credentials ani automatycznej migracji.

## FAZA 12 — migracja przełączeniowa i dokumentacja

### Task 39: Przygotuj obiektywnie samoweryfikującą `014`

**Files:**
- Create: `supabase/migrations/014_revoke_direct_trip_dml.sql`
- Create: `tests/database/migrations/014-revoke-dml.test.ts`
- Create: `ops/checks/014_revoke_direct_trip_dml_pre.sql`
- Create: `ops/checks/014_revoke_direct_trip_dml_post.sql`
- Create: `ops/recovery/014_restore_direct_trip_dml.sql`

**Interfaces:**
- Consumes: aplikacja już używa RPC; operator niezależnie potwierdza CI/smoke.
- Produces: brak direct authenticated INSERT/UPDATE/DELETE na trips/fuel/allowances; SELECT i RPC pozostają.

- [ ] **Step 1: Napisz failing katalogowe pre-check tests**

Każda oczekiwana sygnatura, `prosecdef`, owner, `proconfig search_path`, validated constraints, RLS/policies i ACL. Celowo zmień po jednym elemencie i oczekuj przerwania `014` bez revoke. SQL nie sprawdza nazw jobów CI ani flag testowych.

- [ ] **Step 2: Napisz failing privilege tests**

Przed `014` direct DML jest jeszcze możliwy przez RLS dla ownera. Po `014` direct DML ownera jest denied, SELECT działa, każde RPC authenticated działa, anon/public nie ma execute.

- [ ] **Step 3: Potwierdź red**

Run: `npm run test:db -- tests/database/migrations/014-revoke-dml.test.ts`

Expected: FAIL, migracja nie istnieje.

- [ ] **Step 4: Zaimplementuj pre-check i trzy REVOKE**

W jednej transakcji `DO` odczytuje `pg_proc`, `pg_roles`, `pg_namespace`, `pg_class`, `pg_policy`, `pg_constraint`, `information_schema.role_table_grants`/ACL helpers; każda niezgodność rzuca wyjątek przed zmianą grants. Następnie wykonuje wyłącznie trzy jawne REVOKE ze specyfikacji.

- [ ] **Step 5: Zweryfikuj green i recovery lokalnie**

Run:

```powershell
npm run test:db -- tests/database/migrations/014-revoke-dml.test.ts
npx supabase db reset --local
npm run test:db
```

Expected: PASS; recovery przywraca grants tylko dla kompatybilnej starej aplikacji i jest oznaczone jako procedura awaryjna, nie automatyczny down migration.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/014_revoke_direct_trip_dml.sql tests/database/migrations/014-revoke-dml.test.ts ops/checks/014_* ops/recovery/014_*
git commit -m "db: guard and revoke direct trip aggregate dml"
```

### Task 40: Przygotuj maintenance, backup, deployment i recovery runbooks

**Files:**
- Create: `ops/maintenance/enter.sql`
- Create: `ops/maintenance/exit.sql`
- Create: `ops/maintenance/verify.sql`
- Create: `tests/database/maintenance.test.ts`
- Create: `tests/unit/security/maintenance-coverage.test.ts`
- Create: `docs/runbooks/production-migration.md`
- Create: `docs/runbooks/backup-and-restore.md`
- Create: `docs/runbooks/supabase-auth-backup.md`
- Create: `docs/runbooks/recovery.md`
- Create: `docs/security/final-verification.md`
- Modify: `docs/DEPLOYMENT.md`

**Interfaces:**
- Consumes: lokalnie zielone `001–014`, maintenance guard Task 19 i pełny quality gate Task 38.
- Produces: dwuwarstwowy maintenance, dokładna kolejność `008–014`, pre/post/recovery, Auth restore gate i finalny DoD report.

- [ ] **Step 1: Napisz failing maintenance tests**

Po `enter.sql`: authenticated direct DML wszystkich biznesowych tabel denied; read-only działa; application mutation guard zwraca 503. Test coverage enumeruje każdy eksportowany POST/PATCH/PUT/DELETE w `app/api/**/route.ts` i wymaga wywołania `mutationGuard` przed parsowaniem body/RPC/DML. Po `exit.sql`: tylko jawna allowlista niekrytycznych grants wraca, a krytyczne DML pozostaje odebrane przez `014`.

- [ ] **Step 2: Potwierdź red i zaimplementuj trzy skrypty**

Run przed: `npm run test:db -- tests/database/maintenance.test.ts; npm run test:unit -- tests/unit/security/maintenance-coverage.test.ts` → FAIL. `enter.sql` robi snapshot oczekiwanego ACL do wyniku operatorskiego i revoke; `verify.sql` wykazuje brak mutacji; `exit.sql` nie odtwarza trips/fuel/allowances DML. Skrypty nie są automatycznymi migracjami.

- [ ] **Step 3: Napisz runbook wdrożenia bez automatyzacji produkcji**

Kolejność: potwierdzenie projektu → dwuwarstwowy maintenance → backup/restore evidence → pre-checks → `008` + post → `009` + post → `010` + RLS → `011` → `012` 15+1 → manual sequence report approval → `013` → deploy RPC app → controlled smoke → operator CI confirmation → `014` → post-check → controlled maintenance exit.

- [ ] **Step 4: Zdefiniuj backup i Auth gate**

Runbook wymaga plan-specific Supabase backup/PITR, logicznego `public` dump poza repo, checksums/counts i izolowanego restore. Dokument backupu Supabase Auth ma status `UNVERIFIED — PRODUCTION BLOCKED` dopóki operator nie potwierdzi mechanizmu rzeczywistego planu i nie odtworzy Auth w izolacji; zwykły dump `auth.users` nie jest uznawany za rozwiązanie.

- [ ] **Step 5: Zdefiniuj recovery per etap**

`008–011`: reverse tylko nowych elementów, bez powrotu liberalnego RLS. `012`: usuń tylko `legacy_backfill_created=true`, wyczyść markery. `013` przed zapisami: reverse RPC/sequence. Po switch/zapisach: maintenance, prefer forward fix, w niepewnej integralności PITR/restore. Vercel rollback tylko do schema-compatible build.

- [ ] **Step 6: Wykonaj finalną lokalną weryfikację**

Run:

```powershell
./scripts/verify.ps1
npm run test:db -- tests/database/maintenance.test.ts
npm run test:unit -- tests/unit/security/maintenance-coverage.test.ts
rg -n -i "service_role|eyJ|supabase\.co|postgresql://[^@]+@[^l1]" docs ops tests -g '!*.md'
git diff --check
git status --short
```

Expected: wszystkie gates PASS; secret scan bez sekretów/remote DB; final report jawnie wymienia każdy niewykonany production-only gate zamiast twierdzić, że został zweryfikowany.

- [ ] **Step 7: Commit**

```powershell
git add ops/maintenance tests/database/maintenance.test.ts tests/unit/security/maintenance-coverage.test.ts docs/runbooks docs/security/final-verification.md docs/DEPLOYMENT.md
git commit -m "docs: add guarded production migration runbooks"
```

**Checkpoint F12:** komplet `008–014`, maintenance i runbooki są przetestowane lokalnie; nic nie zostało wykonane na produkcji.

## Checkpoint and Commit Summary

| Checkpoint | Warunek wejścia do następnej fazy | Główne commity |
|---|---|---|
| F0 | czysty worktree, middleware zachowany, lint/test/local DB baseline | `test: establish noninteractive quality baseline`, `test: add local-only Supabase harness` |
| F1 | fixture/auth helper green, kontrolowany red ownership baseline | `test: add anonymized production-shape database fixtures`, `test: expose legacy ownership and rls gaps` |
| F2 | `001–010`, ownership/RLS USER A→B green | `db: add ownership expansion migration`, `db: backfill per-user ownership`, `db: enforce ownership constraints and rls` |
| F3 | exact fuel + `011–012`, 15+1 bez duplikatu | fuel unit + dwa `db:` commity |
| F4 | sequence/RPC/cascade/concurrency/security green | cztery małe `db/security:` commity |
| F5 | strict command schemas, thin RPC API, date-only | types/API/date commity |
| F6 | aggregate draft i wiele purchases/legacy UI | trzy TripForm/fuel commity |
| F7 | entity ownership, deactivation, DB reports | trzy entity/query commity |
| F8 | ExcelJS i sklasyfikowane dependencies | import + dependency commits |
| F9 | private cache off, no service role, auth gate, headers | trzy security commits |
| F10 | mobile-first/a11y komponenty i ekrany | cztery UI commits |
| F11 | Playwright/axe/CI i full verification | E2E + CI commits |
| F12 | `014` i komplet manual runbooks | migration + docs commits |

## Execution Risks and Stop Conditions

1. **Composite `SET NULL`:** jeśli wersja PostgreSQL nie zachowuje `user_id` przy wymaganym FK, zatrzymać Task 9 i przedstawić bezpieczną alternatywę; nie dodawać triggera jako obejścia.
2. **Dane nie spełniają pre-check:** migracja ma przerwać; nie naprawiać heurystycznie fixture ani rzeczywistych danych.
3. **Równoległość cascade:** niestabilny lock order lub deadlock blokuje przejście poza F4.
4. **Zgodność Decimal/PostgreSQL:** dowolna różnica string result blokuje UI switch.
5. **Zmiana `middleware.ts`:** Task 31 ma obowiązkowy user approval gate; brak zgody nie upoważnia do merge ani resetu.
6. **Next/dependencies:** nierozwiązany critical runtime jest production blockerem; nie wolno wymuszać upgrade'u ani automatycznej naprawy.
7. **PWA/CSP:** brak dowodu prywatnego no-cache oznacza wyłączenie SW; CSP failure oznacza wąski kompatybilny etap i dokumentację, nie szerokie unsafe wildcard.
8. **Auth backup:** status pozostaje niezweryfikowany, dopóki restore rzeczywistego planu nie przejdzie w izolacji; implementacja repo nie może sama zamknąć tego gate.
9. **Produkcja:** każda komenda wskazująca remote Supabase, maintenance, backfill lub `014` wymaga nowej, osobnej zgody i nie należy do wykonania tego planu implementacyjnego.

## Final Execution Gate

Po Task 40 wykonawca przedstawia:

- commit range i `git status --short`;
- wyniki lint/typecheck/unit/db/build/E2E/axe;
- wynik local reset `001–014`;
- dependency classification i production blockers;
- listę wszystkich production-only kroków nadal niewykonanych;
- potwierdzenie, że oryginalna zmiana `middleware.ts` została zachowana lub po osobnej zgodzie bezpiecznie scalona.

Nie uruchamia się wdrożenia produkcyjnego w ramach tego planu. Produkcyjne backupy, maintenance, migracje i konfiguracja wymagają kolejnego, jawnego polecenia operatora.
