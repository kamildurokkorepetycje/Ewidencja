# Ewidencja — projekt przygotowania do produkcji

**Data:** 2026-08-24

**Status:** zatwierdzony projekt architektury; oczekuje na końcową akceptację pliku

**Repozytorium:** `ewidencja-nextjs`
**Model własności:** jedno konto = jeden właściciel danych

## 1. Cel i granice projektu

Celem jest przygotowanie istniejącej aplikacji Next.js + Supabase do bezpiecznego użycia przez właściciela i kilku wybranych serwisantów. Użytkownicy nie współdzielą danych. Każdy rekord biznesowy należy do dokładnie jednego użytkownika, a podstawową granicą bezpieczeństwa jest PostgreSQL RLS oparty na `auth.uid() = user_id`.

Projekt rozwija istniejącą aplikację etapowo. Nie powstają organizacje, workspace, współdzielenie danych, hierarchia administratorów, rozbudowany RBAC, OCR, CRM ani pełny offline mode.

Priorytety:

1. integralność istniejących danych;
2. izolacja użytkowników;
3. poprawność matematyki paliwa;
4. niezawodność i atomowość;
5. ergonomia mobilna;
6. spójny wygląd;
7. funkcje dodatkowe.

### 1.1. Nienaruszalność produkcji podczas implementacji

- Implementacja tworzy migracje SQL wyłącznie w repozytorium.
- Żadna migracja nie jest automatycznie uruchamiana na produkcyjnym Supabase.
- Dane produkcyjne nie są modyfikowane podczas implementacji i testów.
- Migracje są testowane na lokalnym Supabase/Docker albo na izolowanym projekcie testowym.
- Produkcyjne wdrożenie wymaga osobnego potwierdzenia operatora, maintenance mode, zweryfikowanego backupu oraz ręcznego wykonania procedury.

### 1.2. Wyniki audytu wejściowego

Audyt repozytorium wykazał między innymi:

- brak aktywnego RLS na `hotel_locations` mimo istniejących polityk;
- brak `user_id` i RLS w `hotel_client_distances`;
- brak bazowego wymuszenia wspólnego właściciela relacji;
- nieatomowy zapis przejazdu, diet, paliwa i cascade;
- usuwanie tankowań przy edycji przejazdu i odtwarzanie najwyżej jednego;
- cascade pomijający późniejsze rekordy z tego samego dnia i ignorujący błędy UPDATE;
- dwa źródła prawdy paliwa;
- niespójność `imports`/`import_logs`;
- niespójne role i typy TypeScript;
- agresywne cache PWA prywatnych API, RSC i stron;
- brak testów;
- podatne `xlsx@0.18.5`;
- Next.js wymagający kontrolowanej aktualizacji;
- interaktywny, faktycznie niedziałający skrypt lint.

Odczytowy audyt podłączonej produkcji, bez modyfikacji danych, wykazał:

- 3 konta;
- 23 przejazdy, wszystkie z `vehicle_id`;
- brak istniejących relacji między właścicielami;
- 16 przejazdów ze starymi danymi paliwa;
- 15 z odpowiadającym `fuel_purchases`;
- 1 wymagający utworzenia wpisu;
- brak przejazdów z wieloma tankowaniami;
- 5 `hotel_client_distances` możliwych do jednoznacznego przypisania;
- brak dni z wieloma przejazdami tego samego użytkownika i pojazdu w chwili audytu.

Wyniki te są punktem odniesienia, nie stałymi założeniami migracji. Każda migracja ponownie sprawdza aktualny stan.

## 2. Strategia realizacji

Obowiązuje strategia:

```text
expand → backfill → validate → constrain → switch → późniejszy cleanup
```

Prace dzielą się na pięć etapów:

1. fundament bezpieczeństwa danych;
2. model paliwa i atomowe operacje;
3. API, typy, import i zależności;
4. UX mobile-first;
5. testy, wdrożenie i weryfikacja produkcyjna.

Nie wykonuje się wielkiego, jednorazowego refaktoru. Każdy etap ma własne pre-checki, post-checki, kryteria powodzenia i procedurę recovery.

## 3. Projekt migracji SQL

Powstają migracje `008–014`. Migracja usuwająca stare pola paliwa nie należy do tego pakietu i może powstać dopiero po okresie obserwacji.

Wszystkie nowe migracje:

- są transakcyjne tam, gdzie PostgreSQL na to pozwala;
- przerywają się przez kontrolowany błąd przy niejednoznacznych danych;
- nie przypisują właściciela ani relacji na podstawie przypuszczenia;
- nie usuwają istniejących danych biznesowych;
- mają zapytania pre-check i post-check;
- są idempotentne tam, gdzie jest to bezpieczne, albo odmawiają ponownego wykonania w sposób kontrolowany.

### 3.1. `008_ownership_expand.sql`

Dodaje nullable `user_id` do:

- `hotel_client_distances`;
- `hotels`;
- `import_logs`;
- `audit_logs`.

Zapewnia obecność i prawidłowy typ istniejących `user_id` oraz tworzy indeksy nowych kolumn. Nie wykonuje backfillu, `NOT NULL`, nowych FK ani zmiany danych.

**Pre-check:** obecność tabel, kolumn źródłowych, zgodne typy UUID i spodziewane relacje.

**Post-check:** nowe kolumny są nullable, liczby rekordów i stare wartości są niezmienione.

