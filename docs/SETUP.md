# Konfiguracja i Setup

## 1. Tworzenie projektu Supabase

1. Zaloguj się na [supabase.com](https://supabase.com)
2. Kliknij **New project**
3. Wybierz organizację i wpisz nazwę projektu (np. `ewidencja-przejazdy`)
4. Ustaw silne hasło do bazy danych (zapisz je!)
5. Wybierz region najbliższy użytkownikom (np. `eu-central-1`)
6. Kliknij **Create new project** i poczekaj ~2 minuty

## 2. Pobieranie kluczy API

W panelu projektu Supabase przejdź do:
**Settings → API**

Skopiuj:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role secret** key → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ Klucz `service_role` daje pełny dostęp do bazy — NIGDY nie umieszczaj go po stronie klienta ani w publicznym repozytorium.

## 3. Plik .env.local

Utwórz plik `.env.local` w głównym katalogu projektu:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 4. Migracje bazy danych

Przejdź do **SQL Editor** w panelu Supabase i uruchom pliki SQL w kolejności:

### 001_create_tables.sql
Tworzy wszystkie tabele:
- `profiles` — rozszerzenie tabeli `auth.users`
- `vehicles` — pojazdy
- `drivers` — kierowcy
- `clients` — klienci
- `trips` — przejazdy (główna tabela)
- `fuel_purchases` — faktury paliwowe
- `hotels` — faktury hotelowe
- `import_logs` — logi importu
- `audit_logs` — logi zmian

### 002_rls_policies.sql
Konfiguruje Row Level Security:
- Wszyscy zalogowani użytkownicy mogą odczytywać dane
- Zapis wymaga roli `manager` lub `admin`
- Usuwanie wymaga roli `admin`

### 003_functions.sql
Tworzy:
- Trigger `set_updated_at` — automatycznie aktualizuje pole `updated_at`
- Trigger `handle_new_user` — automatycznie tworzy profil przy rejestracji
- Funkcja `calculate_trip_stats` — oblicza km, paliwo, spalanie
- Widok `monthly_trip_summary`
- Widok `client_trip_summary`

## 5. Tworzenie pierwszego użytkownika

### Opcja A: przez Supabase Dashboard
1. Przejdź do **Authentication → Users**
2. Kliknij **Add user**
3. Wpisz email i hasło
4. Następnie w SQL Editor ustaw rolę admin:

```sql
UPDATE profiles SET role = 'admin' WHERE id = '<uuid-użytkownika>';
```

### Opcja B: przez API aplikacji (po uruchomieniu)
Zarejestruj się przez stronę `/login` (funkcja sign-up do dodania opcjonalnie).

## 6. Konfiguracja Auth w Supabase

W panelu: **Authentication → URL Configuration**

- **Site URL**: `http://localhost:3000` (dev) lub URL produkcyjny
- **Redirect URLs**: Dodaj URL swojej aplikacji

## 7. Uruchomienie lokalne

```bash
npm install
npm run dev
```

Otwórz http://localhost:3000 — zostaniesz przekierowany do `/login`.

## 8. Weryfikacja środowiska

Po uruchomieniu sprawdź:
- ✅ Logowanie działa
- ✅ Dashboard wyświetla się poprawnie
- ✅ Można dodać pojazd (Pojazdy → Dodaj pojazd)
- ✅ Można dodać klienta (Klienci → Dodaj klienta)
- ✅ Można dodać przejazd (Przejazdy → Dodaj przejazd)
