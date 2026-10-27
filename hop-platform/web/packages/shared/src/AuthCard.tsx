import { useId } from "react";
import PhoneLogin from "./PhoneLogin";
import "./auth-card.css";

export interface AuthCardProps {
  mode: "rider" | "captain";
  accentColor?: "coral" | "gold";
  title: string;
  subtitle?: string;
  eyebrow?: string;
  finePrint?: string;
  phoneLogin?: boolean;
  accountLoginUrl?: string;
  accountLoginLabel?: string;
  onAccountLogin?: () => void;
  onSignedIn?: () => void;
}
export default function AuthCard({ mode, accentColor = mode === "captain" ? "gold" : "coral", title, subtitle, eyebrow, finePrint, phoneLogin = true, accountLoginUrl = "/auth/login", accountLoginLabel = "Continue with your account", onAccountLogin, onSignedIn = () => window.location.reload() }: AuthCardProps) {
  const id = useId();
  return <section className="lp-card auth-card" data-accent={accentColor} data-mode={mode} aria-labelledby={id}>
    <header><span className="auth-eyebrow">{eyebrow ?? (mode === "captain" ? "Captain sign in" : "Welcome to hop")}</span><h2 id={id}>{title}</h2>{subtitle && <p className="auth-subtitle">{subtitle}</p>}</header>
    <a className="button" href={accountLoginUrl} onClick={onAccountLogin}>{accountLoginLabel}</a>
    {phoneLogin && <><div className="auth-divider"><span>or</span></div><PhoneLogin onSignedIn={onSignedIn} /></>}
    {finePrint && <p className="auth-fine">{finePrint}</p>}
  </section>;
}
