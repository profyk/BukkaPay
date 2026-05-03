import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { CURRENCIES, Currency, CurrencyCode, getStoredCurrency, setStoredCurrency, getCurrency, getInitialCurrency } from "./currency";

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (code: CurrencyCode) => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextType>({
  currency: CURRENCIES[0],
  setCurrency: async () => {},
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(getInitialCurrency);

  useEffect(() => {
    getStoredCurrency().then(setCurrencyCode);
  }, []);

  const setCurrency = async (code: CurrencyCode) => {
    setCurrencyCode(code);
    await setStoredCurrency(code);
  };

  return (
    <CurrencyContext.Provider value={{ currency: getCurrency(currencyCode), setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
