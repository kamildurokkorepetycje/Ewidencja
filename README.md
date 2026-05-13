# Ewidencja Przejazdów

Aplikacja webowa do zarządzania ewidencją przejazdów służbowych, zastępująca plik Excel. Zbudowana w Next.js 14, TypeScript, Tailwind CSS i Supabase.

## Funkcje

- Ewidencja przejazdów (trasy, paliwo, hotele, faktury)
- Zarządzanie pojazdami, kierowcami, klientami
- Raporty miesięczne i roczne z eksportem PDF/Excel/CSV
- Import danych z pliku Excel
- Wykrywanie błędów w ewidencji
- Panel mobilny (PWA-ready)
- Role użytkowników: admin / menedżer / kierowca

## Quick start

### 1. Wymagania

- Node.js 18+
- Konto Supabase (supabase.com)
- Konto Vercel (opcjonalnie)

### 2. Klonowanie i instalacja

```bash
git clone <repo-url>
cd ewidencja-nextjs
npm install
```

### 3. Konfiguracja środowiska

```bash
cp .env.example .env.local
```

Uzupełnij `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Migracje bazy danych

W panelu Supabase → SQL Editor uruchom kolejno:

```
supabase/migrations/001_create_tables.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_functions.sql
```

Lub przy pomocy Supabase CLI:

```bash
npx supabase db push
```

### 5. Uruchomienie deweloperskie

```bash
npm run dev
```

Aplikacja dostępna na http://localhost:3000

### 6. Budowanie produkcyjne

```bash
npm run build
npm start
```

## Struktura projektu

```
app/
  (auth)/login/          # Strona logowania
  (dashboard)/
    page.tsx             # Dashboard główny
    przejazdy/           # Ewidencja przejazdów
    klienci/             # Zarządzanie klientami
    pojazdy/             # Zarządzanie pojazdami
    kierowcy/            # Zarządzanie kierowcami
    paliwo/              # Faktury paliwowe
    hotele/              # Przejazdy z hotelem
    raporty/             # Raporty i eksport
    import/              # Import z Excela
    ustawienia/          # Profil użytkownika
  api/                   # API routes
    trips/
    clients/
    vehicles/
    drivers/
    fuel/
    reports/
    import/
    export/
components/
  ui/                    # Button, Input, Modal, Badge...
  layout/                # Sidebar, Header, MobileNav
  trips/                 # TripForm
lib/
  supabase/              # client.ts, server.ts, admin.ts
  types/                 # TypeScript interfaces
  utils/                 # calculations, formatting, excel, export
supabase/
  migrations/            # SQL schema files
```

## Dokumentacja

- [Konfiguracja i setup](docs/SETUP.md)
- [Wdrożenie na Vercel](docs/DEPLOYMENT.md)
- [Przewodnik importu Excel](docs/IMPORT_GUIDE.md)

## Technologie

| Technologia | Wersja |
|-------------|--------|
| Next.js | 14.2.13 |
| React | 18 |
| TypeScript | 5 |
| Tailwind CSS | 3.4.1 |
| Supabase | ^2.45.4 |
| @supabase/ssr | ^0.5.1 |
| react-hook-form | ^7.53.0 |
| zod | ^3.23.8 |
| SheetJS (xlsx) | ^0.18.5 |
| jsPDF | ^2.5.1 |
| lucide-react | ^0.441.0 |
| date-fns | ^3.6.0 |

## Licencja

Prywatny projekt. Wszelkie prawa zastrzeżone.
# Ewidencja
