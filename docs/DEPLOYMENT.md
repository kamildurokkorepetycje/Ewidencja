# Wdrożenie na Vercel

## Wymagania wstępne

- Konto [Vercel](https://vercel.com)
- Projekt na GitHubie / GitLabie / Bitbucket
- Skonfigurowany projekt Supabase (patrz [SETUP.md](SETUP.md))

## 1. Push do repozytorium

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<twoja-nazwa>/<repo>.git
git push -u origin main
```

## 2. Import projektu w Vercel

1. Zaloguj się na [vercel.com](https://vercel.com)
2. Kliknij **Add New → Project**
3. Wybierz repozytorium z listą (autoryzuj GitHub jeśli trzeba)
4. Kliknij **Import**

## 3. Konfiguracja zmiennych środowiskowych

W sekcji **Environment Variables** dodaj:

| Nazwa | Wartość |
|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxxxxxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (klucz anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (klucz service_role) |

> Ustaw je dla środowisk: **Production**, **Preview**, **Development**

## 4. Ustawienia budowania

Vercel powinien automatycznie wykryć Next.js. Sprawdź:
- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

## 5. Deploy

Kliknij **Deploy**. Pierwsze wdrożenie zajmuje ok. 2-3 minut.

Po zakończeniu otrzymasz URL w stylu:
`https://ewidencja-nextjs.vercel.app`

## 6. Aktualizacja URL w Supabase

Po otrzymaniu produkcyjnego URL:

1. Przejdź do Supabase → **Authentication → URL Configuration**
2. Zmień **Site URL** na: `https://ewidencja-nextjs.vercel.app`
3. Dodaj do **Redirect URLs**: `https://ewidencja-nextjs.vercel.app/**`

## 7. Dalsze wdrożenia (CI/CD)

Każdy push do gałęzi `main` automatycznie wdraża nową wersję na Vercel.

Pushe do innych gałęzi tworzą **Preview deployments** (podgląd).

## Niestandardowa domena

1. Vercel → Settings → Domains
2. Dodaj swoją domenę
3. Zaktualizuj rekordy DNS u rejestratora domeny (A lub CNAME)
4. Zaktualizuj Site URL w Supabase

## Zmienne tylko dla serwera

Vercel automatycznie chroni zmienne bez prefiksu `NEXT_PUBLIC_` przed wysłaniem do przeglądarki. Zmienna `SUPABASE_SERVICE_ROLE_KEY` jest bezpieczna.