**Sukces:** kompatybilne rozszerzenie schematu bez zmiany danych.
**Recovery:** usunięcie wyłącznie nowych kolumn i indeksów przed rozpoczęciem ich używania.

### 3.2. `009_ownership_backfill.sql`

Backfill:

```text
hotel_client_distances.user_id ← hotel_locations.user_id
  tylko jeśli hotel.user_id = client.user_id

hotels.user_id                  ← trips.user_id
import_logs.user_id             ← created_by
audit_logs.user_id              ← changed_by
```

Migracja odmawia działania, jeżeli rodzic nie istnieje, właściciele rodziców są różni lub źródło właściciela jest puste. Nie przypisuje rekordów do pierwszego użytkownika ani do użytkownika uznanego za prawdopodobnego.

**Pre-check:** pełny raport rekordów bez możliwego jednoznacznego właściciela i relacji cross-owner.

**Post-check:** zero `user_id IS NULL` w objętych tabelach i zero niezgodności z rodzicami.

**Sukces:** każdy rekord ma jednoznacznie wyprowadzonego właściciela.
**Recovery przed constraints:** wyzerowanie wyłącznie nowych kolumn; po kolejnych etapach preferowany backup/PITR.

### 3.3. `010_ownership_constraints_rls.sql`

Po udanych pre-checkach ustawia `user_id NOT NULL` na prywatnych tabelach biznesowych. `profiles` pozostaje wyjątkiem z własnością `profiles.id = auth.uid()`.

Globalna unikalność zostaje zastąpiona przez:

```sql
UNIQUE (user_id, registration_number)
UNIQUE (user_id, code)
```

Stare globalne constraints są identyfikowane na podstawie katalogu PostgreSQL i kolumn, a nie wyłącznie założonej nazwy.

Composite FK powstają tylko tam, gdzie są potrzebne do wymuszenia ownership:

```text
trips(user_id, vehicle_id)                    → vehicles(user_id, id)
trips(user_id, client_id)                     → clients(user_id, id)
trips(user_id, driver_id)                     → drivers(user_id, id)
fuel_purchases(user_id, trip_id)              → trips(user_id, id)
fuel_purchases(user_id, vehicle_id)           → vehicles(user_id, id)
hotel_client_distances(user_id, hotel_id)      → hotel_locations(user_id, id)
hotel_client_distances(user_id, client_id)     → clients(user_id, id)
trip_allowances(user_id, trip_id)              → trips(user_id, id)
hotels(user_id, trip_id)                       → trips(user_id, id)
```

Na rodzicach powstają wyłącznie wymagane `UNIQUE(user_id, id)`. FK są dodawane jako `NOT VALID`, a następnie jawnie walidowane. Brak możliwości bezpiecznej walidacji zatrzymuje migrację; nie powstaje obejście.

Docelowe usuwanie:

- `trip_allowances`: `CASCADE` po usunięciu przejazdu;
- `fuel_purchases.trip_id`: `SET NULL`, dokument pozostaje;
- `hotels.trip_id`: `SET NULL`, jeśli dokument ma pozostać niezależny;
- `hotel_client_distances`: `CASCADE` po usunięciu hotelu lub klienta.

Jeżeli dostępna wersja PostgreSQL nie pozwoli zachować `user_id` przy composite FK `SET NULL`, projekt zatrzymuje tę część i przedstawia bezpieczną alternatywę zamiast dodawać niezweryfikowany trigger.

RLS na zwykłych tabelach:

```sql
SELECT USING (user_id = auth.uid())
INSERT WITH CHECK (user_id = auth.uid())
UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
DELETE USING (user_id = auth.uid())
```

`hotel_locations` i `hotel_client_distances` otrzymują jawne `ENABLE ROW LEVEL SECURITY`. `profiles` używa `id = auth.uid()`. Użytkownik ma tylko SELECT własnych `audit_logs`; nie ma ręcznego INSERT/UPDATE/DELETE.

Polityki admin/manager pozwalające czytać cudze dane zostają usunięte. `handle_new_user()` ignoruje `raw_user_meta_data.role`. Pole roli może pozostać kompatybilnościowo, ale nie daje uprawnień. Widoki raportowe działają jako `security_invoker` i uwzględniają `user_id` albo nie są dostępne dla `authenticated`.

`trips.vehicle_id` przechodzi do `NOT NULL` wyłącznie po osobnym pre-checku zwracającym zero rekordów. `fuel_purchases.vehicle_id` ma ten sam docelowy kierunek, ale oddzielny pre-check; brakujące wartości nigdy nie są uzupełniane automatycznie.

**Pre-check:** zero null owners, cross-owner relations i duplikatów per-user; osobne raporty nullable vehicle.

**Post-check:** RLS aktywne, polityki właściwe, FK zwalidowane, brak globalnych UNIQUE i polityk administracyjnych.

**Sukces:** izolacja działa w DB niezależnie od aplikacji.
**Recovery:** nie cofać zabezpieczeń do liberalnych polityk; przy problemie użyć zweryfikowanego backupu/PITR.

### 3.4. `011_fuel_model_expand.sql`

Dodaje do `trips`:

```sql
fuel_norm_used          NUMERIC(8,4)
fuel_adjustment_percent SMALLINT
fuel_used_exact         NUMERIC(12,6)
fuel_calculation_mode   TEXT
```

