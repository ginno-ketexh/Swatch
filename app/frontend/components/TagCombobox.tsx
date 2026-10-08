import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { listTags } from "../api/client";

const TAG_LIMIT = 10;

function normalizeTag(value: string): string {
  return value.normalize("NFC").replace(/\p{Cc}/gu, "").trim().replace(/\s+/g, " ");
}

type TagComboboxProps = {
  id: string;
  tags: string[];
  onChange: (tags: string[]) => void;
};

export function TagCombobox({ id, tags, onChange }: TagComboboxProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState("");

  const suggestions = useQuery({
    queryKey: ["tags"],
    queryFn: ({ signal }) => listTags(signal),
    enabled: open,
    staleTime: 30_000,
  });

  const typed = normalizeTag(draft);
  const known = suggestions.data ?? [];
  const already = (name: string) => tags.some((tag) => tag.toLowerCase() === name.toLowerCase());
  const matches = known
    .map((tag) => tag.name)
    .filter((name) => !already(name))
    .filter((name) => (typed ? name.toLowerCase().includes(typed.toLowerCase()) : true));
  const exact = known.some((tag) => tag.name.toLowerCase() === typed.toLowerCase());
  const showCreate = typed.length > 0 && !exact && !already(typed);
  const options = [
    ...(showCreate ? [{ id: `${listId}-create`, label: `Create “${typed}”`, value: typed }] : []),
    ...matches.map((name) => ({ id: `${listId}-option-${name}`, label: name, value: name })),
  ];
  const expanded = open && options.length > 0;
  const activeOption = options[active] ?? options[0];
  const full = tags.length >= TAG_LIMIT;

  function add(raw: string) {
    const name = normalizeTag(raw);
    if (!name || full) return;
    if (already(name)) {
      setDraft("");
      setMessage("");
      inputRef.current?.focus();
      return;
    }
    onChange([...tags, name]);
    setDraft("");
    setActive(0);
    setMessage(`Added tag ${name}`);
    inputRef.current?.focus();
  }

  function remove(name: string) {
    onChange(tags.filter((tag) => tag.toLowerCase() !== name.toLowerCase()));
    setMessage(`Removed tag ${name}`);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (options.length === 0 ? 0 : (index + 1) % options.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (options.length === 0 ? 0 : (index - 1 + options.length) % options.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (expanded && activeOption) add(activeOption.value);
      else add(draft);
      return;
    }
    if (event.key === ",") {
      event.preventDefault();
      add(draft);
      return;
    }
    if (event.key === "Escape") {
      if (!open && draft.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setDraft("");
      return;
    }
    if (event.key === "Backspace" && draft.length === 0 && tags.length > 0) {
      event.preventDefault();
      const last = tags[tags.length - 1];
      document.getElementById(`${id}-chip-${last}`)?.focus();
    }
  }

  return (
    <div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <li key={tag} className="flex items-center gap-1 border border-line bg-surface px-2 py-1">
            <span className="break-words">{tag}</span>
            <button
              id={`${id}-chip-${tag}`}
              type="button"
              className="min-h-6 min-w-6 underline"
              aria-label={`Remove tag ${tag}`}
              onClick={() => remove(tag)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <label className="mt-3 block" htmlFor={id}>
        Add a tag
      </label>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        className="mt-2 w-full border border-ink bg-canvas px-3 py-2 text-base"
        type="text"
        value={draft}
        maxLength={30}
        autoComplete="off"
        disabled={full}
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeOption ? activeOption.id : undefined}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setDraft(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {full ? <p className="mt-1">A swatch can have at most 10 tags.</p> : null}
      {expanded ? (
        <ul id={listId} role="listbox" className="mt-1 border border-ink bg-canvas">
          {options.map((option, index) => (
            <li
              key={option.id}
              id={option.id}
              role="option"
              aria-selected={index === active}
              className="min-h-11 px-3 py-2"
              onMouseDown={(event) => {
                event.preventDefault();
                add(option.value);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
