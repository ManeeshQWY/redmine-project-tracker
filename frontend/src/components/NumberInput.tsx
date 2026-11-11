import { useEffect, useState } from "react";

interface Props {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  /** Whole numbers only (a decimal is rounded). */
  integer?: boolean;
  className?: string;
  title?: string;
  "aria-label"?: string;
}

/**
 * A number field you can clear and retype. It keeps what is being typed, hands a value to
 * `onCommit` only once it is a valid number inside [min, max] (so a half-typed or absurd
 * value never reaches the calculations), and puts the last good value back when it loses focus.
 */
export default function NumberInput({ value, onCommit, min = 0, max = Number.MAX_SAFE_INTEGER, integer = false, className, title, "aria-label": ariaLabel }: Props) {
  const [text, setText] = useState(String(value));

  // The value changed from outside (not by this field): show it.
  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  function parse(raw: string): number | null {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const v = integer ? Math.round(n) : n;
    return v >= min && v <= max ? v : null;
  }

  return (
    <input
      type="number"
      inputMode={integer ? "numeric" : "decimal"}
      min={min}
      max={max}
      className={className}
      title={title}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = parse(e.target.value);
        if (v !== null && v !== value) onCommit(v);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
