import HopCirclePanel from "./HopCirclePanel";
import { useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { t, useLang } from "@hop/shared/i18n";

export type BookingExtrasValue = {
  family_member_id?: string;
  passenger_name?: string;
  passenger_phone?: string;
  favorite_first?: boolean;
  circle?: boolean;
  circle_captain_id?: string;
};
type Family = { id: string; status: string; role: string; name: string };

// Ride-for-someone-else and favorite-driver-first options for the booking form.
export default function BookingExtras({ onChange,circleEnabled=false,circleDisabled=false }: { onChange: (v: BookingExtrasValue) => void;circleEnabled?:boolean;circleDisabled?:boolean }) {
  useLang();
  const [family, setFamily] = useState<Family[]>([]);
  const [hasFavorites, setHasFavorites] = useState(false);
  const [circleChoice,setCircleChoice]=useState<string|null>(null);
  const [who, setWho] = useState("me");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [favoriteFirst, setFavoriteFirst] = useState(false);
  useEffect(() => {
    api<{ family: Family[]; favorite_drivers: unknown[] }>("/api/companion")
      .then((d) => {
        setFamily(d.family.filter((m) => m.role === "owner" && m.status === "accepted"));
        setHasFavorites(d.favorite_drivers.length > 0);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const v: BookingExtrasValue = {};
    if (who === "other") {
      v.passenger_name = name;
      v.passenger_phone = phone;
    } else if (who !== "me") v.family_member_id = who;
    if(circleEnabled && !circleDisabled && circleChoice!==null){v.circle=true;if(circleChoice)v.circle_captain_id=circleChoice;}
    if ((!circleEnabled || circleChoice===null || circleDisabled) && favoriteFirst && hasFavorites) v.favorite_first = true;
    onChange(v);
  }, [who, name, phone, favoriteFirst, hasFavorites, onChange,circleEnabled,circleDisabled,circleChoice]);
  return (
    <>
      <label>
        {t("book.riding")}
        <select value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="me">{t("book.me")}</option>
          {family.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
          <option value="other">{t("book.other")}</option>
        </select>
      </label>
      {who === "other" && (
        <>
          <label>Passenger name<input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required /></label>
          <label>Passenger mobile (10 digits)<input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} required /></label>
          <p className="muted">The driver sees the passenger's name and number after accepting. Share the pickup code with the passenger.</p>
        </>
      )}
      {circleEnabled&&<HopCirclePanel booking choice={circleChoice} onChoice={setCircleChoice} disabled={circleDisabled}/>}
      {hasFavorites && (!circleEnabled || circleChoice===null || circleDisabled) && (
        <label className="check">
          <input type="checkbox" checked={favoriteFirst} onChange={(e) => setFavoriteFirst(e.target.checked)} />
          {t("book.favFirst")}
        </label>
      )}
    </>
  );
}