Korekta może mieć wyłącznie `0`, `5` albo `10`. Historyczne pola normy/korekty mogą pozostać nullable, ponieważ starego +5%/+10% nie wolno zgadywać. Tryby: `legacy` oraz `norm`.

Dodaje do `fuel_purchases`:

```sql
legacy_source_trip_id   UUID NULL
legacy_backfill_created BOOLEAN NOT NULL DEFAULT FALSE
```

oraz unikalny indeks częściowy na niepustym `legacy_source_trip_id`. Typ `liters` zostaje bezstratnie poszerzony, np. do `NUMERIC(12,4)`.

Stare `trips.fuel_purchased`, `has_invoice`, `invoice_number` i `invoice_date` pozostają bez zmian i są później traktowane read-only.

**Pre-check:** zgodne typy, ownership tankowań, wartości w docelowych zakresach.

**Post-check:** nowe pola i indeks istnieją, rekordy i stare pola są niezmienione.

**Sukces:** aplikacja może obsłużyć oba modele bez usunięcia danych legacy.
**Recovery:** usunięcie nowych elementów tylko przed rozpoczęciem ich używania.

### 3.5. `012_fuel_legacy_backfill.sql`

Historyczny przejazd kwalifikuje się, gdy ma `fuel_purchased > 0`, numer dokumentu lub `has_invoice = true`.

Fingerprint istniejącego tankowania obejmuje:

- `user_id`;
- `trip_id`;
- `vehicle_id`;
- litry;
- numer dokumentu;
- datę `invoice_date` albo `date_from`.

Klasyfikacja:

1. dokładnie jedno zgodne tankowanie — oznaczenie istniejącego wpisu;
2. brak tankowania przypisanego do przejazdu i brak podejrzanego standalone — utworzenie jednego wpisu;
3. wpis przypisany, ale niezgodny — przerwanie;
4. więcej niż jedno dopasowanie — przerwanie;
5. potencjalnie zgodny standalone — przerwanie i ręczna decyzja.

Nowy rekord ma `legacy_source_trip_id = trips.id` i `legacy_backfill_created = true`. Istniejący ma flagę `false`. Unikalny indeks zapobiega duplikatom przy powtórzeniu.

Historyczne obliczenia otrzymują:

```text
fuel_used_exact = fuel_used
fuel_calculation_mode = legacy
```

Migracja nie zmienia `fuel_end`, starego `fuel_purchased`, historycznego `fuel_used` ani dalszego łańcucha.

**Pre-check:** pełna klasyfikacja i raport rozbieżności; oczekiwany stan audytu to 16/15/1, ale migracja nie wymusza go kosztem danych.

**Post-check:** każdy legacy trip ma jedno mapowanie, brak duplikatów, dokładnie oznaczone rekordy istniejące i utworzone, stare pola bez zmian.

**Sukces dla obecnego stanu:** 15 wpisów rozpoznanych i dokładnie 1 utworzony.
**Recovery przed switch:** usunięcie tylko `legacy_backfill_created = true` oraz wyzerowanie markerów na rozpoznanych istniejących wpisach.

### 3.6. `013_trip_atomic_operations.sql`

Dodaje jawne `trip_sequence INTEGER`. Kolejność biznesowa:

```sql
ORDER BY date_from, trip_sequence, id
```

Pre-check jawnie raportuje wszystkie grupy:

```sql
SELECT user_id, vehicle_id, date_from, count(*) AS trip_count,
       array_agg(id ORDER BY created_at, id) AS proposed_order
FROM public.trips
GROUP BY user_id, vehicle_id, date_from
HAVING count(*) > 1;
```

Operator ręcznie weryfikuje raport przed produkcyjną migracją. Backfill używa `ROW_NUMBER()` według `created_at, id` tylko jako udokumentowane założenie migracyjne.

Constraint:

```sql
UNIQUE (user_id, vehicle_id, date_from, trip_sequence)
DEFERRABLE INITIALLY DEFERRED
```

Numeracja jest zawsze kompaktowa `1..N`. Przeniesienie przejazdu na inną datę lub pojazd resekwencjonuje stary i nowy zbiór w jednej transakcji.

Powstają krytyczne RPC, między innymi:

```text
save_trip_with_children
save_fuel_purchase
delete_fuel_purchase
recalculate_vehicle_trips
delete_trip_and_recalculate
```

RPC są granicą bezpieczeństwa `SECURITY DEFINER`:

- restrykcyjny lub pusty `search_path`;
- kwalifikowane nazwy schematów;
- jawne `auth.uid() IS NOT NULL`;
- brak dynamic SQL;
- brak przyjmowania `user_id` jako źródła ownership;
- jawna weryfikacja każdej relacji;
- `EXECUTE` wyłącznie dla `authenticated`;
- brak EXECUTE dla `PUBLIC` i `anon`;
- optimistic concurrency dla `trips.updated_at` i każdego istniejącego `fuel_purchases.updated_at`.

Operacje blokują dotknięte pojazdy w stałej kolejności, zapisują agregat atomowo i przerywają całość przy dowolnym błędzie.

**Pre-check:** komplet constraints/RLS/backfill paliwa, poprawne korekty, raport sequence i brak niejednoznacznych relacji.

**Post-check:** sygnatury i zabezpieczenia funkcji, spójne `1..N`, testy transakcyjności i kolejności.

