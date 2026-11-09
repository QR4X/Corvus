import type { ReactNode } from "react";
import { Sheet, SheetSearch } from "./Sheet";

export function SearchSheet({
  open,
  title,
  placeholder,
  value,
  onChange,
  onClose,
  found,
  invalid,
  children,
}: {
  open: boolean;

  title: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  found?: number;
  invalid?: boolean;

  children: ReactNode;
}) {
  return (
    <Sheet
      title={title}
      open={open}
      onClose={onClose}
      startFull

      focusOnOpen={false}
    >
      {}
      <SheetSearch
        value={value}
        placeholder={placeholder}
        found={found}
        invalid={invalid}
        autoFocus={open}
        onChange={onChange}
      />
      <div className="corvus-search-results">{children}</div>
    </Sheet>
  );
}
