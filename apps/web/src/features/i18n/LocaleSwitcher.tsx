import type { ChangeEvent } from "react";

import { localeCatalog, type Locale } from "./locale";

type LocaleSwitcherProps = {
  readonly className?: string;
  readonly compact?: boolean;
  readonly locale: Locale;
  readonly onLocaleChange: (locale: Locale) => void;
};

export function LocaleSwitcher({ className, compact = false, locale, onLocaleChange }: LocaleSwitcherProps) {
  const copy = localeCatalog(locale).locale;
  const currentLocaleLabel = locale === "en" ? copy.english : copy.simplifiedChinese;
  const labelClassName = compact ? "jixia-locale-switcher__label jixia-locale-switcher__label--compact" : "jixia-locale-switcher__label";
  const switcherClassName = ["jixia-locale-switcher", compact ? "jixia-locale-switcher--compact" : undefined, className]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    const nextLocale = event.currentTarget.value;

    if (nextLocale === "en" || nextLocale === "zh-CN") {
      onLocaleChange(nextLocale);
    }
  }

  return (
    <label className={switcherClassName}>
      <span className={labelClassName}>{copy.label}</span>
      <select aria-label={copy.label} onChange={handleChange} title={currentLocaleLabel} value={locale}>
        <option value="en">{compact ? "EN" : copy.english}</option>
        <option value="zh-CN">{compact ? "中文" : copy.simplifiedChinese}</option>
      </select>
    </label>
  );
}