**Sukces:** nowe RPC są gotowe do użycia, ale bezpośredni DML nie jest jeszcze odebrany.
**Recovery przed nowymi zapisami:** usunięcie RPC, nowych constraints/indeksów i kolumny sequence według przetestowanego reverse script.

### 3.7. `014_revoke_direct_trip_dml.sql`

Ta migracja jest uruchamiana dopiero po wdrożeniu i sprawdzeniu aplikacji używającej RPC. Przejście testów CI/RPC jest warunkiem operatora, a nie założeniem możliwym do sprawdzenia przez SQL.

Obiektywne pre-checki DB sprawdzają:

- obecność oczekiwanych RPC i dokładne sygnatury;
- `SECURITY DEFINER`;
- oczekiwanego właściciela funkcji;
- restrykcyjny `search_path`;
- wymagane RLS, polityki i zwalidowane constraints;
- aktualne privileges;
- brak EXECUTE dla `PUBLIC`/`anon`;
- EXECUTE dla `authenticated`.

Niezgodność przerywa migrację.

Następnie:

```sql
REVOKE INSERT, UPDATE, DELETE ON public.trips FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fuel_purchases FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.trip_allowances FROM authenticated;
```

**Post-check:** bezpośredni DML jest odebrany, odczyt nadal działa przez RLS, RPC mają tylko oczekiwane uprawnienia.

**Sukces:** atomowej logiki nie da się ominąć bezpośrednim klientem Supabase.
**Recovery:** wyłącznie przetestowany skrypt przywracający zgodne uprawnienia i kompatybilna wersja aplikacji; przy niepewności maintenance mode i PITR.

### 3.8. Późniejszy cleanup

Stare pola paliwowe mogą zostać usunięte dopiero w osobnej przyszłej migracji po spełnieniu łącznie:

- aplikacja nie czyta i nie zapisuje starych pól;
- raporty/import/eksport używają `fuel_purchases`;
- backfill i wszystkie testy przechodzą;
- okres obserwacji nie wykazał rozbieżności;
- istnieje osobno zatwierdzona procedura backupu i recovery.

## 4. Przepływ danych i odpowiedzialność warstw

### 4.1. Zapis agregatu przejazdu

```text
TripForm
→ draft schemas
→ API command schema i whitelist
→ Next.js API z sesją użytkownika
→ zabezpieczone RPC
→ trips + fuel_purchases + trip_allowances
→ cascade
→ pełny wynik do UI
```

React zarządza draftem i preview. API uwierzytelnia, waliduje i mapuje błędy. RPC rozstrzyga ownership, transakcję, concurrency, sequence, matematykę i cascade.

Komenda zapisu zawiera osobno trip, tankowania, diety, oczekiwane `updated_at` oraz akcję obliczeń paliwa. Nie zawiera zaufanego `user_id`, `fuel_end` ani `fuel_used_exact`.

### 4.2. Source of truth paliwa

Po switch:

- `fuel_purchases` jest jedynym źródłem sumy zatankowanego paliwa;
- nie istnieje synchronizacja dwukierunkowa z `trips.fuel_purchased`;
- stare `trips.fuel_purchased` pozostaje wyłącznie legacy/read-only;
- standalone `fuel_purchase` z `trip_id IS NULL` jest poprawny i nie uczestniczy w obliczeniach żadnego przejazdu.

### 4.3. Centralna matematyka

PostgreSQL `NUMERIC` jest źródłem rozstrzygającym:

```text
purchased_exact = SUM(fuel_purchases.liters WHERE trip_id = current_trip.id)
fuel_used_exact = distance × fuel_norm_used / 100 × (1 + adjustment / 100)
fuel_end_exact  = fuel_start + purchased_exact - fuel_used_exact
fuel_end        = ROUND(fuel_end_exact, 1)
```

Wartości pośrednie nie są zaokrąglane. `ROUND(..., 1)` występuje dokładnie raz dla finalnego `fuel_end`. PostgreSQL `ROUND(NUMERIC, 1)` określa wynik połówek: `58.15 → 58.2`. Następny przejazd przejmuje już finalne, zaokrąglone `fuel_end`.

Litry zachowują dokładność, np. `36.42`. UI usuwa niepotrzebne zera bez zmiany wartości: norma `7.2000` jest wyświetlana jako `7,2`, tankowanie `36.42` jako `36,42`, stan końcowy jako `58,2`.

Preview UI korzysta z Decimal.js w czystym module domenowym. Testy parytetu porównują Decimal.js z SQL `NUMERIC`.

### 4.4. Legacy

Akcje:

```text
preserve_legacy
switch_to_norm
recalculate_norm
```

Zwykła edycja rekordu legacy nie przełącza modelu. Zmiana klienta, notatki, hotelu, diet lub tankowań zachowuje historyczne `fuel_used_exact`. Zmiana tankowania aktualizuje `fuel_end`, ale nie zgaduje historycznej normy/korekty.

Przełączenie do `norm` wymaga jawnego działania i podsumowania skutków. Historyczne +5%/+10% nigdy nie jest odgadywane.

### 4.5. Cascade i usuwanie

Cascade działa według `date_from, trip_sequence, id`:

