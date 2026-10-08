function hidePassword(input: HTMLInputElement, button: HTMLButtonElement) {
  input.type = "password";
  button.setAttribute("aria-pressed", "false");
  button.textContent = "Show password";
}

function bindPasswordToggles(root: ParentNode) {
  root.querySelectorAll<HTMLButtonElement>("[data-password-toggle]").forEach((button) => {
    const input = document.getElementById(button.getAttribute("aria-controls") ?? "");
    if (!(input instanceof HTMLInputElement)) return;

    button.addEventListener("click", () => {
      const showing = input.type === "text";
      if (showing) {
        hidePassword(input, button);
        return;
      }
      input.type = "text";
      button.setAttribute("aria-pressed", "true");
      button.textContent = "Hide password";
    });
  });
}

function bindPending(form: HTMLFormElement) {
  form.addEventListener("submit", (event) => {
    if (form.dataset.submitted === "true") {
      event.preventDefault();
      return;
    }
    form.dataset.submitted = "true";

    form.querySelectorAll<HTMLButtonElement>("[data-password-toggle]").forEach((button) => {
      const input = document.getElementById(button.getAttribute("aria-controls") ?? "");
      if (input instanceof HTMLInputElement) hidePassword(input, button);
    });

    const submit = form.querySelector<HTMLButtonElement>("[data-pending]");
    if (!submit) return;
    submit.textContent = submit.dataset.pending ?? "Saving…";
    window.setTimeout(() => {
      submit.disabled = true;
    }, 0);
  });
}

function bindCapsLock() {
  const hint = document.querySelector<HTMLElement>("[data-caps-lock]");
  const password = document.querySelector<HTMLInputElement>("#password");
  if (!hint || !password) return;

  const update = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    hint.hidden = !event.getModifierState("CapsLock");
  };

  password.addEventListener("keyup", update);
  password.addEventListener("keydown", update);
}

bindPasswordToggles(document);
document.querySelectorAll("form").forEach((form) => bindPending(form));
bindCapsLock();
