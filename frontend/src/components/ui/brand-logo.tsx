import brandMark from "../../assets/brand/toyflow-mark.png";
import brandWordmark from "../../assets/brand/toyflow-wordmark.png";

interface BrandLogoProps {
  surface?: "dark-surface" | "light-surface";
}

/** Logo ToyFlow (gấu trong hộp + chữ ToyFlow) — cùng ảnh với SiteBrand ở header trang chủ */
export function BrandLogo({ surface = "dark-surface" }: BrandLogoProps) {
  return (
    <div
      className={
        surface === "light-surface"
          ? "brand-logo brand-logo--on-light"
          : "brand-logo"
      }
      role="img"
      aria-label="ToyFlow"
    >
      <img src={brandMark} alt="" className="brand-logo__mark" width={226} height={160} />
      <img src={brandWordmark} alt="" className="brand-logo__wordmark" width={366} height={96} />
    </div>
  );
}