1. `fuel_start` z finalnego `fuel_end` poprzednika;
2. suma wyłącznie tankowań przypisanych do bieżącego trip;
3. legacy zachowuje `fuel_used_exact`, norm przelicza je dokładnie;
4. jedno finalne zaokrąglenie;
5. przekazanie wyniku następnemu rekordowi.

Usunięcie przejazdu atomowo:

1. zapamiętuje pozycję;
2. ustawia jego `fuel_purchases.trip_id = NULL`;
3. usuwa diety;
4. usuwa trip;
5. kompaktuje sequence;
6. przelicza późniejsze rekordy bez odłączonych tankowań.

Przeniesienie tankowania lub przejazdu przelicza wszystkie dotknięte łańcuchy i blokuje pojazdy w stałej kolejności UUID.

### 4.6. Error handling

API zwraca kontrolowane kody, między innymi:

```text
UNAUTHENTICATED
VALIDATION_ERROR
RELATION_NOT_OWNED
CONCURRENT_MODIFICATION
TRIP_ORDER_CONFLICT
LEGACY_RECALC_CONFIRMATION_REQUIRED
DATABASE_CONSTRAINT
INTERNAL_ERROR
```

UI nie otrzymuje raw SQL, nazw polityk, stack trace ani prywatnych payloadów. Konflikt optimistic concurrency zwraca HTTP 409 i zachowuje draft użytkownika.

## 5. Walidacja, API, typy i moduły pomocnicze

### 5.1. Schematy Zod

Draft i command schemas pozostają rozdzielone, jeśli poprawia to czytelność:

```text
lib/schemas/common
lib/schemas/trip-draft
lib/schemas/trip-command
lib/schemas/fuel-purchase-draft
lib/schemas/fuel-purchase-command
```

Wspólne fragmenty używają `.extend()`/`.transform()`. API command schema jest ostateczną whitelistą, odrzuca nieznane pola i nigdy nie ufa `user_id`.

Walidacja zwraca `error`, `suggestion` lub `info`. Tylko błędy logiczne/techniczne blokują zapis. Brak faktury, nietypowa trasa, spalanie lub standalone tankowanie nie blokują.

### 5.2. API

Każdy mutujący endpoint sprawdza sesję, limit body, poprawność JSON, command schema i ownership. Mutacje wpływające na trip/fuel/cascade są cienką warstwą nad RPC. Inne moduły używają API + RLS.

Lista przejazdów wykonuje filtry, search, count i paginację w PostgreSQL. Raporty i eksport sumują paliwo z `fuel_purchases`.

### 5.3. Typy

Powstaje generowany `lib/supabase/database.types.ts`. Typy wierszy pochodzą ze schematu DB, a osobne typy domenowe obejmują komendy, drafty, preview i konkretne joiny. Usuwane są `any` i rozjazdy ról, Hotel, ImportLog oraz pól paliwa.

### 5.4. Role i Auth

Role nie wpływają na dostęp do danych i nie są edytowalne przez profil/metadata/API. Sidebar używa `profiles`, nie `user_profiles`. Brak publicznej rejestracji. Konta są tworzone lub zapraszane poza aplikacją. Runtime nie używa `SUPABASE_SERVICE_ROLE_KEY`; admin client i wymaganie sekretu w Vercel są usunięte.

Login korzysta z email/password, reset hasła z allowlistowanym redirectem. Middleware obsługuje wygasłą sesję, a logout usuwa prywatny cache.

### 5.5. Import

Jedynym modelem jest `import_logs`. `xlsx` zostaje zastąpione przez ExcelJS. Oficjalnie wspierane są tylko przetestowane formaty; jeśli `.xls` nie jest bezpiecznie obsługiwany, wspierane są `.xlsx` i `.csv`.

Limity: 5 MB, 10 arkuszy, 5000 wierszy, 100 kolumn. Upsert klientów używa `(user_id, code)` przy istniejącym kodzie. Brak automatycznego scalania po samej nazwie. Import trip zachowuje kolejność wierszy jako sequence, waliduje ownership i używa kontrolowanej ścieżki legacy.

### 5.6. Daty

Date-only pozostaje stringiem `YYYY-MM-DD`. Logika domenowa nie używa `new Date('YYYY-MM-DD')`, `toISOString().slice(0,10)` ani `setDate()`. Powstają testowane funkcje parse/format/compare/add/range odporne na DST Europe/Warsaw.

### 5.7. PWA

Bezpieczeństwo ma pierwszeństwo przed offline. API, RSC, authenticated HTML i dashboard nie mogą trafiać do cache. Cache dopuszcza wyłącznie wersjonowane zasoby statyczne. Jeśli nie można tego jednoznacznie zagwarantować, service worker jest wyłączony w pierwszym wydaniu; manifest i ikony mogą pozostać.

### 5.8. Dependencies, lint i headers

Nie używa się `npm audit fix --force`. Każde high/critical jest klasyfikowane jako runtime/dev, osiągalne/nieosiągalne, z advisory, wersją poprawioną, planem i wpływem upgrade. Nierozwiązana krytyczna podatność runtime blokuje produkcję; samo dowolne znalezisko audit nie blokuje automatycznie merge.

Obowiązkowo: usunąć `xlsx`, zaktualizować Next.js do poprawionej stabilnej wersji i ocenić PWA, jsPDF/DOMPurify, Sharp, PostCSS, Babel oraz zależności pośrednie.

`npm run lint` działa nieinteraktywnie przez ESLint CLI i nadaje się do CI.

