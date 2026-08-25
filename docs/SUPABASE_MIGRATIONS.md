# Migracje Supabase

Migracje w `supabase/migrations` są artefaktami do lokalnego lub izolowanego środowiska testowego. Nie zostały uruchomione przeciwko produkcji.

## Kolejność

1. Uruchom `001`-`007` zgodnie z istniejącym schematem.
2. `008_profile_role_alignment.sql` rozszerza ownership o nullable `user_id`; nie modyfikuje rekordów.
3. `009_ownership_backfill.sql` przypisuje ownership wyłącznie z jednoznacznych relacji. Zatrzymuje się przy orphanach, ownerach `NULL` i relacjach cross-owner.
4. `010_ownership_constraints_rls.sql` wymaga udanego `009`. Dodaje constraints, composite FK, RLS i ogranicza zapis profilu do `full_name`.
5. `011_fuel_model_expand.sql` dodaje nowy model paliwa bez usuwania pól legacy.
6. `012_fuel_legacy_backfill.sql` tworzy provenance dla paliwa legacy albo zatrzymuje się, gdy dopasowanie tankowania jest niejednoznaczne.
7. `013_trip_atomic_operations.sql` dodaje sequence oraz przygotowuje RPC. Obecne API nadal korzysta z legacy direct DML, dlatego `save_trip_with_children` zwraca kontrolowany błąd do czasu wdrożenia mapowania API na RPC.
8. [014_revoke_direct_trip_dml.sql](../supabase/manual/014_revoke_direct_trip_dml.sql) jest ręcznym gate'em poza katalogiem automatycznych migracji. Nie uruchamiaj go, dopóki API nie zostanie przełączone na RPC i zweryfikowane w środowisku testowym.

## Lokalne testowanie

Przed testem wykonaj backup lub reset wyłącznie lokalnej bazy. Nie ustawiaj zmiennych produkcyjnych i nie linkuj projektu Supabase.

```powershell
npx supabase start
npx supabase db reset --local
```

Dla ręcznego skryptu `014` wymagany jest maintenance gate w zatwierdzonej transakcji:

```sql
BEGIN;
SET LOCAL app.allow_direct_trip_dml_revoke = 'on';
-- Execute supabase/manual/014_revoke_direct_trip_dml.sql only after the RPC API rollout.
COMMIT;
```

Skrypt `014` odbiera bezpośrednie `INSERT`, `UPDATE` i `DELETE` dla przejazdów, tankowań i diet. W aktualnej wersji aplikacji byłoby to niekompatybilne, dlatego nie jest częścią zwykłego resetu lokalnego.
