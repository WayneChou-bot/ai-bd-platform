import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, tr, type Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : "en";
}
export async function getT() {
  const locale = await getLocale();
  return { locale, t: tr(locale) };
}