CSP jest wdrażane etapowo po weryfikacji źródeł Next.js, Supabase i Vercel. Nie dodaje się szerokiego `unsafe-*` tylko dla wygody. Pierwszy etap zawiera kompatybilne bezpieczne dyrektywy i dokumentuje dalsze utwardzenie. Google Fonts przechodzą na `next/font`. Pozostałe nagłówki obejmują nosniff, referrer policy, ochronę ramek, permissions policy i HSTS tylko dla HTTPS/produkcji.

### 5.9. Audit logs

Pełny audit trail nie należy do krytycznej ścieżki pierwszego wydania. Użytkownik może co najwyżej czytać własne wpisy; nie może ręcznie ich tworzyć, zmieniać ani usuwać. Rozszerzenie o kontrolowane triggery/RPC wymaga osobnego projektu.

## 6. UX mobile-first

### 6.1. Viewporty i layout

Testowane są 360, 390, 430, 768, 1366 i 1920 px. Viewporty nie wymuszają liczby kolumn. Czytelność decyduje, czy statystyki są w jednej czy dwóch kolumnach.

Mobile używa jednej kolumny, marginesu około 16 px, touch targets min. 44 px i paddingu safe area. Desktop ma sidebar 256 px i ograniczoną maksymalną szerokość treści. `maximumScale: 1` zostaje usunięte.

### 6.2. Dashboard

Dashboard pozostaje lekki i operacyjny. Pokazuje wybrany pojazd, licznik, paliwo, statystyki miesiąca, diety, ostatnie przejazdy oraz CTA Nowy przejazd/Tankowanie. Nie powstaje zestaw dodatkowych wykresów ani modułów.

### 6.3. Listy

Mobile używa kart dla przejazdów, paliwa, diet, klientów, hoteli i pojazdów. Desktop zachowuje czytelne tabele. Filtry mobilne są bottom sheetem, a search/paginacja działają w DB.

Dezaktywacja jest standardową akcją klientów, pojazdów i podobnych encji. Trwałe usunięcie wymaga sprawdzenia zależności i wyraźnego potwierdzenia; nie może niszczyć czytelności historii.

### 6.4. TripForm

Podział:

```text
TripForm
├── TripBasicInfo
├── ClientSelector
├── RouteSection
│   └── TripLegEditor
├── MileageSection
├── FuelSection
│   ├── FuelPurchaseList
│   └── FuelPurchaseForm
├── AllowanceSection
├── HotelSection
├── TripSummary
└── TripValidationSummary
```

Mobile pokazuje sekcyjne karty/collapsible: Wyjazd, Trasa, Paliwo, Diety, Hotel i dodatkowe, Podsumowanie. Błąd otwiera właściwą sekcję i przenosi focus. Desktop zachowuje rozwinięte karty oraz sticky summary.

Na trasach dodawania/edycji MobileNav jest ukryty. Sticky Zapisz/Anuluj ma pełny safe-area i keyboard offset, więc nie nakłada się z nawigacją.

`useUnsavedChanges` używa własnego dialogu dla nawigacji wewnętrznej i standardowego `beforeunload` bez niestandardowego tekstu dla zamknięcia/odświeżenia karty.

### 6.5. Wiele tankowań

FuelSection pokazuje listę, dokładną sumę, normę bez zbędnych zer, korektę, dokładne zużycie i finalny stan z jednym miejscem. Dodawanie/edycja działa w klasycznym modalu desktop i stabilnym bottom/fullscreen sheet mobile.

Usunięcie tankowania w TripForm jest draftem. „Cofnij” przywraca cały rekord, wszystkie dane i pierwotną pozycję. Baza zmienia się dopiero przy atomowym zapisie agregatu.

BottomSheet priorytetyzuje focus, keyboard, scroll, safe area, dirty state i stabilność. Swipe-to-close nie należy do pierwszego wydania.

Legacy ma neutralny panel i jawne Przelicz według normy. Samo tankowanie nie przełącza trybu.

### 6.6. Nawigacja i stany

MobileNav zachowuje Dashboard, Przejazdy, centralne `+`, Klienci i Raporty. `+` otwiera tylko Nowy przejazd/Tankowanie.

Każdy ekran ma skeleton/loading, właściwy empty state, filtrowany empty state, retry error state i zachowanie danych formularza po błędzie. Czerwony kolor służy realnym błędom i destrukcji, nie sugestiom.

### 6.7. Accessibility

Definition of Done obejmuje focus management, keyboard navigation, aria-label, aria-describedby, aria-live, widoczne focus states, kontrast, touch targets, semantyczne nagłówki, focus trap, powrót focusu i informację niewyrażaną wyłącznie kolorem.

Modal/BottomSheet używa `role=dialog`, `aria-modal`, dostępnego tytułu, Escape, zablokowanego tła i potwierdzenia przy dirty state. Combobox i DatePicker są dostępne z klawiatury.

## 7. Strategia testów

### 7.1. Narzędzia

- Vitest;
- Testing Library;
- Supabase CLI + Docker lub izolowany projekt testowy;
- Playwright;
- axe-core/playwright.

### 7.2. Unit tests

Obowiązkowe paliwo:

```text
58.17 → 58.2
58.14 → 58.1
58.15 → 58.2
```

