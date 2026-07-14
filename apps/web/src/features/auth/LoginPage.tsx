import type { LoginRequest, LoginResponse } from "@jixia/shared";
import type { FormEvent } from "react";
import { useState } from "react";

import { apiFetch } from "../../lib/api";
import { LocaleSwitcher } from "../i18n/LocaleSwitcher";
import { localeCatalog, type Locale } from "../i18n/locale";

type LoginPageProps = {
  readonly locale?: Locale;
  readonly onLoginSuccess?: (response: LoginResponse) => void;
  readonly onLocaleChange?: (locale: Locale) => void;
};

export function LoginPage({ locale = "en", onLoginSuccess, onLocaleChange }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = localeCatalog(locale).login;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    const payload: LoginRequest = { email, password };

    try {
      const response = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        json: payload
      });
      setStatus("success");
      onLoginSuccess?.(response);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : copy.unableToSignIn);
    }
  }

  return (
    <main className="jixia-login">
      <section aria-labelledby="login-title" className="jixia-login__intro">
        <div className="jixia-login__intro-topline">
          <p className="jixia-login__brand">Jixia</p>
          {onLocaleChange ? <LocaleSwitcher locale={locale} onLocaleChange={onLocaleChange} /> : null}
        </div>
        <p className="jixia-login__eyebrow">{copy.eyebrow}</p>
        <h1 id="login-title">{copy.title}</h1>
        <p className="jixia-login__description">{copy.description}</p>
      </section>

      <form className="jixia-login__form" onSubmit={handleSubmit} aria-describedby="login-helper">
        <div>
          <p className="jixia-login__form-kicker">{copy.formKicker}</p>
          <h2>{copy.formTitle}</h2>
        </div>

        <label className="jixia-login__field">
          <span>{copy.email}</span>
          <input
            autoComplete="email"
            inputMode="email"
            name="email"
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
            type="email"
            value={email}
          />
        </label>

        <label className="jixia-login__field">
          <span>{copy.password}</span>
          <input
            autoComplete="current-password"
            name="password"
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            type="password"
            value={password}
          />
        </label>

        {errorMessage ? (
          <p className="jixia-login__notice jixia-login__notice--error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {status === "success" ? (
          <p className="jixia-login__notice jixia-login__notice--success" role="status">
            {copy.signedIn}
          </p>
        ) : null}

        <button className="jixia-login__submit" disabled={status === "submitting"} type="submit">
          {status === "submitting" ? copy.signingIn : copy.signIn}
        </button>

        <p className="jixia-login__helper" id="login-helper">{copy.helper}</p>
      </form>
    </main>
  );
}

type FormStatus = "idle" | "submitting" | "success" | "error";
