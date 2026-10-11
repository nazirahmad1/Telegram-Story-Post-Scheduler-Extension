import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "../../i18n";
import { DirectionalIcon } from "../Icon";
import { COUNTRIES, flagEmoji, type Country } from "../../telegram/countries";

interface CountryPickerProps {
  value: Country;
  onChange: (country: Country) => void;
  disabled?: boolean;
}

export function CountryPicker({ value, onChange, disabled }: CountryPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // A fixed-size popup window can't grow to fit the dropdown — if it opens
  // low enough on the page to extend past the visible area, this is the
  // only way the person ever sees the rest of it. "nearest" avoids
  // yanking the view around when it's already fully visible.
  useEffect(() => {
    if (open) menuRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const filtered = COUNTRIES.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.dialCode.includes(q) || c.iso.toLowerCase() === q;
  });

  return (
    <div className="country-picker" ref={containerRef}>
      <button
        type="button"
        className="input country-picker-trigger"
        disabled={disabled}
        aria-label={t("auth.selectCountry")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true" style={{ fontSize: 18 }}>
          {flagEmoji(value.iso)}
        </span>
        <span>+{value.dialCode}</span>
        <DirectionalIcon name="chevron-down" icon={ChevronDown} size={14} />
      </button>

      {open && (
        <div ref={menuRef} className="country-picker-menu card">
          <input
            className="input"
            type="text"
            autoFocus
            placeholder={t("auth.searchCountry")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("auth.searchCountry")}
          />
          <ul className="country-picker-list" role="listbox" aria-label={t("auth.selectCountry")}>
            {filtered.map((c) => (
              <li key={c.iso}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.iso === value.iso}
                  className="country-picker-option"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 18 }}>
                    {flagEmoji(c.iso)}
                  </span>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span className="helper-text">+{c.dialCode}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="helper-text" style={{ padding: 8 }}>—</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