Testowany jest pełny wzór z brakiem/jednym/wieloma tankowaniami, dokładnością 1–4 miejsc, korektą 0/5/10, granicami połowy, brakiem błędów floating point i przekazaniem finalnego wyniku następnemu trip.

Pozostałe testy: distance, liczniki, legacy actions, sequence/resequence, date-only/DST, allowances, error/suggestion/info, draft/command schemas i odrzucenie `user_id`.

### 7.3. Anonimowy fixture

Fixture odwzorowuje liczności i relacje istotne dla migracji, bez danych produkcyjnych: 3 użytkowników, 2 pojazdy, 17 klientów, 2 kierowców, 23 trip, 16 legacy, 15 istniejących fuel purchases, 1 brakujący, 5 hotel distances i 88 allowances.

### 7.4. Testy migracji

Ścieżka pozytywna uruchamia `001–014` od czystej bazy. Ścieżki negatywne obejmują cross-owner, null owner/vehicle, duplikaty per-user, niejednoznaczne paliwo, podejrzany standalone, złą korektę i wiele trip tego samego dnia.

Każdy błąd ma wycofać całą transakcję. Test ponownego wykonania potwierdza brak dodatkowych tankowań i zmian danych albo kontrolowaną odmowę.

### 7.5. RLS/RPC integration

USER A tworzy pełny zestaw danych. USER B nie może ich SELECT/UPDATE/DELETE ani wskazać ich UUID w child record/RPC. Testy obejmują brak/niepoprawny JWT, `anon`, UUID A→B, bezpośredni DML, role metadata oraz brak ręcznych mutacji audit logs.

RPC tests obejmują atomowy zapis, wymuszone błędy w child/cascade, optimistic concurrency trip i fuel purchases, równoległość, przenoszenie, compact sequence, usuwanie historyczne oraz standalone wykluczony z łańcucha.

### 7.6. Playwright i viewporty

Happy path: login, pojazd, klient, trip, dwa tankowania, wynik paliwa, edycja, cascade, edycja trip, draft delete/undo, zapis, raport i logout/cache.

Projekty: 360×800, 390×844, 430×932, 768×1024, 1366×768, 1920×1080. Kluczowe ekrany sprawdzają brak horizontal overflow. Axe i ręczne testy pokrywają pełny zakres accessibility.

### 7.7. CI

CI uruchamia osobne joby static, unit, database, build, E2E i security. Merge blokują lint, typecheck, unit, migration/RLS/RPC, build i główny E2E.

Audit findings są klasyfikowane; nie obowiązuje zasada blokowania przez dowolne znalezisko. Nierozwiązana krytyczna podatność runtime blokuje produkcję. `npm audit fix --force` jest zabronione.

## 8. Maintenance mode, backup i wdrożenie

### 8.1. Maintenance mode

Maintenance mode ma rzeczywiście blokować mutacje zwykłych użytkowników:

- POST/PATCH/PUT/DELETE zwracają kontrolowany 503;
- read-only może pozostać, jeśli jest bezpieczny;
- flaga środowiskowa i bramka middleware/API blokują mutacje przez aplikację;
- ponieważ przed cutoverem starszy klient może pisać bezpośrednio do Supabase, osobny, przetestowany skrypt operatorski czasowo odbiera `authenticated` DML na tabelach biznesowych; sama plansza lub flaga aplikacji nie jest wystarczająca;
- przed odebraniem uprawnień operator zapisuje oczekiwany stan ACL, a skrypt wyjścia odtwarza wyłącznie jawnie wymienione uprawnienia tabel niekrytycznych; DML `trips`, `fuel_purchases` i `trip_allowances` pozostaje odebrany przez `014`;
- czasowe odebranie DML nie może blokować działania zweryfikowanych `SECURITY DEFINER` RPC po ich wdrożeniu, ale bramka aplikacji nadal uniemożliwia zwykłym użytkownikom wywołanie mutacji w oknie serwisowym;
- operator ma udokumentowany sposób włączenia i wyłączenia;
- nie powstaje system administratorski.

Skrypty wejścia/wyjścia z maintenance są testowane na lokalnej bazie i nie należą do automatycznego łańcucha migracji. Wyjście z maintenance następuje dopiero po `014`; nie może przypadkowo przywrócić bezpośredniego DML tabel krytycznych.

### 8.2. Backup

Przed wdrożeniem operator:

1. potwierdza projekt/environment;
2. włącza maintenance mode i potwierdza brak zapisów;
3. tworzy pełny backup/PITR zgodny z planem Supabase;
4. tworzy logiczny dump `public` i zaszyfrowany dump krytycznych danych poza repo;
5. zapisuje liczności, sumy kontrolne i stan migracji;
6. odtwarza backup w izolowanym środowisku;
7. potwierdza restore przed migracją.

Nie zakłada się, że `auth.users` można poprawnie backupować/odtwarzać zwykłym dumpem. Mechanizm Supabase Auth musi być zweryfikowany dla rzeczywistego projektu/planu, a próbny restore w izolacji musi objąć auth. Dopiero wtedy backup/restore auth może zostać oznaczony jako zweryfikowany. Dumpy i dane produkcyjne nigdy nie trafiają do repo.

### 8.3. Kolejność ręcznego wdrożenia

