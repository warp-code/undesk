import { sanitizeNumberInput } from "../_lib/format";

interface FormInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suffix?: string;
  disabled?: boolean;
  readOnly?: boolean;
  children?: React.ReactNode;
}

export const FormInput = ({
  value,
  onChange,
  placeholder = "0",
  suffix,
  disabled = false,
  readOnly = false,
  children,
}: FormInputProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeNumberInput(e.target.value);
    if (sanitized !== null) {
      onChange(sanitized);
    }
  };

  const baseClasses = readOnly
    ? "bg-input/50 rounded-md px-3 py-2 flex justify-between items-center border border-transparent"
    : "bg-input rounded-md px-3 py-2 flex justify-between items-center border border-transparent hover:border-border focus-within:border-primary hover:focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all";

  return (
    <div className={baseClasses}>
      {readOnly ? (
        <span
          className={
            parseFloat(value) > 0 ? "text-foreground" : "text-muted-foreground"
          }
        >
          {parseFloat(value) > 0 ? parseFloat(value).toLocaleString() : "—"}
        </span>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent text-foreground outline-none"
        />
      )}
      {children}
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </div>
  );
};
