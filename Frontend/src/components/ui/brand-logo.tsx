interface BrandLogoProps {
  surface?: "dark-surface" | "light-surface";
}
export function BrandLogo({ surface = "dark-surface" }: BrandLogoProps) {
  return (
    <div
      className={
        surface === "light-surface"
          ? "brand-logo brand-logo--on-light"
          : "brand-logo"
      }
    >
      <div className="brand-logo__mark" aria-hidden>
        <span className="brand-logo__tile brand-logo__tile--emerald" />
        <span className="brand-logo__tile brand-logo__tile--amber" />
        <span className="brand-logo__tile brand-logo__tile--sky" />
        <span className="brand-logo__tile brand-logo__tile--blue" />
      </div>
      <span className="brand-logo__name">ToyFlow</span>
    </div>
  );
}