1. Maintenance mode blokujący mutacje w aplikacji oraz czasowe odebranie DML zwykłym użytkownikom w DB; zapis stanu ACL.
2. Zweryfikowany backup i próbny restore.
3. Wszystkie pre-checki i zapis wyników.
4. `008`, post-check.
5. `009`, post-check pięciu hotel distances.
6. `010`, RLS/ownership tests.
7. `011`, potwierdzenie braku zmiany legacy.
8. `012`, potwierdzenie klasyfikacji 15+1 i braku duplikatów.
9. Raport grup sequence i ręczna akceptacja.
10. `013`, post-check sequence/RPC.
11. Deployment aplikacji używającej RPC.
12. Smoke test na kontrolowanym koncie.
13. Operator potwierdza wyniki CI/RPC poza SQL.
14. `014`, obiektywne pre-checki DB i odebranie DML.
15. Post-deploy checks.
16. Kontrolowane wyjście z maintenance: przywrócenie wyłącznie oczekiwanych uprawnień niekrytycznych, pozostawienie revoke z `014`, wyłączenie bramki aplikacji.

Dowolny błąd zatrzymuje proces; nie uruchamia się następnej migracji.

### 8.4. Post-deploy checks

SQL potwierdza zero null owners/cross-owner/duplikatów, aktywne RLS, zwalidowane FK, poprawne UNIQUE per-user, jedno mapowanie każdego legacy, dokładnie jeden utworzony backfill, zwarte sequence, niepuste vehicle, odebrany DML i brak RPC dla anon/public.

Kontrole łańcucha potwierdzają `fuel_start = previous fuel_end`, wykluczenie standalone, sumę wyłącznie z `fuel_purchases` oraz dokładnie jedno finalne zaokrąglenie.

Smoke test obejmuje auth, dwa tankowania, legacy preserve/switch, cascade, mobile, raport, import testowy, cache/logout i brak console/hydration errors.

### 8.5. Recovery

- Błąd transakcyjnej migracji: zatrzymać proces, potwierdzić rollback, poprawić/testować w izolacji.
- Po `008–011`: reverse scripts tylko dla nowych elementów; nie przywracać liberalnego RLS.
- Po `012` przed switch: usunąć wyłącznie `legacy_backfill_created = true`, wyzerować markery istniejących wpisów.
- Po `013` przed nowymi zapisami: usunąć RPC/sequence według przetestowanego reverse script i pozostać w maintenance.
- Po switch i nowych zapisach: zatrzymać mutacje, preferować forward fix, a przy niepewnej integralności odtworzyć PITR/backup. Nie rekonstruować starego modelu heurystycznie.
- Rollback Vercel jest dozwolony tylko do wersji kompatybilnej z aktualnym schematem i RPC.

## 9. Definition of Done

### 9.1. Bezpieczeństwo

- RLS na każdej prywatnej tabeli;
- USER A nie widzi ani nie zmienia USER B;
- relacje cross-owner są niemożliwe;
- RPC bez prawidłowego JWT jest odrzucone;
- SECURITY DEFINER spełnia wszystkie wymagania;
- bezpośredni DML krytycznych tabel jest odebrany;
- brak eskalacji roli i runtime service role;
- brak cache prywatnych danych;
- brak nierozwiązanej krytycznej podatności runtime.

### 9.2. Dane i migracje

- lokalny test `001–014` przechodzi;
- fixture pozytywny i negatywne scenariusze przechodzą;
- pięć hotel distances ma owner;
- backfill rozpoznaje 15 i tworzy dokładnie 1 wpis;
- brak duplikatów;
- pre/post-checki oraz recovery są przetestowane;
- backup, Supabase Auth backup i próbny restore są zweryfikowane przed produkcją.

### 9.3. Paliwo

- dowolna liczba tankowań;
- `fuel_purchases` jest jedynym source of truth;
- brak zaokrągleń pośrednich;
- jedno finalne `ROUND(...,1)`;
- litry zachowują dokładność;
- legacy nie przełącza się automatycznie;
- cascade działa dla edycji, usunięcia i przenoszenia;
- standalone nie uczestniczy w trip.

### 9.4. UX i accessibility

- wszystkie viewporty działają bez overflow;
- karty mobile i tabele desktop są czytelne;
- MobileNav nie koliduje ze sticky actions;
- bottom sheet jest keyboard/safe-area/dirty-state safe;
- draft nie ginie;
- dashboard pozostaje lekki;
- focus, keyboard, aria, contrast, touch targets i axe są spełnione.

### 9.5. Jakość

- nieinteraktywny lint przechodzi;
- typecheck przechodzi;
- unit, migration, RLS, RPC i E2E przechodzą;
- production build przechodzi;
- brak console/hydration errors;
- dependency review jest udokumentowany;
- git diff nie zawiera debugów, przypadkowych artefaktów ani krytycznych braków implementacyjnych.

## 10. Artefakty końcowe implementacji

Po zakończeniu implementacji repozytorium zawiera:

- migracje `008–014` z pre/post-checkami;
- anonimowy fixture i testy migracji;
- unit/integration/E2E/axe;
- CI;
- instrukcję backupu, Supabase Auth, maintenance mode, wdrożenia i recovery;
- raport zależności/advisories;
- końcowy raport wyników lint, typecheck, tests, integration, E2E i build;
- listę ręcznych czynności Supabase/Vercel i ewentualnych blockerów produkcyjnych.

Żaden z tych artefaktów nie uruchamia produkcyjnych migracji automatycznie.
