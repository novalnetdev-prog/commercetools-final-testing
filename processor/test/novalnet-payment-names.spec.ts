import { getPaymentMethodName, getPaymentMethodNames } from "../src/i18n";

describe("Novalnet payment names", () => {
  test.each([
    ["DIRECT_DEBIT_SEPA", "Direct Debit SEPA", "SEPA-Lastschrift"],
    ["GUARANTEED_DIRECT_DEBIT_SEPA", "Direct Debit SEPA with payment guarantee", "SEPA-Lastschrift mit Zahlungsgarantie"],
    ["BANCOMATPAY", "BANCOMAT Pay", "BANCOMAT Pay"],
    ["KAKAOPAY", "Kakao Pay", "Kakao Pay"],
    ["NAVERPAY", "Naver Pay", "Naver Pay"],
    ["PIX", "PIX", "PIX"],
    ["BOLETO", "Boleto", "Boleto"],
    ["BIZUM", "Bizum", "Bizum"],
  ])("%s uses localized display names", (code, en, de) => {
    expect(getPaymentMethodNames(code)).toEqual({ en, de });
    expect(getPaymentMethodName("de", code)).toBe(de);
  });
});
