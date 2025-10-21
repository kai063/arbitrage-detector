# 🧪 Testovací instrukce pro Arbitrage Detector

## Jak ověřit, že algoritmus funguje správně

### 1. 📋 Příprava na testování
- Spusťte aplikaci na `http://localhost:3001`
- Otevřete Developer Tools (F12) a přejděte na záložku "Console"
- Připravte si sledování konzolových logů

### 2. 🔧 Test nastavení algoritmu

#### Test A: Manuální data s různými nastaveními
1. **Zvolte "Manuální zadávání kurzů"**
2. **Změňte nastavení algoritmu:**
   - Max iterace: 20
   - Min. profit: 1.0%
   - Max. délka cesty: 3
3. **Generujte testovací data:** Klikněte "Jednoduchá arbitráž"
4. **Spusťte analýzu**
5. **V konzoli ověřte:**
   ```
   🔧 API Settings received: {
     finalSettings: {
       maxIterations: 20,
       minProfitThreshold: 0.01,
       maxPathLength: 3,
       ...
     }
   }
   ```

#### Test B: Binance data s filtračními nastaveními
1. **Zvolte "Binance Live Data"**
2. **Vyberte základní sadu měn** (BTC,ETH,BNB,USDT,USDC)
3. **Změňte nastavení:**
   - Min. profit: 0.1%
   - Max iterace: 15
4. **Klikněte "Načíst data a analyzovat"**
5. **V konzoli ověřte:**
   - Načtení dat z Binance
   - Použití správných nastavení
   - Filtrování podle vybraných měn

### 3. 🎯 Test funkčnosti algoritmu

#### Test 1: Zaručená arbitráž
- **Očekávané výsledky:** 1 cyklus s ~3.25% profitem
- **Data:** "Jednoduchá arbitráž" z Test Data Generator
- **Konzolové logy:**
  ```
  🔍 detectCurrencyArbitrage started: { inputRates: 10, settings: {...} }
  📊 Currency filtering: (pokud jsou vybrané měny)
  🏗️ Building graph with rates: X
  🔄 Starting arbitrage cycle detection...
  ✅ Initial detection found X cycles
  💰 Profit filtering (1%): X → Y cycles
  📏 Path length filtering (max 4): Y → Z cycles
  🎯 Final result: { totalCycles: 1, bestProfit: ~3.25 }
  ```

#### Test 2: Bez arbitráže
- **Očekávané výsledky:** 0 cyklů
- **Data:** "Bez arbitráže" z Test Data Generator
- **Konzolové logy:** Finální výsledek by měl být 0 cyklů

#### Test 3: Binance Live Data
- **Očekávané výsledky:** Závislé na aktuálních tržních podmínkách
- **Data:** Live data z Binance API
- **Konzolové logy:**
  ```
  🔍 Starting arbitrage detection with Binance data: {
    totalRates: X,
    settings: { selectedCurrencies: [...] },
    sampleRates: [...]
  }
  ```

### 4. ✅ Kontrolní seznam

#### Nastavení algoritmu
- [ ] Změna "Max iterace" se promítne do API volání
- [ ] Změna "Min. profit" správně filtruje výsledky
- [ ] Změna "Max. délka cesty" omezuje délku cyklů
- [ ] Vybrané měny správně filtrují vstupní data

#### UI Organizace
- [ ] **Nahoře:** Zdroje dat, Nastavení algoritmu, Výsledky arbitráže
- [ ] **Dole:** Statistics Overview, Algorithm Debug, Arbitrage History
- [ ] **Binance tabulka** je přímo u Binance nastavení (ne dole)
- [ ] **Test Data Generator** se zobrazuje pouze u manuálního zdroje

#### Funkčnost algoritmu
- [ ] Jednoduchá arbitráž najde ~3.25% profit
- [ ] Data "Bez arbitráže" najde 0 cyklů
- [ ] Binance data načte reálné kurzy a analyzuje je
- [ ] Změna nastavení ovlivňuje výsledky

### 5. 🐛 Debugging tipů

Pokud algoritmus nefunguje správně:

1. **Zkontrolujte konzoli** pro error logy
2. **Ověřte nastavení** v konzolových logech
3. **Zkontrolujte filtrování** - možná jsou příliš přísné filtry
4. **Testujte postupně:**
   - Nejprve testovací data bez filtrů
   - Pak přidejte filtry postupně
   - Nakonec testujte s Binance daty

### 6. 📊 Interpretace výsledků

#### Pozitivní výsledky
- **Konzolové logy:** Postupné kroky algoritmu jsou viditelné
- **UI feedback:** Notifikace o nalezených arbitrážích
- **Graf:** Vizualizace nalezených cyklů
- **Tabulka:** Historie všech analýz

#### Problematické signály
- **Chybějící logy:** Algoritmus se možná nezavolal
- **0 cyklů vždy:** Příliš přísné nastavení nebo chyba v datech
- **Timeout:** Příliš vysoké hodnoty maxIterations
- **Chyby API:** Problém s Binance připojením

### 7. 🚀 Doporučené testovací scénáře

1. **Rychlý test:** Manuální → Jednoduchá arbitráž → Default nastavení
2. **Nastavení test:** Změňte min. profit na 5% → Mělo by najít 0 cyklů
3. **Binance test:** Živá data → Základní sada měn → Min. profit 0.1%
4. **Výkonnostní test:** Max iterace 50 → Sledujte čas výpočtu

Aplikace je nyní plně připravena na testování! 🎉