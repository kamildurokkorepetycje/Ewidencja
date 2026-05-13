# Przewodnik importu danych z Excela

## Obsługiwane formaty

- `.xlsx` — Excel 2007 i nowszy (zalecany)
- `.xls` — Excel 97-2003

## Import klientów

### Wymagane kolumny

| Kolumna w pliku | Pole w aplikacji | Wymagane |
|-----------------|------------------|----------|
| Nazwa / Klient / Client | Nazwa klienta | ✅ |
| Kod / Code | Kod klienta | ❌ |
| Miasto / Miejscowość / City | Miasto | ❌ |
| Odległość / Km / Distance | Standardowa trasa (km) | ❌ |
| Uwagi / Notes | Uwagi | ❌ |

### Przykładowy arkusz klientów

| Kod | Nazwa | Miasto | Odległość |
|-----|-------|--------|-----------|
| SKL01 | Sklep ABC | Warszawa | 120 |
| FAB02 | Fabryka XYZ | Kraków | 280 |

## Import przejazdów

### Wymagane kolumny

| Kolumna w pliku | Pole w aplikacji | Wymagane |
|-----------------|------------------|----------|
| Data od / Data wyjazdu / Date from | Data wyjazdu | ✅ |
| Data do / Data powrotu / Date to | Data powrotu | ❌ (domyślnie = data od) |
| Klient / Client | Nazwa klienta | ❌ |
| Pojazd / Vehicle / Nr rej. | Nr rejestracyjny | ❌ |
| Km od / Licznik start | Stan licznika (start) | ❌ |
| Km do / Licznik koniec | Stan licznika (koniec) | ❌ |
| Km / Dystans | Dystans (km) | ❌ |
| Paliwo start | Paliwo na start (L) | ❌ |
| Paliwo koniec | Paliwo na koniec (L) | ❌ |
| Tankowanie / Litry | Paliwo zakupione (L) | ❌ |
| Hotel | Hotel (TAK/NIE, 1/0) | ❌ |
| Noclegi | Liczba noclegów | ❌ |
| Faktura / Nr faktury | Numer faktury | ❌ |
| Uwagi | Uwagi | ❌ |

### Obsługiwane formaty dat

Import rozpoznaje następujące formaty dat:
- `2025-01-15` (ISO, zalecany)
- `15.01.2025` (polski)
- `15/01/2025`
- `15-01-2025`
- Liczba seryjna Excel (np. `45707`)

### Mapowanie klientów

Podczas importu przejazdów, klient jest wyszukiwany po:
1. Kodzie klienta (dokładne dopasowanie)
2. Nazwie klienta (dokładne dopasowanie)

Jeśli klient nie zostanie znaleziony, przejazd zostanie zaimportowany bez powiązanego klienta.

## Krok po kroku

### 1. Otwórz stronę importu
Przejdź do **Import** w menu bocznym.

### 2. Wybierz plik
Kliknij obszar przesyłania pliku i wybierz plik `.xlsx`/`.xls`.

### 3. Wybierz arkusz i typ importu
- Wybierz arkusz zawierający dane
- Wybierz **Przejazdy** lub **Klienci**

### 4. Sprawdź mapowanie kolumn
Aplikacja automatycznie próbuje wykryć mapowanie kolumn.

Możesz ręcznie zmienić dopasowania rozwijając listę przy każdym polu.

Kolumny których nie chcesz importować — zostaw „— pomiń —".

### 5. Podgląd
Sprawdź pierwsze 5 wierszy danych. Upewnij się, że daty i wartości wyglądają poprawnie.

### 6. Importuj
Kliknij **Importuj**. Po zakończeniu zobaczysz:
- Liczbę pomyślnie zaimportowanych wierszy
- Liczbę błędów
- Szczegóły błędów (jeśli wystąpiły)

## Wskazówki

- Usuń wiersze nagłówkowe z sum, podsumowań itp. przed importem
- Daty w formacie ISO (`YYYY-MM-DD`) są najbardziej niezawodne
- Import nie tworzy duplikatów automatycznie — sprawdź dane przed importem
- W przypadku błędów dla konkretnych wierszy, popraw dane w pliku i zaimportuj ponownie tylko błędne wiersze

## Eksport danych

### Excel
Przejdź do **Raporty** → wybierz miesiąc/rok → kliknij **Excel**.

Lub na stronie **Przejazdy** → **Eksport Excel** (eksportuje bieżący widok z filtrami).

### CSV
Analogicznie jak Excel, wybierz **CSV**. Plik ma kodowanie UTF-8 z BOM dla poprawnego wyświetlania polskich znaków w Excel.

### PDF
Przejdź do **Raporty** → wybierz miesiąc → kliknij **PDF**. Generuje raport miesięczny z tabelą przejazdów.
